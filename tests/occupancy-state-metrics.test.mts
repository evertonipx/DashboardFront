import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const occupancyDuration: typeof import("../lib/occupancy-duration.ts") =
  require("../lib/occupancy-duration.ts");

const MINUTE = 60_000;

test("indicadores de estado usam somente minutos ocupados ou livres confirmados", () => {
  const from = Date.parse("2026-09-16T12:00:00.000Z");
  const buckets = Array.from(
    { length: 9 },
    (_, index) => new Date(from + index * MINUTE),
  );
  const metrics = new Map([
    [from, occupied()],
    [from + MINUTE, occupied()],
    [from + 2 * MINUTE, free()],
    [from + 3 * MINUTE, free()],
    [from + 4 * MINUTE, transition()],
    [from + 5 * MINUTE, occupied()],
    [from + 6 * MINUTE, free()],
    // minute 7 is deliberately unknown
    [from + 8 * MINUTE, occupied()],
  ]);

  const summary = occupancyDuration.buildOccupancyDurationSummary(
    buckets,
    metrics,
  );
  const indicators = occupancyDuration.deriveOccupancyStateMetrics(summary);

  assert.equal(indicators.confirmedOccupiedSequenceCount, 3);
  assert.equal(indicators.averageConfirmedOccupiedSequenceSeconds, 80);
  assert.equal(indicators.longestConfirmedOccupiedSeconds, 120);
  assert.equal(indicators.confirmedFreeSequenceCount, 2);
  assert.equal(indicators.averageConfirmedFreeSequenceSeconds, 90);
  assert.equal(indicators.longestConfirmedFreeSeconds, 120);
  assert.equal(indicators.confirmedStateSeconds, 7 * 60);
  assert.equal(indicators.occupiedShareOfConfirmed, 4 / 7);
  assert.equal(indicators.freeShareOfConfirmed, 3 / 7);
  assert.equal(indicators.confirmedCoverageShare, 7 / 9);
  assert.equal(indicators.coverageShare, 8 / 9);
  assert.equal(indicators.transitionMinuteCount, 1);
  assert.equal(indicators.minimumDetectedTransitions, 3);
});

test("indicadores vazios não publicam percentual ou média artificiais", () => {
  const summary = occupancyDuration.buildOccupancyDurationSummary(
    [new Date("2026-09-16T12:00:00.000Z")],
    new Map(),
  );
  const indicators = occupancyDuration.deriveOccupancyStateMetrics(summary);

  assert.equal(indicators.averageConfirmedOccupiedSequenceSeconds, null);
  assert.equal(indicators.averageConfirmedFreeSequenceSeconds, null);
  assert.equal(indicators.occupiedShareOfConfirmed, null);
  assert.equal(indicators.freeShareOfConfirmed, null);
  assert.equal(indicators.coverageShare, 0);
  assert.equal(indicators.confirmedCoverageShare, 0);
  assert.equal(indicators.minimumDetectedTransitions, 0);
});

test("resumo diário aceita médias decimais sem confundir arredondamento com inconsistência", () => {
  const from = Date.parse("2026-09-18T00:00:00.000Z");
  let seed = 40;
  const buckets: Date[] = [];
  const metrics = new Map<
    number,
    { average: number; minimum: number; peak: number }
  >();

  for (let index = 0; index < 1_440; index += 1) {
    seed = Math.imul(seed, 1_664_525) + 1_013_904_223;
    const average = Math.round(((seed >>> 0) / 4_294_967_296) * 1_000_000) /
      100_000;
    const bucket = from + index * MINUTE;
    buckets.push(new Date(bucket));

    if (index % 3 === 0) {
      metrics.set(bucket, {
        average,
        minimum: Math.min(average, 0.000_001),
        peak: Math.max(average, 0.000_002),
      });
    } else if (index % 3 === 1) {
      metrics.set(bucket, { average, minimum: average, peak: average });
    } else {
      metrics.set(bucket, { average: 0, minimum: 0, peak: 0 });
    }
  }

  // A carga total e as cargas consolidadas por segmento somam os mesmos
  // valores em ordens diferentes. A diferença normal de ponto flutuante não
  // pode invalidar um dia inteiro de métricas válidas.
  assert.doesNotThrow(() =>
    occupancyDuration.buildOccupancyDurationSummary(buckets, metrics),
  );
});

function occupied() {
  return { average: 1, minimum: 1, peak: 1 };
}

function free() {
  return { average: 0, minimum: 0, peak: 0 };
}

function transition() {
  return { average: 0.5, minimum: 0, peak: 1 };
}
