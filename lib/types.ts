export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type Session = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: number;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  company_id?: string;
  company_name?: string;
  company_trade_name?: string | null;
  company?: CurrentUserCompany;
  is_master: boolean;
  role?: "super-admin" | "admin" | "operator" | string;
  permissions?: UserPermission[];
};

export type CurrentUserCompany = {
  id: string;
  name: string;
  trade_name?: string | null;
};

export type Permission = {
  id: string;
  module_id?: string;
  slug: string;
  action?: string;
  created_at?: string;
  module?: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    active?: boolean;
  };
};

export type UserPermission = {
  id: string;
  permission_id?: string;
  user_id?: string;
  company_id?: string;
  module_id?: string;
  slug: string;
  action?: string;
  can_view?: boolean;
  can_create?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  can_export?: boolean;
  module?: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    active?: boolean;
  };
};

export type DashboardSummary = {
  total_events: number;
  active_cameras: number;
  active_workers: number;
};

export type RealtimeEventRow = {
  bucket: string;
  camera_id: string;
  metric_type: string;
  total: number;
};

export type RealtimeEventsResponse = {
  data: RealtimeEventRow[];
};

export type AnalyticsEventRow = {
  bucket: string;
  camera_id: string;
  line_count_id?: string;
  metric_type: string;
  object_class?: string;
  total: number;
};

export type AggregateGranularity =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "semester"
  | "year";

export type AggregateEventRow = AnalyticsEventRow;

export type AggregateEventsResponse = {
  data: AggregateEventRow[];
  granularity: AggregateGranularity;
};

export type HourlyEventsResponse = {
  data: AnalyticsEventRow[];
};

export type DailyEventsResponse = {
  data: AnalyticsEventRow[];
};

export type ScenarioLine = {
  line_count_id: string;
  action_multiplier: -1 | 0 | 1;
  label?: string;
};

export type Scenario = {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  scenario_type?: string;
  active: boolean;
  config?: number[];
  lines: ScenarioLine[];
  created_at?: string;
  updated_at?: string;
};

export type ScenarioResult = {
  scenario_id: string;
  result: number;
  event_count: number;
  from: string;
  to: string;
};

export type Camera = {
  id: string;
  company_id: string;
  location_id?: string;
  sub_location_id?: string;
  name: string;
  code?: string;
  channel?: string;
  description?: string;
  ip_address?: string;
  active: boolean;
  areas?: CameraArea[];
  occupancy_areas?: CameraArea[];
  line_counts?: CameraLineCount[];
};

export type CameraArea = {
  id?: string;
  area_id?: string;
  area_name?: string;
  area_label?: string;
  camera_id?: string;
  company_id?: string;
  name?: string;
  label?: string;
  code?: string;
  active?: boolean;
  config?: number[];
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

export type Location = {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SubLocation = {
  id: string;
  company_id: string;
  location_id: string;
  name: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CameraLineCount = {
  id: string;
  camera_id: string;
  company_id: string;
  name: string;
  line_code: string;
  active: boolean;
  metric_type?: string;
  type?: string;
  kind?: string;
  target_type?: string;
  object_type?: string;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

export type WorkerConfigLineCount = {
  id: string;
  line_code?: string;
  active?: boolean;
  metric_type?: string;
  name?: string;
  type?: string;
  kind?: string;
  target_type?: string;
  object_type?: string;
};

export type WorkerConfigCamera = {
  id?: string;
  camera_id?: string;
  name?: string;
  line_counts?: WorkerConfigLineCount[];
  areas?: CameraArea[];
  occupancy_areas?: CameraArea[];
};

export type WorkerConfigResponse = {
  company_id?: string;
  cameras?: WorkerConfigCamera[];
};

export type Worker = {
  id: string;
  company_id: string;
  user_id?: string;
  auth_user_id?: string;
  created_by_user_id?: string;
  worker_id?: string;
  local_worker_id?: string;
  client_id?: string;
  name: string;
  description?: string;
  api_key_prefix?: string;
  active: boolean;
  hostname?: string;
  ip_address?: string;
  version?: string;
  metadata?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type OccupancySnapshot = {
  id: string;
  company_id?: string;
  area_id?: string;
  area_name?: string;
  location_id?: string;
  location_name?: string;
  camera_id?: string;
  camera_name?: string;
  worker_id?: string;
  people_count: number;
  capacity?: number | null;
  occupancy_percentage?: number | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  captured_at: string;
  received_at?: string;
  status?: string;
  data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

export type OccupancyRow = {
  area?: string;
  area_label?: string;
  avg?: number;
  camera_id?: string;
  camera_name?: string;
  current_at?: string;
  current_value?: number;
  min?: number;
  object_class?: string;
  peak?: number;
};

export type OccupancySnapshotsResponse =
  | OccupancySnapshot[]
  | {
      areas?: Array<OccupancySnapshot | OccupancyRow | Record<string, unknown>>;
      data?: Array<OccupancySnapshot | OccupancyRow | Record<string, unknown>>;
      snapshots?: Array<OccupancySnapshot | OccupancyRow | Record<string, unknown>>;
    };

export type OccupancyScenarioArea = {
  area_id: string;
  camera_id: string;
  label?: string;
};

export type OccupancyScenario = {
  id: string;
  company_id: string;
  name: string;
  object_class: string;
  active: boolean;
  areas: OccupancyScenarioArea[];
  config?: number[];
  min_total?: number | null;
  max_total?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type OccupancyScenarioListResponse =
  | OccupancyScenario[]
  | {
      data?: OccupancyScenario[];
    };

export type OccupancyScenarioBucketRow = {
  area_avg?: number;
  area_id?: string;
  area_max?: number;
  area_min?: number;
  bucket: string;
  camera_id?: string;
  scenario_total_avg?: number;
  scenario_total_max?: number;
  scenario_total_min?: number;
};

export type OccupancyScenarioAggregateResponse = {
  data?: OccupancyScenarioBucketRow[];
  granularity?: AggregateGranularity | string;
  scenario_id?: string;
};

export type OccupancyScenarioHistoryAreaRow = {
  area_id: string;
  camera_id: string;
  snapshot_at?: string;
  value: number;
};

export type OccupancyScenarioHistoryResponse = {
  areas?: OccupancyScenarioHistoryAreaRow[];
  as_of?: string;
  scenario_id?: string;
  total: number;
};

export type OccupancyAlertRow = {
  id: number;
  object_class?: string;
  scenario_id?: string;
  threshold_kind?: "min" | "max" | string;
  threshold_value?: number;
  total_value?: number;
  triggered_at?: string;
};

export type OccupancyAlertListResponse =
  | OccupancyAlertRow[]
  | {
      data?: OccupancyAlertRow[];
    };

export type CreateWorkerResponse = {
  id: string;
  company_id?: string;
  client_id?: string;
  name: string;
  api_key: string;
  api_key_prefix?: string;
};

export type RotateWorkerKeyResponse = {
  api_key: string;
  api_key_prefix?: string;
};

export type ScenarioPayload = {
  name: string;
  description?: string;
  scenario_type: string;
  active?: boolean;
  lines: ScenarioLine[];
};
