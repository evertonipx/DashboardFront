import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  abortPendingRequestsAfterFailure,
  abortRequest,
  createAbortError,
} from "../lib/request-cancellation.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("falha real cancela os irmãos sem converter o erro original em AbortError", async () => {
  const controller = new AbortController();
  const failure = new Error("falha primária");
  let siblingCancelled = false;

  const sibling = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => {
        siblingCancelled = true;
        reject(controller.signal.reason);
      },
      { once: true },
    );
  });

  let observedFailure: unknown;
  try {
    await Promise.all([Promise.reject(failure), sibling]);
  } catch (error) {
    observedFailure = error;
    const requestWasAborted = abortPendingRequestsAfterFailure(
      controller,
      error,
      "Cancelando consultas irmãs.",
    );
    assert.equal(requestWasAborted, false);
  }

  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(observedFailure, failure);
  assert.equal(failure.name, "Error");
  assert.equal(siblingCancelled, true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason?.name, "AbortError");
  assert.equal(controller.signal.reason?.message, "Cancelando consultas irmãs.");
});

test("cancelamento esperado preserva a razão existente e continua classificável", () => {
  const controller = new AbortController();
  abortRequest(controller, "A ação foi fechada.");
  const originalReason = controller.signal.reason;

  const requestWasAborted = abortPendingRequestsAfterFailure(
    controller,
    new Error("erro tardio de um ramo"),
    "Esta razão não deve substituir a original.",
  );

  assert.equal(requestWasAborted, true);
  assert.equal(controller.signal.reason, originalReason);
});

test("AbortError de um ramo também interrompe os demais ramos ativos", () => {
  const controller = new AbortController();
  const requestWasAborted = abortPendingRequestsAfterFailure(
    controller,
    createAbortError("Ramo cancelado."),
    "Cancelando os demais ramos.",
  );

  assert.equal(requestWasAborted, true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(controller.signal.reason?.name, "AbortError");
});

test("ações de relatório e IA cancelam consultas irmãs antes de tratar a falha", () => {
  const reportAction = readFileSync(
    resolve(root, "components/app/report-export-actions.tsx"),
    "utf8",
  );
  const aiAction = readFileSync(
    resolve(root, "components/app/ai-analysis-action.tsx"),
    "utf8",
  );

  assert.match(
    reportAction,
    /catch \(error\) \{[\s\S]*?const requestWasAborted = abortPendingRequestsAfterFailure\([\s\S]*?if \(requestWasAborted\) return;[\s\S]*?toast\.error\(userFacingErrorMessage\(error,/,
  );
  assert.match(
    aiAction,
    /catch \(error\) \{[\s\S]*?const requestWasAborted = abortPendingRequestsAfterFailure\([\s\S]*?analysisRequestSequence\.current !== requestId \|\|[\s\S]*?requestWasAborted[\s\S]*?setAnalysisError\(toUiError\(error,/,
  );
  assert.doesNotMatch(reportAction, /controller\.abort\(\s*\)/);
  assert.doesNotMatch(aiAction, /controller\.abort\(\s*\)/);
});
