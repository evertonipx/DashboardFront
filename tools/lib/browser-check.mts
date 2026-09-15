import assert from "node:assert/strict";
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { build, transformSync } from "esbuild";
import ts from "typescript";
import WebSocket from "ws";

type EvaluateResult = {
  result: { value?: unknown };
  exceptionDetails?: { text: string; exception?: { description?: string } };
};
type CdpResults = {
  "Runtime.evaluate": EvaluateResult;
  "Page.captureScreenshot": { data: string };
};
type CdpResult<Method extends string> = Method extends keyof CdpResults ? CdpResults[Method] : Record<string, unknown>;
export type CdpEvent = { method: string; params: Record<string, unknown> };
export type CdpClient = {
  close(): void;
  send<Method extends string>(method: Method, params?: Record<string, unknown>): Promise<CdpResult<Method>>;
};
type PendingCommand = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
};

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(predicate: () => unknown | Promise<unknown>, label: string, timeoutMs = 30_000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export function serverPort(server: Server): number {
  const address = server.address();
  assert.ok(address && typeof address !== "string", "Fixture server is not listening on TCP.");
  return address.port;
}

export async function browserPageUrl(debugPort: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(10_000) });
  assert.ok(response.ok, `Chrome target discovery failed (${response.status}).`);
  const pages: unknown = await response.json();
  assert.ok(Array.isArray(pages), "Chrome returned an invalid target list.");
  const page: unknown = pages.find((entry: unknown) => isRecord(entry) && entry.type === "page");
  assert.ok(isRecord(page) && typeof page.webSocketDebuggerUrl === "string", "Chrome has no debuggable page.");
  return page.webSocketDebuggerUrl;
}

export async function evaluate<T>(client: CdpClient, expression: string): Promise<T> {
  const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  // CDP is a serialization boundary; each fixture declares its returned shape.
  return result.result.value as T;
}

export async function connectCdp(url: string, onEvent?: (event: CdpEvent) => void, timeoutMs = 30_000): Promise<CdpClient> {
  const socket = new WebSocket(url, { handshakeTimeout: timeoutMs });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let sequence = 0;
  const pending = new Map<number, PendingCommand>();
  const rejectPending = (error: Error) => {
    for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(error); }
    pending.clear();
  };
  socket.on("error", rejectPending);
  socket.on("close", () => rejectPending(new Error("Chrome debugging connection closed.")));
  socket.on("message", (data) => {
    let message: unknown;
    try { message = JSON.parse(data.toString()); }
    catch { rejectPending(new Error("Chrome returned an invalid debugging message.")); return; }
    if (!isRecord(message)) return;
    if (typeof message.id !== "number") {
      if (typeof message.method === "string" && isRecord(message.params)) onEvent?.({ method: message.method, params: message.params });
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  return {
    close() { rejectPending(new Error("Browser check disposed.")); socket.close(); },
    send<Method extends string>(method: Method, params: Record<string, unknown> = {}): Promise<CdpResult<Method>> {
      return new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) { reject(new Error(`Chrome connection is not open: ${method}`)); return; }
        const id = ++sequence;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
        pending.set(id, { resolve: (value) => resolve(value as CdpResult<Method>), reject, timeout });
        socket.send(JSON.stringify({ id, method, params }), (error) => {
          if (!error) return;
          clearTimeout(timeout); pending.delete(id); reject(error);
        });
      });
    },
  };
}

export async function bundleBrowserFixture(root: string, entry: string, outfile: string, alias: Record<string, string> = {}): Promise<void> {
  await build({ absWorkingDir: root, stdin: { contents: await readFile(entry, "utf8"), sourcefile: basename(entry), resolveDir: root, loader: entry.endsWith(".tsx") ? "tsx" : "jsx" }, outfile, bundle: true, platform: "browser", format: "iife", target: "es2020", jsx: "automatic", tsconfig: `${root}/tsconfig.json`, alias: { "@": root, ...alias }, nodePaths: [`${root}/node_modules`], define: { "process.env.NODE_ENV": JSON.stringify("development"), "process.env.NEXT_PUBLIC_IPXDATA_DEFAULT_COMPANY_TIME_ZONE": JSON.stringify("America/Sao_Paulo") }, logLevel: "silent" });
}

/** Compile self-contained browser measurements from their original TypeScript.
 * Serializing functions after tsx has transformed them would capture its private
 * function-name helper. Official esbuild output keeps the CDP snippet standalone.
 */
export function compileBrowserFunctions<Names extends string>(source: string, names: readonly Names[]): Record<Names, string> {
  const ast = ts.createSourceFile("browser-measurements.mts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = new Map(ast.statements.filter(ts.isFunctionDeclaration).filter((node) => node.name).map((node) => [node.name!.text, node]));
  const result = {} as Record<Names, string>;
  for (const name of names) {
    const node = functions.get(name);
    assert.ok(node, `Missing browser measurement function: ${name}`);
    const declaration = node.getText(ast).replace(/^export\s+/, "");
    result[name] = transformSync(`(${declaration})`, { loader: "ts", target: "es2022", keepNames: false }).code.trim().replace(/;$/, "");
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
