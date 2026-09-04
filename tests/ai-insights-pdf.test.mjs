import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testsDirectory, "..");
const moduleCache = new Map();
const pdf = loadTypeScriptModule("lib/ai-insights-pdf.ts");

test("composição do IA Advisor separa o cabeçalho e preserva somente conteúdo executivo", () => {
  const report = validReport();
  const originalPriorities = report.insights.actions.map((action) => action.priority);
  const header = pdf.buildAiInsightsPdfHeader(report, {
    companyId: "company-a",
    companyLabel: "Shopping Exemplo",
  });
  const blocks = pdf.buildAiInsightsPdfBlocks(report);
  const serialized = JSON.stringify(blocks);

  assert.deepEqual(header, {
    company: "Shopping Exemplo",
    period: "01/08/2026 a 26/08/2026",
  });
  assert.deepEqual(
    pdf.buildAiInsightsPdfHeader(report),
    {
      company: "Empresa selecionada",
      period: "01/08/2026 a 26/08/2026",
    },
    "o cabeçalho sem nome amigável deve usar uma descrição neutra",
  );

  for (const expected of [
    report.insights.summary,
    report.insights.findings[0].title,
    report.insights.findings[0].evidence,
    report.insights.findings[0].interpretation,
    report.insights.actions[0].whyNow,
    report.insights.actions[0].steps[0],
    report.insights.actions[0].expectedEffect,
    report.insights.actions[0].target,
    report.insights.actions[0].risks[0],
    "Direção recomendada",
    "Oportunidades de resultado",
    "Plano de ação",
  ]) {
    assert.ok(serialized.includes(expected), `conteúdo ausente: ${expected}`);
  }
  for (const technicalDetail of [
    report.id,
    report.meta.model,
    report.insights.dataQuality.notes[0],
    report.insights.questions[0],
    report.insights.disclaimer,
    "Shopping Exemplo",
    "Tokens de entrada",
    "Tokens de saída",
    "Visão de origem",
    "Módulo / visão",
    "Período analisado",
    "Intervalo civil",
    "Dados consolidados até",
    "Plano gerado em",
    "Origem na visão",
    "Base e premissas",
    "Próximo movimento",
    "Qualidade dos dados",
    "Diagnóstico executivo",
  ]) {
    assert.equal(
      serialized.includes(technicalDetail),
      false,
      `detalhe técnico não deve disputar espaço no relatório executivo: ${technicalDetail}`,
    );
  }

  const targetBlock = blocks.find(
    (block) => block.kind === "paragraph" && block.label === "Meta do piloto",
  );
  assert.deepEqual(targetBlock, {
    kind: "paragraph",
    label: "Meta do piloto",
    text: "1.050 visitas por hora",
  });

  const actionHeadings = blocks
    .filter(
      (block) =>
        block.kind === "item-heading" && block.eyebrow.startsWith("INICIATIVA "),
    )
    .map((block) => block.title);
  assert.deepEqual(actionHeadings, [
    "Reforçar a operação no pico",
    "Revisar a sinalização",
  ]);
  assert.deepEqual(
    report.insights.actions.map((action) => action.priority),
    originalPriorities,
    "a ordenação do PDF não deve alterar a resposta persistida",
  );
});

test("PDF executivo omite governança técnica mesmo quando a captura é parcial", () => {
  const report = validReport();

  const serialized = JSON.stringify(pdf.buildAiInsightsPdfBlocks(report));
  assert.equal(serialized.includes("Base e premissas"), false);
  assert.equal(serialized.includes("Qualidade"), false);
  assert.equal(serialized.includes("Tokens"), false);
  assert.equal(serialized.includes(report.insights.dataQuality.notes[0]), false);
  assert.equal(serialized.includes(report.insights.questions[0]), false);
  assert.equal(serialized.includes(report.insights.disclaimer), false);
  assert.ok(serialized.includes("Direção recomendada"));
  assert.ok(serialized.includes("Impacto a validar"));
});

