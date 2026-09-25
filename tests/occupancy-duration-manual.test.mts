import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildOccupancyHistoricalMinuteRange } from "../lib/occupancy-duration.ts";

const durationWidgetSource = readFileSync(
  resolve("components/app/occupancy-duration-widgets.tsx"),
  "utf8",
);

test("duração histórica preserva exatamente o intervalo [from, to)", () => {
  const from = new Date("2026-09-18T18:20:00.000Z");
  const to = new Date("2026-09-18T18:23:00.000Z");
  const range = buildOccupancyHistoricalMinuteRange(
    {
      dateKeys: ["2026-09-18"],
      from,
      timeZone: "America/Sao_Paulo",
      to,
    },
    "America/Sao_Paulo",
  );

  assert.equal(range.from.toISOString(), from.toISOString());
  assert.equal(range.to.toISOString(), to.toISOString());
  assert.equal(range.dayEnd.toISOString(), to.toISOString());
  assert.equal(range.requestedAt.toISOString(), to.toISOString());
  assert.equal(range.timeZone, "America/Sao_Paulo");
  assert.deepEqual(
    range.buckets.map((bucket) => bucket.toISOString()),
    [
      "2026-09-18T18:20:00.000Z",
      "2026-09-18T18:21:00.000Z",
      "2026-09-18T18:22:00.000Z",
    ],
  );
  assert.equal(
    range.buckets.some((bucket) => bucket.getTime() === to.getTime()),
    false,
    "a borda exclusiva nunca pode virar bucket",
  );
});

test("duração histórica rejeita limites inválidos, fusos divergentes e mais de 32 dias civis", () => {
  const aligned = new Date("2026-09-01T03:00:00.000Z");

  assert.throws(
    () =>
      buildOccupancyHistoricalMinuteRange(
        { from: aligned, to: aligned },
        "America/Sao_Paulo",
      ),
    /período histórico de ocupação é inválido/,
  );
  assert.throws(
    () =>
      buildOccupancyHistoricalMinuteRange(
        {
          from: new Date(aligned.getTime() + 1),
          to: new Date(aligned.getTime() + 60_000),
        },
        "America/Sao_Paulo",
      ),
    /minuto fechado/,
  );
  assert.throws(
    () =>
      buildOccupancyHistoricalMinuteRange(
        {
          from: aligned,
          timeZone: "UTC",
          to: new Date(aligned.getTime() + 60_000),
        },
        "America/Sao_Paulo",
      ),
    /fuso do período histórico diverge/,
  );
  assert.throws(
    () =>
      buildOccupancyHistoricalMinuteRange(
        {
          dateKeys: Array.from({ length: 33 }, (_, index) =>
            `2026-09-${String(index + 1).padStart(2, "0")}`,
          ),
          from: aligned,
          to: new Date(aligned.getTime() + 33 * 24 * 60 * 60_000),
        },
        "America/Sao_Paulo",
      ),
    /1 a 32 dias civis/,
  );
  assert.throws(
    () =>
      buildOccupancyHistoricalMinuteRange(
        {
          from: aligned,
          to: new Date(aligned.getTime() + (32 * 25 * 60 + 1) * 60_000),
        },
        "America/Sao_Paulo",
      ),
    /no máximo 32 dias civis/,
  );
});

test("modo manual não agenda polling, progresso temporizado nem listeners de retomada", () => {
  assert.match(
    durationWidgetSource,
    /const scheduleNext = \(\) => \{\s*if \(refreshMode !== "poll" \|\| disposed\) return;/,
    "qualquer timer de próxima consulta precisa encerrar imediatamente em manual",
  );
  assert.match(
    durationWidgetSource,
    /refreshMode === "poll" &&\s*progressTimer === undefined\s*\) \{\s*progressTimer = window\.setTimeout\(publishProgress, 32\);/,
    "a publicação progressiva temporizada pertence somente ao modo ao vivo",
  );
  assert.match(
    durationWidgetSource,
    /if \(refreshMode === "poll"\) \{\s*document\.addEventListener\("visibilitychange", resume\);\s*window\.addEventListener\("online", resume\);\s*\}/,
    "a análise manual não deve instalar listeners que reiniciem consultas",
  );
  assert.match(
    durationWidgetSource,
    /refreshMode === "manual"\s*\? Promise\.resolve\(cachedCurrentSnapshots\)\s*:\s*queryEnabled/,
    "o estado histórico ausente deve permanecer desconhecido, sem consultar o estado atual",
  );
});

