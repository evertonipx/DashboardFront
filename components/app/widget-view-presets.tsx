"use client";

import * as React from "react";
import {
  Check,
  Copy,
  LayoutTemplate,
  Play,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  flushUserGridSync,
  requestUserGridSync,
  USER_GRID_HYDRATED_EVENT,
} from "@/lib/user-grid";
import {
  applyWidgetViewPreset,
  captureWidgetViewSnapshot,
  deleteWidgetViewPreset,
  loadWidgetViewPresets,
  saveWidgetViewPresets,
  setDefaultWidgetViewPreset,
  upsertWidgetViewPreset,
  WIDGET_VIEW_PRESETS_UPDATED_EVENT,
  type WidgetViewPreset,
  type WidgetViewPresetNamespace,
  type WidgetViewScope,
} from "@/lib/widget-view-presets";
import {
  getCardMenuDefinition,
  type CardMenuKey,
  type CardPreference,
} from "@/lib/view-preferences";

export type WidgetViewPresetsDialogProps = {
  cardIds: string[];
  companyId?: string | null;
  currentScope?: WidgetViewScope | null;
  menuKey: CardMenuKey;
  onApplySourcePreset?: (preset: WidgetViewPreset) => boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  preferences: CardPreference[];
  presetNamespace?: WidgetViewPresetNamespace;
  scopes?: WidgetViewScope[];
  sourceMenuKeys?: CardMenuKey[];
  userId?: string | null;
};

type SourcePresetGroup = {
  label: string;
  menuKey: CardMenuKey;
  presets: WidgetViewPreset[];
};

type CertifiedPresetScope = {
  companyId?: string | null;
  currentScope: WidgetViewScope | null;
  key: string;
  menuKey: CardMenuKey;
  presetNamespace: WidgetViewPresetNamespace;
  scopes: WidgetViewScope[];
  userId?: string | null;
};

const EMPTY_PRESETS: WidgetViewPreset[] = [];
const EMPTY_SOURCE_PRESET_GROUPS: SourcePresetGroup[] = [];

