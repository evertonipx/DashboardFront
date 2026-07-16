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
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  applyWidgetViewPreset,
  captureWidgetViewSnapshot,
  deleteWidgetViewPreset,
  loadWidgetViewPresets,
  setDefaultWidgetViewPreset,
  upsertWidgetViewPreset,
  WIDGET_VIEW_PRESETS_UPDATED_EVENT,
  type WidgetViewPreset,
  type WidgetViewScope,
} from "@/lib/widget-view-presets";
import {
  getCardMenuDefinition,
  type CardMenuKey,
  type CardPreference,
} from "@/lib/view-preferences";

type WidgetViewPresetsDialogProps = {
  cardIds: string[];
  companyId?: string | null;
  currentScope?: WidgetViewScope | null;
  menuKey: CardMenuKey;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  preferences: CardPreference[];
  scopes?: WidgetViewScope[];
  userId?: string | null;
};

export function WidgetViewPresetsDialog({
  cardIds,
  companyId,
  currentScope = null,
  menuKey,
  onOpenChange,
  open,
  preferences,
  scopes = [],
  userId,
}: WidgetViewPresetsDialogProps) {
  const menu = getCardMenuDefinition(menuKey);
  const [presets, setPresets] = React.useState<WidgetViewPreset[]>([]);
  const [name, setName] = React.useState("");
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [replicateId, setReplicateId] = React.useState<string | null>(null);
  const [selectedScopeIds, setSelectedScopeIds] = React.useState<string[]>([]);
  const [scopeFilter, setScopeFilter] = React.useState("");
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

  const refreshPresets = React.useCallback(() => {
    setPresets(loadWidgetViewPresets(menuKey, companyId, userId));
  }, [companyId, menuKey, userId]);

  React.useEffect(() => {
    if (!open) return;
    refreshPresets();
    setName(defaultPresetName(menu.label, currentScope));
    setDeleteId(null);
    setReplicateId(null);
    setSelectedScopeIds([]);
    setScopeFilter("");
  }, [currentScope, menu.label, open, refreshPresets]);

  React.useEffect(() => {
    function syncPresets() {
      refreshPresets();
    }
    window.addEventListener(WIDGET_VIEW_PRESETS_UPDATED_EVENT, syncPresets);
    window.addEventListener("storage", syncPresets);
    return () => {
      window.removeEventListener(
        WIDGET_VIEW_PRESETS_UPDATED_EVENT,
        syncPresets,
      );
      window.removeEventListener("storage", syncPresets);
    };
  }, [refreshPresets]);

  function currentSnapshot() {
    return captureWidgetViewSnapshot({
      cardIds,
      companyId,
      menuKey,
      preferences,
      sourceScope: currentScope,
      userId,
    });
  }

  function saveCurrentView() {
    if (!name.trim()) {
      toast.error("Informe um nome para a visão.");
      return;
    }
    const next = upsertWidgetViewPreset({
      companyId,
      menuKey,
      name,
      snapshot: currentSnapshot(),
      userId,
    });
    setPresets(next);
    setName(defaultPresetName(menu.label, currentScope));
    toast.success("Visão salva com todas as configurações dos widgets.");
  }

  function updatePreset(preset: WidgetViewPreset) {
    const next = upsertWidgetViewPreset({
      companyId,
      id: preset.id,
      menuKey,
      name: preset.name,
      snapshot: currentSnapshot(),
      userId,
    });
    setPresets(next);

    if (preset.isDefault) {
      applyPresetToScopes(
        next.find((candidate) => candidate.id === preset.id) ?? preset,
        defaultTargets(),
      );
      toast.success("Visão padrão atualizada e replicada.");
      reloadIfCurrentTarget(defaultTargets());
      return;
    }
    toast.success("Visão atualizada.");
  }

  function applyToCurrent(preset: WidgetViewPreset) {
    applyWidgetViewPreset(preset, {
      companyId,
      targetScope: currentScope,
      userId,
    });
    toast.success("Visão aplicada nesta tela.");
    scheduleReload();
  }

  function toggleDefault(preset: WidgetViewPreset) {
    if (preset.isDefault) {
      const next = setDefaultWidgetViewPreset(
        menuKey,
        "",
        companyId,
        userId,
      );
      setPresets(next);
      toast.success("Visão padrão removida.");
      return;
    }

    const next = setDefaultWidgetViewPreset(
      menuKey,
      preset.id,
      companyId,
      userId,
    );
    const nextPreset =
      next.find((candidate) => candidate.id === preset.id) ?? preset;
    const targets = defaultTargets();
    applyPresetToScopes(nextPreset, targets);
    setPresets(next);
    toast.success(
      targets.length
        ? `Visão definida como padrão e aplicada em ${targets.length} tela(s).`
        : "Visão definida como padrão.",
    );
    reloadIfCurrentTarget(targets);
  }

  function confirmDelete(presetId: string) {
    setPresets(
      deleteWidgetViewPreset(menuKey, presetId, companyId, userId),
    );
    setDeleteId(null);
    if (replicateId === presetId) setReplicateId(null);
    toast.success("Visão excluída.");
  }

  function startReplication(preset: WidgetViewPreset) {
    setReplicateId(preset.id);
    setDeleteId(null);
    setScopeFilter("");
    setSelectedScopeIds(
      normalizedScopes
        .filter((scope) => scope.id !== currentScope?.id)
        .map((scope) => scope.id),
    );
  }

  function replicatePreset(preset: WidgetViewPreset) {
    const targets = normalizedScopes.filter((scope) =>
      selectedScopeIds.includes(scope.id),
    );
    if (!targets.length) {
      toast.error("Selecione ao menos uma tela de destino.");
      return;
    }
    applyPresetToScopes(preset, targets);
    setReplicateId(null);
    toast.success(`Visão replicada em ${targets.length} tela(s).`);
    reloadIfCurrentTarget(targets);
  }

  function applyPresetToScopes(
    preset: WidgetViewPreset,
    targets: WidgetViewScope[],
  ) {
    if (!targets.length) {
      applyWidgetViewPreset(preset, {
        companyId,
        targetScope: currentScope,
        userId,
      });
      return;
    }
    targets.forEach((targetScope) => {
      applyWidgetViewPreset(preset, { companyId, targetScope, userId });
    });
  }

  function defaultTargets() {
    if (normalizedScopes.length) return normalizedScopes;
    return currentScope ? [currentScope] : [];
  }

  function reloadIfCurrentTarget(targets: WidgetViewScope[]) {
    if (!currentScope || targets.some((scope) => scope.id === currentScope.id)) {
      scheduleReload();
    }
  }

  function scheduleReload() {
    onOpenChange(false);
    window.setTimeout(() => window.location.reload(), 180);
  }

  function toggleScope(scopeId: string) {
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
            padrão para novos cenários.
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
                onChange={(event) => setName(event.target.value)}
                placeholder={`Ex.: ${menu.label} operacional`}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveCurrentView();
                }}
              />
            </div>
            <Button type="button" onClick={saveCurrentView}>
              <Save className="h-4 w-4" />
              Salvar visão atual
            </Button>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Modelos disponíveis</div>
              <div className="text-xs text-muted-foreground">
                {presets.length
                  ? `${presets.length} visão(ões) salva(s) para ${menu.label}.`
                  : "Nenhuma visão salva nesta tela."}
              </div>
            </div>
            {currentScope ? (
              <Badge variant="outline">Atual: {currentScope.name}</Badge>
            ) : null}
          </div>

          <div className="space-y-2">
            {presets.map((preset) => {
              const replicating = replicateId === preset.id;
              const deleting = deleteId === preset.id;
              return (
                <div key={preset.id} className="rounded-md border bg-card p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                              setSelectedScopeIds(
                                visibleScopes.map((scope) => scope.id),
                              )
                            }
                          >
                            Todos
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
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            As visões ficam separadas por usuário, empresa e menu.
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

function uniqueScopes(scopes: WidgetViewScope[]) {
  const byId = new Map<string, WidgetViewScope>();
  scopes.forEach((scope) => {
    if (!scope.id.trim()) return;
    byId.set(scope.id, { id: scope.id, name: scope.name || scope.id });
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
