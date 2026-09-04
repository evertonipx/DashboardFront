"use client";

import * as React from "react";
import {
  Check,
  Edit,
  MapPinned,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { useResourceAutoRefresh } from "@/components/app/use-resource-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiFetch } from "@/lib/api";
import {
  filterScopedApiRows,
  usesMasterCrossCompanyScope,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import {
  buildOccupancyAreaKey,
  resolveOccupancyAreaSelectionLabel,
  type OccupancyAreaOption,
} from "@/lib/occupancy-areas";
import {
  fetchOccupancyAreaCatalog,
  requireOccupancyAreaClassCompatibility,
} from "@/lib/occupancy-area-options";
import { requireOccupancyScenarioRows } from "@/lib/occupancy-validation";
import { canManageOccupancy } from "@/lib/permissions";
import { RESOURCE_METADATA_REFRESH_INTERVAL_MS } from "@/lib/resource-auto-refresh";
import { selectExplicitCompanyScopedRows } from "@/lib/tenant-scope-validation";
import type {
  OccupancyScenario,
  OccupancyScenarioArea,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

type AreaOption = OccupancyAreaOption;

type Draft = {
  id?: string;
  active: boolean;
  areas: OccupancyScenarioArea[];
  max_total: string;
  min_total: string;
  name: string;
  object_class: string;
};

const MANUAL_AREA_OPTION = "__manual__";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function OccupancyScenarioManager() {
  const { user } = useAuth();
  const canEdit = canManageOccupancy(user);
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const masterCrossCompanyScope = usesMasterCrossCompanyScope(
    user,
    companyScopeId,
  );
  const [scenarios, setScenarios] = React.useState<OccupancyScenario[]>([]);
  const [areaOptions, setAreaOptions] = React.useState<AreaOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingAreas, setLoadingAreas] = React.useState(true);
  const [scenarioCatalogError, setScenarioCatalogError] = React.useState("");
  const [areaCatalogError, setAreaCatalogError] = React.useState("");
  const [areaCatalogWarning, setAreaCatalogWarning] = React.useState("");
  const [areaCatalogAuthoritative, setAreaCatalogAuthoritative] =
    React.useState(false);
  const [scenarioCatalogReady, setScenarioCatalogReady] = React.useState(false);
  const [areaCatalogReady, setAreaCatalogReady] = React.useState(false);
  const [scenarioCatalogCompanyId, setScenarioCatalogCompanyId] =
    React.useState("");
  const [areaCatalogCompanyId, setAreaCatalogCompanyId] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [bulkDeactivateDialogOpen, setBulkDeactivateDialogOpen] =
    React.useState(false);
  const [bulkUpdatingStatus, setBulkUpdatingStatus] = React.useState<
    boolean | null
  >(null);
  const [scenarioSearch, setScenarioSearch] = React.useState("");
  const [scenarioStatus, setScenarioStatus] = React.useState<
    "all" | "active" | "inactive"
  >("all");
  const [selectedScenarioIds, setSelectedScenarioIds] = React.useState<
    string[]
  >([]);
  const [editingScenario, setEditingScenario] =
    React.useState<OccupancyScenario | null>(null);
  const scenarioRequestSequenceRef = React.useRef(0);
  const areaRequestSequenceRef = React.useRef(0);
  const companyScopeIdRef = React.useRef(companyScopeId);
  const scenarioCatalogCertified =
    Boolean(companyScopeId) &&
    scenarioCatalogReady &&
    scenarioCatalogCompanyId === companyScopeId;
  const areaCatalogCertified =
    Boolean(companyScopeId) &&
    areaCatalogReady &&
    areaCatalogCompanyId === companyScopeId;
  const catalogsReady =
    scenarioCatalogCertified && areaCatalogCertified;
  const selectedScenarioIdSet = React.useMemo(
    () => new Set(selectedScenarioIds),
    [selectedScenarioIds],
  );
  const filteredScenarios = React.useMemo(() => {
    const search = scenarioSearch.trim().toLocaleLowerCase("pt-BR");
    return scenarios.filter((scenario) => {
      if (scenarioStatus === "active" && !scenario.active) return false;
      if (scenarioStatus === "inactive" && scenario.active) return false;
      if (!search) return true;
      return scenario.name.toLocaleLowerCase("pt-BR").includes(search);
    });
  }, [scenarioSearch, scenarioStatus, scenarios]);
  const selectedScenarios = React.useMemo(
    () =>
      scenarios.filter((scenario) => selectedScenarioIdSet.has(scenario.id)),
    [scenarios, selectedScenarioIdSet],
  );
  const selectedVisibleScenarioCount = filteredScenarios.filter((scenario) =>
    selectedScenarioIdSet.has(scenario.id),
  ).length;
  const allVisibleScenariosSelected =
    filteredScenarios.length > 0 &&
    selectedVisibleScenarioCount === filteredScenarios.length;
  const scenarioSelectionState = allVisibleScenariosSelected
    ? true
    : selectedVisibleScenarioCount
      ? "indeterminate"
      : false;
  const bulkMutating = bulkDeleting || bulkUpdatingStatus !== null;
  const activeSelectedScenarioCount = selectedScenarios.filter(
    (scenario) => scenario.active,
  ).length;
  const inactiveSelectedScenarioCount =
    selectedScenarios.length - activeSelectedScenarioCount;

  const loadScenarios = React.useCallback(async (
    { silent = false }: { silent?: boolean } = {},
  ) => {
    const requestSequence = ++scenarioRequestSequenceRef.current;
    const requestedCompanyId = companyScopeId;
    const isCurrentRequest = () =>
      requestSequence === scenarioRequestSequenceRef.current &&
      companyScopeIdRef.current === requestedCompanyId;
    if (!silent) {
      setLoading(true);
      setScenarioCatalogReady(false);
      setScenarioCatalogCompanyId("");
      setScenarioCatalogError("");
    }
    try {
      if (!requestedCompanyId) {
        throw new Error(
          "Empresa ativa não definida para carregar cenários de ocupação.",
        );
      }
      const response = await apiFetch<unknown>("/occupancy/scenarios", {
        companyScopeId: requestedCompanyId,
      });
      const payload = masterCrossCompanyScope
        ? selectExplicitCompanyScopedRows(response, requestedCompanyId, {
            collectionKeys: ["data"],
            label: "cenários de Ocupação",
          }).rows
        : response;
      const rows = filterScopedApiRows(
        requireOccupancyScenarioRows(payload, requestedCompanyId),
        requestedCompanyId,
      );
      if (!isCurrentRequest()) return;
      setScenarios(rows);
      const availableScenarioIds = new Set(
        rows.map((scenario) => scenario.id),
      );
      setSelectedScenarioIds((current) =>
        current.filter((scenarioId) => availableScenarioIds.has(scenarioId)),
      );
      setScenarioCatalogError("");
      setScenarioCatalogCompanyId(requestedCompanyId);
      setScenarioCatalogReady(true);
    } catch {
      if (!isCurrentRequest()) return;
      const message = "Não foi possível carregar os cenários de ocupação.";
      if (!silent) {
        setScenarios([]);
        setScenarioCatalogCompanyId("");
        setScenarioCatalogError(message);
        setScenarioCatalogReady(false);
        toast.error(message);
      }
    } finally {
      if (!silent && isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [companyScopeId, masterCrossCompanyScope]);

  const loadAreaOptions = React.useCallback(async (
    { silent = false }: { silent?: boolean } = {},
  ) => {
    const requestSequence = ++areaRequestSequenceRef.current;
    const now = new Date();
    if (!silent) {
      setLoadingAreas(true);
      setAreaOptions([]);
      setAreaCatalogReady(false);
      setAreaCatalogCompanyId("");
      setAreaCatalogError("");
      setAreaCatalogWarning("");
      setAreaCatalogAuthoritative(false);
    }
    try {
      if (!companyScopeId) {
        throw new Error(
          "Empresa ativa não definida para descobrir áreas de ocupação.",
        );
      }
      const catalog = await fetchOccupancyAreaCatalog({
        companyId: companyScopeId,
        from: new Date(now.getTime() - 4 * HOUR_MS),
        request: <T,>(path: string) =>
          apiFetch<T>(path, { companyScopeId }),
        to: now,
      });
      if (requestSequence !== areaRequestSequenceRef.current) return;
      setAreaOptions(catalog.options);
      setAreaCatalogError("");
      setAreaCatalogAuthoritative(catalog.authoritative);
      setAreaCatalogWarning(
        catalog.authoritative
          ? ""
          : "A lista de áreas está sendo atualizada e pode não mostrar todas as opções neste momento.",
      );
      setAreaCatalogCompanyId(companyScopeId);
      setAreaCatalogReady(true);
    } catch {
      if (requestSequence !== areaRequestSequenceRef.current) return;
      const message = "Não foi possível carregar as áreas de ocupação.";
      if (!silent) {
        setAreaOptions([]);
        setAreaCatalogCompanyId("");
        setAreaCatalogError(message);
        setAreaCatalogWarning("");
        setAreaCatalogAuthoritative(false);
        setAreaCatalogReady(false);
        toast.error(message);
      }
    } finally {
      if (!silent && requestSequence === areaRequestSequenceRef.current) {
        setLoadingAreas(false);
      }
    }
  }, [companyScopeId]);

  React.useLayoutEffect(() => {
    companyScopeIdRef.current = companyScopeId;
  }, [companyScopeId]);

  React.useEffect(() => {
    setScenarios([]);
    setScenarioCatalogReady(false);
    setScenarioCatalogCompanyId("");
    setDialogOpen(false);
    setBulkDeleteDialogOpen(false);
    setBulkDeactivateDialogOpen(false);
    setSelectedScenarioIds([]);
    setScenarioSearch("");
    setScenarioStatus("all");
    setEditingScenario(null);
    void loadScenarios();
    void loadAreaOptions();
  }, [loadAreaOptions, loadScenarios]);

  useResourceAutoRefresh(
    async () => {
      await Promise.all([
        loadScenarios({ silent: true }),
        loadAreaOptions({ silent: true }),
      ]);
    },
    {
      enabled:
        Boolean(companyScopeId) && !loading && !loadingAreas && !bulkMutating,
      intervalMs: RESOURCE_METADATA_REFRESH_INTERVAL_MS,
    },
  );

  function openCreateDialog() {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de ocupação.");
      return;
    }
    if (!catalogsReady) {
      toast.error(
        areaCatalogError ||
          scenarioCatalogError ||
          "As opções de ocupação ainda estão sendo carregadas.",
      );
      return;
    }

    setEditingScenario(null);
    setDialogOpen(true);
  }

  function openEditDialog(scenario: OccupancyScenario) {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de ocupação.");
      return;
    }
    if (!catalogsReady) {
      toast.error(
        areaCatalogError ||
          scenarioCatalogError ||
          "As opções de ocupação ainda estão sendo carregadas.",
      );
      return;
    }
    if (scenario.company_id !== companyScopeId) {
      toast.error("Este cenário não pertence à empresa selecionada.");
      return;
    }

    setEditingScenario(scenario);
    setDialogOpen(true);
  }

  async function deleteScenario(scenario: OccupancyScenario) {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de ocupação.");
      return;
    }
    if (!scenarioCatalogCertified) {
      toast.error(
        scenarioCatalogError ||
          "Os cenários de ocupação ainda não estão disponíveis.",
      );
      return;
    }
    if (scenario.company_id !== companyScopeId) {
      toast.error("Este cenário não pertence à empresa selecionada.");
      return;
    }

    if (!window.confirm(`Excluir o cenário de ocupação "${scenario.name}"?`)) {
      return;
    }

    const requestedCompanyId = companyScopeId;
    try {
      await apiFetch(`/occupancy/scenarios/${scenario.id}`, {
        companyScopeId: requestedCompanyId,
        method: "DELETE",
      });
      if (requestedCompanyId !== companyScopeIdRef.current) return;
      toast.success("Cenário de ocupação excluído.");
      await loadScenarios();
    } catch {
      if (requestedCompanyId !== companyScopeIdRef.current) return;
      toast.error("Não foi possível excluir o cenário de ocupação.");
    }
  }

  function toggleScenarioSelection(scenarioId: string, checked: boolean) {
    setSelectedScenarioIds((current) => {
      if (checked) return [...new Set([...current, scenarioId])];
      return current.filter((candidateId) => candidateId !== scenarioId);
    });
  }

  function toggleAllScenarioSelection(checked: boolean) {
    const visibleIds = new Set(
      filteredScenarios.map((scenario) => scenario.id),
    );
    setSelectedScenarioIds((current) =>
      checked
        ? [...new Set([...current, ...visibleIds])]
        : current.filter((scenarioId) => !visibleIds.has(scenarioId)),
    );
  }

  async function updateSelectedScenarioStatus(active: boolean) {
    if (!canEdit || bulkMutating) return;
    if (!scenarioCatalogCertified) {
      toast.error(
        scenarioCatalogError ||
          "Os cenários de ocupação ainda não estão disponíveis.",
      );
      return;
    }

    const requestedCompanyId = companyScopeId;
    const candidates = selectedScenarios.filter(
      (scenario) =>
        scenario.company_id === requestedCompanyId &&
        scenario.active !== active,
    );
    if (!requestedCompanyId || !candidates.length) return;

    setBulkUpdatingStatus(active);
    const updatedIds: string[] = [];
    const failedIds: string[] = [];
    let companyChanged = false;

    try {
      for (const scenario of candidates) {
        if (companyScopeIdRef.current !== requestedCompanyId) {
          companyChanged = true;
          break;
        }

        try {
          const response = await apiFetch<unknown>(
            `/occupancy/scenarios/${scenario.id}`,
            {
              body: { active },
              companyScopeId: requestedCompanyId,
              method: "PUT",
            },
          );
          requireOptionalOccupancyStatusResponse(response, {
            active,
            companyId: requestedCompanyId,
            expectedId: scenario.id,
          });
          updatedIds.push(scenario.id);
        } catch {
          failedIds.push(scenario.id);
        }
      }

      if (companyChanged) return;

      setSelectedScenarioIds(failedIds);
      setBulkDeactivateDialogOpen(false);
      if (updatedIds.length) await loadScenarios();

      const action = active ? "ativado(s)" : "desativado(s)";
      if (!failedIds.length) {
        toast.success(`${updatedIds.length} cenário(s) ${action}.`);
      } else if (updatedIds.length) {
        toast.warning(
          `${updatedIds.length} cenário(s) ${action}; ${failedIds.length} não puderam ser alterados.`,
        );
      } else {
        toast.error("Não foi possível alterar os cenários selecionados.");
      }
    } finally {
      setBulkUpdatingStatus(null);
    }
  }

  async function deleteSelectedScenarios() {
    if (!canEdit || bulkMutating) return;
    if (!scenarioCatalogCertified) {
      toast.error(
        scenarioCatalogError ||
          "Os cenários de ocupação ainda não estão disponíveis.",
      );
      return;
    }

    const requestedCompanyId = companyScopeId;
    const candidates = selectedScenarios.filter(
      (scenario) => scenario.company_id === requestedCompanyId,
    );
    if (!requestedCompanyId || !candidates.length) {
      toast.error("Selecione pelo menos um cenário válido.");
      setBulkDeleteDialogOpen(false);
      return;
    }

    setBulkDeleting(true);
    const deletedIds: string[] = [];
    const failedIds: string[] = [];
    let companyChanged = false;

    try {
      for (const scenario of candidates) {
        if (companyScopeIdRef.current !== requestedCompanyId) {
          companyChanged = true;
          break;
        }

        try {
          await apiFetch(`/occupancy/scenarios/${scenario.id}`, {
            companyScopeId: requestedCompanyId,
            method: "DELETE",
          });
          deletedIds.push(scenario.id);
        } catch {
          failedIds.push(scenario.id);
        }
      }

      if (companyChanged) return;

      setSelectedScenarioIds(failedIds);
      setBulkDeleteDialogOpen(false);

      if (deletedIds.length) await loadScenarios();

      if (!failedIds.length) {
        toast.success(
          deletedIds.length === 1
            ? "Cenário de ocupação excluído."
            : `${deletedIds.length} cenários de ocupação excluídos.`,
        );
      } else if (deletedIds.length) {
        toast.warning(
          `${deletedIds.length} cenário(s) excluído(s); ${failedIds.length} não puderam ser excluídos.`,
        );
      } else {
        toast.error("Não foi possível excluir os cenários selecionados.");
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleSaved(savedCompanyId: string) {
    if (savedCompanyId !== companyScopeIdRef.current) return;
    setDialogOpen(false);
    await Promise.all([loadScenarios(), loadAreaOptions()]);
  }

  return (
    <section className="space-y-4">
      <Card id="config-cenarios-ocupacao" className="scroll-mt-6">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPinned className="h-4 w-4" />
              Cenários de ocupação
            </CardTitle>
            <CardDescription className="mt-1">
              Configure cenários de ocupação por câmera, objeto e limites de alerta.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                void loadScenarios();
                void loadAreaOptions();
              }}
              disabled={loading || loadingAreas || bulkMutating}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (loading || loadingAreas) && "animate-spin",
                )}
              />
              Atualizar
            </Button>
            {canEdit ? (
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={openCreateDialog}
                disabled={!catalogsReady || bulkMutating}
              >
                <Plus className="h-4 w-4" />
                Novo cenário
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {areaCatalogError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Áreas indisponíveis: {areaCatalogError}
            </div>
          ) : loadingAreas ? (
            <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Carregando câmeras e áreas de ocupação...
            </div>
          ) : areaCatalogWarning ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              {areaCatalogWarning}
            </div>
          ) : null}
          {loading ? (
            <TableSkeleton />
          ) : scenarioCatalogError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
              Cenários indisponíveis: {scenarioCatalogError}
            </div>
          ) : scenarios.length ? (
            <>
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_auto] sm:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={scenarioSearch}
                    onChange={(event) => setScenarioSearch(event.target.value)}
                    placeholder="Buscar cenário"
                    className="pl-9"
                    aria-label="Buscar cenários de ocupação"
                  />
                </div>
                <Select
                  value={scenarioStatus}
                  onValueChange={(value) =>
                    setScenarioStatus(
                      value as "all" | "active" | "inactive",
                    )
                  }
                >
                  <SelectTrigger aria-label="Filtrar cenários por status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="justify-center whitespace-nowrap">
                  {filteredScenarios.length} de {scenarios.length}
                </Badge>
              </div>
              {selectedScenarios.length ? (
                <div
                  className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                  role="region"
                  aria-label="Ações para cenários de ocupação selecionados"
                  aria-busy={bulkMutating}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {selectedScenarios.length} cenário(s) selecionado(s)
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Edite um item ou aplique uma ação à seleção.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedScenarioIds([])}
                      disabled={bulkMutating}
                    >
                      <X className="h-3.5 w-3.5" />
                      Limpar seleção
                    </Button>
                    {selectedScenarios.length === 1 ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(selectedScenarios[0])}
                        disabled={bulkMutating || !catalogsReady}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void updateSelectedScenarioStatus(true)}
                      disabled={bulkMutating || !inactiveSelectedScenarioCount}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {bulkUpdatingStatus === true ? "Ativando..." : "Ativar"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setBulkDeactivateDialogOpen(true)}
                      disabled={bulkMutating || !activeSelectedScenarioCount}
                    >
                      <X className="h-3.5 w-3.5" />
                      Desativar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setBulkDeleteDialogOpen(true)}
                      disabled={bulkMutating || !scenarioCatalogCertified}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir selecionados
                    </Button>
                  </div>
                </div>
              ) : null}
              <Table scrollRegionLabel="Cenários de ocupação cadastrados">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        aria-label="Selecionar todos os cenários de ocupação"
                        checked={scenarioSelectionState}
                        onCheckedChange={(checked) =>
                          toggleAllScenarioSelection(checked === true)
                        }
                        disabled={bulkMutating || !filteredScenarios.length}
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Áreas</TableHead>
                    <TableHead>Objeto</TableHead>
                    <TableHead>Alertas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Atualizado</TableHead>
                    {canEdit ? (
                      <TableHead className="text-right">Ações</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredScenarios.map((scenario) => {
                    const selected = selectedScenarioIdSet.has(scenario.id);
                    return (
                      <TableRow
                        key={scenario.id}
                        aria-selected={selected}
                        data-state={selected ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={`Selecionar cenário ${scenario.name}`}
                            checked={selected}
                            onCheckedChange={(checked) =>
                              toggleScenarioSelection(
                                scenario.id,
                                checked === true,
                              )
                            }
                            disabled={bulkMutating}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{scenario.name}</div>
                        </TableCell>
                        <TableCell>
                          {formatNumber(scenario.areas?.length ?? 0)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {occupancyObjectLabel(scenario.object_class)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {thresholdSummary(scenario)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge active={scenario.active} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(
                            scenario.updated_at ?? scenario.created_at,
                          )}
                        </TableCell>
                        {canEdit ? (
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(scenario)}
                                disabled={bulkMutating || !catalogsReady}
                              >
                                <Edit className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteScenario(scenario)}
                                disabled={
                                  bulkMutating || !scenarioCatalogCertified
                                }
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
                  {!filteredScenarios.length ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-10 text-center text-muted-foreground"
                      >
                        Nenhum cenário corresponde aos filtros selecionados.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum cenário de ocupação cadastrado.
              {canEdit ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={openCreateDialog}
                    disabled={!catalogsReady}
                  >
                    <Plus className="h-4 w-4" />
                    Criar primeiro cenário
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <OccupancyScenarioDialog
        areaCatalogAuthoritative={areaCatalogAuthoritative}
        areaCatalogError={areaCatalogError}
        areaCatalogReady={areaCatalogCertified}
        areaOptions={areaOptions}
        canEdit={canEdit}
        companyId={companyScopeId}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        open={dialogOpen}
        scenario={editingScenario}
      />
      <Dialog
        open={bulkDeactivateDialogOpen}
        onOpenChange={(open) => {
          if (!bulkMutating) setBulkDeactivateDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Desativar cenários selecionados?</DialogTitle>
            <DialogDescription>
              {activeSelectedScenarioCount} cenário(s) deixarão de ser
              considerados nas seleções operacionais até serem reativados.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-52 overflow-y-auto rounded-md border bg-muted/20 p-3">
            <ul className="space-y-1 text-sm">
              {selectedScenarios
                .filter((scenario) => scenario.active)
                .map((scenario) => (
                  <li key={scenario.id} className="truncate">
                    {scenario.name}
                  </li>
                ))}
            </ul>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDeactivateDialogOpen(false)}
              disabled={bulkMutating}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void updateSelectedScenarioStatus(false)}
              disabled={bulkMutating || !activeSelectedScenarioCount}
            >
              {bulkUpdatingStatus === false
                ? "Desativando..."
                : `Desativar ${activeSelectedScenarioCount} cenário(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!bulkMutating) setBulkDeleteDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Excluir cenários selecionados?</DialogTitle>
            <DialogDescription>
              Esta ação excluirá {selectedScenarios.length} cenário(s) de
              ocupação e não poderá ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-52 overflow-y-auto rounded-md border bg-muted/20 p-3">
            <ul className="space-y-1 text-sm">
              {selectedScenarios.map((scenario) => (
                <li key={scenario.id} className="truncate">
                  {scenario.name}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDeleteDialogOpen(false)}
              disabled={bulkMutating}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteSelectedScenarios()}
              disabled={bulkMutating || !selectedScenarios.length}
            >
              <Trash2 className="h-4 w-4" />
              {bulkDeleting
                ? "Excluindo..."
                : `Excluir ${selectedScenarios.length} cenário(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function OccupancyScenarioDialog({
  areaCatalogAuthoritative,
  areaCatalogError,
  areaCatalogReady,
  areaOptions,
  canEdit,
  companyId,
  onOpenChange,
  onSaved,
  open,
  scenario,
}: {
  areaCatalogAuthoritative: boolean;
  areaCatalogError: string;
  areaCatalogReady: boolean;
  areaOptions: AreaOption[];
  canEdit: boolean;
  companyId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (companyId: string) => Promise<void>;
  open: boolean;
  scenario: OccupancyScenario | null;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => createEmptyDraft());
  const [saving, setSaving] = React.useState(false);
  const companyIdRef = React.useRef(companyId);
  const compatibleAreaOptions = React.useMemo(() => {
    const objectClass = draft.object_class.trim().toLowerCase();
    return areaOptions.filter(
      (option) =>
        !option.object_class || option.object_class === objectClass,
    );
  }, [areaOptions, draft.object_class]);

  React.useLayoutEffect(() => {
    companyIdRef.current = companyId;
  }, [companyId]);

  React.useEffect(() => {
    if (!open) return;
    setDraft(scenario ? scenarioToDraft(scenario) : createEmptyDraft());
  }, [open, scenario]);

  function updateArea(index: number, patch: Partial<OccupancyScenarioArea>) {
    setDraft((current) => ({
      ...current,
      areas: current.areas.map((area, areaIndex) =>
        areaIndex === index ? { ...area, ...patch } : area,
      ),
    }));
  }

  function addArea() {
    const used = new Set(draft.areas.map(areaKey));
    const option = compatibleAreaOptions.find(
      (item) => !used.has(areaKey(item)),
    );
    if (!option) {
      toast.error(
        compatibleAreaOptions.length
          ? "Todas as áreas disponíveis desta classe já foram incluídas."
          : "Não há outra área disponível para este tipo de detecção.",
      );
      return;
    }

    setDraft((current) => ({
      ...current,
      areas: [
        ...current.areas,
        {
          area_id: option.area_id,
          camera_id: option.camera_id,
          label: option.label,
        },
      ],
    }));
  }

  function removeArea(index: number) {
    setDraft((current) => ({
      ...current,
      areas: current.areas.filter((_, areaIndex) => areaIndex !== index),
    }));
  }

  async function saveScenario() {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de ocupação.");
      return;
    }

    if (!areaCatalogReady || !companyId) {
      toast.error(
        areaCatalogError ||
          "As áreas ainda não estão disponíveis para salvar o cenário.",
      );
      return;
    }
    if (
      draft.id &&
      (!scenario ||
        scenario.id !== draft.id ||
        scenario.company_id !== companyId)
    ) {
      toast.error("Este cenário não pertence à empresa selecionada.");
      return;
    }

    let payload: ReturnType<typeof buildScenarioPayload>;
    try {
      payload = buildScenarioPayload(draft);
      requireOccupancyAreaClassCompatibility({
        authoritative: areaCatalogAuthoritative && draft.active,
        areas: payload.areas,
        objectClass: payload.object_class,
        options: areaOptions,
      });
    } catch {
      toast.error("Revise o nome, os limites e as áreas selecionadas.");
      return;
    }

    setSaving(true);
    try {
      if (draft.id) {
        const response = await apiFetch<unknown>(
          `/occupancy/scenarios/${draft.id}`,
          {
            method: "PUT",
            body: {
              ...payload,
              active: draft.active,
            },
            companyScopeId: companyId,
          },
        );
        if (companyId !== companyIdRef.current) return;
        requireSavedScenario(response, {
          active: draft.active,
          companyId,
          expectedId: draft.id,
          payload,
        });
        toast.success("Cenário de ocupação atualizado.");
      } else {
        const response = await apiFetch<unknown>("/occupancy/scenarios", {
          method: "POST",
          body: payload,
          companyScopeId: companyId,
        });
        if (companyId !== companyIdRef.current) return;
        requireSavedScenario(response, { companyId, payload });
        toast.success("Cenário de ocupação criado.");
      }

      await onSaved(companyId);
    } catch {
      if (companyId !== companyIdRef.current) return;
      toast.error("Não foi possível salvar o cenário de ocupação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "Editar cenário de ocupação" : "Novo cenário de ocupação"}
          </DialogTitle>
          <DialogDescription>
            Selecione as áreas que farão parte deste cenário.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {!areaCatalogReady ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Salvamento indisponível:{" "}
              {areaCatalogError ||
                "as áreas ainda estão sendo carregadas."}
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_150px_150px]">
            <FormField label="Nome">
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Ex.: Postos de trabalho"
              />
            </FormField>
            <FormField label="Tipo de detecção">
              <Select
                value={draft.object_class}
                onValueChange={(objectClass) =>
                  setDraft((current) => ({
                    ...current,
                    object_class: objectClass,
                  }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="person">Pessoas</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Mínimo">
              <Input
                min={0}
                type="number"
                value={draft.min_total}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    min_total: event.target.value,
                  }))
                }
                placeholder="0"
              />
            </FormField>
            <FormField label="Máximo">
              <Input
                min={0}
                type="number"
                value={draft.max_total}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    max_total: event.target.value,
                  }))
                }
                placeholder="50"
              />
            </FormField>
          </div>

          {draft.id ? (
            <div className="max-w-[180px]">
              <FormField label="Status">
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.active}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      active: !current.active,
                    }))
                  }
                  className={cn(
                    "flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    draft.active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground",
                  )}
                >
                  {draft.active ? "Ativo" : "Inativo"}
                  <span
                    className={cn(
                      "flex h-4 w-7 items-center rounded-full p-0.5 transition",
                      draft.active ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "h-3 w-3 rounded-full bg-background shadow-sm transition",
                        draft.active && "translate-x-3",
                      )}
                    />
                  </span>
                </button>
              </FormField>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Áreas do cenário</div>
                <div className="text-xs text-muted-foreground">
                  Selecione uma área detectada ou preencha câmera e área manualmente.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addArea}
                disabled={!areaCatalogReady}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar área
              </Button>
            </div>

            {draft.areas.length ? (
              <div className="space-y-2">
                {draft.areas.map((area, index) => (
                  <ScenarioAreaEditor
                    key={`${area.camera_id}-${area.area_id}-${index}`}
                    area={area}
                    areaOptions={compatibleAreaOptions}
                    onPatch={(patch) => updateArea(index, patch)}
                    onRemove={() => removeArea(index)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                Inclua pelo menos uma área no cenário.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={saveScenario}
            disabled={saving || !canEdit || !areaCatalogReady}
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar cenário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioAreaEditor({
  area,
  areaOptions,
  onPatch,
  onRemove,
}: {
  area: OccupancyScenarioArea;
  areaOptions: AreaOption[];
  onPatch: (patch: Partial<OccupancyScenarioArea>) => void;
  onRemove: () => void;
}) {
  const selectedOption = areaOptions.find(
    (option) =>
      option.area_id === area.area_id && option.camera_id === area.camera_id,
  );
  const selectedOptionKey = selectedOption?.key ?? MANUAL_AREA_OPTION;

  return (
    <div className="grid gap-3 rounded-md border bg-card p-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]">
      <FormField label="Área detectada">
        <Select
          value={selectedOptionKey}
          onValueChange={(value) => {
            if (value === MANUAL_AREA_OPTION) return;
            const option = areaOptions.find((item) => item.key === value);
            if (!option) return;

            onPatch({
              area_id: option.area_id,
              camera_id: option.camera_id,
              label: resolveOccupancyAreaSelectionLabel({
                currentLabel: area.label,
                currentOptionLabel: selectedOption?.label,
                nextOptionLabel: option.label,
              }),
            });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={MANUAL_AREA_OPTION} disabled>
              Área já configurada
            </SelectItem>
            {areaOptions.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Rótulo">
        <Input
          value={area.label ?? ""}
          onChange={(event) => onPatch({ label: event.target.value })}
          placeholder="Posto 01"
        />
      </FormField>
      <div className="flex items-end">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={onRemove}
          aria-label="Remover área"
          title="Remover área"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function FormField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "secondary"}>
      {active ? "Ativo" : "Inativo"}
    </Badge>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

function buildScenarioPayload(draft: Draft) {
  const name = draft.name.trim();
  if (!name) {
    throw new Error("Informe o nome do cenário.");
  }
  const objectClass = draft.object_class.trim().toLowerCase();
  if (!objectClass) {
    throw new Error("Informe a classe de objeto.");
  }
  if (!draft.areas.length) {
    throw new Error("Inclua pelo menos uma área.");
  }

  const identities = new Set<string>();
  const areas = draft.areas.map((area, index) => {
    const areaId = area.area_id.trim();
    const cameraId = area.camera_id.trim();
    if (!cameraId || !areaId) {
      throw new Error(
        `Selecione uma área válida na posição ${index + 1}.`,
      );
    }
    const identity = areaOptionKey(cameraId, areaId);
    if (identities.has(identity)) {
      throw new Error(
        "A mesma área foi adicionada mais de uma vez.",
      );
    }
    identities.add(identity);

    return {
      area_id: areaId,
      camera_id: cameraId,
      label: area.label?.trim() || undefined,
    };
  });
  const minimum = parseOptionalNumber(draft.min_total, "mínimo");
  const maximum = parseOptionalNumber(draft.max_total, "máximo");
  if (
    minimum !== undefined &&
    maximum !== undefined &&
    minimum > maximum
  ) {
    throw new Error("O mínimo não pode ser maior que o máximo.");
  }

  return {
    areas,
    max_total: maximum,
    min_total: minimum,
    name,
    object_class: objectClass,
  };
}

function requireSavedScenario(
  value: unknown,
  {
    active,
    companyId,
    expectedId,
    payload,
  }: {
    active?: boolean;
    companyId: string;
    expectedId?: string;
    payload: ReturnType<typeof buildScenarioPayload>;
  },
) {
  if (isEmptyMutationResponse(value)) return;

  const [scenario] = requireOccupancyScenarioRows([value], companyId);
  if (scenario.company_id !== companyId) {
    throw new Error(
      "O cenário não pôde ser vinculado à empresa selecionada.",
    );
  }
  if (expectedId && scenario.id !== expectedId) {
    throw new Error(
      "A atualização não pôde ser confirmada para o cenário selecionado.",
    );
  }
  if (
    scenario.name !== payload.name ||
    scenario.object_class !== payload.object_class ||
    (scenario.min_total ?? undefined) !== payload.min_total ||
    (scenario.max_total ?? undefined) !== payload.max_total ||
    (active !== undefined && scenario.active !== active)
  ) {
    throw new Error(
      "A configuração salva não corresponde aos valores informados.",
    );
  }

  const savedAreas = new Map(
    scenario.areas.map((area) => [areaKey(area), area] as const),
  );
  if (savedAreas.size !== payload.areas.length) {
    throw new Error(
      "Nem todas as áreas selecionadas puderam ser confirmadas.",
    );
  }
  payload.areas.forEach((area) => {
    const saved = savedAreas.get(areaOptionKey(area.camera_id, area.area_id));
    if (!saved || (saved.label ?? undefined) !== area.label) {
      throw new Error(
        "Uma das áreas selecionadas não pôde ser confirmada.",
      );
    }
  });

  return scenario;
}

function requireOptionalOccupancyStatusResponse(
  value: unknown,
  {
    active,
    companyId,
    expectedId,
  }: {
    active: boolean;
    companyId: string;
    expectedId: string;
  },
) {
  if (isEmptyMutationResponse(value)) return;

  const [scenario] = requireOccupancyScenarioRows([value], companyId);
  if (scenario.id !== expectedId) {
    throw new Error("A atualização retornou outro cenário de ocupação.");
  }
  if (scenario.active !== active) {
    throw new Error("O status retornado não corresponde ao solicitado.");
  }
}

function isEmptyMutationResponse(value: unknown) {
  return value === undefined || value === null || value === "";
}

function scenarioToDraft(scenario: OccupancyScenario): Draft {
  return {
    active: scenario.active,
    areas: (scenario.areas ?? []).map((area) => ({ ...area })),
    id: scenario.id,
    max_total:
      scenario.max_total === null || scenario.max_total === undefined
        ? ""
        : String(scenario.max_total),
    min_total:
      scenario.min_total === null || scenario.min_total === undefined
        ? ""
        : String(scenario.min_total),
    name: scenario.name,
    object_class: scenario.object_class || "person",
  };
}

function createEmptyDraft(): Draft {
  return {
    active: true,
    areas: [],
    max_total: "",
    min_total: "",
    name: "",
    object_class: "person",
  };
}

function thresholdSummary(scenario: OccupancyScenario) {
  const min =
    scenario.min_total === null || scenario.min_total === undefined
      ? "sem mín."
      : `mín. ${formatNumber(scenario.min_total)}`;
  const max =
    scenario.max_total === null || scenario.max_total === undefined
      ? "sem máx."
      : `máx. ${formatNumber(scenario.max_total)}`;

  return `${min} / ${max}`;
}

function occupancyObjectLabel(value?: string | null) {
  return value?.trim().toLowerCase() === "person" ? "Pessoas" : "Outro tipo";
}

function areaOptionKey(cameraId: string, areaId: string) {
  return buildOccupancyAreaKey(cameraId, areaId);
}

function areaKey(area: OccupancyScenarioArea) {
  return areaOptionKey(area.camera_id, area.area_id);
}

function parseOptionalNumber(value: string, label: string) {
  const cleanValue = value.trim();
  if (!cleanValue) return undefined;

  const parsed = Number(cleanValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Informe um valor ${label} não negativo válido.`);
  }

  return parsed;
}
