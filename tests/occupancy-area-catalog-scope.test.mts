// Dynamic fixtures intentionally cross injected-module and malformed-input boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RuntimeFixture = any;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const modules = new Map();
const catalog = load("lib/occupancy-area-options.ts");
const validation = load("lib/occupancy-validation.ts");
const camera = (company_id = "selected", id = "camera-a"): RuntimeFixture => ({ company_id, id, name: `Camera ${id}`, active: true });
const area = (company_id = "selected", camera_id = "camera-a", area_id = "region-a"): RuntimeFixture => ({
  company_id, camera_id, area_id, area_name: `Area ${area_id}`, object_class: "person",
  source_kind: "region", active: true, last_seen_at: "2026-09-11T10:00:00Z",
});

function fetchCatalog(cameras: RuntimeFixture, areas: RuntimeFixture, overrides: Record<string, RuntimeFixture> = {}) {
  return catalog.fetchOccupancyAreaCatalog({
    companyId: "selected", from: new Date("2026-09-11T09:00:00Z"), to: new Date("2026-09-11T11:00:00Z"),
    request: async (path: string) => {
      if (path === "/cameras") return cameras;
      if (path === "/occupancy/areas") return { complete: true, data: areas };
      throw new Error(`Unexpected fallback ${path}`);
    }, ...overrides,
  });
}

test("Master explícito separa catálogo por empresa antes de validar campos de outro tenant", async () => {
  const result = await fetchCatalog([camera(), { company_id: "foreign" }], [area(), { company_id: "foreign" }], { masterCrossCompanyScope: true });
  assert.equal(result.authoritative, true);
  assert.deepEqual(result.options.map(({ camera_id, area_id }: RuntimeFixture) => ({ camera_id, area_id })), [{ camera_id: "camera-a", area_id: "region-a" }]);
});

test("usuário comum rejeita empresa estranha em câmeras ou áreas, sem ativação implícita", async () => {
  for (const masterCrossCompanyScope of [undefined, false]) {
    await assert.rejects(fetchCatalog([camera(), camera("foreign", "camera-b")], [area()], { masterCrossCompanyScope }), /fora da empresa autenticada/);
    await assert.rejects(fetchCatalog([camera()], [area(), area("foreign", "camera-b")], { masterCrossCompanyScope }), /fora da empresa autenticada/);
  }
});

test("Master não atribui à empresa selecionada IDs ausentes, nulos ou inválidos", async () => {
  for (const company of [undefined, null, "", " selected "]) {
    const cameraRow = camera(); cameraRow.company_id = company;
    await assert.rejects(fetchCatalog([cameraRow], [area()], { masterCrossCompanyScope: true }), /company_id/);
    const row = area(); row.company_id = company;
    await assert.rejects(fetchCatalog([camera()], [row], { masterCrossCompanyScope: true }), /company_id/);
  }
});

test("o contrato tenant-scoped comum continua aceitando company_id omitido", async () => {
  const ownCamera = camera(); delete ownCamera.company_id;
  const ownArea = area(); delete ownArea.company_id;
  assert.equal((await fetchCatalog([ownCamera], [ownArea])).options.length, 1);
});

test("snapshot consolidado valida linhas sem exigir que todo o tenant pertença a um cenário", () => {
  const value = {
    data: [
      {
        area: "region-a",
        avg: 2,
        camera_id: "camera-a",
        current_at: "2026-09-11T10:00:00Z",
        current_value: 3,
        min: 1,
        object_class: "person",
        peak: 4,
      },
      {
        area: "region-b",
        avg: 1,
        camera_id: "camera-b",
        current_at: "2026-09-11T10:00:00Z",
        current_value: 1,
        min: 0,
        object_class: "person",
        peak: 2,
      },
    ],
  };
  const rows = validation.requireOccupancySnapshotSupersetRows(value, {
    expectedObjectClass: "person",
    from: new Date("2026-09-11T09:00:00Z"),
    to: new Date("2026-09-11T11:00:00Z"),
  });
  assert.equal(rows.length, 2);
  assert.throws(
    () =>
      validation.requireOccupancySnapshotSupersetRows(
        { data: [{ ...value.data[0], currentValue: 3 }] },
        {
          expectedObjectClass: "person",
          from: new Date("2026-09-11T09:00:00Z"),
          to: new Date("2026-09-11T11:00:00Z"),
        },
      ),
    /aliases não certificados/,
  );
});

