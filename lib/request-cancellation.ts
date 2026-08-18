const DEFAULT_ABORT_MESSAGE = "A solicitação foi cancelada porque ficou obsoleta.";

export function createAbortError(message = DEFAULT_ABORT_MESSAGE): Error {
  if (typeof DOMException === "function") {
    return new DOMException(message, "AbortError");
  }

  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function abortRequest(
  controller: AbortController,
  message = DEFAULT_ABORT_MESSAGE,
) {
  if (controller.signal.aborted) return;
  controller.abort(createAbortError(message));
}

export function isAbortError(error: unknown, signal?: AbortSignal) {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  ) {
    return true;
  }

  return Boolean(signal?.aborted && error === signal.reason);
}