export function WidgetViewPresetsDialog({
  cardIds,
  companyId,
  currentScope = null,
  menuKey,
  onApplySourcePreset,
  onOpenChange,
  open,
  preferences,
  presetNamespace = menuKey,
  scopes = [],
  sourceMenuKeys = [],
  userId,
}: WidgetViewPresetsDialogProps) {
  const menu = getCardMenuDefinition(menuKey);
  const [storedPresets, setStoredPresets] = React.useState<WidgetViewPreset[]>(
    [],
  );
  const [storedSourcePresetGroups, setStoredSourcePresetGroups] = React.useState<
    SourcePresetGroup[]
  >([]);
  const [loadedPresetScopeKey, setLoadedPresetScopeKey] = React.useState("");
  const loadedPresetScopeKeyRef = React.useRef("");
  const currentPresetScopeKeyRef = React.useRef("");
  const [name, setName] = React.useState("");
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = React.useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [replicateId, setReplicateId] = React.useState<string | null>(null);
  const [selectedScopeIds, setSelectedScopeIds] = React.useState<string[]>([]);
  const [scopeFilter, setScopeFilter] = React.useState("");
  const currentScopeId = currentScope?.id ?? "";
  const currentScopeName = currentScope?.name ?? "";
  const presetScopeKey = presetCatalogScopeKey({
    companyId,
    menuKey,
    presetNamespace,
    userId,
  });
  const presetCatalogCertified =
    open && loadedPresetScopeKey === presetScopeKey;
  const presets = presetCatalogCertified ? storedPresets : EMPTY_PRESETS;
  const sourcePresetGroups = presetCatalogCertified
    ? storedSourcePresetGroups
    : EMPTY_SOURCE_PRESET_GROUPS;
  const sourceMenuKeysValue = sourceMenuKeys.join("|");
  const normalizedSourceMenuKeys = React.useMemo(
    () =>
      Array.from(
        new Set(
          (sourceMenuKeysValue
            ? sourceMenuKeysValue.split("|")
            : []) as CardMenuKey[],
        ),
      ).filter((sourceMenuKey) => sourceMenuKey !== menuKey),
    [menuKey, sourceMenuKeysValue],
  );
  const normalizedScopes = React.useMemo(
    () => uniqueScopes(scopes),
    [scopes],
  );
  const visibleScopes = React.useMemo(() => {
    const query = normalizeSearch(scopeFilter);
    return query
      ? normalizedScopes.filter((scope) =>
          normalizeSearch(scope.name).includes(query),
        )
      : normalizedScopes;
  }, [normalizedScopes, scopeFilter]);
  const selectedPresets = React.useMemo(
    () => presets.filter((preset) => selectedPresetIds.has(preset.id)),
    [presets, selectedPresetIds],
  );
  const allPresetsSelected =
    presets.length > 0 && selectedPresets.length === presets.length;
  const presetSelectionState = allPresetsSelected
    ? true
    : selectedPresets.length
      ? "indeterminate"
      : false;

  React.useLayoutEffect(() => {
    currentPresetScopeKeyRef.current = presetScopeKey;
    loadedPresetScopeKeyRef.current = "";
    setLoadedPresetScopeKey("");
    setStoredPresets([]);
    setStoredSourcePresetGroups([]);
    setDeleteId(null);
    setBulkDeleteConfirm(false);
    setSelectedPresetIds(new Set());
    setReplicateId(null);
    setSelectedScopeIds([]);
    setScopeFilter("");
  }, [open, presetScopeKey]);

  const refreshPresets = React.useCallback(() => {
    const requestedScopeKey = presetScopeKey;
    const nextPresets = loadWidgetViewPresets(
      menuKey,
      companyId,
      userId,
      presetNamespace,
    );
    const nextSourcePresetGroups = normalizedSourceMenuKeys.map(
      (sourceMenuKey) => ({
        label: getCardMenuDefinition(sourceMenuKey).label,
        menuKey: sourceMenuKey,
        presets: loadWidgetViewPresets(sourceMenuKey, companyId, userId),
      }),
    );
    if (currentPresetScopeKeyRef.current !== requestedScopeKey) return;

    setStoredPresets(nextPresets);
    setSelectedPresetIds((current) => {
      const availableIds = new Set(nextPresets.map((preset) => preset.id));
      const retained = new Set(
        [...current].filter((presetId) => availableIds.has(presetId)),
      );
      return retained.size === current.size ? current : retained;
    });
    setStoredSourcePresetGroups(nextSourcePresetGroups);
    loadedPresetScopeKeyRef.current = requestedScopeKey;
    setLoadedPresetScopeKey(requestedScopeKey);
  }, [
    companyId,
    menuKey,
    normalizedSourceMenuKeys,
    presetNamespace,
    presetScopeKey,
    userId,
  ]);

  React.useEffect(() => {
    if (!open) return;
    refreshPresets();
    setName(
      defaultPresetName(
        menu.label,
        currentScopeId
          ? { id: currentScopeId, name: currentScopeName }
          : null,
      ),
    );
    setDeleteId(null);
    setBulkDeleteConfirm(false);
    setSelectedPresetIds(new Set());
    setReplicateId(null);
    setSelectedScopeIds([]);
    setScopeFilter("");
  }, [currentScopeId, currentScopeName, menu.label, open, refreshPresets]);

  React.useEffect(() => {
    function syncPresets() {
      refreshPresets();
    }
    window.addEventListener(WIDGET_VIEW_PRESETS_UPDATED_EVENT, syncPresets);
    window.addEventListener(USER_GRID_HYDRATED_EVENT, syncPresets);
    window.addEventListener("storage", syncPresets);
    return () => {
      window.removeEventListener(
        WIDGET_VIEW_PRESETS_UPDATED_EVENT,
        syncPresets,
      );
      window.removeEventListener(USER_GRID_HYDRATED_EVENT, syncPresets);
      window.removeEventListener("storage", syncPresets);
    };
  }, [refreshPresets]);

  function requireCertifiedPresetScope(): CertifiedPresetScope | null {
    if (
      !presetCatalogCertified ||
      currentPresetScopeKeyRef.current !== presetScopeKey ||
      loadedPresetScopeKeyRef.current !== presetScopeKey
    ) {
      toast.error("Atualize as visões salvas antes de alterá-las.");
      return null;
    }

    return {
      companyId,
      currentScope: currentScope
        ? { id: currentScope.id, name: currentScope.name }
        : null,
      key: presetScopeKey,
      menuKey,
      presetNamespace,
      scopes: normalizedScopes.map((scope) => ({ ...scope })),
      userId,
    };
  }

  function requirePresetForScope(
    preset: WidgetViewPreset | string,
    scope: CertifiedPresetScope,
    source = false,
  ) {
    if (currentPresetScopeKeyRef.current !== scope.key) return null;
    const presetId = typeof preset === "string" ? preset : preset.id;
    const candidates = source
      ? storedSourcePresetGroups.flatMap((group) => group.presets)
      : storedPresets;
    return candidates.find((candidate) => candidate.id === presetId) ?? null;
  }

  function currentSnapshot(scope: CertifiedPresetScope) {
    return captureWidgetViewSnapshot({
      cardIds,
      companyId: scope.companyId,
      menuKey: scope.menuKey,
      preferences,
      sourceScope: scope.currentScope,
      userId: scope.userId,
    });
  }

  function saveCurrentView() {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    if (!name.trim()) {
      toast.error("Informe um nome para a visão.");
      return;
    }
    const next = upsertWidgetViewPreset({
      companyId: scope.companyId,
      menuKey: scope.menuKey,
      name,
      presetNamespace: scope.presetNamespace,
      snapshot: currentSnapshot(scope),
      userId: scope.userId,
    });
    if (currentPresetScopeKeyRef.current !== scope.key) return;
    setStoredPresets(next);
    requestUserGridSync();
    setName(defaultPresetName(menu.label, scope.currentScope));
    toast.success("Visão salva com todas as configurações dos widgets.");
  }

  function updatePreset(preset: WidgetViewPreset) {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    const certifiedPreset = requirePresetForScope(preset, scope);
    if (!certifiedPreset) return;
    const next = upsertWidgetViewPreset({
      companyId: scope.companyId,
      id: certifiedPreset.id,
      menuKey: scope.menuKey,
      name: certifiedPreset.name,
      presetNamespace: scope.presetNamespace,
      snapshot: currentSnapshot(scope),
      userId: scope.userId,
    });
    if (currentPresetScopeKeyRef.current !== scope.key) return;
    setStoredPresets(next);
    requestUserGridSync();

    if (certifiedPreset.isDefault) {
      const targets = defaultTargets(scope);
      applyPresetToScopes(
        next.find((candidate) => candidate.id === certifiedPreset.id) ??
          certifiedPreset,
        targets,
        scope,
      );
      toast.success("Visão padrão atualizada e replicada.");
      reloadIfCurrentTarget(targets, scope);
      return;
    }
    toast.success("Visão atualizada.");
  }

  function applyToCurrent(preset: WidgetViewPreset) {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    const certifiedPreset = requirePresetForScope(preset, scope);
    if (!certifiedPreset) return;
    applyWidgetViewPreset(certifiedPreset, {
      companyId: scope.companyId,
      presetNamespace: scope.presetNamespace,
      targetScope: scope.currentScope,
      userId: scope.userId,
    });
    toast.success("Visão aplicada nesta tela.");
    void scheduleReload(scope);
  }

  function applySourcePreset(preset: WidgetViewPreset) {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    const certifiedPreset = requirePresetForScope(preset, scope, true);
    if (!certifiedPreset || !onApplySourcePreset?.(certifiedPreset)) return;
    requestUserGridSync();
    onOpenChange(false);
  }

  function toggleDefault(preset: WidgetViewPreset) {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    const certifiedPreset = requirePresetForScope(preset, scope);
    if (!certifiedPreset) return;
    if (certifiedPreset.isDefault) {
      const next = setDefaultWidgetViewPreset(
        scope.menuKey,
        "",
        scope.companyId,
        scope.userId,
        scope.presetNamespace,
      );
      if (currentPresetScopeKeyRef.current !== scope.key) return;
      setStoredPresets(next);
      requestUserGridSync();
      toast.success("Visão padrão removida.");
      return;
    }

    const next = setDefaultWidgetViewPreset(
      scope.menuKey,
      certifiedPreset.id,
      scope.companyId,
      scope.userId,
      scope.presetNamespace,
    );
    const nextPreset =
      next.find((candidate) => candidate.id === certifiedPreset.id) ??
      certifiedPreset;
    const targets = defaultTargets(scope);
    applyPresetToScopes(nextPreset, targets, scope);
    if (currentPresetScopeKeyRef.current !== scope.key) return;
    setStoredPresets(next);
    requestUserGridSync();
    toast.success(
      targets.length
        ? `Visão definida como padrão e aplicada em ${targets.length} tela(s).`
        : "Visão definida como padrão.",
    );
    reloadIfCurrentTarget(targets, scope);
  }

  function confirmDelete(presetId: string) {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    const certifiedPreset = requirePresetForScope(presetId, scope);
    if (!certifiedPreset) return;
    const next =
      deleteWidgetViewPreset(
        scope.menuKey,
        certifiedPreset.id,
        scope.companyId,
        scope.userId,
        scope.presetNamespace,
      );
    if (currentPresetScopeKeyRef.current !== scope.key) return;
    setStoredPresets(
      next,
    );
    requestUserGridSync();
    setDeleteId(null);
    setSelectedPresetIds((current) => {
      if (!current.has(presetId)) return current;
      const next = new Set(current);
      next.delete(presetId);
      return next;
    });
    if (replicateId === certifiedPreset.id) setReplicateId(null);
    toast.success("Visão excluída.");
  }

  function togglePresetSelection(presetId: string, selected: boolean) {
    if (!presetCatalogCertified) return;
    setSelectedPresetIds((current) => {
      const next = new Set(current);
      if (selected) next.add(presetId);
      else next.delete(presetId);
      return next;
    });
    setBulkDeleteConfirm(false);
  }

  function toggleAllPresets(selected: boolean) {
    if (!presetCatalogCertified) return;
    setSelectedPresetIds(
      selected ? new Set(presets.map((preset) => preset.id)) : new Set(),
    );
    setBulkDeleteConfirm(false);
  }

  function deleteSelectedPresets() {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    if (!selectedPresets.length) return;
    const selectedIds = new Set(selectedPresets.map((preset) => preset.id));
    const next = saveWidgetViewPresets(
      scope.menuKey,
      storedPresets.filter((preset) => !selectedIds.has(preset.id)),
      scope.companyId,
      scope.userId,
      scope.presetNamespace,
    );
    if (currentPresetScopeKeyRef.current !== scope.key) return;
    setStoredPresets(next);
    setSelectedPresetIds(new Set());
    setBulkDeleteConfirm(false);
    setDeleteId(null);
    setReplicateId(null);
    requestUserGridSync();
    toast.success(
      selectedIds.size === 1
        ? "1 visão excluída."
        : `${selectedIds.size} visões excluídas.`,
    );
  }

  function startReplication(preset: WidgetViewPreset) {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    const certifiedPreset = requirePresetForScope(preset, scope);
    if (!certifiedPreset) return;
    setReplicateId(certifiedPreset.id);
    setDeleteId(null);
    setScopeFilter("");
    setSelectedScopeIds(
      scope.scopes
        .filter((candidate) => candidate.id !== scope.currentScope?.id)
        .map((candidate) => candidate.id),
    );
  }

  function replicatePreset(preset: WidgetViewPreset) {
    const scope = requireCertifiedPresetScope();
    if (!scope) return;
    const certifiedPreset = requirePresetForScope(preset, scope);
    if (!certifiedPreset) return;
    const targets = scope.scopes.filter((candidate) =>
      selectedScopeIds.includes(candidate.id),
    );
    if (!targets.length) {
      toast.error("Selecione ao menos uma tela de destino.");
      return;
    }
    applyPresetToScopes(certifiedPreset, targets, scope);
    requestUserGridSync();
    setReplicateId(null);
    toast.success(`Visão replicada em ${targets.length} tela(s).`);
    reloadIfCurrentTarget(targets, scope);
  }

  function applyPresetToScopes(
    preset: WidgetViewPreset,
    targets: WidgetViewScope[],
    scope: CertifiedPresetScope,
  ) {
    if (currentPresetScopeKeyRef.current !== scope.key) return;
    if (!targets.length) {
      applyWidgetViewPreset(preset, {
        companyId: scope.companyId,
        presetNamespace: scope.presetNamespace,
        targetScope: scope.currentScope,
        userId: scope.userId,
      });
      return;
    }
    targets.forEach((targetScope) => {
      if (currentPresetScopeKeyRef.current !== scope.key) return;
      applyWidgetViewPreset(preset, {
        companyId: scope.companyId,
        presetNamespace: scope.presetNamespace,
        targetScope,
        userId: scope.userId,
      });
    });
  }

  function defaultTargets(scope: CertifiedPresetScope) {
    if (scope.scopes.length) return scope.scopes;
    return scope.currentScope ? [scope.currentScope] : [];
  }

  function reloadIfCurrentTarget(
    targets: WidgetViewScope[],
    scope: CertifiedPresetScope,
  ) {
    if (
      !scope.currentScope ||
      targets.some((target) => target.id === scope.currentScope?.id)
    ) {
      void scheduleReload(scope);
    }
  }

  async function scheduleReload(scope: CertifiedPresetScope) {
    onOpenChange(false);
    const synchronized = await flushUserGridSync();
    if (currentPresetScopeKeyRef.current !== scope.key) return;
    if (!synchronized) {
      toast.error(
        "A visão foi aplicada, mas a sincronização ainda está pendente. A tela não será recarregada para preservar as alterações.",
      );
      return;
    }
    window.location.reload();
  }

  function toggleScope(scopeId: string) {
    if (!presetCatalogCertified) return;
    setSelectedScopeIds((current) =>
      current.includes(scopeId)
        ? current.filter((id) => id !== scopeId)
        : [...current, scopeId],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Visões salvas
          </DialogTitle>
          <DialogDescription>
            Salve a composição completa, replique em outras telas e escolha um
            padrão para novos cenários. Visões compatíveis de outros menus
            também podem ser abertas aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <section className="grid gap-3 rounded-md border bg-muted/15 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`widget-view-name-${menuKey}`}>
                Nome da visão atual
              </Label>
              <Input
                id={`widget-view-name-${menuKey}`}
                value={name}
                disabled={!presetCatalogCertified}
                onChange={(event) => setName(event.target.value)}
                placeholder={`Ex.: ${menu.label} operacional`}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveCurrentView();
                }}
              />
            </div>
            <Button
              type="button"
              onClick={saveCurrentView}
              disabled={!presetCatalogCertified}
            >
              <Save className="h-4 w-4" />
              Salvar visão atual
            </Button>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Modelos disponíveis</div>
              <div className="text-xs text-muted-foreground">
                {!presetCatalogCertified
                  ? "Carregando as visões desta empresa..."
                  : presets.length
                  ? `${presets.length} visão(ões) salva(s) para ${menu.label}.`
                  : "Nenhuma visão salva nesta tela."}
              </div>
            </div>
            {currentScope ? (
              <Badge variant="outline">Atual: {currentScope.name}</Badge>
            ) : null}
          </div>

          <div className="space-y-2">
            {presets.length ? (
              <div className="rounded-md border bg-muted/20 p-3">
                <div
                  className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  role="toolbar"
                  aria-label="Ações para visões selecionadas"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={presetSelectionState}
                      onCheckedChange={(checked) =>
                        toggleAllPresets(checked === true)
                      }
                      aria-label="Selecionar todas as visões salvas"
                    />
                    {selectedPresets.length
                      ? `${selectedPresets.length} selecionada${selectedPresets.length === 1 ? "" : "s"}`
                      : "Selecionar todas"}
                  </label>
                  {selectedPresets.length ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setBulkDeleteConfirm(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir selecionadas
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedPresetIds(new Set());
                          setBulkDeleteConfirm(false);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                        Limpar
                      </Button>
                    </div>
                  ) : null}
                </div>
                {bulkDeleteConfirm && selectedPresets.length ? (
                  <div className="mt-3 flex flex-col gap-2 border-t border-destructive/20 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm">
                      Excluir definitivamente {selectedPresets.length}{" "}
                      {selectedPresets.length === 1 ? "visão" : "visões"} selecionada
                      {selectedPresets.length === 1 ? "" : "s"}?
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkDeleteConfirm(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={deleteSelectedPresets}
                      >
                        Confirmar exclusão
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {presets.map((preset) => {
              const replicating = replicateId === preset.id;
              const deleting = deleteId === preset.id;
              return (
                <div
                  key={preset.id}
                  className={cn(
                    "rounded-md border bg-card p-3 transition-colors",
                    selectedPresetIds.has(preset.id) &&
                      "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={selectedPresetIds.has(preset.id)}
                        onCheckedChange={(checked) =>
                          togglePresetSelection(preset.id, checked === true)
                        }
                        aria-label={`Selecionar visão ${preset.name}`}
                      />
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold">
                          {preset.name}
                        </div>
                        {preset.isDefault ? (
                          <Badge className="gap-1">
                            <Star className="h-3 w-3 fill-current" />
                            Padrão
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {preset.snapshot.sourceScope
                          ? `Origem: ${preset.snapshot.sourceScope.name} · `
                          : ""}
                        {preset.snapshot.cardIds.length} widget(s) · atualizado em{" "}
                        {formatDateTime(preset.updatedAt)}
                      </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => applyToCurrent(preset)}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Aplicar
                      </Button>
                      {normalizedScopes.length > 1 ? (
                        <IconButton
                          label="Replicar em outras telas"
                          onClick={() => startReplication(preset)}
                        >
                          <Copy className="h-4 w-4" />
                        </IconButton>
                      ) : null}
                      <IconButton
                        label="Atualizar com a tela atual"
                        onClick={() => updatePreset(preset)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        active={preset.isDefault}
                        label={
                          preset.isDefault
                            ? "Remover como padrão"
                            : "Definir como padrão e aplicar a todas as telas"
                        }
                        onClick={() => toggleDefault(preset)}
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            preset.isDefault && "fill-current",
                          )}
                        />
                      </IconButton>
                      <IconButton
                        destructive
                        label="Excluir visão"
                        onClick={() => setDeleteId(preset.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>

                  {deleting ? (
                    <div className="mt-3 flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm">
                        Excluir definitivamente a visão “{preset.name}”?
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteId(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => confirmDelete(preset.id)}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {replicating ? (
                    <div className="mt-3 space-y-3 rounded-md border bg-muted/15 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold">
                            Replicar em outras telas
                          </div>
                          <div className="text-xs text-muted-foreground">
                            O cenário da visão será remapeado para cada destino.
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSelectedScopeIds((current) =>
                                Array.from(
                                  new Set([
                                    ...current,
                                    ...visibleScopes.map((scope) => scope.id),
                                  ]),
                                ),
                              )
                            }
                          >
                            Todos visíveis
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedScopeIds([])}
                          >
                            Limpar
                          </Button>
                        </div>
                      </div>

                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={scopeFilter}
                          onChange={(event) => setScopeFilter(event.target.value)}
                          className="pl-9"
                          placeholder="Filtrar cenários ou telas"
                        />
                      </div>

                      <div className="grid max-h-52 gap-1 overflow-y-auto sm:grid-cols-2">
                        {visibleScopes.map((scope) => {
                          const checked = selectedScopeIds.includes(scope.id);
                          return (
                            <label
                              key={scope.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                                checked
                                  ? "border-primary/40 bg-primary/5"
                                  : "bg-background",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleScope(scope.id)}
                                className="h-4 w-4 accent-primary"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {scope.name}
                              </span>
                              {scope.id === currentScope?.id ? (
                                <Badge variant="outline">Atual</Badge>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setReplicateId(null)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => replicatePreset(preset)}
                          disabled={!selectedScopeIds.length}
                        >
                          <Copy className="h-4 w-4" />
                          Replicar em {selectedScopeIds.length || 0} tela(s)
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {onApplySourcePreset
            ? sourcePresetGroups.map((group) => (
                <section key={group.menuKey} className="space-y-2 pt-2">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-t pt-4">
                    <div>
                      <div className="text-sm font-semibold">
                        Visões de {group.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Abra em {menu.label} uma composição salva anteriormente.
                      </div>
                    </div>
                    <Badge variant="outline">{group.presets.length}</Badge>
                  </div>

                  {group.presets.length ? (
                    group.presets.map((preset) => (
                      <div
                        key={`${group.menuKey}-${preset.id}`}
                        className="flex flex-col gap-3 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold">
                              {preset.name}
                            </div>
                            <Badge variant="secondary">{group.label}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {preset.snapshot.sourceScope
                              ? `Origem: ${preset.snapshot.sourceScope.name} · `
                              : ""}
                            {preset.snapshot.cardIds.length} widget(s) · atualizado em{" "}
                            {formatDateTime(preset.updatedAt)}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => applySourcePreset(preset)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Abrir em {menu.label}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center text-sm text-muted-foreground">
                      Nenhuma visão salva em {group.label}.
                    </div>
                  )}
                </section>
              ))
            : null}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            As visões ficam vinculadas ao usuário e à empresa selecionada.
          </div>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IconButton({
  active = false,
  children,
  destructive = false,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  destructive?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size="icon"
      className={cn(
        "h-8 w-8",
        destructive && "text-muted-foreground hover:text-destructive",
      )}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

function presetCatalogScopeKey({
  companyId,
  menuKey,
  presetNamespace,
  userId,
}: {
  companyId?: string | null;
  menuKey: CardMenuKey;
  presetNamespace: WidgetViewPresetNamespace;
  userId?: string | null;
}) {
  const surface =
    menuKey === "occupancy" &&
    (presetNamespace === "occupancy-analysis" ||
      presetNamespace === "occupancy-live" ||
      presetNamespace === "occupancy-reports")
      ? presetNamespace
      : menuKey;

  return JSON.stringify([
    companyId?.trim() ?? "",
    userId?.trim() ?? "",
    menuKey,
    surface,
  ]);
}

function uniqueScopes(scopes: WidgetViewScope[]) {
  const byId = new Map<string, WidgetViewScope>();
  scopes.forEach((scope) => {
    if (!scope.id.trim()) return;
    byId.set(scope.id, { id: scope.id, name: scope.name || "Visão sem nome" });
  });
  return Array.from(byId.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "pt-BR"),
  );
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function defaultPresetName(
  menuLabel: string,
  scope: WidgetViewScope | null,
) {
  return scope ? `${menuLabel} - ${scope.name}` : `${menuLabel} personalizado`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