test("snapshot atual certifica somente a leitura bruta das áreas solicitadas", () => {
  const rows = validation.requireOccupancyCurrentSnapshotRows(
    {
      data: [
        {
          area: "region-a",
          avg: "estatística não usada",
          camera_id: "camera-a",
          current_at: "2026-09-11T08:00:00Z",
          current_value: 9,
          min: 30,
          object_class: "person",
          peak: 4,
        },
      ],
    },
    {
      expectedAreas: [{ area_id: "region-a", camera_id: "camera-a" }],
      expectedObjectClass: "person",
    },
  );

  assert.deepEqual(
    rows.map((row: RuntimeFixture) => ({
      area: row.area,
      camera_id: row.camera_id,
      current_at: row.current_at,
      current_value: row.current_value,
      object_class: row.object_class,
    })),
    [
      {
        area: "region-a",
        camera_id: "camera-a",
        current_at: "2026-09-11T08:00:00Z",
        current_value: 9,
        object_class: "person",
      },
    ],
    "a leitura atual não pertence ao intervalo estatístico nem ao domínio min/peak",
  );
});

test("linhas não solicitadas não invalidam o lote atual", () => {
  const rows = validation.requireOccupancyCurrentSnapshotRows(
    {
      data: [
        null,
        {
          area: "foreign-region",
          camera_id: "foreign-camera",
          currentValue: "inválido",
          object_class: 42,
        },
        {
          area: "region-a",
          camera_id: "camera-a",
          current_at: "2026-09-11T10:00:00Z",
          current_value: 0,
          object_class: "person",
        },
      ],
    },
    {
      expectedAreas: [{ area_id: "region-a", camera_id: "camera-a" }],
      expectedObjectClass: "person",
    },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].current_value, 0, "zero explícito deve ser preservado");
});

test("área solicitada mantém validação estrita de identidade, classe e leitura", () => {
  const scope = {
    expectedAreas: [{ area_id: "region-a", camera_id: "camera-a" }],
    expectedObjectClass: "person",
  };
  const valid = {
    area: "region-a",
    camera_id: "camera-a",
    current_at: "2026-09-11T10:00:00Z",
    current_value: 3,
    object_class: "person",
  };

  for (const [patch, message] of [
    [{ currentValue: 3 }, /aliases não certificados/],
    [{ object_class: "vehicle" }, /ao consultar "person"/],
    [{ current_value: -1 }, /current_value/],
    [{ current_at: "ontem" }, /current_at/],
  ] as const) {
    assert.throws(
      () =>
        validation.requireOccupancyCurrentSnapshotRows(
          { data: [{ ...valid, ...patch }] },
          scope,
        ),
      message,
    );
  }

  assert.throws(
    () =>
      validation.requireOccupancyCurrentSnapshotRows(
        { data: [valid, valid] },
        scope,
      ),
    /duplicado/,
  );
});

test("snapshot atual preserva ausência por área sem inventar zero", () => {
  const rows = validation.requireOccupancyCurrentSnapshotRows(
    { data: [] },
    {
      expectedAreas: [
        { area_id: "region-a", camera_id: "camera-a" },
        { area_id: "region-b", camera_id: "camera-b" },
      ],
      expectedObjectClass: "person",
    },
  );
  assert.deepEqual(rows, []);
  assert.throws(
    () =>
      validation.requireOccupancyCurrentSnapshotRows(
        { data: [], rows: [] },
        {
          expectedAreas: [{ area_id: "region-a", camera_id: "camera-a" }],
          expectedObjectClass: "person",
        },
      ),
    /envelope ambíguo/,
  );
});

