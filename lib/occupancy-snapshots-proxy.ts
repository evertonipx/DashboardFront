export type OccupancySnapshotsProxyResult = {
  payload: unknown;
  status: number;
};

const BACKEND_UNAVAILABLE_MESSAGE =
  "Backend de ocupação indisponível para consultar snapshots.";
const INVALID_BACKEND_RESPONSE_MESSAGE =
  "O backend de ocupação não retornou uma resposta JSON certificável.";

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
