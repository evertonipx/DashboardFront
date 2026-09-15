import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { WebSocketServer, type WebSocket } from "ws";
import {
  compileBrowserFunctions,
  connectCdp,
  evaluate,
  serverPort,
  waitFor,
  type CdpClient,
  type CdpEvent,
} from "../tools/lib/browser-check.mts";

type Command = { id: number; method: string; params: Record<string, unknown> };
type CommandHandler = (command: Command, socket: WebSocket) => void;

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

/** A disposable loopback peer exercises the actual ws transport, never Chrome. */
async function withCdp(
  onCommand: CommandHandler,
  run: (client: CdpClient, events: CdpEvent[]) => Promise<void>,
  timeoutMs = 1_000,
): Promise<void> {
  const server = createServer();
  const websocket = new WebSocketServer({ server });
  let client: CdpClient | undefined;
  websocket.on("connection", (socket) => {
    socket.on("message", (raw) => {
      const message: unknown = JSON.parse(raw.toString());
      assert.ok(message && typeof message === "object" && "id" in message && "method" in message && "params" in message);
      assert.equal(typeof message.id, "number");
      assert.equal(typeof message.method, "string");
      assert.ok(message.params && typeof message.params === "object" && !Array.isArray(message.params));
      onCommand(message as Command, socket);
    });
  });
  try {
    await listen(server);
    const events: CdpEvent[] = [];
    client = await connectCdp(`ws://127.0.0.1:${serverPort(server)}`, (event) => events.push(event), timeoutMs);
    await run(client, events);
  } finally {
    client?.close();
    for (const socket of websocket.clients) socket.terminate();
    await new Promise<void>((resolve) => websocket.close(() => resolve()));
    await closeServer(server);
  }
}

test("medições TypeScript viram funções JS autônomas sem helper privado do tsx", () => {
  const source = `
    type Measurement = { value: number; scale?: number };
    const unrelated = () => { throw new Error('must not execute'); };
    export function readMeasurement(input: Measurement): number {
      const scale = (value: number) => value * (input.scale ?? 2);
      return scale(input.value);
    }
    export function readLabel(label: string): string { return label.toUpperCase(); }
  `;
  const functions = compileBrowserFunctions(source, ["readMeasurement", "readLabel"]);
  assert.deepEqual(Object.keys(functions), ["readMeasurement", "readLabel"]);
  for (const code of Object.values(functions)) {
    assert.doesNotMatch(code, /__name|unrelated|export function|:\s*(?:number|string|Measurement)/);
  }
  const measured: unknown = runInNewContext(`${functions.readMeasurement}({value: 7, scale: 3})`, Object.create(null), { timeout: 100 });
  const fallback: unknown = runInNewContext(`${functions.readMeasurement}({value: 7})`, Object.create(null), { timeout: 100 });
  const label: unknown = runInNewContext(`${functions.readLabel}('ipx')`, Object.create(null), { timeout: 100 });
  assert.equal(measured, 21);
  assert.equal(fallback, 14);
  assert.equal(label, "IPX");
});

test("serialização recusa uma função ausente em vez de produzir fixture vazia", () => {
  assert.throws(
    () => compileBrowserFunctions("export function present() { return 1; }", ["missing"]),
    /Missing browser measurement function: missing/,
  );
});

test("serverPort exige servidor TCP ativo e devolve a porta real", async () => {
  const server = createServer();
  assert.throws(() => serverPort(server), /not listening on TCP/);
  try {
    await listen(server);
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    assert.equal(serverPort(server), address.port);
    assert.ok(address.port > 0);
  } finally {
    await closeServer(server);
  }
  assert.throws(() => serverPort(server), /not listening on TCP/);
});

test("waitFor aceita predicado assíncrono e para na primeira condição verdadeira", async () => {
  let calls = 0;
  await waitFor(async () => {
    calls++;
    return calls === 3 ? { ready: true } : false;
  }, "three checks", 1_000, 1);
  assert.equal(calls, 3);
});

