export type OccupancySnapshotsProxyResult = {
  payload: unknown;
  status: number;
};

const BACKEND_UNAVAILABLE_MESSAGE =
  "Os dados de ocupação estão temporariamente indisponíveis.";
const INVALID_BACKEND_RESPONSE_MESSAGE =
  "Não foi possível interpretar os dados de ocupação recebidos.";

export async function resolveOccupancySnapshotsProxyResult(
  response: Response | null,
): Promise<OccupancySnapshotsProxyResult> {
  if (!response) {
    return {
      payload: { error: BACKEND_UNAVAILABLE_MESSAGE },
      status: 502,
    };
  }

  const invalidJson = Symbol("invalid-json");
  const payload = await response.json().catch(() => invalidJson);
  if (
    payload === invalidJson ||
    payload === null ||
    typeof payload !== "object"
  ) {
    return {
      payload: { error: INVALID_BACKEND_RESPONSE_MESSAGE },
      status: response.ok ? 502 : response.status,
    };
  }

  return { payload, status: response.status };
}