test("filtragem Master não relaxa câmera ou duplicação e aceita object_class livre", async () => {
  const master = { masterCrossCompanyScope: true };
  await assert.rejects(fetchCatalog([camera()], [area("selected", "unknown-camera")], master), /câmera desconhecida/);
  await assert.rejects(fetchCatalog([camera()], [area(), area()], master), /duplicada/);
  const freeObjectClass = await fetchCatalog(
    [camera()],
    [{ ...area(), object_class: "Person" }],
    master,
  );
  assert.equal(freeObjectClass.options[0].object_class, "Person");
  const incomplete = await fetchCatalog([camera()], [], {
    ...master,
    request: async (path: string) =>
      path === "/cameras"
        ? [camera()]
        : { complete: false, data: [area()] },
  });
  assert.equal(incomplete.authoritative, false);
  assert.equal(incomplete.options.length, 1);
  const result = await fetchCatalog([camera()], [{ ...area(), active: false }], master);
  assert.deepEqual(result.options, []);
});

test("catálogo Swagger funciona sem permissão de câmeras e só é autoritativo com complete true", async () => {
  for (const status of [401, 403, 404, 405]) {
    const requestedPaths: string[] = [];
    const result = await catalog.fetchOccupancyAreaCatalog({
      companyId: "selected",
      from: new Date("2026-09-11T09:00:00Z"),
      to: new Date("2026-09-11T11:00:00Z"),
      request: async (path: string) => {
        requestedPaths.push(path);
        if (path === "/cameras") {
          throw Object.assign(new Error("forbidden"), { status });
        }
        if (path === "/occupancy/areas") {
          const row = area();
          delete row.last_seen_at;
          row.source_kind = "polygon";
          return { data: [row] };
        }
        throw new Error(`Unexpected fallback ${path}`);
      },
    });

    assert.equal(result.authoritative, false, `status ${status}`);
    assert.deepEqual(result.options, [
      {
        area_id: "region-a",
        camera_id: "camera-a",
        key: JSON.stringify(["camera-a", "region-a"]),
        label: "Area region-a / Câmera sem nome",
        object_class: "person",
      },
    ]);
    assert.deepEqual(
      requestedPaths.sort(),
      ["/cameras", "/occupancy/areas"],
      `status ${status}: catálogo próprio não deve abrir fallback`,
    );
  }

  const complete = await catalog.fetchOccupancyAreaCatalog({
    companyId: "selected",
    from: new Date("2026-09-11T09:00:00Z"),
    to: new Date("2026-09-11T11:00:00Z"),
    request: async (path: string) => {
      if (path === "/cameras") {
        throw Object.assign(new Error("forbidden"), { status: 403 });
      }
      if (path === "/occupancy/areas") {
        const row = area();
        delete row.source_kind;
        row.last_seen_at = null;
        return { complete: true, data: [row] };
      }
      throw new Error(`Unexpected fallback ${path}`);
    },
  });
  assert.equal(complete.authoritative, true);
  assert.equal(
    complete.options.length,
    1,
    "área ativa sem last_seen continua configurável",
  );
});

test("catálogo autônomo mantém isolamento JWT e escopo cross-company explícito do Master", async () => {
  const requestFor = (rows: RuntimeFixture[]) => async (path: string) => {
    if (path === "/cameras") {
      throw Object.assign(new Error("forbidden"), { status: 403 });
    }
    if (path === "/occupancy/areas") {
      return { complete: true, data: rows };
    }
    throw new Error(`Unexpected fallback ${path}`);
  };

  await assert.rejects(
    fetchCatalog([], [], {
      request: requestFor([area(), area("foreign", "camera-b", "region-b")]),
    }),
    /fora da empresa autenticada/,
  );

  const master = await fetchCatalog([], [], {
    masterCrossCompanyScope: true,
    request: requestFor([area(), area("foreign", "camera-b", "region-b")]),
  });
  assert.equal(master.authoritative, true);
  assert.deepEqual(
    master.options.map((option: RuntimeFixture) => option.camera_id),
    ["camera-a"],
  );

  const missingCompany = area();
  delete missingCompany.company_id;
  await assert.rejects(
    fetchCatalog([], [], {
      masterCrossCompanyScope: true,
      request: requestFor([missingCompany]),
    }),
    /company_id/,
  );
});

