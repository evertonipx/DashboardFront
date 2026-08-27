export type AiInsightsBodyErrorCode =
  | "empty_body"
  | "invalid_body"
  | "payload_too_large"
  | "request_aborted";

export class AiInsightsBodyError extends Error {
  readonly code: AiInsightsBodyErrorCode;

  constructor(code: AiInsightsBodyErrorCode) {
    super(code);
    this.name = "AiInsightsBodyError";
    this.code = code;
  }
}

type ReadableRequestBody = {
  body: ReadableStream<Uint8Array> | null;
  signal: AbortSignal;
};

/** Reads and validates the complete UTF-8 request stream by bytes, not chars. */
export async function readLimitedUtf8Body(
  request: ReadableRequestBody,
  maximumBytes: number,
) {
  if (!request.body) throw new AiInsightsBodyError("empty_body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AiInsightsBodyError("payload_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof AiInsightsBodyError) throw error;
    if (request.signal.aborted) {
      throw new AiInsightsBodyError("request_aborted");
    }
    throw new AiInsightsBodyError("invalid_body");
  } finally {
    reader.releaseLock();
  }

  if (!text.trim()) throw new AiInsightsBodyError("empty_body");
  return text;
}
