"use client";

import * as React from "react";
import {
  Check,
  Edit,
  ListChecks,
  ListPlus,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Trash2,
  X,
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { OccupancyScenarioManager } from "@/components/app/occupancy-scenario-manager";
import { apiFetch } from "@/lib/api";
import {
  filterScopedApiRows,
  usesMasterCrossCompanyScope,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import { requireCameraRows } from "@/lib/metadata-validation";
import { isOccupancyAreaLineCount } from "@/lib/occupancy-area-options";
import { canManageOccupancy, canManageScenarios } from "@/lib/permissions";
import { requireScenarioRows } from "@/lib/scenario-validation";
import { selectExplicitCompanyScopedRows } from "@/lib/tenant-scope-validation";
import type {
  CameraLineCount,
  Scenario,
  ScenarioLine,
  ScenarioPayload,
  ScenarioResult,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

type ResultMap = Record<string, ScenarioResult | null>;

type CachedScenarioResult = {
  expiresAt: number;
  value: ScenarioResult | null;
};

const SCENARIO_RESULT_CACHE_TTL_MS = 30_000;
const SCENARIO_RESULT_BATCH_SIZE = 4;
const SCENARIO_RESULT_CACHE_MAX_ENTRIES = 256;
const scenarioResultCache = new Map<string, CachedScenarioResult>();

function trimScenarioResultCache() {
  while (scenarioResultCache.size > SCENARIO_RESULT_CACHE_MAX_ENTRIES) {
    const oldestKey = scenarioResultCache.keys().next().value;
    if (typeof oldestKey !== "string") return;
    scenarioResultCache.delete(oldestKey);
  }
}

type LineOption = CameraLineCount & {
  cameraName: string;
};

type FormLine = {
  key: string;
  line_count_id: string;
  action_multiplier: "-1" | "0" | "1";
  label: string;
};

export function ScenarioManager() {
  const { user } = useAuth();
  const canEditScenarios = canManageScenarios(user);
  const canEditOccupancy = canManageOccupancy(user);
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const masterCrossCompanyScope = usesMasterCrossCompanyScope(
    user,
    companyScopeId,
  );
  const [activeTab, setActiveTab] = React.useState<"flow" | "occupancy">(
    canEditScenarios ? "flow" : "occupancy",
  );
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [results, setResults] = React.useState<ResultMap>({});
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
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
  const [editingScenario, setEditingScenario] = React.useState<Scenario | null>(
    null,
  );
  const [scenarioCatalogCompanyId, setScenarioCatalogCompanyId] =
    React.useState("");
  const companyScopeIdRef = React.useRef(companyScopeId);
  const scenarioRequestSequenceRef = React.useRef(0);
  const scenarioRequestControllerRef = React.useRef<AbortController | null>(
    null,
  );
  const resolvedActiveTab =
    (activeTab === "flow" && canEditScenarios) ||
    (activeTab === "occupancy" && canEditOccupancy)
      ? activeTab
      : canEditScenarios
        ? "flow"
        : "occupancy";
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
      return [scenario.name, scenario.description]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(search));
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
  const scenarioCatalogCertified =
    Boolean(companyScopeId.trim()) &&
    scenarioCatalogCompanyId === companyScopeId.trim();
  const activeSelectedScenarioCount = selectedScenarios.filter(
    (scenario) => scenario.active,
  ).length;
  const inactiveSelectedScenarioCount =
    selectedScenarios.length - activeSelectedScenarioCount;

  const loadScenarios = React.useCallback(async (
    { forceResults = false }: { forceResults?: boolean } = {},
  ) => {
    const requestedCompanyScopeId = companyScopeId.trim();
    const requestSequence = ++scenarioRequestSequenceRef.current;
    const isCurrentRequest = () =>
      requestSequence === scenarioRequestSequenceRef.current &&
      companyScopeIdRef.current.trim() === requestedCompanyScopeId;

    if (!canEditScenarios || !requestedCompanyScopeId) {
      scenarioRequestControllerRef.current?.abort(
        new DOMException("A consulta de cenários foi encerrada.", "AbortError"),
      );
      scenarioRequestControllerRef.current = null;
      setScenarios([]);
      setResults({});
      setScenarioCatalogCompanyId("");
      setLoading(false);
      return;
    }

    scenarioRequestControllerRef.current?.abort(
      new DOMException("A consulta de cenários foi atualizada.", "AbortError"),
    );
    const controller = new AbortController();
    scenarioRequestControllerRef.current = controller;
    setLoading(true);
    try {
      const response = await apiFetch<unknown>("/scenarios", {
        companyScopeId: requestedCompanyScopeId,
        signal: controller.signal,
      });
      const payload = masterCrossCompanyScope
        ? selectExplicitCompanyScopedRows(
            response,
            requestedCompanyScopeId,
            { label: "cenários de Contagem" },
          ).rows
        : response;
      const data = requireScenarioRows(payload, requestedCompanyScopeId);
      const scopedScenarios = filterScopedApiRows(
        data,
        requestedCompanyScopeId,
      );

      if (!isCurrentRequest()) return;

      setScenarios(scopedScenarios);
      setScenarioCatalogCompanyId(requestedCompanyScopeId);
      const availableScenarioIds = new Set(
        scopedScenarios.map((scenario) => scenario.id),
      );
      setSelectedScenarioIds((current) =>
        current.filter((scenarioId) => availableScenarioIds.has(scenarioId)),
      );
      setLoading(false);

      const now = Date.now();
      const cachedEntries: Array<readonly [string, ScenarioResult | null]> = [];
      const scenariosToHydrate: Scenario[] = [];
      scopedScenarios.forEach((scenario) => {
        const cacheKey = `${requestedCompanyScopeId}:${scenario.id}`;
        const cached = scenarioResultCache.get(cacheKey);
        if (cached) {
          cachedEntries.push([scenario.id, cached.value] as const);
        }
        if (forceResults || !cached || cached.expiresAt <= now) {
          scenariosToHydrate.push(scenario);
        }
      });
      setResults(Object.fromEntries(cachedEntries));

      // The list itself is useful immediately. Totals are intentionally
      // hydrated in small batches so dozens of scenarios do not block the
      // table or saturate the browser connection pool.
      void (async () => {
        for (
          let index = 0;
          index < scenariosToHydrate.length;
          index += SCENARIO_RESULT_BATCH_SIZE
        ) {
          if (!isCurrentRequest()) return;
          const batch = scenariosToHydrate.slice(
            index,
            index + SCENARIO_RESULT_BATCH_SIZE,
          );
          const entries = await Promise.all(
            batch.map(async (scenario) => {
              try {
                const result = await apiFetch<ScenarioResult>(
                  `/scenarios/${scenario.id}/result`,
                  {
                    companyScopeId: requestedCompanyScopeId,
                    signal: controller.signal,
                  },
                );
                return [scenario.id, result] as const;
              } catch {
                return [scenario.id, null] as const;
              }
            }),
          );
          if (!isCurrentRequest()) return;

          const expiresAt = Date.now() + SCENARIO_RESULT_CACHE_TTL_MS;
          entries.forEach(([scenarioId, result]) => {
            scenarioResultCache.set(
              `${requestedCompanyScopeId}:${scenarioId}`,
              { expiresAt, value: result },
            );
          });
          trimScenarioResultCache();
          setResults((current) => ({
            ...current,
            ...Object.fromEntries(entries),
          }));
        }
      })();
    } catch {
      if (!isCurrentRequest()) return;
      setScenarios([]);
      setResults({});
      setScenarioCatalogCompanyId("");
      toast.error("Não foi possível carregar os cenários.");
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, [canEditScenarios, companyScopeId, masterCrossCompanyScope]);

  React.useLayoutEffect(() => {
    companyScopeIdRef.current = companyScopeId;
  }, [companyScopeId]);

  React.useEffect(() => {
    setScenarios([]);
    setResults({});
    setScenarioCatalogCompanyId("");
    setDialogOpen(false);
    setBulkDialogOpen(false);
    setBulkDeleteDialogOpen(false);
    setBulkDeactivateDialogOpen(false);
    setSelectedScenarioIds([]);
    setScenarioSearch("");
    setScenarioStatus("all");
    setEditingScenario(null);
  }, [companyScopeId]);

  React.useEffect(() => {
    if (activeTab === "flow" && !canEditScenarios && canEditOccupancy) {
      setActiveTab("occupancy");
    } else if (
      activeTab === "occupancy" &&
      !canEditOccupancy &&
      canEditScenarios
    ) {
      setActiveTab("flow");
    }

    if (!canEditScenarios) {
      setDialogOpen(false);
      setBulkDialogOpen(false);
      setBulkDeleteDialogOpen(false);
      setBulkDeactivateDialogOpen(false);
      setSelectedScenarioIds([]);
      setEditingScenario(null);
    }
  }, [activeTab, canEditOccupancy, canEditScenarios]);

  React.useEffect(() => {
    void loadScenarios();
    return () => {
      scenarioRequestControllerRef.current?.abort(
        new DOMException("A tela de cenários foi fechada.", "AbortError"),
      );
      scenarioRequestControllerRef.current = null;
      scenarioRequestSequenceRef.current += 1;
    };
  }, [loadScenarios]);

  function openCreateDialog() {
    if (!canEditScenarios) {
      toast.error("Seu usuário não pode alterar cenários.");
      return;
    }
    if (!scenarioCatalogCertified) {
      toast.error("Os cenários ainda estão sendo carregados.");
      return;
    }

    setEditingScenario(null);
    setDialogOpen(true);
  }

  function openEditDialog(scenario: Scenario) {
    if (!canEditScenarios) {
      toast.error("Seu usuário não pode alterar cenários.");
      return;
    }
    if (
      !scenarioCatalogCertified ||
      scenario.company_id !== companyScopeId.trim()
    ) {
      toast.error("Este cenário não pertence à empresa selecionada.");
      return;
    }

    setEditingScenario(scenario);
    setDialogOpen(true);
  }

  async function deleteScenario(scenario: Scenario) {
    if (!canEditScenarios) {
      toast.error("Seu usuário não pode alterar cenários.");
      return;
    }

    const requestedCompanyScopeId = companyScopeId.trim();
    if (
      !scenarioCatalogCertified ||
      !requestedCompanyScopeId ||
      scenario.company_id !== requestedCompanyScopeId
    ) {
      toast.error("Este cenário não pertence à empresa selecionada.");
      return;
    }

    if (!window.confirm(`Excluir o cenário "${scenario.name}"?`)) return;

    try {
      await apiFetch(`/scenarios/${scenario.id}`, {
        companyScopeId: requestedCompanyScopeId,
        method: "DELETE",
      });
      if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) return;

      toast.success("Cenário excluído");
      scenarioResultCache.delete(
        `${requestedCompanyScopeId}:${scenario.id}`,
      );
      await loadScenarios({ forceResults: true });
    } catch {
      if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) return;
      toast.error("Não foi possível excluir o cenário.");
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
    if (!canEditScenarios || bulkMutating) return;

    const requestedCompanyScopeId = companyScopeId.trim();
    if (!requestedCompanyScopeId || !scenarioCatalogCertified) {
      toast.error("Selecione uma empresa antes de alterar os cenários.");
      return;
    }

    const candidates = selectedScenarios.filter(
      (scenario) =>
        scenario.company_id === requestedCompanyScopeId &&
        scenario.active !== active,
    );
    if (!candidates.length) return;

    setBulkUpdatingStatus(active);
    const updatedIds: string[] = [];
    const failedIds: string[] = [];
    let companyChanged = false;

    try {
      for (const scenario of candidates) {
        if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) {
          companyChanged = true;
          break;
        }

        try {
          const response = await apiFetch<unknown>(
            `/scenarios/${scenario.id}`,
            {
            body: { active },
            companyScopeId: requestedCompanyScopeId,
            method: "PUT",
            },
          );
          requireOptionalScenarioMutationResponse(response, {
            active,
            companyId: requestedCompanyScopeId,
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
      if (updatedIds.length) await loadScenarios({ forceResults: true });

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
    if (!canEditScenarios || bulkMutating) return;

    const requestedCompanyScopeId = companyScopeId.trim();
    if (!requestedCompanyScopeId || !scenarioCatalogCertified) {
      toast.error("Selecione uma empresa antes de excluir os cenários.");
      return;
    }

    const candidates = selectedScenarios.filter(
      (scenario) => scenario.company_id === requestedCompanyScopeId,
    );
    if (!candidates.length) {
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
        if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) {
          companyChanged = true;
          break;
        }

        try {
          await apiFetch(`/scenarios/${scenario.id}`, {
            companyScopeId: requestedCompanyScopeId,
            method: "DELETE",
          });
          deletedIds.push(scenario.id);
          scenarioResultCache.delete(
            `${requestedCompanyScopeId}:${scenario.id}`,
          );
        } catch {
          failedIds.push(scenario.id);
        }
      }

      if (companyChanged) return;

      setSelectedScenarioIds(failedIds);
      setBulkDeleteDialogOpen(false);

      if (deletedIds.length) {
        await loadScenarios({ forceResults: true });
      }

      if (!failedIds.length) {
        toast.success(
          deletedIds.length === 1
            ? "Cenário excluído."
            : `${deletedIds.length} cenários excluídos.`,
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

  async function handleSaved() {
    setDialogOpen(false);
    await loadScenarios({ forceResults: true });
  }

  if (!canEditScenarios && !canEditOccupancy) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cenários indisponíveis</CardTitle>
          <CardDescription>
            Seu usuário não possui acesso administrativo aos cenários de
            Contagem ou de Ocupação.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Tabs
        value={resolvedActiveTab}
        onValueChange={(value) => {
          if (value === "flow" && canEditScenarios) setActiveTab(value);
          if (value === "occupancy" && canEditOccupancy) setActiveTab(value);
        }}
        className="space-y-4"
      >
        {canEditScenarios && canEditOccupancy ? (
          <TabsList>
            <TabsTrigger value="flow">Contagem</TabsTrigger>
            <TabsTrigger value="occupancy">Ocupação</TabsTrigger>
          </TabsList>
        ) : null}

        {canEditScenarios ? <TabsContent value="flow">
          <Card id="config-cenarios" className="scroll-mt-6">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Cenários de contagem
                </CardTitle>
                <CardDescription className="mt-1">
                  Configure os cenários de contagem usados por ao vivo e relatórios.
                </CardDescription>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => void loadScenarios({ forceResults: true })}
                  disabled={loading || bulkMutating}
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  Atualizar
                </Button>
                {canEditScenarios ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setBulkDialogOpen(true)}
                      disabled={bulkMutating || !scenarioCatalogCertified}
                    >
                      <ListPlus className="h-4 w-4" />
                      Criar por linha
                    </Button>
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={openCreateDialog}
                      disabled={bulkMutating || !scenarioCatalogCertified}
                    >
                      <Plus className="h-4 w-4" />
                      Novo cenário
                    </Button>
                  </>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full" />
                  ))}
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
                        aria-label="Buscar cenários de contagem"
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
                      aria-label="Ações para cenários selecionados"
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
                            disabled={bulkMutating}
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
                          disabled={bulkMutating}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir selecionados
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <Table scrollRegionLabel="Cenários de contagem cadastrados">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          aria-label="Selecionar todos os cenários de contagem"
                          checked={scenarioSelectionState}
                          onCheckedChange={(checked) =>
                            toggleAllScenarioSelection(checked === true)
                          }
                          disabled={bulkMutating || !filteredScenarios.length}
                        />
                      </TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Linhas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Resultado hoje</TableHead>
                      <TableHead>Atualizado</TableHead>
                      {canEditScenarios ? (
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
                          <div className="mt-1 max-w-[420px] truncate text-xs text-muted-foreground">
                            {scenario.description || "Sem descrição"}
                          </div>
                        </TableCell>
                        <TableCell>{scenario.lines?.length ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={scenario.active ? "success" : "secondary"}>
                            {scenario.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {results[scenario.id] ? (
                            <div className="font-medium">
                              {formatNumber(results[scenario.id]?.result)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(scenario.updated_at ?? scenario.created_at)}
                        </TableCell>
                        {canEditScenarios ? (
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(scenario)}
                                disabled={bulkMutating}
                              >
                                <Edit className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteScenario(scenario)}
                                disabled={bulkMutating}
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
                          colSpan={7}
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
                  {canEditScenarios
                    ? "Nenhum cenário cadastrado. Crie o primeiro filtro para o dashboard."
                    : "Nenhum cenário cadastrado."}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent> : null}

        {canEditOccupancy ? <TabsContent value="occupancy">
          <OccupancyScenarioManager />
        </TabsContent> : null}
      </Tabs>

      {canEditScenarios ? (
        <>
          <ScenarioDialog
            canEdit={canEditScenarios}
            open={dialogOpen}
            scenario={editingScenario}
            companyScopeId={companyScopeId}
            requireExplicitCompanyId={masterCrossCompanyScope}
            onOpenChange={setDialogOpen}
            onSaved={handleSaved}
          />
          <BulkScenarioDialog
            canEdit={canEditScenarios}
            companyScopeId={companyScopeId}
            requireExplicitCompanyId={masterCrossCompanyScope}
            onOpenChange={setBulkDialogOpen}
            onSaved={() => loadScenarios({ forceResults: true })}
            open={bulkDialogOpen}
            scenarios={scenarios}
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
                  contagem e não poderá ser desfeita.
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
        </>
      ) : null}
    </section>
  );
}

function ScenarioDialog({
  canEdit,
  open,
  scenario,
  companyScopeId,
  requireExplicitCompanyId,
  onOpenChange,
  onSaved,
}: {
  canEdit: boolean;
  open: boolean;
  scenario: Scenario | null;
  companyScopeId: string;
  requireExplicitCompanyId: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [active, setActive] = React.useState("true");
  const [lines, setLines] = React.useState<FormLine[]>([]);
  const [lineOptions, setLineOptions] = React.useState<LineOption[]>([]);
  const [lineSearch, setLineSearch] = React.useState("");
  const [loadingOptions, setLoadingOptions] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const companyScopeIdRef = React.useRef(companyScopeId);

  React.useLayoutEffect(() => {
    companyScopeIdRef.current = companyScopeId;
  }, [companyScopeId]);

  React.useEffect(() => {
    if (!open) return;

    setName(scenario?.name ?? "");
    setDescription(scenario?.description ?? "");
    setActive(String(scenario?.active ?? true));
    setLineSearch("");
    setLines(
      scenario?.lines?.length
        ? scenario.lines.map((line, index) => ({
            key: `${line.line_count_id}-${index}`,
            line_count_id: line.line_count_id,
            action_multiplier: String(line.action_multiplier) as "-1" | "0" | "1",
            label: line.label ?? "",
          }))
        : [emptyLine()],
    );
  }, [open, scenario]);

  React.useEffect(() => {
    if (!open) return;

    let mounted = true;

    async function loadLineOptions() {
      setLoadingOptions(true);
      try {
        const options = await loadCountingLineOptions(
          companyScopeId,
          requireExplicitCompanyId,
        );
        if (mounted) setLineOptions(options);
      } catch {
        toast.error("Não foi possível carregar as linhas de contagem.");
      } finally {
        if (mounted) setLoadingOptions(false);
      }
    }

    loadLineOptions();

    return () => {
      mounted = false;
    };
  }, [companyScopeId, open, requireExplicitCompanyId]);

  const filteredLineOptions = React.useMemo(
    () => filterLineOptions(lineOptions, lineSearch),
    [lineOptions, lineSearch],
  );

  function updateLine(key: string, patch: Partial<FormLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((current) =>
      current.length === 1 ? [emptyLine()] : current.filter((line) => line.key !== key),
    );
  }

  function addLineOptions(options: LineOption[]) {
    setLines((current) => {
      const selectedIds = new Set(
        current.map((line) => line.line_count_id).filter(Boolean),
      );
      const additions = options
        .filter((option) => !selectedIds.has(option.id))
        .map(formLineFromOption);
      if (!additions.length) return current;

      return [
        ...current.filter((line) => line.line_count_id),
        ...additions,
      ];
    });
  }

  async function saveScenario() {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de contagem.");
      return;
    }

    const requestedCompanyScopeId = companyScopeId.trim();
    if (!requestedCompanyScopeId) {
      toast.error("Selecione uma empresa antes de salvar o cenário.");
      return;
    }
    if (
      scenario &&
      scenario.company_id !== requestedCompanyScopeId
    ) {
      toast.error("Este cenário não pertence à empresa selecionada.");
      return;
    }

    const cleanName = name.trim();
    const cleanLines = lines
      .filter((line) => line.line_count_id)
      .map<ScenarioLine>((line) => ({
        line_count_id: line.line_count_id,
        action_multiplier: Number(line.action_multiplier) as -1 | 0 | 1,
        label: line.label.trim() || undefined,
      }));

    if (!cleanName) {
      toast.error("Nome obrigatório");
      return;
    }

    if (!cleanLines.length) {
      toast.error("Adicione pelo menos uma linha de contagem");
      return;
    }

    const payload: ScenarioPayload = {
      name: cleanName,
      description: description.trim() || undefined,
      scenario_type: scenario?.scenario_type || "custom",
      lines: cleanLines,
    };

    if (scenario) {
      payload.active = active === "true";
    }

    setSaving(true);
    try {
      if (scenario) {
        const response = await apiFetch<unknown>(`/scenarios/${scenario.id}`, {
          body: payload,
          companyScopeId: requestedCompanyScopeId,
          method: "PUT",
        });
        if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) return;
        requireOptionalScenarioMutationResponse(response, {
          active: payload.active,
          companyId: requestedCompanyScopeId,
          expectedId: scenario.id,
        });
        toast.success("Cenário atualizado");
      } else {
        const response = await apiFetch<unknown>("/scenarios", {
          body: payload,
          companyScopeId: requestedCompanyScopeId,
          method: "POST",
        });
        if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) return;
        requireOptionalScenarioMutationResponse(response, {
          companyId: requestedCompanyScopeId,
        });
        toast.success("Cenário criado");
      }

      await onSaved();
    } catch {
      if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) return;
      toast.error("Não foi possível salvar o cenário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{scenario ? "Editar cenário" : "Novo cenário"}</DialogTitle>
          <DialogDescription>
            Configure as linhas que compõem este cenário.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label htmlFor="scenario-name">Nome</Label>
            <Input
              id="scenario-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Fluxo entrada principal"
            />
          </div>
          {scenario ? (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={active} onValueChange={setActive}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="scenario-description">Descrição</Label>
          <Textarea
            id="scenario-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Contexto operacional do filtro"
          />
        </div>

        <div className="space-y-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Route className="h-4 w-4 text-primary" />
                Linhas de contagem
                <Badge variant="outline">
                  {lines.filter((line) => line.line_count_id).length} selecionadas
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Cada linha define sua contribuição no resultado final.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar linha
            </Button>
          </div>

          {!loadingOptions && lineOptions.length ? (
            <div className="grid gap-2 rounded-md border bg-muted/20 p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={lineSearch}
                  onChange={(event) => setLineSearch(event.target.value)}
                  placeholder="Filtrar por linha ou câmera"
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => addLineOptions(filteredLineOptions)}
                disabled={!lineSearch.trim() || !filteredLineOptions.length}
              >
                <ListPlus className="h-4 w-4" />
                Adicionar filtradas
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => addLineOptions(lineOptions)}
                disabled={
                  lineOptions.every((option) =>
                    lines.some((line) => line.line_count_id === option.id),
                  )
                }
              >
                <Check className="h-4 w-4" />
                Adicionar todas
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLines([emptyLine()])}
                disabled={!lines.some((line) => line.line_count_id)}
              >
                <X className="h-4 w-4" />
                Limpar
              </Button>
              {lineSearch.trim() ? (
                <div className="text-xs text-muted-foreground lg:col-span-4">
                  {filteredLineOptions.length} de {lineOptions.length} linhas correspondem ao filtro.
                </div>
              ) : null}
            </div>
          ) : null}

          {loadingOptions ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : lineOptions.length ? (
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div
                  key={line.key}
                  className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-[1fr_150px_1fr_44px]"
                >
                  <div className="space-y-2">
                    <Label className="text-xs">Linha</Label>
                    <Select
                      value={line.line_count_id}
                      onValueChange={(value) =>
                        updateLine(line.key, { line_count_id: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Linha ${index + 1}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {lineOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.cameraName} / {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Operação</Label>
                    <Select
                      value={line.action_multiplier}
                      onValueChange={(value) =>
                        updateLine(line.key, {
                          action_multiplier: value as "-1" | "0" | "1",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Soma</SelectItem>
                        <SelectItem value="-1">Subtrai</SelectItem>
                        <SelectItem value="0">Neutro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Rótulo</Label>
                    <Input
                      value={line.label}
                      onChange={(event) =>
                        updateLine(line.key, { label: event.target.value })
                      }
                      placeholder="Ex: Entrada"
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(line.key)}
                      aria-label="Remover linha"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma linha ativa encontrada. Cadastre linhas de contagem nas câmeras
              antes de criar cenários.
            </div>
          )}
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
          <Button type="button" onClick={saveScenario} disabled={saving || !canEdit}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar cenário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkScenarioDialog({
  canEdit,
  companyScopeId,
  requireExplicitCompanyId,
  onOpenChange,
  onSaved,
  open,
  scenarios,
}: {
  canEdit: boolean;
  companyScopeId: string;
  requireExplicitCompanyId: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
  open: boolean;
  scenarios: Scenario[];
}) {
  const [lineOptions, setLineOptions] = React.useState<LineOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [prefix, setPrefix] = React.useState("");
  const [nameMode, setNameMode] = React.useState<"line" | "camera_line">(
    "camera_line",
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [createdCount, setCreatedCount] = React.useState(0);
  const companyScopeIdRef = React.useRef(companyScopeId);
  const individualScenarioLineIds = React.useMemo(
    () =>
      new Set(
        scenarios.flatMap((scenario) =>
          scenario.lines?.length === 1
            ? [scenario.lines[0]?.line_count_id].filter(
                (id): id is string => Boolean(id),
              )
            : [],
        ),
      ),
    [scenarios],
  );
  const filteredOptions = React.useMemo(
    () => filterLineOptions(lineOptions, search),
    [lineOptions, search],
  );
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const availableOptions = lineOptions.filter(
    (option) => !individualScenarioLineIds.has(option.id),
  );

  React.useLayoutEffect(() => {
    companyScopeIdRef.current = companyScopeId;
  }, [companyScopeId]);

  React.useEffect(() => {
    if (!open) return;
    let mounted = true;

    setSearch("");
    setPrefix("");
    setSelectedIds([]);
    setCreatedCount(0);
    setLoading(true);
    loadCountingLineOptions(companyScopeId, requireExplicitCompanyId)
      .then((options) => {
        if (mounted) setLineOptions(options);
      })
      .catch(() => {
        if (!mounted) return;
        toast.error("Não foi possível carregar as linhas de contagem.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [companyScopeId, open, requireExplicitCompanyId]);

  function toggleLine(lineId: string) {
    setSelectedIds((current) =>
      current.includes(lineId)
        ? current.filter((id) => id !== lineId)
        : [...current, lineId],
    );
  }

  function selectOptions(options: LineOption[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      options.forEach((option) => {
        if (!individualScenarioLineIds.has(option.id)) next.add(option.id);
      });
      return Array.from(next);
    });
  }

  async function createScenarios() {
    if (!canEdit) {
      toast.error("Seu usuário não pode alterar cenários de contagem.");
      return;
    }

    const requestedCompanyScopeId = companyScopeId.trim();
    if (!requestedCompanyScopeId) {
      toast.error("Selecione uma empresa antes de criar os cenários.");
      return;
    }

    const selectedOptions = lineOptions.filter(
      (option) =>
        selectedSet.has(option.id) && !individualScenarioLineIds.has(option.id),
    );
    if (!selectedOptions.length) {
      toast.error("Selecione pelo menos uma linha sem cenário individual.");
      return;
    }

    setSaving(true);
    setCreatedCount(0);
    const usedNames = new Set(
      scenarios.map((scenario) => normalizeSearchText(scenario.name)),
    );
    const failedIds: string[] = [];
    let created = 0;

    try {
      for (let index = 0; index < selectedOptions.length; index += 4) {
        const chunk = selectedOptions.slice(index, index + 4);
        const results = await Promise.allSettled(
          chunk.map((option) => {
            const payload: ScenarioPayload = {
              description: `Cenário individual criado para ${option.cameraName} / ${option.name}.`,
              lines: [
                {
                  action_multiplier: 1,
                  label: option.name,
                  line_count_id: option.id,
                },
              ],
              name: buildUniqueScenarioName(
                option,
                nameMode,
                prefix,
                usedNames,
              ),
              scenario_type: "custom",
            };
            return apiFetch<unknown>("/scenarios", {
              body: payload,
              companyScopeId: requestedCompanyScopeId,
              method: "POST",
            }).then((response) => {
              requireOptionalScenarioMutationResponse(response, {
                companyId: requestedCompanyScopeId,
              });
            });
          }),
        );

        results.forEach((result, resultIndex) => {
          if (result.status === "fulfilled") created += 1;
          else if (chunk[resultIndex]) failedIds.push(chunk[resultIndex].id);
        });
        if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) return;
        setCreatedCount(created);
      }

      if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) return;
      await onSaved();
      if (companyScopeIdRef.current.trim() !== requestedCompanyScopeId) return;
      if (failedIds.length) {
        setSelectedIds(failedIds);
        toast.error(
          `${created} cenário(s) criado(s); ${failedIds.length} falharam e continuam selecionados.`,
        );
      } else {
        toast.success(`${created} cenário(s) criado(s) por linha.`);
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Criar um cenário por linha</DialogTitle>
          <DialogDescription>
            Selecione as linhas e gere cenários individuais em lote.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bulk-scenario-prefix">Prefixo opcional</Label>
            <Input
              id="bulk-scenario-prefix"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="Ex: Acesso"
            />
          </div>
          <div className="space-y-2">
            <Label>Formato do nome</Label>
            <Select
              value={nameMode}
              onValueChange={(value) =>
                setNameMode(value as "line" | "camera_line")
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="camera_line">Câmera - linha</SelectItem>
                <SelectItem value="line">Somente linha</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-md border bg-muted/20 p-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filtrar por entrada, saída ou câmera"
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => selectOptions(filteredOptions)}
              disabled={!filteredOptions.some(
                (option) => !individualScenarioLineIds.has(option.id),
              )}
            >
              Selecionar filtradas
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => selectOptions(availableOptions)}
              disabled={!availableOptions.length}
            >
              Selecionar todas
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelectedIds([])}
              disabled={!selectedIds.length}
            >
              <X className="h-4 w-4" />
              Limpar
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{selectedIds.length} selecionadas</Badge>
            <span>{availableOptions.length} disponíveis</span>
            {individualScenarioLineIds.size ? (
              <span>{individualScenarioLineIds.size} já possuem cenário individual</span>
            ) : null}
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto rounded-md border p-1">
          {loading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredOptions.length ? (
            <div className="grid gap-1 md:grid-cols-2">
              {filteredOptions.map((option) => {
                const alreadyCreated = individualScenarioLineIds.has(option.id);
                const selected = selectedSet.has(option.id);

                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex min-w-0 items-start gap-3 rounded-md border px-3 py-2",
                      alreadyCreated
                        ? "cursor-not-allowed bg-muted/40 opacity-65"
                        : "cursor-pointer bg-card hover:border-primary/40",
                      selected && "border-primary bg-primary/10",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-primary"
                      checked={selected}
                      disabled={alreadyCreated}
                      onChange={() => toggleLine(option.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {option.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {option.cameraName}
                      </span>
                    </span>
                    {alreadyCreated ? (
                      <Badge variant="secondary">Criado</Badge>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma linha corresponde ao filtro.
            </div>
          )}
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
            onClick={createScenarios}
            disabled={saving || !canEdit || !selectedIds.length}
          >
            <ListPlus className="h-4 w-4" />
            {saving
              ? `Criando ${createdCount}/${selectedIds.length}...`
              : `Criar ${selectedIds.length} cenário(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function loadCountingLineOptions(
  companyScopeId: string,
  requireExplicitCompanyId: boolean,
) {
  const requestedCompanyScopeId = companyScopeId.trim();
  if (!requestedCompanyScopeId) {
    throw new Error("Selecione uma empresa antes de carregar as linhas.");
  }

  const cameraResponse = await apiFetch<unknown>("/cameras", {
      companyScopeId: requestedCompanyScopeId,
    });
  const cameraPayload = requireExplicitCompanyId
    ? selectExplicitCompanyScopedRows(
        cameraResponse,
        requestedCompanyScopeId,
        { label: "câmeras" },
      ).rows
    : cameraResponse;
  const cameras = filterScopedApiRows(
    requireCameraRows(cameraPayload, requestedCompanyScopeId),
    requestedCompanyScopeId,
  );
  const lineGroups = await Promise.all(
    cameras.map(async (camera) => {
      try {
        const cameraLines = await apiFetch<CameraLineCount[]>(
          `/cameras/${camera.id}/line-counts`,
          { companyScopeId: requestedCompanyScopeId },
        );
        return filterScopedApiRows(cameraLines, requestedCompanyScopeId).map(
          (line) => ({
            ...line,
            cameraName: camera.name,
          }),
        );
      } catch {
        return [];
      }
    }),
  );

  return lineGroups
    .flat()
    .filter((line) => line.active !== false && !isOccupancyAreaLineCount(line))
    .sort(
      (left, right) =>
        left.cameraName.localeCompare(right.cameraName, "pt-BR") ||
        left.name.localeCompare(right.name, "pt-BR"),
    );
}

function filterLineOptions(options: LineOption[], search: string) {
  const terms = normalizeSearchText(search)
    .split(/[\s,;|]+/)
    .filter((term) => term.length > 1 && term !== "ou");
  if (!terms.length) return options;

  return options.filter((option) => {
    const searchable = normalizeSearchText(
      `${option.name} ${option.cameraName} ${option.line_code}`,
    );
    return terms.some((term) => searchable.includes(term));
  });
}

function buildUniqueScenarioName(
  option: LineOption,
  mode: "line" | "camera_line",
  prefix: string,
  usedNames: Set<string>,
) {
  const base = mode === "line" ? option.name : `${option.cameraName} - ${option.name}`;
  const cleanPrefix = prefix.trim();
  const requested = cleanPrefix ? `${cleanPrefix} ${base}` : base;
  let candidate = requested;
  let suffix = 2;

  if (usedNames.has(normalizeSearchText(candidate))) {
    candidate = `${requested} (${option.line_code})`;
  }
  while (usedNames.has(normalizeSearchText(candidate))) {
    candidate = `${requested} (${option.line_code} ${suffix})`;
    suffix += 1;
  }
  usedNames.add(normalizeSearchText(candidate));
  return candidate;
}

function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function requireOptionalScenarioMutationResponse(
  value: unknown,
  {
    active,
    companyId,
    expectedId,
  }: {
    active?: boolean;
    companyId: string;
    expectedId?: string;
  },
) {
  if (value === undefined || value === null || value === "") return;

  const [scenario] = requireScenarioRows([value], companyId);
  if (expectedId && scenario.id !== expectedId) {
    throw new Error("A atualização retornou outro cenário.");
  }
  if (active !== undefined && scenario.active !== active) {
    throw new Error("O status retornado não corresponde ao solicitado.");
  }
}

function formLineFromOption(option: LineOption): FormLine {
  return {
    action_multiplier: "1",
    key: `${option.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: option.name,
    line_count_id: option.id,
  };
}

function emptyLine(): FormLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    line_count_id: "",
    action_multiplier: "1",
    label: "",
  };
}
