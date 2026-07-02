import type { Worker } from "@/lib/types";

type WorkerRecord = Worker & Record<string, unknown>;

const nestedKeys = [
  "metadata",
  "data",
  "payload",
  "heartbeat",
  "status",
  "system",
] as const;

export function getWorkerDisplayInfo(worker: Worker) {
  const record = worker as WorkerRecord;
  const hostname = firstString(record, [
    "hostname",
    "host_name",
    "hostName",
    "host",
    "machine_name",
    "machineName",
    "device_name",
    "deviceName",
    "computer_name",
    "computerName",
    "node_name",
    "nodeName",
  ]);
  const ipAddress = firstString(record, [
    "ip_address",
    "ipAddress",
    "ip",
    "host_ip",
    "hostIp",
    "private_ip",
    "privateIp",
    "public_ip",
    "publicIp",
    "local_ip",
    "localIp",
  ]);
  const version = normalizeVersion(
    firstString(record, [
      "version",
      "worker_version",
      "workerVersion",
      "app_version",
      "appVersion",
      "software_version",
      "softwareVersion",
      "build_version",
      "buildVersion",
    ]),
  );
  const lastSeenAt = firstString(record, [
    "last_seen_at",
    "lastSeenAt",
    "last_seen",
    "lastSeen",
    "seen_at",
    "seenAt",
    "heartbeat_at",
    "heartbeatAt",
    "last_heartbeat_at",
    "lastHeartbeatAt",
    "last_checkin_at",
    "lastCheckinAt",
    "updated_at",
    "updatedAt",
    "received_at",
    "receivedAt",
  ]);
  const apiKeyPrefix = firstString(record, [
    "api_key_prefix",
    "apiKeyPrefix",
    "key_prefix",
    "keyPrefix",
  ]);
  const identifier = firstString(record, [
    "local_worker_id",
    "localWorkerId",
    "worker_id",
    "workerId",
    "edge_worker_id",
    "edgeWorkerId",
    "client_worker_id",
    "clientWorkerId",
  ]);

  return {
    apiKeyPrefix,
    environment: [hostname, ipAddress].filter(Boolean).join(" / "),
    hostname,
    identifier,
    ipAddress,
    lastSeenAt,
    version,
  };
}

function firstString(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = cleanString(record[key]);
    if (value) return value;
  }

  for (const key of nestedKeys) {
    const value = record[key];
    if (!value || typeof value !== "object") continue;

    const found = firstStringInObject(value as Record<string, unknown>, keys, 0);
    if (found) return found;
  }

  return "";
}

function firstStringInObject(
  record: Record<string, unknown>,
  keys: readonly string[],
  depth: number,
): string {
  for (const key of keys) {
    const value = cleanString(record[key]);
    if (value) return value;
  }

  if (depth >= 2) return "";

  for (const value of Object.values(record)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const found = firstStringInObject(
      value as Record<string, unknown>,
      keys,
      depth + 1,
    );
    if (found) return found;
  }

  return "";
}

function cleanString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeVersion(value: string) {
  if (!value) return "";
  return value.toLowerCase().startsWith("v") ? value : `v${value}`;
}
