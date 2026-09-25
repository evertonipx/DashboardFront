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

/**
 * Cancels work that may still be running alongside a failed request while
 * preserving whether the failure itself was an expected cancellation.
 *
 * The classification must happen before aborting the shared controller;
 * otherwise a real error would be mistaken for an AbortError merely because
 * this function cancelled its still-pending siblings.
 */
export function abortPendingRequestsAfterFailure(
  controller: AbortController,
  error: unknown,
  message = DEFAULT_ABORT_MESSAGE,
) {
  const requestWasAborted =
    controller.signal.aborted || isAbortError(error, controller.signal);
  abortRequest(controller, message);
  return requestWasAborted;
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