test("caller deriva a permissão explícita do usuário autenticado e mantém escopo HTTP", () => {
  const source = readFileSync(resolve("components/app/occupancy-scenario-manager.tsx"), "utf8");
  assert.match(source, /const masterCrossCompanyScope = usesMasterCrossCompanyScope\(\s*user,\s*companyScopeId/);
  assert.match(source, /fetchOccupancyAreaCatalog\(\{[\s\S]*?masterCrossCompanyScope,[\s\S]*?apiFetch<T>\(path, \{ companyScopeId \}\)/);
  const callback = source.slice(source.indexOf("const loadAreaOptions"), source.indexOf("React.useLayoutEffect", source.indexOf("const loadAreaOptions")));
  assert.match(callback, /\[companyScopeId, masterCrossCompanyScope\]/);
});

test("fallback 404 separa snapshots mistos pela relação explícita câmera/empresa apenas para Master", async () => {
  const row = { camera_id: "camera-a", area: "region-a", current_value: 0, avg: 0, min: 0, peak: 0, current_at: "2026-09-11T10:00:00Z" };
  const calls: RuntimeFixture[] = [];
  const request = async (path: string) => {
    calls.push(path);
    if (path === "/cameras") return [camera(), camera("foreign", "camera-b")];
    if (path === "/occupancy/areas") throw Object.assign(new Error("missing"), { status: 404 });
    if (path.startsWith("/occupancy?")) return { data: [row, { camera_id: "camera-b" }] };
    if (path === "/cameras/camera-a/line-counts") return [];
    throw new Error(`Unexpected foreign request ${path}`);
  };
  const result = await fetchCatalog([], [], { masterCrossCompanyScope: true, request });
  assert.equal(result.authoritative, false);
  assert.deepEqual(result.options.map((option: RuntimeFixture) => option.camera_id), ["camera-a"]);
  assert.ok(!calls.some((path) => path.includes("camera-b/")));
  await assert.rejects(fetchCatalog([], [], { masterCrossCompanyScope: false, request }), /fora da empresa autenticada/);
});

test("fallback Master não aceita câmera desconhecida, relação ambígua, ID ausente ou empresa contraditória", async () => {
  const row = { camera_id: "camera-a", area: "region-a", current_value: 0, avg: 0, min: 0, peak: 0, current_at: "2026-09-11T10:00:00Z" };
  for (const [cameras, snapshots, pattern] of [
    [[camera()], [{ ...row, camera_id: "unknown" }], /desconhecida/],
    [[camera()], [{ ...row, camera_id: undefined }], /camera_id/],
    [[camera(), camera("foreign", "camera-a")], [row], /duplicada/],
    [[camera(), { company_id: "foreign" }], [row], /id da câmera/],
    [[camera()], [{ ...row, company_id: "foreign" }], /contradiz/],
  ] as const) {
    await assert.rejects(fetchCatalog([], [], { masterCrossCompanyScope: true, request: async (path: string) => {
      if (path === "/cameras") return cameras;
      if (path === "/occupancy/areas") throw Object.assign(new Error("missing"), { status: 404 });
      if (path.startsWith("/occupancy?")) return snapshots;
      return [];
    } }), pattern);
  }
});

function load(path: string): RuntimeFixture {
  if (modules.has(path)) return modules.get(path);
  const loaded: { exports: RuntimeFixture } = { exports: {} }; modules.set(path, loaded.exports);
  const output = ts.transpileModule(readFileSync(resolve(path), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("module", "exports", "require", output)(loaded, loaded.exports, (name: RuntimeFixture) => {
    if (name === "@/lib/api") return { apiFetch: () => { throw new Error("No production API in this fixture"); } };
    if (name === "@/lib/master-company-scope") return { filterScopedApiRows: (rows: RuntimeFixture, companyId: string) => rows.filter((row: RuntimeFixture) => row.company_id === companyId) };
    return name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
  });
  return loaded.exports;
}