test("normalização PDF remove NUL e mojibake sem acionar Unicode incompatível", () => {
  const expected = ">=+5% em 2 de 3 domingos com a ação.";
  const interleavedNul =
    "≥+\u00005\u0000%\u0000 \u0000e\u0000m\u0000 \u00002\u0000 \u0000d\u0000e\u0000 \u00003\u0000 \u0000d\u0000o\u0000m\u0000i\u0000n\u0000g\u0000o\u0000s\u0000 \u0000c\u0000o\u0000m\u0000 \u0000a\u0000 \u0000a\u0000ç\u0000ã\u0000o\u0000.";
  const interleavedReplacement =
    "≥�+�5�%� �e�m� �2� �d�e� �3� �d�o�m�i�n�g�o�s� �c�o�m� �a� �a�ç�ã�o�.";

  assert.equal(pdf.normalizeAiInsightsPdfText(interleavedNul), expected);
  assert.equal(pdf.normalizeAiInsightsPdfText(interleavedReplacement), expected);
  assert.equal(
    pdf.normalizeAiInsightsPdfText("Meta → escala · limite ≥ 5%"),
    "Meta -> escala · limite >= 5%",
  );
  assert.doesNotMatch(
    pdf.normalizeAiInsightsPdfText(interleavedReplacement),
    /[\u0000\uFFFD\u2265]/,
  );

  const report = validReport();
  report.insights.actions[1].target = interleavedNul;
  const targetBlock = pdf
    .buildAiInsightsPdfBlocks(report)
    .find((block) => block.kind === "paragraph" && block.label === "Meta do piloto");
  assert.equal(targetBlock?.text, expected);
});

test("paginação pura consome todas as linhas sem elipse ou perda", () => {
  const original = Array.from({ length: 41 }, (_, index) => `linha-${index + 1}`);
  const rendered = [];
  let remaining = original;
  for (const capacity of [7, 3, 11, 1, 19]) {
    const page = pdf.splitAiInsightsPdfLines(remaining, capacity);
    rendered.push(...page.visible);
    remaining = page.remaining;
  }
  if (remaining.length) {
    const page = pdf.splitAiInsightsPdfLines(remaining, remaining.length);
    rendered.push(...page.visible);
    remaining = page.remaining;
  }

  assert.deepEqual(rendered, original);
  assert.deepEqual(remaining, []);
  assert.deepEqual(pdf.splitAiInsightsPdfLines(original, 0), {
    remaining: original,
    visible: [],
  });
});

test("nome do PDF é seguro e usa a data civil do fuso da análise", () => {
  const report = validReport();
  const instant = new Date("2026-08-27T01:30:00.000Z");

  assert.equal(
    pdf.safeAiInsightsPdfFilename(" Relatório IA: Agosto/2026.pdf "),
    "relatorio-ia-agosto-2026",
  );
  assert.equal(
    pdf.createAiInsightsPdfFilename(report, instant),
    "ia-advisor-2026-08-26.pdf",
  );
  assert.equal(
    pdf.createAiInsightsPdfFilename(report, instant, "Shopping São José"),
    "ia-advisor-shopping-sao-jose-2026-08-26.pdf",
  );
  assert.doesNotMatch(
    pdf.createAiInsightsPdfFilename(report, instant, "Shopping São José"),
    /counting|occupancy|live|analysis|reports/,
  );
  assert.match(
    pdf.formatAiInsightsPdfDateTime(instant, "America/Sao_Paulo"),
    /26\/08\/2026.*22:30/,
  );
  assert.match(
    pdf.formatAiInsightsPdfDateTime(instant, "Fuso/Inexistente"),
    /27\/08\/2026.*01:30/,
  );
});

test("renderizador gera A4 retrato multipágina com conteúdo extremo", async () => {
  const report = validReport();
  const longText = Array.from(
    { length: 90 },
    (_, index) => `evidência operacional verificável ${index + 1}`,
  ).join(" · ");
  report.insights.summary = longText;
  report.insights.findings = Array.from({ length: 8 }, (_, index) => ({
    confidence: index % 2 ? "media" : "alta",
    evidence: `${longText} FIM-EVIDENCIA-${index}`,
    interpretation: `${longText} FIM-INTERPRETACAO-${index}`,
    title: `Evidência extensa ${index + 1}`,
    widget: `Widget ${index + 1}`,
  }));
  report.insights.actions = Array.from({ length: 8 }, (_, index) => ({
    baseline: "1.000 visitas",
    confidence: "media",
    effort: "medio",
    expectedEffect: `${longText} FIM-EFEITO-${index}`,
    measurementWindow: "Quatro semanas comparáveis",
    owner: "Operações",
    priority: index === 0 ? "imediata" : "alta",
    risks: [`${longText} FIM-RISCO-${index}`],
    steps: Array.from(
      { length: 6 },
      (_, step) => `${longText} FIM-PASSO-${index}-${step}`,
    ),
    target: "1.100 visitas",
    targetKpi: "Fluxo diário",
    title: `Ação extensa ${index + 1}`,
    whyNow: `${longText} FIM-MOTIVO-${index}`,
  }));

  const { doc, filename } = await pdf.createAiInsightsPdfDocument(report, {
    exportedAt: new Date("2026-08-27T12:00:00.000Z"),
  });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const bytes = doc.output("arraybuffer");

  assert.ok(width < height, "o documento deve permanecer em A4 retrato");
  assert.ok(doc.getNumberOfPages() > 10, "conteúdo extenso deve paginar");
  assert.ok(bytes.byteLength > 20_000, "o PDF precisa conter conteúdo vetorial");
  assert.equal(filename, "ia-advisor-2026-08-27.pdf");
});