test("waitFor termina por prazo e preserva erro real do predicado", async () => {
  let calls = 0;
  await assert.rejects(waitFor(() => { calls++; return false; }, "fixture not ready", 25, 5), /Timed out waiting for fixture not ready/);
  assert.ok(calls > 0);
  const expected = new Error("fixture failed before readiness");
  await assert.rejects(waitFor(() => { throw expected; }, "broken fixture", 1_000, 1), (error: unknown) => error === expected);
});

test("CDP correlaciona respostas fora de ordem e mantém eventos separados", async () => {
  let first: Command | undefined;
  await withCdp((command, socket) => {
    if (command.method === "Fixture.first") { first = command; return; }
    assert.ok(first);
    assert.deepEqual(first.params, { selection: "first" });
    assert.ok(command.id > first.id);
    socket.send(JSON.stringify({ method: "Page.loadEventFired", params: { timestamp: 42 } }));
    socket.send(JSON.stringify({ id: command.id, result: { name: "second" } }));
    socket.send(JSON.stringify({ id: first.id, result: { name: "first" } }));
  }, async (client, events) => {
    const responses = await Promise.all([
      client.send("Fixture.first", { selection: "first" }),
      client.send("Fixture.second"),
    ]);
    assert.deepEqual(responses, [{ name: "first" }, { name: "second" }]);
    assert.deepEqual(events, [{ method: "Page.loadEventFired", params: { timestamp: 42 } }]);
  });
});

test("CDP propaga erro de protocolo sem inutilizar comandos seguintes", async () => {
  await withCdp((command, socket) => {
    socket.send(JSON.stringify(command.method === "Fixture.invalid"
      ? { id: command.id, error: { code: -32601, message: "Unknown fixture method" } }
      : { id: command.id, result: { ready: true } }));
  }, async (client) => {
    await assert.rejects(client.send("Fixture.invalid"), /Unknown fixture method/);
    assert.deepEqual(await client.send("Fixture.next"), { ready: true });
  });
});

test("evaluate devolve valor serializado e não mascara exceção do navegador", async () => {
  await withCdp((command, socket) => {
    assert.equal(command.method, "Runtime.evaluate");
    assert.equal(command.params.returnByValue, true);
    assert.equal(command.params.awaitPromise, true);
    const result = command.params.expression === "throw new Error('render failed')"
      ? { result: {}, exceptionDetails: { text: "Uncaught", exception: { description: "Error: render failed" } } }
      : { result: { value: { width: 320, visible: true } } };
    socket.send(JSON.stringify({ id: command.id, result }));
  }, async (client) => {
    assert.deepEqual(await evaluate<{ width: number; visible: boolean }>(client, "measure()"), { width: 320, visible: true });
    await assert.rejects(evaluate(client, "throw new Error('render failed')"), /Error: render failed/);
  });
});

test("CDP rejeita pendências quando o peer fecha e recusa novo envio", async () => {
  await withCdp((_command, socket) => socket.close(), async (client) => {
    await assert.rejects(client.send("Fixture.close"), /Chrome debugging connection closed/);
    await assert.rejects(client.send("Fixture.afterClose"), /Chrome connection is not open/);
  });
});

test("dispose local rejeita comando pendente imediatamente", async () => {
  await withCdp(() => {}, async (client) => {
    const rejected = assert.rejects(client.send("Fixture.pending"), /Browser check disposed/);
    client.close();
    await rejected;
    await assert.rejects(client.send("Fixture.afterDispose"), /Chrome connection is not open/);
  });
});

test("CDP limita comando sem resposta e aceita resposta posterior de outro comando", async () => {
  await withCdp((command, socket) => {
    if (command.method === "Fixture.stalled") return;
    socket.send(JSON.stringify({ id: command.id, result: { recovered: true } }));
  }, async (client) => {
    await assert.rejects(client.send("Fixture.stalled"), /CDP timeout: Fixture.stalled/);
    assert.deepEqual(await client.send("Fixture.next"), { recovered: true });
  }, 100);
});

test("CDP rejeita JSON inválido sem deixar a espera pendente", async () => {
  await withCdp((_command, socket) => socket.send("not-json"), async (client) => {
    await assert.rejects(client.send("Fixture.invalidJson"), /Chrome returned an invalid debugging message/);
  });
});
