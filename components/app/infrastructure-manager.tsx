"use client";

import * as React from "react";
import {
  Edit,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type CameraGroupFormState = {
  camera_ids: string[];
  name: string;
  scope_id: string;
  scope_type: CameraGroupScopeType;
};

type InfrastructureTab = "locations" | "cameras";
type InfrastructureView = InfrastructureTab | "all";

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

export function InfrastructureManager({ view = "all" }: { view?: InfrastructureView }) {
  const { user } = useAuth();
  const canEditLocations = canManageLocations(user);
  const canEditCameras = canManageCameras(user);
  const companyScopeId = useEffectiveCompanyScopeId(user);
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
  const [activeTab, setActiveTab] = React.useState<InfrastructureTab>(
    view === "cameras" ? "cameras" : "locations",
  );
  const [loading, setLoading] = React.useState(true);
  const [loadingChildren, setLoadingChildren] = React.useState(false);
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
  const [editingLine, setEditingLine] =
    React.useState<CameraLineCount | null>(null);
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
  const workersById = React.useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker])),
    [workers],
  );

  const selectedLocation = React.useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  );
  const selectedCamera = React.useMemo(
    () => cameras.find((camera) => camera.id === selectedCameraId) ?? null,
    [cameras, selectedCameraId],
  );
  const selectedSubLocation = React.useMemo(
    () =>
      subLocations.find((subLocation) => subLocation.id === selectedSubLocationId) ??
      null,
    [selectedSubLocationId, subLocations],
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

  const loadBase = React.useCallback(async () => {
    setLoading(true);
    try {
      const [locationRows, cameraRows, workerRows] = await Promise.all([
        apiFetch<Location[]>("/locations"),
        apiFetch<Camera[]>("/cameras"),
        fetchInfrastructureWorkers(companyScopeId).catch(() => []),
      ]);
      const scopedLocations = filterScopedApiRows(locationRows, companyScopeId);
      const scopedCameras = filterScopedApiRows(cameraRows, companyScopeId);
      setLocations(scopedLocations);
      setCameras(scopedCameras);
      setWorkers(workerRows);
      setSelectedLocationId((current) =>
        current && scopedLocations.some((row) => row.id === current)
          ? current
          : scopedLocations[0]?.id ?? "",
      );
      setSelectedCameraId((current) =>
        current && scopedCameras.some((row) => row.id === current)
          ? current
          : scopedCameras[0]?.id ?? "",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a infraestrutura.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [companyScopeId]);

  const loadSubLocations = React.useCallback(async () => {
    if (!selectedLocationId) {
      setSubLocations([]);
      setSelectedSubLocationId("");
      return;
    }

    setLoadingChildren(true);
    try {
      const rows = await apiFetch<SubLocation[]>(
        `/locations/${selectedLocationId}/sub-locations`,
      );
      const scopedRows = filterScopedApiRows(rows, companyScopeId);
      setSubLocations(scopedRows);
      setSelectedSubLocationId((current) =>
        current && scopedRows.some((row) => row.id === current)
          ? current
          : scopedRows[0]?.id ?? "",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar sub-locations.";
      toast.error(message);
    } finally {
      setLoadingChildren(false);
    }
  }, [companyScopeId, selectedLocationId]);

  const loadLineCounts = React.useCallback(async () => {
    if (!selectedCameraId) {
      setLineCounts([]);
      return;
    }

    setLoadingChildren(true);
    try {
      const rows = await apiFetch<CameraLineCount[]>(
        `/cameras/${selectedCameraId}/line-counts`,
      );
      setLineCounts(
        filterScopedApiRows(rows, companyScopeId),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível carregar line counts.";
      toast.error(message);
    } finally {
      setLoadingChildren(false);
    }
  }, [companyScopeId, selectedCameraId]);

  React.useEffect(() => {
    loadBase();
  }, [loadBase]);

  React.useEffect(() => {
    loadSubLocations();
  }, [loadSubLocations]);

  React.useEffect(() => {
    loadLineCounts();
  }, [loadLineCounts]);

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
      try {
        const rows = await apiFetch<SubLocation[]>(
          `/locations/${cameraForm.location_id}/sub-locations`,
        );
        if (mounted) {
          setCameraSubLocations(filterScopedApiRows(rows, companyScopeId));
        }
      } catch {
        if (mounted) setCameraSubLocations([]);
      }
    }

    loadCameraSubLocations();

    return () => {
      mounted = false;
    };
  }, [cameraDialog, cameraForm.location_id, companyScopeId]);

  function openLocation(location?: Location) {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }

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

    if (!selectedLocationId) {
      toast.error("Selecione uma location antes de criar uma sub-location.");
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

    if (!subLocation) {
      toast.error("Selecione uma sub-location.");
      return;
    }

    const group =
      cameraGroups.find(
        (item) =>
          item.scope_type === "sub_location" && item.scope_id === subLocation.id,
      ) ?? null;
    const fallbackCameraIds = cameras
      .filter(
        (camera) =>
          camera.active !== false &&
          camera.sub_location_id === subLocation.id,
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

    if (!selectedCameraId) {
      toast.error("Selecione uma câmera antes de criar uma line count.");
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

    const name = locationForm.name.trim();
    if (!name) {
      toast.error("Nome obrigatório");
      return;
    }
    if (!workers.length) {
      toast.error("Cadastre um worker antes de salvar uma location.");
      return;
    }
    if (!locationForm.worker_id) {
      toast.error("Selecione o worker vinculado a esta location.");
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
            method: "PUT",
            body,
          },
        );
        savedLocationId = updated?.id || editingLocation.id;
        toast.success("Location atualizada");
      } else {
        const created = await apiFetch<Partial<Location> | null>("/locations", {
          method: "POST",
          body: {
            name,
            description: locationForm.description.trim() || undefined,
          },
        });
        savedLocationId = created?.id ?? "";
        toast.success("Location criada");
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
          "Location salva, mas a API não retornou o id para gravar o vínculo com o worker.",
        );
      }

      setLocationDialog(false);
      await loadBase();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSubLocation() {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }

    const name = subLocationForm.name.trim();
    if (!selectedLocationId || !name) {
      toast.error("Location e nome são obrigatórios");
      return;
    }

    setSaving(true);
    try {
      if (editingSubLocation) {
        await apiFetch(
          `/locations/${selectedLocationId}/sub-locations/${editingSubLocation.id}`,
          {
            method: "PUT",
            body: {
              name,
              active: subLocationForm.active === "true",
            },
          },
        );
        toast.success("Sub-location atualizada");
      } else {
        await apiFetch(`/locations/${selectedLocationId}/sub-locations`, {
          method: "POST",
          body: { name },
        });
        toast.success("Sub-location criada");
      }

      setSubLocationDialog(false);
      await loadSubLocations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function saveCameraGroup() {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }

    const cameraIds = cameraGroupForm.camera_ids.filter((cameraId) =>
      cameraGroupAvailableCameras.some((camera) => camera.id === cameraId),
    );
    if (!selectedSubLocation || !cameraGroupForm.scope_id) {
      toast.error("Selecione uma sub-location.");
      return;
    }
    if (!cameraIds.length) {
      toast.error("Selecione ao menos uma câmera para a sub-location");
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
    toast.success("Câmeras da sub-location atualizadas");
  }

  async function saveCamera() {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }

    const name = cameraForm.name.trim();
    if (!name || !cameraForm.location_id) {
      toast.error("Nome e location são obrigatórios");
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
          method: "PUT",
          body: {
            ...sharedBody,
            active: cameraForm.active === "true",
          },
        });
        toast.success("Câmera atualizada");
      } else {
        await apiFetch("/cameras", {
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function saveLineCount() {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }

    const name = lineForm.name.trim();
    const lineCode = lineForm.line_code.trim();
    if (!selectedCameraId || !name || !lineCode) {
      toast.error("Câmera, nome e line code são obrigatórios");
      return;
    }

    setSaving(true);
    try {
      if (editingLine) {
        await apiFetch(
          `/cameras/${selectedCameraId}/line-counts/${editingLine.id}`,
          {
            method: "PUT",
            body: {
              name,
              line_code: lineCode,
              active: lineForm.active === "true",
            },
          },
        );
        toast.success("Line count atualizada");
      } else {
        await apiFetch(`/cameras/${selectedCameraId}/line-counts`, {
          method: "POST",
          body: { name, line_code: lineCode },
        });
        toast.success("Line count criada");
      }

      setLineDialog(false);
      await loadLineCounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function removeLocation(location: Location) {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }

    if (!window.confirm(`Excluir a location "${location.name}"?`)) return;
    await removeResource(`/locations/${location.id}`, "Location excluída", async () => {
      setWorkerLocationAssignments(
        setWorkerLocationAssignment(cameraGroupScopeId, location.id, ""),
      );
      await loadBase();
    });
  }

  async function removeSubLocation(subLocation: SubLocation) {
    if (!canEditLocations) {
      toast.error("Seu usuário não pode alterar locais.");
      return;
    }

    if (!window.confirm(`Excluir a sub-location "${subLocation.name}"?`)) return;
    await removeResource(
      `/locations/${selectedLocationId}/sub-locations/${subLocation.id}`,
      "Sub-location excluída",
      loadSubLocations,
    );
  }

  async function removeCamera(camera: Camera) {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }

    if (!window.confirm(`Excluir a câmera "${camera.name}"?`)) return;
    await removeResource(`/cameras/${camera.id}`, "Câmera excluída", loadBase);
  }

  async function removeLine(line: CameraLineCount) {
    if (!canEditCameras) {
      toast.error("Seu usuário não pode alterar câmeras.");
      return;
    }

    if (!window.confirm(`Excluir a line count "${line.name}"?`)) return;
    await removeResource(
      `/cameras/${selectedCameraId}/line-counts/${line.id}`,
      "Line count excluída",
      loadLineCounts,
    );
  }

  async function removeResource(
    path: string,
    message: string,
    reload: () => Promise<void>,
  ) {
    try {
      await apiFetch(path, { method: "DELETE" });
      toast.success(message);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir.");
    }
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
          camera.active !== false &&
          camera.sub_location_id === subLocation.id,
      )
      .map((camera) => camera.id);
  }

  return (
    <section id="configuracoes" className="scroll-mt-6 space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={loadBase}
          disabled={loading}
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Atualizar
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        {view === "all" ? (
          <TabsList>
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="cameras">Câmeras</TabsTrigger>
          </TabsList>
        ) : null}

        {view !== "cameras" ? (
          <TabsContent value="locations">
            <div id="locations" className="scroll-mt-6 space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Locations cadastradas</CardTitle>
                    <CardDescription>
                      Cadastro operacional usado para vincular e agrupar câmeras.
                    </CardDescription>
                  </div>
                  {canEditLocations ? (
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={() => openLocation()}
                    >
                      <Plus className="h-4 w-4" />
                      Nova location
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <TableSkeleton />
                  ) : locations.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Worker</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Criado em</TableHead>
                          {canEditLocations ? (
                            <TableHead className="text-right">Ações</TableHead>
                          ) : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {locations.map((location) => {
                          const workerId = workerLocationAssignments[location.id] ?? "";
                          const worker = workerId ? workersById.get(workerId) : null;

                          return (
                            <TableRow
                              key={location.id}
                              className={
                                selectedLocationId === location.id
                                  ? "bg-primary/10"
                                  : ""
                              }
                              onClick={() => setSelectedLocationId(location.id)}
                            >
                              <TableCell>
                                <div className="font-medium">{location.name}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {location.description || location.id}
                                </div>
                              </TableCell>
                              <TableCell>
                                {worker ? (
                                  <div className="space-y-1">
                                    <div className="font-medium">{worker.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {worker.description || worker.id}
                                    </div>
                                  </div>
                                ) : (
                                  <Badge variant="warning">
                                    {workerId ? "Worker não encontrado" : "Sem worker"}
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
                  ) : (
                    <EmptyState text="Nenhuma location cadastrada." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>
                      Sub-locations{" "}
                      {selectedLocation ? `de ${selectedLocation.name}` : ""}
                    </CardTitle>
                    <CardDescription>
                      Defina as sub-locations e selecione as câmeras relacionadas
                      a cada uma.
                    </CardDescription>
                  </div>
                  {canEditLocations ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => openSubLocation()}
                      disabled={!selectedLocationId}
                    >
                      <Plus className="h-4 w-4" />
                      Nova sub-location
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {loadingChildren ? (
                    <TableSkeleton />
                  ) : subLocations.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Câmeras</TableHead>
                          <TableHead>Criado em</TableHead>
                          {canEditLocations ? (
                            <TableHead className="text-right">Ações</TableHead>
                          ) : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subLocations.map((subLocation) => {
                          const cameraCount =
                            subLocationCameraIds(subLocation).length;

                          return (
                            <TableRow
                              key={subLocation.id}
                              className={
                                selectedSubLocationId === subLocation.id
                                  ? "bg-primary/10"
                                  : ""
                              }
                              onClick={() => setSelectedSubLocationId(subLocation.id)}
                            >
                              <TableCell>
                                <div className="font-medium">{subLocation.name}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {subLocation.id}
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
                  ) : (
                    <EmptyState text="Nenhuma sub-location para a location selecionada." />
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
                      disabled={!locations.length}
                    >
                      <Plus className="h-4 w-4" />
                      Nova câmera
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <TableSkeleton />
                  ) : cameras.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Status</TableHead>
                          {canEditCameras ? (
                            <TableHead className="text-right">Ações</TableHead>
                          ) : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cameras.map((camera) => (
                          <TableRow
                            key={camera.id}
                            className={
                              selectedCameraId === camera.id
                                ? "bg-primary/10"
                                : ""
                            }
                            onClick={() => setSelectedCameraId(camera.id)}
                          >
                            <TableCell>
                              <div className="font-medium">{camera.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {camera.code || camera.id}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {locations.find(
                                (location) => location.id === camera.location_id,
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
                  ) : (
                    <EmptyState text="Nenhuma câmera cadastrada." />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>
                      Line counts{" "}
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
                      disabled={!selectedCameraId}
                    >
                      <Plus className="h-4 w-4" />
                      Nova line count
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {loadingChildren ? (
                    <TableSkeleton />
                  ) : lineCounts.length ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Line code</TableHead>
                          <TableHead>Status</TableHead>
                          {canEditCameras ? (
                            <TableHead className="text-right">Ações</TableHead>
                          ) : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineCounts.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>
                              <div className="font-medium">{line.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {line.id}
                              </div>
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
                                    onClick={() => openLineCount(line)}
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
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
                  ) : (
                    <EmptyState text="Nenhuma line count para a câmera selecionada." />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog open={locationDialog} onOpenChange={setLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingLocation ? "Editar location" : "Nova location"}
            </DialogTitle>
            <DialogDescription>
              Salva a localidade usada para vincular e agrupar câmeras.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Nome">
            <Input
              value={locationForm.name}
              onChange={(event) =>
                setLocationForm((form) => ({ ...form, name: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Worker vinculado">
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
                      ? "Selecione o worker"
                      : "Nenhum worker disponível"
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
                Cadastre um worker da empresa antes de criar locations.
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
              {editingSubLocation
                ? "Editar sub-location"
                : "Nova sub-location"}
            </DialogTitle>
            <DialogDescription>
              Salva uma zona vinculada à location selecionada.
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
            <DialogTitle>Câmeras da sub-location</DialogTitle>
            <DialogDescription>
              Selecione quais câmeras pertencem à sub-location escolhida.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-sm font-medium">
              {selectedSubLocation?.name ?? "Sub-location"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedLocation?.name ?? "Location"}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Câmeras</Label>
            <div className="max-h-[280px] overflow-y-auto rounded-md border">
              {cameraGroupAvailableCameras.length ? (
                cameraGroupAvailableCameras.map((camera) => {
                  const checked = cameraGroupForm.camera_ids.includes(camera.id);

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
                          {camera.code || camera.id}
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
                  Nenhuma câmera disponível para esta location.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCameraGroupDialog(false)}>
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
            <DialogTitle>{editingCamera ? "Editar câmera" : "Nova câmera"}</DialogTitle>
            <DialogDescription>
              Salva a câmera e sua associação com a location.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Nome">
              <Input
                value={cameraForm.name}
                onChange={(event) =>
                  setCameraForm((form) => ({ ...form, name: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Código">
              <Input
                value={cameraForm.code}
                onChange={(event) =>
                  setCameraForm((form) => ({ ...form, code: event.target.value }))
                }
              />
            </FormField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Location">
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
            <FormField label="Sub-location">
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
              {editingLine ? "Editar line count" : "Nova line count"}
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
            <FormField label="Line code">
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

async function fetchInfrastructureWorkers(companyId?: string | null) {
  const rows = await apiFetch<unknown>("/workers").then((response) =>
    normalizeWorkerRows(response),
  );
  const { scopedRows } = partitionWorkersByCompanyScope(rows, companyId);
  return sortWorkersByActivity(scopedRows);
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