test("exportador não depende de screenshots, captura do DOM ou impressão", () => {
  const source = readFileSync(
    resolve(projectRoot, "lib/ai-insights-pdf.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /html2canvas|window\.print|querySelector|getContext|toDataURL|renderEChart/i,
  );
  assert.match(source, /orientation: "portrait"/);
  assert.match(source, /drawPageFooters/);
  assert.match(source, /Página \$\{page\} de \$\{pageCount\}/);
  assert.match(source, /splitAiInsightsPdfLines/);
  assert.match(source, /EMPRESA · \$\{companyLabel\}/);
  assert.match(source, /PERÍODO ANALISADO · \$\{periodLabel\}/);
  assert.doesNotMatch(source, /sectionTitle/);
  for (const removedLabel of [
    "Visão de origem",
    "Módulo / visão",
    "Intervalo civil",
    "Dados consolidados até",
  ]) {
    assert.equal(source.includes(removedLabel), false);
  }
});

function validReport() {
  return {
    id: "analysis-2026-08-27-001",
    insights: {
      actions: [
        {
          baseline: "3.000 visitas",
          confidence: "media",
          effort: "baixo",
          expectedEffect: "Elevar o fluxo qualificado no período de menor movimento.",
          measurementWindow: "Quatro semanas comparáveis",
          owner: "Marketing",
          priority: "baixa",
          risks: ["Evitar comparar dias com eventos extraordinários."],
          steps: ["Mapear o corredor com menor conversão.", "Executar um piloto A/B."],
          target: "3.300 visitas",
          targetKpi: "Fluxo diário",
          title: "Revisar a sinalização",
          whyNow: "A faixa apresentou recorrência de fluxo abaixo da média.",
        },
        {
          baseline: "900 visitas por hora",
          confidence: "alta",
          effort: "medio",
          expectedEffect: "Capturar demanda adicional com atendimento compatível.",
          measurementWindow: "Duas semanas comparáveis",
          owner: "Operações",
          priority: "imediata",
          risks: ["Dimensionar a equipe sem degradar os horários adjacentes."],
          steps: ["Realocar equipe 30 minutos antes do pico.", "Medir fila e fluxo."],
          target: "1.050 visitas por hora",
          targetKpi: "Fluxo no pico",
          title: "Reforçar a operação no pico",
          whyNow: "Todos os dias analisados repetiram o pico entre 18h e 19h.",
        },
      ],
      dataQuality: {
        notes: ["O último dia possui somente horas fechadas."],
        status: "parcial",
      },
      disclaimer: "Resultados esperados são hipóteses e exigem validação controlada.",
      findings: [
        {
          confidence: "alta",
          evidence: "O fluxo das 18h superou a média diária em todos os dias.",
          interpretation: "A recorrência sustenta priorizar a operação antes do pico.",
          title: "Pico recorrente às 18h",
          widget: "Fluxo por hora",
        },
      ],
      period: {
        from: "2026-08-01",
        label: "Agosto de 2026",
        timeZone: "America/Sao_Paulo",
        to: "2026-08-26",
      },
      questions: ["Quais campanhas estiveram ativas nos dias de maior fluxo?"],
      source: {
        capturedAt: "2026-08-27T01:30:00.000Z",
        dataCompleteUntil: "2026-08-27T00:59:59.000Z",
        module: "counting",
        reportTitle: "Análise de contagem",
        surface: "analysis",
      },
      summary: "Os dados mostram concentração recorrente no início da noite.",
    },
    meta: {
      generatedAt: "2026-08-27T01:35:00.000Z",
      model: "gpt-5.6-terra",
      usage: {
        inputTokens: 1_200,
        outputTokens: 800,
        totalTokens: 2_000,
      },
    },
  };
}

function loadTypeScriptModule(relativePath) {
  const filename = resolve(projectRoot, relativePath);
  const cached = moduleCache.get(filename);
  if (cached) return cached.exports;

  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loadedModule = { exports: {} };
  moduleCache.set(filename, loadedModule);
  const nodeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (!specifier.startsWith("@/")) return nodeRequire(specifier);
    return loadTypeScriptModule(`${specifier.slice(2)}.ts`);
  };
  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  );
  execute(
    loadedModule.exports,
    localRequire,
    loadedModule,
    filename,
    dirname(filename),
  );
  return loadedModule.exports;
}
