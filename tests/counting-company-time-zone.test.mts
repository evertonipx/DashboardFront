import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { fetchHourlyAggregateRanges } from "../lib/aggregate-hour-query.ts";
import { normalizeCountingAggregateRowsTimeZone } from "../lib/counting-aggregate-time.ts";
import {
  countingCalendarRangeToInstants,
  requireCountingRuntimeTimeZone,
} from "../lib/counting-time-zone.ts";

function calendarDate(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

test("Contagem aceita o IANA certificado sem depender do timezone do runtime", () => {
  assert.equal(
    requireCountingRuntimeTimeZone("America/Sao_Paulo"),
    "America/Sao_Paulo",
  );
  assert.equal(
    requireCountingRuntimeTimeZone("Asia/Tokyo"),
    "Asia/Tokyo",
  );
});

test("intervalos civis IANA preservam dias DST de 23 e 25 horas", () => {
  const spring = countingCalendarRangeToInstants(
    {
      from: calendarDate(2026, 3, 8),
      to: calendarDate(2026, 3, 9),
    },
    "America/New_York",
  );
  const fall = countingCalendarRangeToInstants(
    {
      from: calendarDate(2026, 11, 1),
      to: calendarDate(2026, 11, 2),
    },
    "America/New_York",
  );

  assert.equal(spring.to.getTime() - spring.from.getTime(), 23 * 60 * 60_000);
  assert.equal(fall.to.getTime() - fall.from.getTime(), 25 * 60 * 60_000);
});

test("dia civil de São Paulo gera limites absolutos corretos", () => {
  const range = countingCalendarRangeToInstants(
    {
      from: calendarDate(2026, 9, 18),
      to: calendarDate(2026, 9, 19),
    },
    "America/Sao_Paulo",
  );

  assert.equal(range.from.toISOString(), "2026-09-18T03:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-09-19T03:00:00.000Z");
});

test("bucket SQL sem offset é resolvido no IANA da empresa", () => {
  const [row] = normalizeCountingAggregateRowsTimeZone(
    [
      {
        bucket: "2026-09-18T10:00:00",
        camera_id: "camera-1",
        line_count_id: "line-1",
        metric_type: "count",
        total: 1,
      },
    ],
    "hour",
    "America/Sao_Paulo",
  );

  assert.equal(row.bucket, "2026-09-18T13:00:00.000Z");
});

test("bucket civil repetido exige offset explícito no fim do DST", () => {
  assert.throws(
    () =>
      normalizeCountingAggregateRowsTimeZone(
        [
          {
            bucket: "2026-11-01T01:00:00",
            camera_id: "camera-1",
            line_count_id: "line-1",
            metric_type: "count",
            total: 1,
          },
        ],
        "hour",
        "America/New_York",
      ),
    /bucket civil ambíguo.*RFC 3339/,
  );

  const [explicit] = normalizeCountingAggregateRowsTimeZone(
    [
      {
        bucket: "2026-11-01T01:00:00-05:00",
        camera_id: "camera-1",
        line_count_id: "line-1",
        metric_type: "count",
        total: 1,
      },
    ],
    "hour",
    "America/New_York",
  );
  assert.equal(explicit.bucket, "2026-11-01T01:00:00-05:00");
});

test("loader horário particiona por mês civil IANA e preserva cache mensal", async () => {
  const paths: string[] = [];
  await fetchHourlyAggregateRanges({
    cacheScope: "iana-month-test",
    ranges: [
      {
        from: new Date("2026-01-15T12:00:00.000Z"),
        to: new Date("2026-04-02T12:00:00.000Z"),
      },
    ],
    request: async (path) => {
      paths.push(path);
      return { data: [], granularity: "hour" };
    },
    timeZone: "America/New_York",
  });

  assert.equal(paths.length, 4);
  const queries = paths.map((path) => new URL(`http://test${path}`).searchParams);
  assert.deepEqual(
    queries.map((params) => [params.get("from"), params.get("to")]),
    [
      ["2026-01-01T05:00:00.000Z", "2026-02-01T05:00:00.000Z"],
      ["2026-02-01T05:00:00.000Z", "2026-03-01T05:00:00.000Z"],
      ["2026-03-01T05:00:00.000Z", "2026-04-01T04:00:00.000Z"],
      ["2026-04-01T04:00:00.000Z", "2026-05-01T04:00:00.000Z"],
    ],
  );
});

test("normalização permanece correta em processo cujo runtime está em UTC", () => {
  const script = `
    const loaded = await import("./lib/counting-aggregate-time.ts");
    const normalize = loaded.normalizeCountingAggregateRowsTimeZone ?? loaded.default.normalizeCountingAggregateRowsTimeZone;
    const [row] = normalize([{
      bucket: "2026-09-18T10:00:00",
      camera_id: "camera-1",
      line_count_id: "line-1",
      metric_type: "count",
      total: 1
    }], "hour", "America/Sao_Paulo");
    process.stdout.write(row.bucket);
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, TZ: "UTC" },
    },
  );

  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "2026-09-18T13:00:00.000Z");
});
