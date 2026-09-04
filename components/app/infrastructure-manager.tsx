"use client";

import * as React from "react";
import {
  CheckCircle2,
  Edit,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { useResourceAutoRefresh } from "@/components/app/use-resource-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import {
  CAMERA_GROUPS_UPDATED_EVENT,
  type CameraGroup,
  type CameraGroupScopeType,
  type WorkerLocationAssignments,
  readCameraGroups,
  readWorkerLocationAssignments,
  resolveCameraGroupCompanyScope,
  setWorkerLocationAssignment,
  upsertCameraGroup,
} from "@/lib/camera-groups";
import {
  filterScopedApiRows,
  MASTER_COMPANY_SCOPE_EVENT,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import { canManageCameras, canManageLocations } from "@/lib/permissions";
import type {
  Camera,
  CameraLineCount,
  Location,
  SubLocation,
  Worker,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import {
  normalizeWorkerRows,
  partitionWorkersByCompanyScope,
  sortWorkersByActivity,
  workersFromExplicitCompanyScope,
} from "@/lib/worker-scope";

type LocationFormState = {
  name: string;
  description: string;
  active: string;
  worker_id: string;
};

type SubLocationFormState = {
  name: string;
  active: string;
};

type CameraFormState = {
  name: string;
  code: string;
  description: string;
  location_id: string;
  sub_location_id: string;
  active: string;
};

type LineCountFormState = {
  name: string;
  line_code: string;
  active: string;
};

type ResourceLoadOptions = {
  preferCache?: boolean;
  silent?: boolean;
};

type CameraGroupFormState = {
  camera_ids: string[];
  name: string;
  scope_id: string;
  scope_type: CameraGroupScopeType;
};

type InfrastructureTab = "locations" | "cameras";
type InfrastructureView = InfrastructureTab | "all";
type BulkDeleteKind = "locations" | "subLocations" | "cameras" | "lines";

type BulkDeleteRequest = {
  companyId: string;
  items: Array<{ id: string; name: string }>;
  kind: BulkDeleteKind;
  parentId?: string;
};

type ResourceListFilter = {
  query: string;
  status: "active" | "all" | "inactive";
};

const INFRASTRUCTURE_CACHE_TTL_MS = 45_000;
const INFRASTRUCTURE_REFRESH_INTERVAL_MS = 60_000;

type InfrastructureCacheEntry = {
  expiresAt: number;
  value: unknown;
};

const infrastructureResourceCache = new Map<string, InfrastructureCacheEntry>();
const infrastructureResourceRequests = new Map<string, Promise<unknown>>();

function readCachedInfrastructureResource<T>(key: string) {
  const cached = infrastructureResourceCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    infrastructureResourceCache.delete(key);
    return undefined;
  }
  return cached.value as T;
}

async function fetchCachedInfrastructureResource<T>({
  force,
  key,
  preferCache,
  request,
}: {
  force?: boolean;
  key: string;
  preferCache: boolean;
  request: () => Promise<T>;
}) {
  if (preferCache) {
    const cached = readCachedInfrastructureResource<T>(key);
    if (cached !== undefined) return cached;
  }

  const pending = force ? undefined : infrastructureResourceRequests.get(key);
  if (pending) return pending as Promise<T>;

  const nextRequest = request()
    .then((value) => {
      if (infrastructureResourceRequests.get(key) === nextRequest) {
        infrastructureResourceCache.set(key, {
          expiresAt: Date.now() + INFRASTRUCTURE_CACHE_TTL_MS,
          value,
        });
      }
      return value;
    })
    .finally(() => {
      if (infrastructureResourceRequests.get(key) === nextRequest) {
        infrastructureResourceRequests.delete(key);
      }
    });
  infrastructureResourceRequests.set(key, nextRequest);
  return nextRequest;
}

const emptyLocationForm: LocationFormState = {
  name: "",
  description: "",
  active: "true",
  worker_id: "",
};

const emptySubLocationForm: SubLocationFormState = {
  name: "",
  active: "true",
};

const emptyCameraForm: CameraFormState = {
  name: "",
  code: "",
  description: "",
  location_id: "",
  sub_location_id: "none",
  active: "true",
};

const emptyLineForm: LineCountFormState = {
  name: "",
  line_code: "",
  active: "true",
};

const emptyCameraGroupForm: CameraGroupFormState = {
  camera_ids: [],
  name: "",
  scope_id: "",
  scope_type: "sub_location",
};

const emptyResourceListFilter: ResourceListFilter = {
  query: "",
  status: "all",
};

export function InfrastructureManager({
  view = "all",
}: {
  view?: InfrastructureView;
}) {
  const { user } = useAuth();
  const canEditLocations = canManageLocations(user);
  const canEditCameras = canManageCameras(user);
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const companyScopeIdRef = React.useRef(companyScopeId);
  const baseRequestSequenceRef = React.useRef(0);
  const workerRequestSequenceRef = React.useRef(0);
  const subLocationRequestSequenceRef = React.useRef(0);
  const lineCountRequestSequenceRef = React.useRef(0);
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [subLocations, setSubLocations] = React.useState<SubLocation[]>([]);
  const [cameras, setCameras] = React.useState<Camera[]>([]);
  const [workers, setWorkers] = React.useState<Worker[]>([]);
  const [cameraGroups, setCameraGroups] = React.useState<CameraGroup[]>([]);
  const [workerLocationAssignments, setWorkerLocationAssignments] =
    React.useState<WorkerLocationAssignments>({});
  const [cameraGroupScopeId, setCameraGroupScopeId] = React.useState(() =>
    resolveCameraGroupCompanyScope(null),
  );
  const [lineCounts, setLineCounts] = React.useState<CameraLineCount[]>([]);
  const [cameraSubLocations, setCameraSubLocations] = React.useState<
    SubLocation[]
  >([]);
  const [selectedLocationId, setSelectedLocationId] = React.useState("");
  const [selectedSubLocationId, setSelectedSubLocationId] = React.useState("");
  const [selectedCameraId, setSelectedCameraId] = React.useState("");
  const selectedLocationIdRef = React.useRef(selectedLocationId);
  const selectedCameraIdRef = React.useRef(selectedCameraId);
  const [activeTab, setActiveTab] = React.useState<InfrastructureTab>(
    view === "cameras" ? "cameras" : "locations",
  );
  const [loading, setLoading] = React.useState(true);
  const [loadingSubLocations, setLoadingSubLocations] = React.useState(false);
  const [loadingLineCounts, setLoadingLineCounts] = React.useState(false);
  const [locationDialog, setLocationDialog] = React.useState(false);
  const [subLocationDialog, setSubLocationDialog] = React.useState(false);
  const [cameraGroupDialog, setCameraGroupDialog] = React.useState(false);
  const [cameraDialog, setCameraDialog] = React.useState(false);
  const [lineDialog, setLineDialog] = React.useState(false);
  const [editingLocation, setEditingLocation] = React.useState<Location | null>(
    null,
  );
  const [editingSubLocation, setEditingSubLocation] =
    React.useState<SubLocation | null>(null);
  const [editingCameraGroup, setEditingCameraGroup] =
    React.useState<CameraGroup | null>(null);
  const [editingCamera, setEditingCamera] = React.useState<Camera | null>(null);
  const [editingLine, setEditingLine] = React.useState<CameraLineCount | null>(
    null,
  );
  const [locationForm, setLocationForm] =
    React.useState<LocationFormState>(emptyLocationForm);
  const [subLocationForm, setSubLocationForm] =
    React.useState<SubLocationFormState>(emptySubLocationForm);
  const [cameraForm, setCameraForm] =
    React.useState<CameraFormState>(emptyCameraForm);
  const [lineForm, setLineForm] =
    React.useState<LineCountFormState>(emptyLineForm);
  const [cameraGroupForm, setCameraGroupForm] =
    React.useState<CameraGroupFormState>(emptyCameraGroupForm);
  const [saving, setSaving] = React.useState(false);
  const [checkedLocationIds, setCheckedLocationIds] = React.useState<string[]>(
    [],
  );
  const [checkedSubLocationIds, setCheckedSubLocationIds] = React.useState<
    string[]
  >([]);
  const [checkedCameraIds, setCheckedCameraIds] = React.useState<string[]>([]);
  const [checkedLineIds, setCheckedLineIds] = React.useState<string[]>([]);
  const [bulkDeleteRequest, setBulkDeleteRequest] =
    React.useState<BulkDeleteRequest | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [bulkUpdating, setBulkUpdating] = React.useState(false);
  const [baseCatalogCompanyId, setBaseCatalogCompanyId] = React.useState("");
  const [subLocationCatalogScope, setSubLocationCatalogScope] = React.useState({
    companyId: "",
    parentId: "",
  });
  const [lineCatalogScope, setLineCatalogScope] = React.useState({
    companyId: "",
    parentId: "",
  });
  const [locationFilter, setLocationFilter] =
    React.useState<ResourceListFilter>(emptyResourceListFilter);
  const [subLocationFilter, setSubLocationFilter] =
    React.useState<ResourceListFilter>(emptyResourceListFilter);
  const [cameraFilter, setCameraFilter] = React.useState<ResourceListFilter>(
    emptyResourceListFilter,
  );
  const [lineFilter, setLineFilter] = React.useState<ResourceListFilter>(
    emptyResourceListFilter,
  );
  const bulkMutationRunning = saving || bulkDeleting || bulkUpdating;
  const baseCatalogCertified =
    Boolean(companyScopeId) && baseCatalogCompanyId === companyScopeId;
  const subLocationCatalogCertified =
    baseCatalogCertified &&
    Boolean(selectedLocationId) &&
    subLocationCatalogScope.companyId === companyScopeId &&
    subLocationCatalogScope.parentId === selectedLocationId;
  const lineCatalogCertified =
    baseCatalogCertified &&
    Boolean(selectedCameraId) &&
    lineCatalogScope.companyId === companyScopeId &&
    lineCatalogScope.parentId === selectedCameraId;
  const baseActionsDisabled = bulkMutationRunning || !baseCatalogCertified;
  const subLocationActionsDisabled =
    bulkMutationRunning || !subLocationCatalogCertified;
  const lineActionsDisabled = bulkMutationRunning || !lineCatalogCertified;
  const locationsTabActive =
    view === "locations" || (view === "all" && activeTab === "locations");
  const camerasTabActive =
    view === "cameras" || (view === "all" && activeTab === "cameras");
  const needsWorkerCatalog =
    locationsTabActive &&
    (canEditLocations || Object.keys(workerLocationAssignments).length > 0);
  const infrastructureCacheScope = `${user?.id ?? "anonymous"}:${companyScopeId ?? "none"}`;
  const editingDialogOpen =
    locationDialog ||
    subLocationDialog ||
    cameraGroupDialog ||
    cameraDialog ||
    lineDialog ||
    Boolean(bulkDeleteRequest) ||
    bulkUpdating;
  const workersById = React.useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker])),
    [workers],
  );

  React.useLayoutEffect(() => {
    companyScopeIdRef.current = companyScopeId;
  }, [companyScopeId]);

  React.useLayoutEffect(() => {
    selectedLocationIdRef.current = selectedLocationId;
  }, [selectedLocationId]);

  React.useLayoutEffect(() => {
    selectedCameraIdRef.current = selectedCameraId;
  }, [selectedCameraId]);

  const selectedLocation = React.useMemo(
    () =>
      baseCatalogCertified
        ? locations.find((location) => location.id === selectedLocationId) ?? null
        : null,
    [baseCatalogCertified, locations, selectedLocationId],
  );
  const selectedCamera = React.useMemo(
    () =>
      baseCatalogCertified
        ? cameras.find((camera) => camera.id === selectedCameraId) ?? null
        : null,
    [baseCatalogCertified, cameras, selectedCameraId],
  );
  const selectedSubLocation = React.useMemo(
    () =>
      subLocationCatalogCertified
        ? subLocations.find(
            (subLocation) => subLocation.id === selectedSubLocationId,
          ) ?? null
        : null,
    [selectedSubLocationId, subLocationCatalogCertified, subLocations],
  );
  const cameraGroupAvailableCameras = React.useMemo(
    () =>
      cameras.filter(
        (camera) =>
          camera.active !== false &&
          camera.location_id === selectedSubLocation?.location_id,
      ),
    [cameras, selectedSubLocation?.location_id],
  );
  const locationsById = React.useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );
  const cameraSearchByLocationId = React.useMemo(() => {
    const search = new Map<string, string[]>();
    cameras.forEach((camera) => {
      if (!camera.location_id) return;
      const values = search.get(camera.location_id) ?? [];
      values.push(camera.name, camera.code ?? "");
      search.set(camera.location_id, values);
    });
    return search;
  }, [cameras]);
  const cameraSearchBySubLocationId = React.useMemo(() => {
    const search = new Map<string, string[]>();
    const camerasById = new Map(cameras.map((camera) => [camera.id, camera]));
    cameras.forEach((camera) => {
      if (!camera.sub_location_id) return;
      const values = search.get(camera.sub_location_id) ?? [];
      values.push(camera.name, camera.code ?? "");
      search.set(camera.sub_location_id, values);
    });
    cameraGroups.forEach((group) => {
      if (group.scope_type !== "sub_location") return;
      const values = search.get(group.scope_id) ?? [];
      group.camera_ids.forEach((cameraId) => {
        const camera = camerasById.get(cameraId);
        if (camera) values.push(camera.name, camera.code ?? "");
      });
      search.set(group.scope_id, values);
    });
    return search;
  }, [cameraGroups, cameras]);
  const visibleLocations = React.useMemo(
    () =>
      locations.filter((location) => {
        const workerId = workerLocationAssignments[location.id] ?? "";
        const worker = workerId ? workersById.get(workerId) : null;
        return matchesResourceFilter(location.active, locationFilter, [
          location.name,
          location.description,
          worker?.name,
          worker?.description,
          ...(cameraSearchByLocationId.get(location.id) ?? []),
        ]);
      }),
    [
      cameraSearchByLocationId,
      locationFilter,
      locations,
      workerLocationAssignments,
      workersById,
    ],
  );
  const visibleSubLocations = React.useMemo(
    () =>
      subLocations.filter((subLocation) =>
        matchesResourceFilter(subLocation.active, subLocationFilter, [
          subLocation.name,
          ...(cameraSearchBySubLocationId.get(subLocation.id) ?? []),
        ]),
      ),
    [cameraSearchBySubLocationId, subLocationFilter, subLocations],
  );
  const visibleCameras = React.useMemo(
    () =>
      cameras.filter((camera) =>
        matchesResourceFilter(camera.active, cameraFilter, [
          camera.name,
          camera.code,
          camera.description,
          camera.location_id
            ? locationsById.get(camera.location_id)?.name
            : undefined,
        ]),
      ),
    [cameraFilter, cameras, locationsById],
  );
  const visibleLineCounts = React.useMemo(
    () =>
      lineCounts.filter((line) =>
        matchesResourceFilter(line.active, lineFilter, [
          line.name,
          line.line_code,
          selectedCamera?.name,
          selectedCamera?.code,
        ]),
      ),
    [lineCounts, lineFilter, selectedCamera],
  );

  React.useEffect(() => {
    function syncCameraGroups() {
      const scopeId = resolveCameraGroupCompanyScope(user);
      setCameraGroupScopeId(scopeId);
      setCameraGroups(readCameraGroups(scopeId));
      setWorkerLocationAssignments(readWorkerLocationAssignments(scopeId));
    }

    syncCameraGroups();
    window.addEventListener(CAMERA_GROUPS_UPDATED_EVENT, syncCameraGroups);
    window.addEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCameraGroups);

    return () => {
      window.removeEventListener(CAMERA_GROUPS_UPDATED_EVENT, syncCameraGroups);
      window.removeEventListener(MASTER_COMPANY_SCOPE_EVENT, syncCameraGroups);
    };
  }, [user]);

  React.useEffect(() => {
    setLocations([]);
    setSubLocations([]);
    setCameras([]);
    setWorkers([]);
    setLineCounts([]);
    setCameraSubLocations([]);
    setSelectedLocationId("");
    setSelectedSubLocationId("");
    setSelectedCameraId("");
    setCheckedLocationIds([]);
    setCheckedSubLocationIds([]);
    setCheckedCameraIds([]);
    setCheckedLineIds([]);
    setBulkDeleteRequest(null);
    setBulkDeleting(false);
    setBulkUpdating(false);
    setBaseCatalogCompanyId("");
    setSubLocationCatalogScope({ companyId: "", parentId: "" });
    setLineCatalogScope({ companyId: "", parentId: "" });
    setLocationFilter(emptyResourceListFilter);
    setSubLocationFilter(emptyResourceListFilter);
    setCameraFilter(emptyResourceListFilter);
    setLineFilter(emptyResourceListFilter);
    setLoadingSubLocations(false);
    setLoadingLineCounts(false);
    setLocationDialog(false);
    setSubLocationDialog(false);
    setCameraGroupDialog(false);
    setCameraDialog(false);
    setLineDialog(false);
  }, [companyScopeId]);

  const loadBase = React.useCallback(
    async ({
      preferCache = false,
      silent = false,
    }: ResourceLoadOptions = {}) => {
      const requestSequence = ++baseRequestSequenceRef.current;
      if (!companyScopeId) {
        setLocations([]);
        setCameras([]);
        setBaseCatalogCompanyId("");
        setLoading(false);
        return;
      }
      const requestedCompanyScopeId = companyScopeId;
      const locationsCacheKey = `${infrastructureCacheScope}:locations`;
      const camerasCacheKey = `${infrastructureCacheScope}:cameras`;
      const cachedLocations = preferCache
        ? readCachedInfrastructureResource<Location[]>(locationsCacheKey)
        : undefined;
      const cachedCameras = preferCache
        ? readCachedInfrastructureResource<Camera[]>(camerasCacheKey)
        : undefined;
      if (!silent) {
        setLoading(
          cachedLocations === undefined || cachedCameras === undefined,
        );
      }
      try {
        const [locationsResult, camerasResult] = await Promise.allSettled([
          fetchCachedInfrastructureResource({
            force: !preferCache && !silent,
            key: locationsCacheKey,
            preferCache,
            request: () =>
              apiFetch<Location[]>("/locations", {
                companyScopeId: requestedCompanyScopeId,
              }),
          }),
          fetchCachedInfrastructureResource({
            force: !preferCache && !silent,
            key: camerasCacheKey,
            preferCache,
            request: () =>
              apiFetch<Camera[]>("/cameras", {
                companyScopeId: requestedCompanyScopeId,
              }),
          }),
        ]);
        if (
          requestSequence !== baseRequestSequenceRef.current ||
          companyScopeIdRef.current !== requestedCompanyScopeId
        )
          return;
        if (locationsResult.status === "rejected") throw locationsResult.reason;
        if (camerasResult.status === "rejected") throw camerasResult.reason;
        const locationRows = locationsResult.value;
        const cameraRows = camerasResult.value;
        const scopedLocations = filterScopedApiRows(
          locationRows,
          requestedCompanyScopeId,
        );
        const scopedCameras = filterScopedApiRows(
          cameraRows,
          requestedCompanyScopeId,
        );
        setLocations(scopedLocations);
        setCameras(scopedCameras);
        setBaseCatalogCompanyId(requestedCompanyScopeId);
        setCheckedLocationIds((current) =>
          retainAvailableSelection(current, scopedLocations),
        );
        setCheckedCameraIds((current) =>
          retainAvailableSelection(current, scopedCameras),
        );
        setSelectedLocationId((current) =>
          current && scopedLocations.some((row) => row.id === current)
            ? current
            : (scopedLocations[0]?.id ?? ""),
        );
        setSelectedCameraId((current) =>
          current && scopedCameras.some((row) => row.id === current)
            ? current
            : (scopedCameras[0]?.id ?? ""),
        );
      } catch {
        if (
          !silent &&
          requestSequence === baseRequestSequenceRef.current &&
          companyScopeIdRef.current === requestedCompanyScopeId
        ) {
          toast.error("Não foi possível carregar os locais e câmeras.");
        }
      } finally {
        if (
          !silent &&
          requestSequence === baseRequestSequenceRef.current &&
          companyScopeIdRef.current === requestedCompanyScopeId
        ) {
          setLoading(false);
        }
      }
    },
    [companyScopeId, infrastructureCacheScope],
  );

  const loadWorkers = React.useCallback(
    async ({
      preferCache = false,
      silent = false,
    }: ResourceLoadOptions = {}) => {
      const requestSequence = ++workerRequestSequenceRef.current;
      if (!companyScopeId || !needsWorkerCatalog) {
        if (!companyScopeId) setWorkers([]);
        return;
      }

      const requestedCompanyScopeId = companyScopeId;
      try {
        const rows = await fetchCachedInfrastructureResource({
          force: !preferCache && !silent,
          key: `${infrastructureCacheScope}:workers`,
          preferCache,
          request: () => fetchInfrastructureWorkers(requestedCompanyScopeId),
        });
        if (
          requestSequence !== workerRequestSequenceRef.current ||
          companyScopeIdRef.current !== requestedCompanyScopeId
        )
          return;
        setWorkers(rows);
      } catch {
        if (
          !silent &&
          requestSequence === workerRequestSequenceRef.current &&
          companyScopeIdRef.current === requestedCompanyScopeId
        ) {
          toast.warning("Os Workers estão temporariamente indisponíveis.");
        }
      }
    },
    [companyScopeId, infrastructureCacheScope, needsWorkerCatalog],
  );

  const loadSubLocations = React.useCallback(
    async ({
      preferCache = false,
      silent = false,
    }: ResourceLoadOptions = {}) => {
      const requestSequence = ++subLocationRequestSequenceRef.current;
      if (!locationsTabActive) {
        setLoadingSubLocations(false);
        return;
      }
      if (!companyScopeId || !selectedLocationId) {
        setSubLocations([]);
        setSubLocationCatalogScope({ companyId: "", parentId: "" });
        setSelectedSubLocationId("");
        setLoadingSubLocations(false);
        return;
      }

      const requestedCompanyScopeId = companyScopeId;
      const requestedLocationId = selectedLocationId;
      const cacheKey = `${infrastructureCacheScope}:location:${requestedLocationId}:sub-locations`;
      const cachedRows = preferCache
        ? readCachedInfrastructureResource<SubLocation[]>(cacheKey)
        : undefined;
      if (cachedRows === undefined) {
        setSubLocations([]);
        if (!silent) setLoadingSubLocations(true);
      }
      try {
        const rows = await fetchCachedInfrastructureResource({
          force: !preferCache && !silent,
          key: cacheKey,
          preferCache,
          request: () =>
            apiFetch<SubLocation[]>(
              `/locations/${selectedLocationId}/sub-locations`,
              { companyScopeId: requestedCompanyScopeId },
            ),
        });
        if (
          requestSequence !== subLocationRequestSequenceRef.current ||
          companyScopeIdRef.current !== requestedCompanyScopeId ||
          selectedLocationIdRef.current !== requestedLocationId
        )
          return;
        const scopedRows = filterScopedApiRows(rows, requestedCompanyScopeId);
        setSubLocations(scopedRows);
        setSubLocationCatalogScope({
          companyId: requestedCompanyScopeId,
          parentId: requestedLocationId,
        });
        setCheckedSubLocationIds((current) =>
          retainAvailableSelection(current, scopedRows),
        );
        setSelectedSubLocationId((current) =>
          current && scopedRows.some((row) => row.id === current)
            ? current
            : (scopedRows[0]?.id ?? ""),
        );
      } catch {
        if (
          companyScopeIdRef.current !== requestedCompanyScopeId ||
          selectedLocationIdRef.current !== requestedLocationId
        )
          return;
        if (!silent) {
          toast.error("Não foi possível carregar os setores deste local.");
        }
      } finally {
        if (
          !silent &&
          requestSequence === subLocationRequestSequenceRef.current &&
          companyScopeIdRef.current === requestedCompanyScopeId &&
          selectedLocationIdRef.current === requestedLocationId
        ) {
          setLoadingSubLocations(false);
        }
      }
    },
    [
      companyScopeId,
      infrastructureCacheScope,
      locationsTabActive,
      selectedLocationId,
    ],
  );

  const loadLineCounts = React.useCallback(
    async ({
      preferCache = false,
      silent = false,
    }: ResourceLoadOptions = {}) => {
      const requestSequence = ++lineCountRequestSequenceRef.current;
      if (!camerasTabActive) {
        setLoadingLineCounts(false);
        return;
      }
      if (!companyScopeId || !selectedCameraId) {
        setLineCounts([]);
        setLineCatalogScope({ companyId: "", parentId: "" });
        setLoadingLineCounts(false);
        return;
      }

      const requestedCompanyScopeId = companyScopeId;
      const requestedCameraId = selectedCameraId;
      const cacheKey = `${infrastructureCacheScope}:camera:${requestedCameraId}:line-counts`;
      const cachedRows = preferCache
        ? readCachedInfrastructureResource<CameraLineCount[]>(cacheKey)
        : undefined;
      if (cachedRows === undefined) {
        setLineCounts([]);
        if (!silent) setLoadingLineCounts(true);
      }
      try {
        const rows = await fetchCachedInfrastructureResource({
          force: !preferCache && !silent,
          key: cacheKey,
          preferCache,
          request: () =>
            apiFetch<CameraLineCount[]>(
              `/cameras/${selectedCameraId}/line-counts`,
              { companyScopeId: requestedCompanyScopeId },
            ),
        });
        if (
          requestSequence !== lineCountRequestSequenceRef.current ||
          companyScopeIdRef.current !== requestedCompanyScopeId ||
          selectedCameraIdRef.current !== requestedCameraId
        )
          return;
        const scopedRows = filterScopedApiRows(rows, requestedCompanyScopeId);
        setLineCounts(scopedRows);
        setLineCatalogScope({
          companyId: requestedCompanyScopeId,
          parentId: requestedCameraId,
        });
        setCheckedLineIds((current) =>
          retainAvailableSelection(current, scopedRows),
        );
      } catch {
        if (
          !silent &&
          companyScopeIdRef.current === requestedCompanyScopeId &&
          selectedCameraIdRef.current === requestedCameraId
        ) {
          toast.error("Não foi possível carregar as linhas desta câmera.");
        }
      } finally {
        if (
          !silent &&
          requestSequence === lineCountRequestSequenceRef.current &&
          companyScopeIdRef.current === requestedCompanyScopeId &&
          selectedCameraIdRef.current === requestedCameraId
        ) {
          setLoadingLineCounts(false);
        }
      }
    },
    [
      camerasTabActive,
      companyScopeId,
      infrastructureCacheScope,
      selectedCameraId,
    ],
  );

  React.useEffect(() => {
    void loadBase({ preferCache: true });
  }, [loadBase]);

  React.useEffect(() => {
    void loadWorkers({ preferCache: true });
  }, [loadWorkers]);

  React.useEffect(() => {
    void loadSubLocations({ preferCache: true });
  }, [loadSubLocations]);

  React.useEffect(() => {
    void loadLineCounts({ preferCache: true });
  }, [loadLineCounts]);

  useResourceAutoRefresh(
    async () => {
      const refreshes: Promise<void>[] = [loadBase({ silent: true })];
      if (needsWorkerCatalog) {
        refreshes.push(loadWorkers({ silent: true }));
      }
      if (camerasTabActive) {
        refreshes.push(loadLineCounts({ silent: true }));
      }
      await Promise.all(refreshes);
    },
    {
      enabled:
        Boolean(companyScopeId) &&
        !loading &&
        !loadingSubLocations &&
        !loadingLineCounts &&
        !saving &&
        !editingDialogOpen,
      intervalMs: INFRASTRUCTURE_REFRESH_INTERVAL_MS,
    },
  );

  React.useEffect(() => {
    if (view !== "all") {
      setActiveTab(view);
      return;
    }

    function syncTabWithHash() {
      if (window.location.hash === "#cameras") {
        setActiveTab("cameras");
        return;
      }

      if (
        window.location.hash === "#locations" ||
        window.location.hash === "#configuracoes"
      ) {
        setActiveTab("locations");
      }
    }

    syncTabWithHash();
    window.addEventListener("hashchange", syncTabWithHash);

    return () => window.removeEventListener("hashchange", syncTabWithHash);
  }, [view]);

  React.useEffect(() => {
    if (view !== "all") return;

    const hash = window.location.hash;
    const targetId =
      hash === "#cameras"
        ? "cameras"
        : hash === "#locations" || hash === "#configuracoes"
          ? "locations"
          : "";

    if (!targetId) return;

    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
    });
  }, [activeTab, view]);

  React.useEffect(() => {
    if (!cameraDialog || !cameraForm.location_id) {
      setCameraSubLocations([]);
      return;
    }

    let mounted = true;

    async function loadCameraSubLocations() {
      const requestedCompanyScopeId = companyScopeId;
      if (!requestedCompanyScopeId) return;
      try {
        const requestedLocationId = cameraForm.location_id;
        const rows = await fetchCachedInfrastructureResource({
          key: `${infrastructureCacheScope}:location:${requestedLocationId}:sub-locations`,
          preferCache: true,
          request: () =>
            apiFetch<SubLocation[]>(
              `/locations/${requestedLocationId}/sub-locations`,
              { companyScopeId: requestedCompanyScopeId },
            ),
        });
        if (
          mounted &&
          companyScopeIdRef.current === requestedCompanyScopeId &&
          cameraForm.location_id === requestedLocationId
        ) {
          setCameraSubLocations(
            filterScopedApiRows(rows, requestedCompanyScopeId),
          );
        }
      } catch {
        if (mounted) setCameraSubLocations([]);
      }
    }

    loadCameraSubLocations();

    return () => {
      mounted = false;
    };
  }, [
    cameraDialog,
    cameraForm.location_id,
    companyScopeId,
    infrastructureCacheScope,
  ]);

  function catalogCertifiedFor(kind: BulkDeleteKind) {
    if (kind === "locations" || kind === "cameras") {
      return baseCatalogCertified;
    }
    if (kind === "subLocations") return subLocationCatalogCertified;
    return lineCatalogCertified;
  }

  function requireCertifiedCatalog(kind: BulkDeleteKind) {
    if (catalogCertifiedFor(kind)) return true;
    toast.error("Atualize a lista antes de alterar estes cadastros.");
    return false;
  }

  function bulkRequestIsCurrent(request: BulkDeleteRequest) {
    if (companyScopeIdRef.current !== request.companyId) return false;
    if (request.kind === "subLocations") {
      return selectedLocationIdRef.current === request.parentId;
    }
    if (request.kind === "lines") {
      return selectedCameraIdRef.current === request.parentId;
    }
    return true;
  }

  function openLocation(location?: Location) {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }
    if (!requireCertifiedCatalog("locations")) return;

    setEditingLocation(location ?? null);
    setLocationForm(
      location
        ? {
            name: location.name,
            description: location.description ?? "",
            active: String(location.active),
            worker_id:
              workerLocationAssignments[location.id] ?? workers[0]?.id ?? "",
          }
        : {
            ...emptyLocationForm,
            worker_id: workers[0]?.id ?? "",
          },
    );
    setLocationDialog(true);
  }

  function openSubLocation(subLocation?: SubLocation) {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }
    if (!requireCertifiedCatalog("subLocations")) return;

    if (!selectedLocationId) {
      toast.error("Selecione um local antes de criar um setor.");
      return;
    }

    setEditingSubLocation(subLocation ?? null);
    setSubLocationForm(
      subLocation
        ? { name: subLocation.name, active: String(subLocation.active) }
        : emptySubLocationForm,
    );
    setSubLocationDialog(true);
  }

  function openCameraGroup(subLocation: SubLocation) {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }
    if (!requireCertifiedCatalog("subLocations")) return;

    if (!subLocation) {
      toast.error("Selecione um setor.");
      return;
    }

    const group =
      cameraGroups.find(
        (item) =>
          item.scope_type === "sub_location" &&
          item.scope_id === subLocation.id,
      ) ?? null;
    const fallbackCameraIds = cameras
      .filter(
        (camera) =>
          camera.active !== false && camera.sub_location_id === subLocation.id,
      )
      .map((camera) => camera.id);

    setSelectedSubLocationId(subLocation.id);
    setEditingCameraGroup(group ?? null);
    setCameraGroupForm(
      group
        ? {
            camera_ids: group.camera_ids,
            name: subLocation.name,
            scope_id: group.scope_id,
            scope_type: group.scope_type,
          }
        : {
            ...emptyCameraGroupForm,
            camera_ids: fallbackCameraIds,
            name: subLocation.name,
            scope_id: subLocation.id,
            scope_type: "sub_location",
          },
    );
    setCameraGroupDialog(true);
  }

  function openCamera(camera?: Camera) {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }
    if (!requireCertifiedCatalog("cameras")) return;

    setEditingCamera(camera ?? null);
    setCameraForm(
      camera
        ? {
            name: camera.name,
            code: camera.code ?? "",
            description: camera.description ?? "",
            location_id: camera.location_id ?? locations[0]?.id ?? "",
            sub_location_id: camera.sub_location_id ?? "none",
            active: String(camera.active),
          }
        : {
            ...emptyCameraForm,
            location_id: locations[0]?.id ?? "",
          },
    );
    setCameraDialog(true);
  }

  function openLineCount(line?: CameraLineCount) {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }
    if (!requireCertifiedCatalog("lines")) return;

    if (!selectedCameraId) {
      toast.error("Selecione uma câmera antes de criar uma linha de contagem.");
      return;
    }

    setEditingLine(line ?? null);
    setLineForm(
      line
        ? {
            name: line.name,
            line_code: line.line_code,
            active: String(line.active),
          }
        : emptyLineForm,
    );
    setLineDialog(true);
  }

  async function saveLocation() {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }
    if (!requireCertifiedCatalog("locations")) return;

    const name = locationForm.name.trim();
    if (!name) {
      toast.error("Nome obrigatório");
      return;
    }
    if (!workers.length) {
      toast.error("Cadastre um Worker antes de salvar um local.");
      return;
    }
    if (!locationForm.worker_id) {
      toast.error("Selecione o Worker responsável por este local.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name,
        description: locationForm.description.trim() || undefined,
        active: locationForm.active === "true",
      };
      let savedLocationId = editingLocation?.id ?? "";

      if (editingLocation) {
        const updated = await apiFetch<Partial<Location> | null>(
          `/locations/${editingLocation.id}`,
          {
            companyScopeId,
            method: "PUT",
            body,
          },
        );
        savedLocationId = updated?.id || editingLocation.id;
        toast.success("Local atualizado");
      } else {
        const created = await apiFetch<Partial<Location> | null>("/locations", {
          companyScopeId,
          method: "POST",
          body: {
            name,
            description: locationForm.description.trim() || undefined,
          },
        });
        savedLocationId = created?.id ?? "";
        toast.success("Local criado");
      }

      if (savedLocationId) {
        setWorkerLocationAssignments(
          setWorkerLocationAssignment(
            cameraGroupScopeId,
            savedLocationId,
            locationForm.worker_id,
          ),
        );
      } else {
        toast.warning(
          "O local foi salvo, mas o vínculo com o Worker não pôde ser concluído.",
        );
      }

      setLocationDialog(false);
      await loadBase();
    } catch {
      toast.error("Não foi possível salvar o local.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSubLocation() {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }
    if (!requireCertifiedCatalog("subLocations")) return;

    const name = subLocationForm.name.trim();
    if (!selectedLocationId || !name) {
      toast.error("Selecione o local e informe o nome do setor.");
      return;
    }

    setSaving(true);
    try {
      if (editingSubLocation) {
        await apiFetch(
          `/locations/${selectedLocationId}/sub-locations/${editingSubLocation.id}`,
          {
            companyScopeId,
            method: "PUT",
            body: {
              name,
              active: subLocationForm.active === "true",
            },
          },
        );
        toast.success("Setor atualizado");
      } else {
        await apiFetch(`/locations/${selectedLocationId}/sub-locations`, {
          companyScopeId,
          method: "POST",
          body: { name },
        });
        toast.success("Setor criado");
      }

      setSubLocationDialog(false);
      await loadSubLocations();
    } catch {
      toast.error("Não foi possível salvar o setor.");
    } finally {
      setSaving(false);
    }
  }

  function saveCameraGroup() {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }
    if (!requireCertifiedCatalog("subLocations")) return;

    const cameraIds = cameraGroupForm.camera_ids.filter((cameraId) =>
      cameraGroupAvailableCameras.some((camera) => camera.id === cameraId),
    );
    if (!selectedSubLocation || !cameraGroupForm.scope_id) {
      toast.error("Selecione um setor.");
      return;
    }
    if (!cameraIds.length) {
      toast.error("Selecione ao menos uma câmera para o setor.");
      return;
    }

    const nextGroups = upsertCameraGroup(cameraGroupScopeId, {
      ...editingCameraGroup,
      camera_ids: cameraIds,
      name: selectedSubLocation.name,
      scope_id: cameraGroupForm.scope_id,
      scope_type: "sub_location",
    });
    setCameraGroups(nextGroups);
    setCameraGroupDialog(false);
    toast.success("Câmeras do setor atualizadas");
  }

  async function saveCamera() {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }
    if (!requireCertifiedCatalog("cameras")) return;

    const name = cameraForm.name.trim();
    if (!name || !cameraForm.location_id) {
      toast.error("Informe o nome e o local da câmera.");
      return;
    }

    setSaving(true);
    try {
      const sharedBody = {
        name,
        code: cameraForm.code.trim() || undefined,
        description: cameraForm.description.trim() || undefined,
      };

      if (editingCamera) {
        await apiFetch(`/cameras/${editingCamera.id}`, {
          companyScopeId,
          method: "PUT",
          body: {
            ...sharedBody,
            active: cameraForm.active === "true",
          },
        });
        toast.success("Câmera atualizada");
      } else {
        await apiFetch("/cameras", {
          companyScopeId,
          method: "POST",
          body: {
            ...sharedBody,
            location_id: cameraForm.location_id,
            sub_location_id:
              cameraForm.sub_location_id === "none"
                ? undefined
                : cameraForm.sub_location_id,
          },
        });
        toast.success("Câmera criada");
      }

      setCameraDialog(false);
      await loadBase();
    } catch {
      toast.error("Não foi possível salvar a câmera.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLineCount() {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }
    if (!requireCertifiedCatalog("lines")) return;

    const name = lineForm.name.trim();
    const lineCode = lineForm.line_code.trim();
    if (!selectedCameraId || !name || !lineCode) {
      toast.error("Informe a câmera, o nome e o código da linha.");
      return;
    }

    setSaving(true);
    try {
      if (editingLine) {
        await apiFetch(
          `/cameras/${selectedCameraId}/line-counts/${editingLine.id}`,
          {
            companyScopeId,
            method: "PUT",
            body: {
              name,
              line_code: lineCode,
              active: lineForm.active === "true",
            },
          },
        );
        toast.success("Linha de contagem atualizada");
      } else {
        await apiFetch(`/cameras/${selectedCameraId}/line-counts`, {
          companyScopeId,
          method: "POST",
          body: { name, line_code: lineCode },
        });
        toast.success("Linha de contagem criada");
      }

      setLineDialog(false);
      await loadLineCounts();
    } catch {
      toast.error("Não foi possível salvar a linha de contagem.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLocation(location: Location) {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }
    if (!requireCertifiedCatalog("locations")) return;

    if (!window.confirm(`Excluir o local "${location.name}"?`)) return;
    await removeResource(
      `/locations/${location.id}`,
      "Local excluído",
      async () => {
        setWorkerLocationAssignments(
          setWorkerLocationAssignment(cameraGroupScopeId, location.id, ""),
        );
        await loadBase();
      },
    );
  }

  async function removeSubLocation(subLocation: SubLocation) {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }
    if (!requireCertifiedCatalog("subLocations")) return;

    if (!window.confirm(`Excluir o setor "${subLocation.name}"?`)) return;
    await removeResource(
      `/locations/${selectedLocationId}/sub-locations/${subLocation.id}`,
      "Setor excluído",
      loadSubLocations,
    );
  }

  async function removeCamera(camera: Camera) {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }
    if (!requireCertifiedCatalog("cameras")) return;

    if (!window.confirm(`Excluir a câmera "${camera.name}"?`)) return;
    await removeResource(`/cameras/${camera.id}`, "Câmera excluída", loadBase);
  }

  async function removeLine(line: CameraLineCount) {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }
    if (!requireCertifiedCatalog("lines")) return;

    if (!window.confirm(`Excluir a linha de contagem "${line.name}"?`)) return;
    await removeResource(
      `/cameras/${selectedCameraId}/line-counts/${line.id}`,
      "Linha de contagem excluída",
      loadLineCounts,
    );
  }

  async function removeResource(
    path: string,
    message: string,
    reload: () => Promise<void>,
  ) {
    try {
      await apiFetch(path, { companyScopeId, method: "DELETE" });
      toast.success(message);
      await reload();
    } catch {
      toast.error("Não foi possível concluir a exclusão.");
    }
  }

  function requestBulkDelete(kind: BulkDeleteKind) {
    const locationsResource = kind === "locations" || kind === "subLocations";
    if (
      (locationsResource && !canEditLocations) ||
      (!locationsResource && !canEditCameras)
    ) {
      toast.error("Seu usuário não pode alterar estes cadastros.");
      return;
    }
    if (!requireCertifiedCatalog(kind)) return;

    const request = buildBulkDeleteRequest({
      cameras,
      checkedCameraIds,
      checkedLineIds,
      checkedLocationIds,
      checkedSubLocationIds,
      companyId: companyScopeId,
      kind,
      lineCounts,
      locations,
      selectedCameraId,
      selectedLocationId,
      subLocations,
    });
    if (!request.items.length) return;
    setBulkDeleteRequest(request);
  }

  async function updateBulkStatus(kind: BulkDeleteKind, active: boolean) {
    if (bulkUpdating || bulkDeleting || !companyScopeId) return;
    const locationsResource = kind === "locations" || kind === "subLocations";
    if (
      (locationsResource && !canEditLocations) ||
      (!locationsResource && !canEditCameras)
    ) {
      toast.error("Seu usuário não pode alterar estes cadastros.");
      return;
    }
    if (!requireCertifiedCatalog(kind)) return;

    const request = buildBulkDeleteRequest({
      cameras,
      checkedCameraIds,
      checkedLineIds,
      checkedLocationIds,
      checkedSubLocationIds,
      companyId: companyScopeId,
      kind,
      lineCounts,
      locations,
      selectedCameraId,
      selectedLocationId,
      subLocations,
    });
    const pendingItems = request.items.filter((item) =>
      resourceNeedsStatusUpdate(kind, item.id, active, {
        cameras,
        lineCounts,
        locations,
        subLocations,
      }),
    );
    if (!pendingItems.length) {
      toast.info(
        `Os itens selecionados já estão ${active ? "ativos" : "inativos"}.`,
      );
      return;
    }

    setBulkUpdating(true);
    const failedIds: string[] = [];
    for (const item of pendingItems) {
      if (!bulkRequestIsCurrent(request)) {
        setBulkUpdating(false);
        return;
      }
      try {
        await apiFetch(bulkResourcePath(request, item.id), {
          body: bulkStatusUpdateBody(kind, item.id, active, {
            cameras,
            lineCounts,
            locations,
            subLocations,
          }),
          companyScopeId: request.companyId,
          method: "PUT",
        });
      } catch {
        failedIds.push(item.id);
      }
    }
    if (!bulkRequestIsCurrent(request)) {
      setBulkUpdating(false);
      return;
    }

    setFailedBulkSelection(kind, failedIds, {
      setCheckedCameraIds,
      setCheckedLineIds,
      setCheckedLocationIds,
      setCheckedSubLocationIds,
    });

    try {
      if (kind === "locations" || kind === "cameras") await loadBase();
      else if (kind === "subLocations") await loadSubLocations();
      else await loadLineCounts();
    } finally {
      if (bulkRequestIsCurrent(request)) setBulkUpdating(false);
    }

    const updatedCount = pendingItems.length - failedIds.length;
    if (!failedIds.length) {
      toast.success(
        `${updatedCount} ${bulkResourceName(kind, updatedCount)} ${active ? "ativado(s)" : "desativado(s)"}.`,
      );
    } else if (updatedCount) {
      toast.warning(
        `${updatedCount} atualizado(s); ${failedIds.length} não puderam ser alterados e continuam selecionados.`,
      );
    } else {
      toast.error("Não foi possível alterar os itens selecionados.");
    }
  }

  async function confirmBulkDelete() {
    const request = bulkDeleteRequest;
    if (!request || bulkDeleting || !companyScopeId) return;
    if (
      !bulkRequestIsCurrent(request) ||
      !requireCertifiedCatalog(request.kind)
    ) {
      setBulkDeleteRequest(null);
      return;
    }

    const locationsResource =
      request.kind === "locations" || request.kind === "subLocations";
    if (
      (locationsResource && !canEditLocations) ||
      (!locationsResource && !canEditCameras)
    ) {
      setBulkDeleteRequest(null);
      toast.error("Seu usuário não pode alterar estes cadastros.");
      return;
    }

    setBulkDeleting(true);
    const removedIds: string[] = [];
    const failedIds: string[] = [];

    for (const item of request.items) {
      if (!bulkRequestIsCurrent(request)) {
        setBulkDeleting(false);
        setBulkDeleteRequest(null);
        return;
      }
      try {
        await apiFetch(bulkResourcePath(request, item.id), {
          companyScopeId: request.companyId,
          method: "DELETE",
        });
        removedIds.push(item.id);
      } catch {
        failedIds.push(item.id);
      }
    }
    if (!bulkRequestIsCurrent(request)) {
      setBulkDeleting(false);
      setBulkDeleteRequest(null);
      return;
    }

    if (request.kind === "locations" && removedIds.length) {
      let nextAssignments = workerLocationAssignments;
      removedIds.forEach((locationId) => {
        nextAssignments = setWorkerLocationAssignment(
          cameraGroupScopeId,
          locationId,
          "",
        );
      });
      setWorkerLocationAssignments(nextAssignments);
    }

    setFailedBulkSelection(request.kind, failedIds, {
      setCheckedCameraIds,
      setCheckedLineIds,
      setCheckedLocationIds,
      setCheckedSubLocationIds,
    });

    try {
      if (request.kind === "locations" || request.kind === "cameras") {
        await loadBase();
      } else if (request.kind === "subLocations") {
        await loadSubLocations();
      } else {
        await loadLineCounts();
      }
    } finally {
      if (bulkRequestIsCurrent(request)) {
        setBulkDeleting(false);
        setBulkDeleteRequest(null);
      }
    }

    const resourceName = bulkResourceName(request.kind, removedIds.length);
    if (!failedIds.length) {
      toast.success(`${removedIds.length} ${resourceName} excluído(s).`);
    } else if (removedIds.length) {
      toast.warning(
        `${removedIds.length} excluído(s); ${failedIds.length} não puderam ser excluídos e continuam selecionados.`,
      );
    } else {
      toast.error(
        `Não foi possível excluir os ${failedIds.length} itens selecionados.`,
      );
    }
  }

  function selectLocation(locationId: string) {
    if (bulkMutationRunning) return;
    if (locationId === selectedLocationId) return;
    selectedLocationIdRef.current = locationId;
    setSubLocations([]);
    setSubLocationCatalogScope({ companyId: "", parentId: "" });
    setCheckedSubLocationIds([]);
    setSubLocationFilter(emptyResourceListFilter);
    setSelectedLocationId(locationId);
  }

  function selectCamera(cameraId: string) {
    if (bulkMutationRunning) return;
    if (cameraId === selectedCameraId) return;
    selectedCameraIdRef.current = cameraId;
    setLineCounts([]);
    setLineCatalogScope({ companyId: "", parentId: "" });
    setCheckedLineIds([]);
    setLineFilter(emptyResourceListFilter);
    setSelectedCameraId(cameraId);
  }

  function handleTabChange(value: string) {
    const nextTab = value as InfrastructureTab;
    setActiveTab(nextTab);

    if (view !== "all") return;

    const nextHash = nextTab === "cameras" ? "#cameras" : "#locations";
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }

  function subLocationCameraIds(subLocation: SubLocation) {
    const group = cameraGroups.find(
      (item) =>
        item.scope_type === "sub_location" && item.scope_id === subLocation.id,
    );
    const availableIds = new Set(
      cameras
        .filter(
          (camera) =>
            camera.active !== false &&
            camera.location_id === subLocation.location_id,
        )
        .map((camera) => camera.id),
    );
    const configuredIds =
      group?.camera_ids.filter((cameraId) => availableIds.has(cameraId)) ?? [];

    if (configuredIds.length) return configuredIds;

    return cameras
      .filter(
        (camera) =>
          camera.active !== false && camera.sub_location_id === subLocation.id,
      )
      .map((camera) => camera.id);
  }

  function refreshVisibleInfrastructure() {
    const refreshes: Promise<void>[] = [loadBase()];
    if (locationsTabActive) {
      refreshes.push(loadSubLocations());
      if (needsWorkerCatalog) refreshes.push(loadWorkers());
    }
    if (camerasTabActive) {
      refreshes.push(loadLineCounts());
    }
    void Promise.all(refreshes);
  }

  return (
    <section id="configuracoes" className="scroll-mt-6 space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={refreshVisibleInfrastructure}
          disabled={loading || bulkMutationRunning}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Atualizar
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        {view === "all" ? (
          <TabsList>
            <TabsTrigger value="locations">Locais</TabsTrigger>
            <TabsTrigger value="cameras">Câmeras</TabsTrigger>
          </TabsList>
        ) : null}

        {view !== "cameras" ? (
          <TabsContent value="locations">
            <div id="locations" className="scroll-mt-6 space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Locais cadastrados</CardTitle>
                    <CardDescription>
                      Cadastro operacional usado para vincular e agrupar
                      câmeras.
                    </CardDescription>
                  </div>
                  {canEditLocations ? (
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={() => openLocation()}
                      disabled={baseActionsDisabled}
                    >
                      <Plus className="h-4 w-4" />
                      Novo local
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {loading || !baseCatalogCertified ? (
                    <TableSkeleton />
                  ) : locations.length ? (
                    <div className="space-y-3">
                      <ResourceTableFilters
                        filter={locationFilter}
                        placeholder="Buscar por local ou Worker"
                        totalCount={locations.length}
                        visibleCount={visibleLocations.length}
                        disabled={baseActionsDisabled}
                        onChange={setLocationFilter}
                      />
                      <BulkActionBar
                        busy={baseActionsDisabled}
                        count={checkedLocationIds.length}
                        resourceName="local"
                        onActivate={() => updateBulkStatus("locations", true)}
                        onClear={() => setCheckedLocationIds([])}
                        onDeactivate={() =>
                          updateBulkStatus("locations", false)
                        }
                        onDelete={() => requestBulkDelete("locations")}
                        onEdit={
                          checkedLocationIds.length === 1
                            ? () => {
                                const location = locations.find(
                                  (item) => item.id === checkedLocationIds[0],
                                );
                                if (location) openLocation(location);
                              }
                            : undefined
                        }
                      />
                      <Table scrollRegionLabel="Locais cadastrados">
                        <TableHeader>
                          <TableRow>
                            {canEditLocations ? (
                              <SelectionTableHead
                                checked={selectionCheckedState(
                                  selectedVisibleCount(
                                    visibleLocations,
                                    checkedLocationIds,
                                  ),
                                  visibleLocations.length,
                                )}
                                label="Selecionar todos os locais"
                                disabled={baseActionsDisabled}
                                onCheckedChange={(checked) =>
                                  setCheckedLocationIds((current) =>
                                    updateVisibleSelection(
                                      current,
                                      visibleLocations.map((item) => item.id),
                                      checked,
                                    ),
                                  )
                                }
                              />
                            ) : null}
                            <TableHead>Nome</TableHead>
                            <TableHead>Worker</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Criado em</TableHead>
                            {canEditLocations ? (
                              <TableHead className="text-right">
                                Ações
                              </TableHead>
                            ) : null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!visibleLocations.length ? (
                            <FilteredEmptyRow
                              colSpan={canEditLocations ? 6 : 4}
                              text="Nenhum local corresponde aos filtros."
                            />
                          ) : null}
                          {visibleLocations.map((location) => {
                            const workerId =
                              workerLocationAssignments[location.id] ?? "";
                            const worker = workerId
                              ? workersById.get(workerId)
                              : null;

                            return (
                              <TableRow
                                key={location.id}
                                data-state={
                                  checkedLocationIds.includes(location.id)
                                    ? "selected"
                                    : undefined
                                }
                                className={
                                  selectedLocationId === location.id
                                    ? "bg-primary/10"
                                    : ""
                                }
                                onClick={() => selectLocation(location.id)}
                              >
                                {canEditLocations ? (
                                  <SelectionTableCell
                                    checked={checkedLocationIds.includes(
                                      location.id,
                                    )}
                                  label={`Selecionar local ${location.name}`}
                                  disabled={baseActionsDisabled}
                                    onCheckedChange={(checked) =>
                                      setCheckedLocationIds((current) =>
                                        updateSelection(
                                          current,
                                          location.id,
                                          checked,
                                        ),
                                      )
                                    }
                                  />
                                ) : null}
                                <TableCell>
                                  <div className="font-medium">
                                    {location.name}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {location.description || "Sem descrição"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {worker ? (
                                    <div className="space-y-1">
                                      <div className="font-medium">
                                        {worker.name}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {worker.description || "Sem descrição"}
                                      </div>
                                    </div>
                                  ) : (
                                    <Badge variant="warning">
                                      {workerId
                                        ? "Worker indisponível"
                                        : "Sem Worker"}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <StatusBadge active={location.active} />
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {formatDateTime(location.created_at)}
                                </TableCell>
                                {canEditLocations ? (
                                  <TableCell>
                                    <div className="flex flex-wrap justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={baseActionsDisabled}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openLocation(location);
                                        }}
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                        Editar
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        disabled={baseActionsDisabled}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          removeLocation(location);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Excluir
                                      </Button>
                                    </div>
                                  </TableCell>
                                ) : null}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <EmptyState text="Nenhum local cadastrado." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>
                      Setores{" "}
                      {selectedLocation ? `de ${selectedLocation.name}` : ""}
                    </CardTitle>
                    <CardDescription>
                      Defina os setores e selecione as câmeras relacionadas a
                      cada uma.
                    </CardDescription>
                  </div>
                  {canEditLocations ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => openSubLocation()}
                      disabled={!selectedLocationId || subLocationActionsDisabled}
                    >
                      <Plus className="h-4 w-4" />
                      Novo setor
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {selectedLocationId &&
                  (loadingSubLocations || !subLocationCatalogCertified) ? (
                    <TableSkeleton />
                  ) : subLocations.length ? (
                    <div className="space-y-3">
                      <ResourceTableFilters
                        filter={subLocationFilter}
                        placeholder="Buscar setor"
                        totalCount={subLocations.length}
                        visibleCount={visibleSubLocations.length}
                        disabled={subLocationActionsDisabled}
                        onChange={setSubLocationFilter}
                      />
                      <BulkActionBar
                        busy={subLocationActionsDisabled}
                        count={checkedSubLocationIds.length}
                        resourceName="setor"
                        onActivate={() =>
                          updateBulkStatus("subLocations", true)
                        }
                        onClear={() => setCheckedSubLocationIds([])}
                        onDeactivate={() =>
                          updateBulkStatus("subLocations", false)
                        }
                        onDelete={() => requestBulkDelete("subLocations")}
                        onEdit={
                          checkedSubLocationIds.length === 1
                            ? () => {
                                const subLocation = subLocations.find(
                                  (item) =>
                                    item.id === checkedSubLocationIds[0],
                                );
                                if (subLocation) openSubLocation(subLocation);
                              }
                            : undefined
                        }
                      />
                      <Table scrollRegionLabel="Setores do local selecionado">
                        <TableHeader>
                          <TableRow>
                            {canEditLocations ? (
                              <SelectionTableHead
                                checked={selectionCheckedState(
                                  selectedVisibleCount(
                                    visibleSubLocations,
                                    checkedSubLocationIds,
                                  ),
                                  visibleSubLocations.length,
                                )}
                                label="Selecionar todos os setores"
                                disabled={subLocationActionsDisabled}
                                onCheckedChange={(checked) =>
                                  setCheckedSubLocationIds((current) =>
                                    updateVisibleSelection(
                                      current,
                                      visibleSubLocations.map(
                                        (item) => item.id,
                                      ),
                                      checked,
                                    ),
                                  )
                                }
                              />
                            ) : null}
                            <TableHead>Nome</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Câmeras</TableHead>
                            <TableHead>Criado em</TableHead>
                            {canEditLocations ? (
                              <TableHead className="text-right">
                                Ações
                              </TableHead>
                            ) : null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!visibleSubLocations.length ? (
                            <FilteredEmptyRow
                              colSpan={canEditLocations ? 6 : 4}
                              text="Nenhum setor corresponde aos filtros."
                            />
                          ) : null}
                          {visibleSubLocations.map((subLocation) => {
                            const cameraCount =
                              subLocationCameraIds(subLocation).length;

                            return (
                              <TableRow
                                key={subLocation.id}
                                data-state={
                                  checkedSubLocationIds.includes(subLocation.id)
                                    ? "selected"
                                    : undefined
                                }
                                className={
                                  selectedSubLocationId === subLocation.id
                                    ? "bg-primary/10"
                                    : ""
                                }
                                onClick={() =>
                                  setSelectedSubLocationId(subLocation.id)
                                }
                              >
                                {canEditLocations ? (
                                  <SelectionTableCell
                                    checked={checkedSubLocationIds.includes(
                                      subLocation.id,
                                    )}
                                  label={`Selecionar setor ${subLocation.name}`}
                                  disabled={subLocationActionsDisabled}
                                    onCheckedChange={(checked) =>
                                      setCheckedSubLocationIds((current) =>
                                        updateSelection(
                                          current,
                                          subLocation.id,
                                          checked,
                                        ),
                                      )
                                    }
                                  />
                                ) : null}
                                <TableCell>
                                  <div className="font-medium">
                                    {subLocation.name}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {cameraCount
                                      ? `${cameraCount} câmera(s) vinculada(s)`
                                      : "Nenhuma câmera vinculada"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <StatusBadge active={subLocation.active} />
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {cameraCount}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {formatDateTime(subLocation.created_at)}
                                </TableCell>
                                {canEditLocations ? (
                                  <TableCell>
                                    <div className="flex flex-wrap justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={subLocationActionsDisabled}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openCameraGroup(subLocation);
                                        }}
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                        Câmeras
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={subLocationActionsDisabled}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openSubLocation(subLocation);
                                        }}
                                      >
                                        <Edit className="h-3.5 w-3.5" />
                                        Editar
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        disabled={subLocationActionsDisabled}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          removeSubLocation(subLocation);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Excluir
                                      </Button>
                                    </div>
                                  </TableCell>
                                ) : null}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <EmptyState text="Nenhum setor para o local selecionado." />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}

        {view !== "locations" ? (
          <TabsContent value="cameras">
            <div id="cameras" className="scroll-mt-6 space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Câmeras cadastradas</CardTitle>
                    <CardDescription>
                      Origem operacional das linhas de contagem.
                    </CardDescription>
                  </div>
                  {canEditCameras ? (
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={() => openCamera()}
                      disabled={!locations.length || baseActionsDisabled}
                    >
                      <Plus className="h-4 w-4" />
                      Nova câmera
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {loading || !baseCatalogCertified ? (
                    <TableSkeleton />
                  ) : cameras.length ? (
                    <div className="space-y-3">
                      <ResourceTableFilters
                        filter={cameraFilter}
                        placeholder="Buscar por câmera, código ou local"
                        totalCount={cameras.length}
                        visibleCount={visibleCameras.length}
                        disabled={baseActionsDisabled}
                        onChange={setCameraFilter}
                      />
                      <BulkActionBar
                        busy={baseActionsDisabled}
                        count={checkedCameraIds.length}
                        resourceName="câmera"
                        onActivate={() => updateBulkStatus("cameras", true)}
                        onClear={() => setCheckedCameraIds([])}
                        onDeactivate={() => updateBulkStatus("cameras", false)}
                        onDelete={() => requestBulkDelete("cameras")}
                        onEdit={
                          checkedCameraIds.length === 1
                            ? () => {
                                const camera = cameras.find(
                                  (item) => item.id === checkedCameraIds[0],
                                );
                                if (camera) openCamera(camera);
                              }
                            : undefined
                        }
                      />
                      <Table scrollRegionLabel="Câmeras cadastradas">
                        <TableHeader>
                          <TableRow>
                            {canEditCameras ? (
                              <SelectionTableHead
                                checked={selectionCheckedState(
                                  selectedVisibleCount(
                                    visibleCameras,
                                    checkedCameraIds,
                                  ),
                                  visibleCameras.length,
                                )}
                                label="Selecionar todas as câmeras"
                                disabled={baseActionsDisabled}
                                onCheckedChange={(checked) =>
                                  setCheckedCameraIds((current) =>
                                    updateVisibleSelection(
                                      current,
                                      visibleCameras.map((item) => item.id),
                                      checked,
                                    ),
                                  )
                                }
                              />
                            ) : null}
                            <TableHead>Nome</TableHead>
                            <TableHead>Local</TableHead>
                            <TableHead>Status</TableHead>
                            {canEditCameras ? (
                              <TableHead className="text-right">
                                Ações
                              </TableHead>
                            ) : null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!visibleCameras.length ? (
                            <FilteredEmptyRow
                              colSpan={canEditCameras ? 5 : 3}
                              text="Nenhuma câmera corresponde aos filtros."
                            />
                          ) : null}
                          {visibleCameras.map((camera) => (
                            <TableRow
                              key={camera.id}
                              data-state={
                                checkedCameraIds.includes(camera.id)
                                  ? "selected"
                                  : undefined
                              }
                              className={
                                selectedCameraId === camera.id
                                  ? "bg-primary/10"
                                  : ""
                              }
                              onClick={() => selectCamera(camera.id)}
                            >
                              {canEditCameras ? (
                                <SelectionTableCell
                                  checked={checkedCameraIds.includes(camera.id)}
                                label={`Selecionar câmera ${camera.name}`}
                                disabled={baseActionsDisabled}
                                  onCheckedChange={(checked) =>
                                    setCheckedCameraIds((current) =>
                                      updateSelection(
                                        current,
                                        camera.id,
                                        checked,
                                      ),
                                    )
                                  }
                                />
                              ) : null}
                              <TableCell>
                                <div className="font-medium">{camera.name}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {camera.code || "Sem código informado"}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {locations.find(
                                  (location) =>
                                    location.id === camera.location_id,
                                )?.name ?? "-"}
                              </TableCell>
                              <TableCell>
                                <StatusBadge active={camera.active} />
                              </TableCell>
                              {canEditCameras ? (
                                <TableCell>
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={baseActionsDisabled}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openCamera(camera);
                                      }}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      disabled={baseActionsDisabled}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        removeCamera(camera);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Excluir
                                    </Button>
                                  </div>
                                </TableCell>
                              ) : null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <EmptyState text="Nenhuma câmera cadastrada." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>
                      Linhas de contagem{" "}
                      {selectedCamera ? `de ${selectedCamera.name}` : ""}
                    </CardTitle>
                    <CardDescription>
                      Linhas usadas pelos cenários para somar/subtrair eventos.
                    </CardDescription>
                  </div>
                  {canEditCameras ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => openLineCount()}
                      disabled={!selectedCameraId || lineActionsDisabled}
                    >
                      <Plus className="h-4 w-4" />
                      Nova linha
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {selectedCameraId &&
                  (loadingLineCounts || !lineCatalogCertified) ? (
                    <TableSkeleton />
                  ) : lineCounts.length ? (
                    <div className="space-y-3">
                      <ResourceTableFilters
                        filter={lineFilter}
                        placeholder="Buscar por linha ou código"
                        totalCount={lineCounts.length}
                        visibleCount={visibleLineCounts.length}
                        disabled={lineActionsDisabled}
                        onChange={setLineFilter}
                      />
                      <BulkActionBar
                        busy={lineActionsDisabled}
                        count={checkedLineIds.length}
                        resourceName="linha"
                        onActivate={() => updateBulkStatus("lines", true)}
                        onClear={() => setCheckedLineIds([])}
                        onDeactivate={() => updateBulkStatus("lines", false)}
                        onDelete={() => requestBulkDelete("lines")}
                        onEdit={
                          checkedLineIds.length === 1
                            ? () => {
                                const line = lineCounts.find(
                                  (item) => item.id === checkedLineIds[0],
                                );
                                if (line) openLineCount(line);
                              }
                            : undefined
                        }
                      />
                      <Table scrollRegionLabel="Linhas da câmera selecionada">
                        <TableHeader>
                          <TableRow>
                            {canEditCameras ? (
                              <SelectionTableHead
                                checked={selectionCheckedState(
                                  selectedVisibleCount(
                                    visibleLineCounts,
                                    checkedLineIds,
                                  ),
                                  visibleLineCounts.length,
                                )}
                                label="Selecionar todas as linhas de contagem"
                                disabled={lineActionsDisabled}
                                onCheckedChange={(checked) =>
                                  setCheckedLineIds((current) =>
                                    updateVisibleSelection(
                                      current,
                                      visibleLineCounts.map((item) => item.id),
                                      checked,
                                    ),
                                  )
                                }
                              />
                            ) : null}
                            <TableHead>Nome</TableHead>
                            <TableHead>Código da linha</TableHead>
                            <TableHead>Status</TableHead>
                            {canEditCameras ? (
                              <TableHead className="text-right">
                                Ações
                              </TableHead>
                            ) : null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!visibleLineCounts.length ? (
                            <FilteredEmptyRow
                              colSpan={canEditCameras ? 5 : 3}
                              text="Nenhuma linha corresponde aos filtros."
                            />
                          ) : null}
                          {visibleLineCounts.map((line) => (
                            <TableRow
                              key={line.id}
                              data-state={
                                checkedLineIds.includes(line.id)
                                  ? "selected"
                                  : undefined
                              }
                            >
                              {canEditCameras ? (
                                <SelectionTableCell
                                  checked={checkedLineIds.includes(line.id)}
                                label={`Selecionar linha ${line.name}`}
                                disabled={lineActionsDisabled}
                                  onCheckedChange={(checked) =>
                                    setCheckedLineIds((current) =>
                                      updateSelection(
                                        current,
                                        line.id,
                                        checked,
                                      ),
                                    )
                                  }
                                />
                              ) : null}
                              <TableCell>
                                <div className="font-medium">{line.name}</div>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {line.line_code}
                              </TableCell>
                              <TableCell>
                                <StatusBadge active={line.active} />
                              </TableCell>
                              {canEditCameras ? (
                                <TableCell>
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={lineActionsDisabled}
                                      onClick={() => openLineCount(line)}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                      Editar
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      disabled={lineActionsDisabled}
                                      onClick={() => removeLine(line)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Excluir
                                    </Button>
                                  </div>
                                </TableCell>
                              ) : null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <EmptyState text="Nenhuma linha de contagem para a câmera selecionada." />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog
        open={Boolean(bulkDeleteRequest)}
        onOpenChange={(open) => {
          if (!open && !bulkDeleting) setBulkDeleteRequest(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Excluir {bulkDeleteRequest?.items.length ?? 0}{" "}
              {bulkDeleteRequest
                ? bulkResourceName(
                    bulkDeleteRequest.kind,
                    bulkDeleteRequest.items.length,
                  )
                : "itens"}
            </DialogTitle>
            <DialogDescription>
              Esta ação é definitiva. Os itens serão processados um por vez para
              preservar o resultado das exclusões já concluídas caso algum
              cadastro possua vínculos que impeçam sua remoção.
            </DialogDescription>
          </DialogHeader>
          {bulkDeleteRequest ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">
                {bulkDeleteImpact(bulkDeleteRequest.kind)}
              </div>
              <div className="space-y-2">
                <Label>Itens selecionados</Label>
                <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-2 text-sm">
                  {bulkDeleteRequest.items.slice(0, 8).map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md bg-background px-3 py-2"
                    >
                      {item.name}
                    </li>
                  ))}
                  {bulkDeleteRequest.items.length > 8 ? (
                    <li className="px-3 py-2 text-muted-foreground">
                      E mais {bulkDeleteRequest.items.length - 8} item(ns).
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDeleteRequest(null)}
              disabled={bulkDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmBulkDelete}
              disabled={bulkDeleting}
            >
              <Trash2 className="h-4 w-4" />
              {bulkDeleting ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={locationDialog} onOpenChange={setLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? "Editar local" : "Novo local"}
            </DialogTitle>
            <DialogDescription>
              Salva a localidade usada para vincular e agrupar câmeras.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Nome">
            <Input
              value={locationForm.name}
              onChange={(event) =>
                setLocationForm((form) => ({
                  ...form,
                  name: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Worker responsável">
            <Select
              value={locationForm.worker_id}
              onValueChange={(workerId) =>
                setLocationForm((form) => ({
                  ...form,
                  worker_id: workerId,
                }))
              }
              disabled={!workers.length}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    workers.length
                      ? "Selecione o Worker"
                      : "Nenhum Worker disponível"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {workers.map((worker) => (
                  <SelectItem key={worker.id} value={worker.id}>
                    {worker.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!workers.length ? (
              <p className="text-xs text-muted-foreground">
                Cadastre um Worker antes de criar locais.
              </p>
            ) : null}
          </FormField>
          <FormField label="Descrição">
            <Textarea
              value={locationForm.description}
              onChange={(event) =>
                setLocationForm((form) => ({
                  ...form,
                  description: event.target.value,
                }))
              }
            />
          </FormField>
          {editingLocation ? (
            <StatusSelect
              value={locationForm.active}
              onValueChange={(active) =>
                setLocationForm((form) => ({ ...form, active }))
              }
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLocationDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveLocation} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={subLocationDialog} onOpenChange={setSubLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSubLocation ? "Editar setor" : "Novo setor"}
            </DialogTitle>
            <DialogDescription>
              Organize uma área interna do local selecionado.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Nome">
            <Input
              value={subLocationForm.name}
              onChange={(event) =>
                setSubLocationForm((form) => ({
                  ...form,
                  name: event.target.value,
                }))
              }
            />
          </FormField>
          {editingSubLocation ? (
            <StatusSelect
              value={subLocationForm.active}
              onValueChange={(active) =>
                setSubLocationForm((form) => ({ ...form, active }))
              }
            />
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubLocationDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={saveSubLocation} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cameraGroupDialog} onOpenChange={setCameraGroupDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Câmeras do setor</DialogTitle>
            <DialogDescription>
              Selecione quais câmeras pertencem ao setor escolhido.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-sm font-medium">
              {selectedSubLocation?.name ?? "Setor"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedLocation?.name ?? "Local"}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Câmeras</Label>
            <div className="max-h-[280px] overflow-y-auto rounded-md border">
              {cameraGroupAvailableCameras.length ? (
                cameraGroupAvailableCameras.map((camera) => {
                  const checked = cameraGroupForm.camera_ids.includes(
                    camera.id,
                  );

                  return (
                    <label
                      key={camera.id}
                      className="flex cursor-pointer items-center justify-between gap-4 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {camera.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {camera.code || "Sem código informado"}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-primary"
                        checked={checked}
                        onChange={() =>
                          setCameraGroupForm((form) => ({
                            ...form,
                            camera_ids: checked
                              ? form.camera_ids.filter((id) => id !== camera.id)
                              : [...form.camera_ids, camera.id],
                          }))
                        }
                      />
                    </label>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma câmera disponível para este local.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCameraGroupDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={saveCameraGroup} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cameraDialog} onOpenChange={setCameraDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCamera ? "Editar câmera" : "Nova câmera"}
            </DialogTitle>
            <DialogDescription>
              Associe a câmera ao local onde ela está instalada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nome">
              <Input
                value={cameraForm.name}
                onChange={(event) =>
                  setCameraForm((form) => ({
                    ...form,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField label="Código">
              <Input
                value={cameraForm.code}
                onChange={(event) =>
                  setCameraForm((form) => ({
                    ...form,
                    code: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Local">
              <Select
                disabled={Boolean(editingCamera)}
                value={cameraForm.location_id}
                onValueChange={(locationId) =>
                  setCameraForm((form) => ({
                    ...form,
                    location_id: locationId,
                    sub_location_id: "none",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Setor">
              <Select
                disabled={Boolean(editingCamera)}
                value={cameraForm.sub_location_id}
                onValueChange={(subLocationId) =>
                  setCameraForm((form) => ({
                    ...form,
                    sub_location_id: subLocationId,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {cameraSubLocations.map((subLocation) => (
                    <SelectItem key={subLocation.id} value={subLocation.id}>
                      {subLocation.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <FormField label="Descrição">
            <Textarea
              value={cameraForm.description}
              onChange={(event) =>
                setCameraForm((form) => ({
                  ...form,
                  description: event.target.value,
                }))
              }
            />
          </FormField>
          {editingCamera ? (
            <StatusSelect
              value={cameraForm.active}
              onValueChange={(active) =>
                setCameraForm((form) => ({ ...form, active }))
              }
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCameraDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCamera} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lineDialog} onOpenChange={setLineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLine
                ? "Editar linha de contagem"
                : "Nova linha de contagem"}
            </DialogTitle>
            <DialogDescription>
              Salva uma linha de contagem para a câmera selecionada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nome">
              <Input
                value={lineForm.name}
                onChange={(event) =>
                  setLineForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Código da linha">
              <Input
                value={lineForm.line_code}
                onChange={(event) =>
                  setLineForm((form) => ({
                    ...form,
                    line_code: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>
          {editingLine ? (
            <StatusSelect
              value={lineForm.active}
              onValueChange={(active) =>
                setLineForm((form) => ({ ...form, active }))
              }
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveLineCount} disabled={saving}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type SelectionSetter = React.Dispatch<React.SetStateAction<string[]>>;

function BulkActionBar({
  busy,
  count,
  onActivate,
  onClear,
  onDeactivate,
  onDelete,
  onEdit,
  resourceName,
}: {
  busy: boolean;
  count: number;
  onActivate: () => void;
  onClear: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  resourceName: "câmera" | "linha" | "local" | "setor";
}) {
  if (!count) return null;

  const label = count === 1 ? resourceName : pluralResourceName(resourceName);

  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Badge variant="secondary">{count}</Badge>
        <span className="truncate font-medium">
          {label} selecionado{count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEdit}
            disabled={busy}
          >
            <Edit className="h-3.5 w-3.5" />
            Editar
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onActivate}
          disabled={busy}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Ativar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDeactivate}
          disabled={busy}
        >
          <XCircle className="h-3.5 w-3.5" />
          Desativar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={busy}
        >
          Limpar seleção
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={busy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir selecionados
        </Button>
      </div>
    </div>
  );
}

function ResourceTableFilters({
  disabled,
  filter,
  onChange,
  placeholder,
  totalCount,
  visibleCount,
}: {
  disabled: boolean;
  filter: ResourceListFilter;
  onChange: (filter: ResourceListFilter) => void;
  placeholder: string;
  totalCount: number;
  visibleCount: number;
}) {
  const filtered = filter.query.trim() !== "" || filter.status !== "all";

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/15 p-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={placeholder}
          className="h-9 bg-background pl-9"
          placeholder={placeholder}
          value={filter.query}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...filter, query: event.currentTarget.value })
          }
        />
      </div>
      <Select
        disabled={disabled}
        value={filter.status}
        onValueChange={(status) =>
          onChange({
            ...filter,
            status: status as ResourceListFilter["status"],
          })
        }
      >
        <SelectTrigger className="h-9 w-full bg-background sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="active">Ativos</SelectItem>
          <SelectItem value="inactive">Inativos</SelectItem>
        </SelectContent>
      </Select>
      <Badge
        variant="outline"
        className="h-9 justify-center whitespace-nowrap px-3"
      >
        {filtered ? `${visibleCount} de ${totalCount}` : totalCount}
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        disabled={disabled || !filtered}
        onClick={() => onChange(emptyResourceListFilter)}
        aria-label="Limpar filtros"
        title="Limpar filtros"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function FilteredEmptyRow({
  colSpan,
  text,
}: {
  colSpan: number;
  text: string;
}) {
  return (
    <TableRow>
      <TableCell
        className="h-24 text-center text-sm text-muted-foreground"
        colSpan={colSpan}
      >
        {text}
      </TableCell>
    </TableRow>
  );
}

function SelectionTableHead({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean | "indeterminate";
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <TableHead className="w-10">
      <Checkbox
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </TableHead>
  );
}

function SelectionTableCell({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
      <Checkbox
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </TableCell>
  );
}

function buildBulkDeleteRequest({
  cameras,
  checkedCameraIds,
  checkedLineIds,
  checkedLocationIds,
  checkedSubLocationIds,
  companyId,
  kind,
  lineCounts,
  locations,
  selectedCameraId,
  selectedLocationId,
  subLocations,
}: {
  cameras: Camera[];
  checkedCameraIds: string[];
  checkedLineIds: string[];
  checkedLocationIds: string[];
  checkedSubLocationIds: string[];
  companyId: string;
  kind: BulkDeleteKind;
  lineCounts: CameraLineCount[];
  locations: Location[];
  selectedCameraId: string;
  selectedLocationId: string;
  subLocations: SubLocation[];
}): BulkDeleteRequest {
  if (kind === "locations") {
    return {
      companyId,
      items: selectedResourceItems(locations, checkedLocationIds),
      kind,
    };
  }
  if (kind === "subLocations") {
    return {
      companyId,
      items: selectedLocationId
        ? selectedResourceItems(subLocations, checkedSubLocationIds)
        : [],
      kind,
      parentId: selectedLocationId,
    };
  }
  if (kind === "cameras") {
    return {
      companyId,
      items: selectedResourceItems(cameras, checkedCameraIds),
      kind,
    };
  }
  return {
    companyId,
    items: selectedCameraId
      ? selectedResourceItems(lineCounts, checkedLineIds)
      : [],
    kind,
    parentId: selectedCameraId,
  };
}

function bulkResourcePath(request: BulkDeleteRequest, itemId: string) {
  if (request.kind === "locations") return `/locations/${itemId}`;
  if (request.kind === "subLocations") {
    return `/locations/${request.parentId}/sub-locations/${itemId}`;
  }
  if (request.kind === "cameras") return `/cameras/${itemId}`;
  return `/cameras/${request.parentId}/line-counts/${itemId}`;
}

function bulkStatusUpdateBody(
  kind: BulkDeleteKind,
  itemId: string,
  active: boolean,
  resources: {
    cameras: Camera[];
    lineCounts: CameraLineCount[];
    locations: Location[];
    subLocations: SubLocation[];
  },
) {
  if (kind === "locations") {
    const item = resources.locations.find((row) => row.id === itemId);
    if (!item) throw new Error("Local indisponível");
    return {
      active,
      description: item.description || undefined,
      name: item.name,
    };
  }
  if (kind === "subLocations") {
    const item = resources.subLocations.find((row) => row.id === itemId);
    if (!item) throw new Error("Setor indisponível");
    return { active, name: item.name };
  }
  if (kind === "cameras") {
    const item = resources.cameras.find((row) => row.id === itemId);
    if (!item) throw new Error("Câmera indisponível");
    return {
      active,
      code: item.code || undefined,
      description: item.description || undefined,
      name: item.name,
    };
  }
  const item = resources.lineCounts.find((row) => row.id === itemId);
  if (!item) throw new Error("Linha indisponível");
  return {
    active,
    line_code: item.line_code,
    name: item.name,
  };
}

function resourceNeedsStatusUpdate(
  kind: BulkDeleteKind,
  itemId: string,
  active: boolean,
  resources: {
    cameras: Camera[];
    lineCounts: CameraLineCount[];
    locations: Location[];
    subLocations: SubLocation[];
  },
) {
  const rows =
    kind === "locations"
      ? resources.locations
      : kind === "subLocations"
        ? resources.subLocations
        : kind === "cameras"
          ? resources.cameras
          : resources.lineCounts;
  return rows.find((row) => row.id === itemId)?.active !== active;
}

function bulkDeleteImpact(kind: BulkDeleteKind) {
  if (kind === "locations") {
    return "Locais com setores, câmeras ou outros vínculos operacionais podem ser preservados pelo servidor.";
  }
  if (kind === "subLocations") {
    return "Setores ainda vinculados a câmeras ou configurações operacionais podem não ser removidos.";
  }
  if (kind === "cameras") {
    return "Câmeras vinculadas a linhas ou cenários podem ser preservadas para evitar perda de configuração.";
  }
  return "Linhas utilizadas por cenários podem ser preservadas para manter a integridade das análises.";
}

function bulkResourceName(kind: BulkDeleteKind, count: number) {
  const names: Record<BulkDeleteKind, [string, string]> = {
    cameras: ["câmera", "câmeras"],
    lines: ["linha", "linhas"],
    locations: ["local", "locais"],
    subLocations: ["setor", "setores"],
  };
  return names[kind][count === 1 ? 0 : 1];
}

function pluralResourceName(name: "câmera" | "linha" | "local" | "setor") {
  const names = {
    câmera: "câmeras",
    linha: "linhas",
    local: "locais",
    setor: "setores",
  } as const;
  return names[name];
}

function selectedResourceItems<T extends { id: string; name: string }>(
  rows: T[],
  selectedIds: string[],
) {
  const selected = new Set(selectedIds);
  return rows
    .filter((row) => selected.has(row.id))
    .map((row) => ({ id: row.id, name: row.name }));
}

function selectionCheckedState(selectedCount: number, total: number) {
  if (!selectedCount || !total) return false;
  return selectedCount === total ? true : ("indeterminate" as const);
}

function updateSelection(current: string[], id: string, checked: boolean) {
  if (checked) return current.includes(id) ? current : [...current, id];
  return current.filter((currentId) => currentId !== id);
}

function updateVisibleSelection(
  current: string[],
  visibleIds: string[],
  checked: boolean,
) {
  const visible = new Set(visibleIds);
  if (!checked) return current.filter((id) => !visible.has(id));
  const next = new Set(current);
  visibleIds.forEach((id) => next.add(id));
  return [...next];
}

function selectedVisibleCount<T extends { id: string }>(
  rows: T[],
  selectedIds: string[],
) {
  const selected = new Set(selectedIds);
  return rows.filter((row) => selected.has(row.id)).length;
}

function matchesResourceFilter(
  active: boolean,
  filter: ResourceListFilter,
  values: Array<string | null | undefined>,
) {
  if (filter.status === "active" && !active) return false;
  if (filter.status === "inactive" && active) return false;
  const query = normalizeFilterText(filter.query);
  if (!query) return true;
  return values.some((value) => normalizeFilterText(value).includes(query));
}

function normalizeFilterText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function retainAvailableSelection<T extends { id: string }>(
  current: string[],
  rows: T[],
) {
  const available = new Set(rows.map((row) => row.id));
  const next = current.filter((id) => available.has(id));
  return next.length === current.length ? current : next;
}

function setFailedBulkSelection(
  kind: BulkDeleteKind,
  failedIds: string[],
  setters: {
    setCheckedCameraIds: SelectionSetter;
    setCheckedLineIds: SelectionSetter;
    setCheckedLocationIds: SelectionSetter;
    setCheckedSubLocationIds: SelectionSetter;
  },
) {
  if (kind === "locations") setters.setCheckedLocationIds(failedIds);
  else if (kind === "subLocations") setters.setCheckedSubLocationIds(failedIds);
  else if (kind === "cameras") setters.setCheckedCameraIds(failedIds);
  else setters.setCheckedLineIds(failedIds);
}

async function fetchInfrastructureWorkers(companyId?: string | null) {
  const companyScopeId = companyId?.trim();
  if (!companyScopeId) return [];
  const rows = await apiFetch<unknown>("/workers", { companyScopeId }).then(
    (response) => normalizeWorkerRows(response),
  );
  const partition = partitionWorkersByCompanyScope(rows, companyScopeId);
  return sortWorkersByActivity(workersFromExplicitCompanyScope(partition));
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatusSelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <FormField label="Status">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Ativo</SelectItem>
          <SelectItem value="false">Inativo</SelectItem>
        </SelectContent>
      </Select>
    </FormField>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "secondary"}>
      {active ? "Ativo" : "Inativo"}
    </Badge>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}
