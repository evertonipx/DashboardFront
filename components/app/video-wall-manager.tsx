"use client";

import * as React from "react";
import {
  Copy,
  ExternalLink,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Scenario } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  buildOpaqueViewUrl,
  saveViewLinkTarget,
} from "@/lib/view-link-reference";
import {
  VIDEO_WALL_UPDATED_EVENT,
  createVideoWallOutput,
  createVideoWallProfile,
  deleteSavedLiveViews,
  loadSavedLiveViews,
  loadVideoWallProfiles,
  resolveSavedLiveViewUrl,
  saveVideoWallProfiles,
  type SavedLiveView,
  type VideoWallOutput,
  type VideoWallProfile,
} from "@/lib/video-wall";

type VideoWallManagerProps = {
  companyId?: string | null;
  loadingScenarios?: boolean;
  onOpenViewBuilder: () => void;
  scenarios: Scenario[];
  userId?: string | null;
};

type DetectedScreen = {
  availHeight: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
  isPrimary: boolean;
  key: string;
  label: string;
};

type ScreenDetailsLike = {
  screens: Array<{
    availHeight?: number;
    availLeft?: number;
    availTop?: number;
    availWidth?: number;
    height?: number;
    isPrimary?: boolean;
    label?: string;
    left?: number;
    top?: number;
    width?: number;
  }>;
};

type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

const EMPTY_SAVED_VIEWS: SavedLiveView[] = [];
const EMPTY_VIDEO_WALL_PROFILES: VideoWallProfile[] = [];

export function VideoWallManager({
  companyId,
  loadingScenarios = false,
  onOpenViewBuilder,
  scenarios,
  userId,
}: VideoWallManagerProps) {
  const [storedSavedViews, setSavedViews] = React.useState<SavedLiveView[]>([]);
  const [storedProfiles, setProfiles] = React.useState<VideoWallProfile[]>([]);
  const [loadedConfigurationScopeKey, setLoadedConfigurationScopeKey] =
    React.useState("");
  const [activeProfileId, setActiveProfileId] = React.useState("");
  const [screens, setScreens] = React.useState<DetectedScreen[]>([]);
  const [screenApiAvailable, setScreenApiAvailable] = React.useState(false);
  const [detectingScreens, setDetectingScreens] = React.useState(false);
  const [openWindowCount, setOpenWindowCount] = React.useState(0);
  const [selectedOutputIds, setSelectedOutputIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [selectedSavedViewIds, setSelectedSavedViewIds] = React.useState<
    Set<string>
  >(() => new Set());
  const wallWindowsRef = React.useRef(new Map<string, Window>());
  const configurationScopeKey = `${companyId?.trim() ?? ""}\u0000${userId?.trim() ?? ""}`;
  const configurationScopeCertified =
    loadedConfigurationScopeKey === configurationScopeKey;
  const savedViews = configurationScopeCertified
    ? storedSavedViews
    : EMPTY_SAVED_VIEWS;
  const profiles = configurationScopeCertified
    ? storedProfiles
    : EMPTY_VIDEO_WALL_PROFILES;
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const selectedOutputCount =
    activeProfile?.outputs.filter((output) => selectedOutputIds.has(output.id))
      .length ?? 0;
  const allOutputsSelected = Boolean(
    activeProfile?.outputs.length &&
      selectedOutputCount === activeProfile.outputs.length,
  );
  const outputSelectionState = allOutputsSelected
    ? true
    : selectedOutputCount
      ? "indeterminate"
      : false;
  const selectedSavedViewCount = savedViews.filter((view) =>
    selectedSavedViewIds.has(view.id),
  ).length;
  const allSavedViewsSelected =
    savedViews.length > 0 && selectedSavedViewCount === savedViews.length;
  const savedViewSelectionState = allSavedViewsSelected
    ? true
    : selectedSavedViewCount
      ? "indeterminate"
      : false;

  React.useEffect(() => {
    wallWindowsRef.current.forEach((popup) => {
      if (!popup.closed) popup.close();
    });
    wallWindowsRef.current.clear();
    setOpenWindowCount(0);
    setSelectedOutputIds(new Set());
    setSelectedSavedViewIds(new Set());
  }, [configurationScopeKey]);

  React.useEffect(() => {
    function syncStoredConfiguration() {
      const nextViews = loadSavedLiveViews(companyId, userId);
      const storedProfiles = loadVideoWallProfiles(companyId, userId);
      const nextProfiles = storedProfiles.length
        ? storedProfiles
        : [createVideoWallProfile("Video wall principal", nextViews[0]?.id)];

      setSavedViews(nextViews);
      setSelectedSavedViewIds((current) =>
        retainAvailableIds(current, nextViews.map((view) => view.id)),
      );
      setProfiles(nextProfiles);
      setLoadedConfigurationScopeKey(configurationScopeKey);
      setActiveProfileId((current) =>
        nextProfiles.some((profile) => profile.id === current)
          ? current
          : nextProfiles[0]?.id ?? "",
      );
    }

    syncStoredConfiguration();
    window.addEventListener(VIDEO_WALL_UPDATED_EVENT, syncStoredConfiguration);
    window.addEventListener("storage", syncStoredConfiguration);
    return () => {
      window.removeEventListener(
        VIDEO_WALL_UPDATED_EVENT,
        syncStoredConfiguration,
      );
      window.removeEventListener("storage", syncStoredConfiguration);
    };
  }, [companyId, configurationScopeKey, userId]);

  React.useEffect(() => {
    setSelectedOutputIds((current) =>
      retainAvailableIds(
        current,
        activeProfile?.outputs.map((output) => output.id) ?? [],
      ),
    );
  }, [activeProfile]);

  React.useEffect(() => {
    const currentScreen = readCurrentScreen();
    setScreens([currentScreen]);
    setScreenApiAvailable(
      typeof (window as WindowWithScreenDetails).getScreenDetails === "function",
    );
  }, []);

  React.useEffect(() => {
    if (!scenarios.length || !profiles.length) return;
    const missingScenario = profiles.some((profile) =>
      profile.outputs.some(
        (output) => output.source === "live_dashboard" && !output.scenarioId,
      ),
    );
    if (!missingScenario) return;

    setProfiles(
      saveVideoWallProfiles(
        profiles.map((profile) => ({
        ...profile,
        outputs: profile.outputs.map((output) =>
          output.source === "live_dashboard" && !output.scenarioId
            ? { ...output, scenarioId: scenarios[0].id }
            : output,
        ),
        })),
        companyId,
        userId,
      ),
    );
  }, [companyId, profiles, scenarios, userId]);

  function persistProfiles(nextProfiles: VideoWallProfile[]) {
    setProfiles(
      saveVideoWallProfiles(nextProfiles, companyId, userId),
    );
  }

  function updateActiveProfile(
    update: (profile: VideoWallProfile) => VideoWallProfile,
  ) {
    if (!activeProfile) return;
    const now = new Date().toISOString();
    persistProfiles(
      profiles.map((profile) =>
        profile.id === activeProfile.id
          ? { ...update(profile), updatedAt: now }
          : profile,
      ),
    );
  }

  function updateOutput(outputId: string, patch: Partial<VideoWallOutput>) {
    updateActiveProfile((profile) => ({
      ...profile,
      outputs: profile.outputs.map((output) =>
        output.id === outputId ? { ...output, ...patch } : output,
      ),
    }));
  }

  function createProfile() {
    const profile = createVideoWallProfile(
      `Video wall ${profiles.length + 1}`,
      savedViews[0]?.id,
    );
    profile.outputs[0].scenarioId = scenarios[0]?.id ?? "";
    persistProfiles([profile, ...profiles]);
    setActiveProfileId(profile.id);
  }

  function duplicateProfile() {
    if (!activeProfile) return;
    const profile = createVideoWallProfile(
      `${activeProfile.name} - cópia`,
      savedViews[0]?.id,
    );
    profile.outputs = activeProfile.outputs.map((output, index) => {
      const identity = createVideoWallOutput(index + 1);
      return {
        ...output,
        id: identity.id,
        linkReference: identity.linkReference,
      };
    });
    persistProfiles([profile, ...profiles]);
    setActiveProfileId(profile.id);
  }

  function removeProfile() {
    if (!activeProfile) return;
    if (!window.confirm(`Excluir a configuração "${activeProfile.name}"?`)) {
      return;
    }
    const remaining = profiles.filter(
      (profile) => profile.id !== activeProfile.id,
    );
    const nextProfiles = remaining.length
      ? remaining
      : [createVideoWallProfile("Video wall principal", savedViews[0]?.id)];
    nextProfiles[0].outputs[0].scenarioId ||= scenarios[0]?.id ?? "";
    persistProfiles(nextProfiles);
    setActiveProfileId(nextProfiles[0].id);
    setSelectedOutputIds(new Set());
  }

  function addOutput() {
    if (!activeProfile) return;
    const output = createVideoWallOutput(
      activeProfile.outputs.length + 1,
      savedViews[0]?.id,
    );
    output.scenarioId = scenarios[0]?.id ?? "";
    updateActiveProfile((profile) => ({
      ...profile,
      outputs: [...profile.outputs, output],
    }));
  }

  function duplicateOutput(output: VideoWallOutput) {
    const identity = createVideoWallOutput(
      (activeProfile?.outputs.length ?? 0) + 1,
    );
    updateActiveProfile((profile) => ({
      ...profile,
      outputs: [
        ...profile.outputs,
        {
          ...output,
          id: identity.id,
          linkReference: identity.linkReference,
          name: `${output.name} - cópia`,
          screenKey: "auto",
        },
      ],
    }));
  }

  function removeOutput(outputId: string) {
    updateActiveProfile((profile) => ({
      ...profile,
      outputs: profile.outputs.filter((output) => output.id !== outputId),
    }));
    setSelectedOutputIds((current) => {
      if (!current.has(outputId)) return current;
      const next = new Set(current);
      next.delete(outputId);
      return next;
    });
  }

  function toggleOutputSelection(outputId: string, selected: boolean) {
    setSelectedOutputIds((current) => updateSelectedIds(current, outputId, selected));
  }

  function toggleAllOutputs(selected: boolean) {
    setSelectedOutputIds(
      selected && activeProfile
        ? new Set(activeProfile.outputs.map((output) => output.id))
        : new Set(),
    );
  }

  function duplicateSelectedOutputs() {
    if (!activeProfile) return;
    const selected = activeProfile.outputs.filter((output) =>
      selectedOutputIds.has(output.id),
    );
    if (!selected.length) return;
    const copies = selected.map((output, index) => {
      const identity = createVideoWallOutput(
        activeProfile.outputs.length + index + 1,
      );
      return {
        ...output,
        id: identity.id,
        linkReference: identity.linkReference,
        name: `${output.name} - cópia`,
        screenKey: "auto",
      };
    });
    updateActiveProfile((profile) => ({
      ...profile,
      outputs: [...profile.outputs, ...copies],
    }));
    setSelectedOutputIds(new Set(copies.map((output) => output.id)));
    toast.success(
      `${copies.length} saída${copies.length === 1 ? " duplicada" : "s duplicadas"}.`,
    );
  }

  function removeSelectedOutputs() {
    if (!activeProfile) return;
    const selected = activeProfile.outputs.filter((output) =>
      selectedOutputIds.has(output.id),
    );
    if (!selected.length) return;
    if (selected.length >= activeProfile.outputs.length) {
      toast.error("Mantenha ao menos uma saída no video wall.");
      return;
    }
    if (
      !window.confirm(
        `Remover ${selected.length} saída${selected.length === 1 ? "" : "s"} desta configuração?`,
      )
    ) {
      return;
    }
    const selectedIds = new Set(selected.map((output) => output.id));
    updateActiveProfile((profile) => ({
      ...profile,
      outputs: profile.outputs.filter((output) => !selectedIds.has(output.id)),
    }));
    setSelectedOutputIds(new Set());
    toast.success(
      `${selected.length} saída${selected.length === 1 ? " removida" : "s removidas"}.`,
    );
  }

  async function detectScreens() {
    const getScreenDetails = (window as WindowWithScreenDetails).getScreenDetails;
    if (!getScreenDetails) {
      setScreens([readCurrentScreen()]);
      toast.info("Use o posicionamento manual das janelas neste dispositivo.");
      return;
    }

    setDetectingScreens(true);
    try {
      const details = await getScreenDetails.call(window);
      const detected = details.screens.map(normalizeDetectedScreen);
      setScreens(detected.length ? detected : [readCurrentScreen()]);
      toast.success(
        detected.length === 1
          ? "1 monitor detectado."
          : `${detected.length} monitores detectados.`,
      );
    } catch {
      setScreens([readCurrentScreen()]);
      toast.error(
        "Não foi possível acessar os monitores. Verifique a permissão de gerenciamento de janelas.",
      );
    } finally {
      setDetectingScreens(false);
    }
  }

  function launchWall() {
    if (!activeProfile?.outputs.length) {
      toast.error("Adicione ao menos uma saída ao video wall.");
      return;
    }

    const resolvedOutputs = activeProfile.outputs.map((output, index) => ({
      output,
      screen: resolveOutputScreen(output, screens, index),
      url: resolveOutputUrl(output, savedViews, scenarios, companyId, userId),
    }));
    const invalidOutput = resolvedOutputs.find(({ url }) => !url);
    if (invalidOutput) {
      toast.error(`Configure a fonte de ${invalidOutput.output.name}.`);
      return;
    }

    let opened = 0;
    let blocked = 0;
    resolvedOutputs.forEach(({ output, screen, url }, index) => {
      const features = buildWindowFeatures(screen, index, screens.length);
      const popup = window.open(
        url,
        `ipxdata-wall-${activeProfile.id}-${output.id}`,
        features,
      );
      if (!popup) {
        blocked += 1;
        return;
      }

      try {
        popup.opener = null;
        popup.moveTo(screen.availLeft, screen.availTop);
        popup.resizeTo(screen.availWidth, screen.availHeight);
        popup.focus();
      } catch {
        // Window placement may be restricted even when opening the view succeeds.
      }
      wallWindowsRef.current.set(output.id, popup);
      opened += 1;
    });

    setOpenWindowCount(openedWindowCount(wallWindowsRef.current));
    if (blocked) {
      toast.error(
        `${blocked} saída(s) bloqueada(s). Autorize pop-ups para abrir todo o video wall.`,
      );
    } else {
      toast.success(
        opened === 1
          ? "Video wall aberto em 1 monitor."
          : `Video wall aberto em ${opened} monitores.`,
      );
    }
  }

  function stopWall() {
    wallWindowsRef.current.forEach((popup) => {
      if (!popup.closed) popup.close();
    });
    wallWindowsRef.current.clear();
    setOpenWindowCount(0);
    toast.success("Janelas do video wall fechadas.");
  }

  function previewOutput(output: VideoWallOutput) {
    const url = resolveOutputUrl(
      output,
      savedViews,
      scenarios,
      companyId,
      userId,
    );
    if (!url) {
      toast.error(`Configure a fonte de ${output.name}.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function removeSavedViews(viewIds: Iterable<string>) {
    const selectedIds = new Set(viewIds);
    if (!selectedIds.size) return;
    const nextViews = deleteSavedLiveViews(selectedIds, companyId, userId);
    setSavedViews(nextViews);
    persistProfiles(
      profiles.map((profile) => ({
        ...profile,
        outputs: profile.outputs.map((output) =>
          selectedIds.has(output.viewId) ? { ...output, viewId: "" } : output,
        ),
      })),
    );
    setSelectedSavedViewIds(new Set());
  }

  function removeSavedView(view: SavedLiveView) {
    if (!window.confirm(`Excluir a visão "${view.name}"?`)) return;
    removeSavedViews([view.id]);
    toast.success("Visão excluída.");
  }

  function removeSelectedSavedViews() {
    const selected = savedViews.filter((view) =>
      selectedSavedViewIds.has(view.id),
    );
    if (!selected.length) return;
    if (
      !window.confirm(
        `Excluir ${selected.length} ${selected.length === 1 ? "visão salva" : "visões salvas"}?`,
      )
    ) {
      return;
    }
    removeSavedViews(selected.map((view) => view.id));
    toast.success(
      selected.length === 1
        ? "1 visão excluída."
        : `${selected.length} visões excluídas.`,
    );
  }

  if (!activeProfile) return null;

  return (
    <section className="space-y-4">
      <div className="rounded-md border bg-card p-4 shadow-soft">
        <div className="grid gap-4 xl:grid-cols-[minmax(220px,320px)_minmax(240px,1fr)_auto] xl:items-end">
          <Field label="Configuração">
            <Select value={activeProfile.id} onValueChange={setActiveProfileId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Nome do video wall">
            <Input
              value={activeProfile.name}
              onChange={(event) =>
                updateActiveProfile((profile) => ({
                  ...profile,
                  name: event.target.value,
                }))
              }
            />
          </Field>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Button type="button" variant="outline" size="icon" onClick={createProfile} title="Nova configuração" aria-label="Nova configuração">
              <Plus className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={duplicateProfile} title="Duplicar configuração" aria-label="Duplicar configuração">
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={removeProfile} title="Excluir configuração" aria-label="Excluir configuração">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button type="button" onClick={launchWall}>
              <Play className="h-4 w-4" />
              Iniciar video wall
            </Button>
            <Button type="button" variant="outline" onClick={stopWall} disabled={!openWindowCount}>
              <Square className="h-4 w-4" />
              Parar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Saídas do video wall</h2>
              <p className="text-xs text-muted-foreground">
                {activeProfile.outputs.length} monitor(es) configurado(s)
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addOutput}>
              <Plus className="h-4 w-4" />
              Adicionar monitor
            </Button>
          </div>

          <div
            className="flex min-w-0 flex-col gap-2 rounded-md border bg-muted/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            role="toolbar"
            aria-label="Ações para saídas selecionadas"
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={outputSelectionState}
                onCheckedChange={(checked) => toggleAllOutputs(checked === true)}
                aria-label="Selecionar todas as saídas"
              />
              {selectedOutputCount
                ? `${selectedOutputCount} selecionada${selectedOutputCount === 1 ? "" : "s"}`
                : "Selecionar todas"}
            </label>
            {selectedOutputCount ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={duplicateSelectedOutputs}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={selectedOutputCount >= activeProfile.outputs.length}
                  onClick={removeSelectedOutputs}
                  title={
                    selectedOutputCount >= activeProfile.outputs.length
                      ? "Mantenha ao menos uma saída"
                      : undefined
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedOutputIds(new Set())}
                >
                  Limpar
                </Button>
              </div>
            ) : null}
          </div>

          {activeProfile.outputs.map((output, index) => (
            <Card
              key={output.id}
              className={cn(
                "transition-colors",
                selectedOutputIds.has(output.id) &&
                  "border-primary/40 bg-primary/5",
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedOutputIds.has(output.id)}
                        onCheckedChange={(checked) =>
                          toggleOutputSelection(output.id, checked === true)
                        }
                        aria-label={`Selecionar saída ${output.name}`}
                      />
                      <Monitor className="h-4 w-4 shrink-0 text-primary" />
                      Saída {index + 1}
                    </CardTitle>
                    <CardDescription>
                      {outputSourceSummary(output, savedViews, scenarios)}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => previewOutput(output)} title="Abrir teste" aria-label={`Abrir teste de ${output.name}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateOutput(output)} title="Duplicar saída" aria-label={`Duplicar ${output.name}`}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeOutput(output.id)} disabled={activeProfile.outputs.length === 1} title="Remover saída" aria-label={`Remover ${output.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Nome da saída">
                    <Input value={output.name} onChange={(event) => updateOutput(output.id, { name: event.target.value })} />
                  </Field>

                  <Field label="Conteúdo">
                    <Select
                      value={output.source}
                      onValueChange={(value) =>
                        updateOutput(output.id, {
                          scenarioId: scenarios[0]?.id ?? "",
                          source: value as VideoWallOutput["source"],
                          viewId: savedViews[0]?.id ?? "",
                        })
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="live_dashboard">Ao Vivo completo</SelectItem>
                        <SelectItem value="saved_view">Visão salva</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {output.source === "live_dashboard" ? (
                    <Field label="Cenário do Ao Vivo">
                      <Select
                        value={output.scenarioId}
                        onValueChange={(scenarioId) => updateOutput(output.id, { scenarioId })}
                        disabled={loadingScenarios || !scenarios.length}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {scenarios.map((scenario) => (
                            <SelectItem key={scenario.id} value={scenario.id}>
                              {scenario.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : (
                    <Field label="Visão">
                      <Select
                        value={output.viewId}
                        onValueChange={(viewId) => updateOutput(output.id, { viewId })}
                        disabled={!savedViews.length}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {savedViews.map((view) => (
                            <SelectItem key={view.id} value={view.id}>
                              {view.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <Field label="Monitor físico">
                    <Select value={output.screenKey} onValueChange={(screenKey) => updateOutput(output.id, { screenKey })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automático</SelectItem>
                        {screens.map((screen) => (
                          <SelectItem key={screen.key} value={screen.key}>
                            {screen.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <aside className="space-y-5 border-t pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Monitores</h2>
                <p className="text-xs text-muted-foreground">
                  {screens.length} detectado(s)
                </p>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={detectScreens} disabled={detectingScreens} title="Detectar monitores" aria-label="Detectar monitores">
                <RefreshCw className={`h-4 w-4 ${detectingScreens ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {screenApiAvailable ? "Distribuição automática" : "Posicionamento manual"}
              </Badge>
              {openWindowCount ? (
                <Badge variant="outline">{openWindowCount} janela(s) aberta(s)</Badge>
              ) : null}
            </div>
            <div className="space-y-2">
              {screens.map((screen) => (
                <div key={screen.key} className="rounded-md border px-3 py-2">
                  <div className="truncate text-sm font-medium">{screen.label}</div>
                  <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {screen.availWidth} x {screen.availHeight}
                    {screen.isPrimary ? " · principal" : ""}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Visões salvas</h2>
                <p className="text-xs text-muted-foreground">
                  {savedViews.length} disponível(is)
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onOpenViewBuilder}>
                <Plus className="h-4 w-4" />
                Criar
              </Button>
            </div>
            {savedViews.length ? (
              <div className="space-y-2">
                <div
                  className="flex min-w-0 flex-col gap-2 rounded-md border bg-muted/20 px-3 py-2"
                  role="toolbar"
                  aria-label="Ações para visões salvas selecionadas"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={savedViewSelectionState}
                      onCheckedChange={(checked) =>
                        setSelectedSavedViewIds(
                          checked === true
                            ? new Set(savedViews.map((view) => view.id))
                            : new Set(),
                        )
                      }
                      aria-label="Selecionar todas as visões salvas"
                    />
                    {selectedSavedViewCount
                      ? `${selectedSavedViewCount} selecionada${selectedSavedViewCount === 1 ? "" : "s"}`
                      : "Selecionar todas"}
                  </label>
                  {selectedSavedViewCount ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={removeSelectedSavedViews}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedSavedViewIds(new Set())}
                      >
                        Limpar
                      </Button>
                    </div>
                  ) : null}
                </div>
                {savedViews.map((view) => (
                  <div
                    key={view.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors",
                      selectedSavedViewIds.has(view.id) &&
                        "border-primary/40 bg-primary/5",
                    )}
                  >
                    <Checkbox
                      checked={selectedSavedViewIds.has(view.id)}
                      onCheckedChange={(checked) =>
                        setSelectedSavedViewIds((current) =>
                          updateSelectedIds(current, view.id, checked === true),
                        )
                      }
                      aria-label={`Selecionar visão ${view.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{view.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        Visão pronta para exibição
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeSavedView(view)} title="Excluir visão" aria-label={`Excluir ${view.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhuma visão individual salva.
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

function updateSelectedIds(
  current: Set<string>,
  id: string,
  selected: boolean,
) {
  const next = new Set(current);
  if (selected) next.add(id);
  else next.delete(id);
  return next;
}

function retainAvailableIds(current: Set<string>, availableIds: string[]) {
  const available = new Set(availableIds);
  const retained = new Set([...current].filter((id) => available.has(id)));
  if (
    retained.size === current.size &&
    [...retained].every((id) => current.has(id))
  ) {
    return current;
  }
  return retained;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function outputSourceSummary(
  output: VideoWallOutput,
  views: SavedLiveView[],
  scenarios: Scenario[],
) {
  if (output.source === "saved_view") {
    return views.find((view) => view.id === output.viewId)?.name ?? "Visão não definida";
  }
  return (
    scenarios.find((scenario) => scenario.id === output.scenarioId)?.name ??
    "Cenário não definido"
  );
}

function resolveOutputUrl(
  output: VideoWallOutput,
  views: SavedLiveView[],
  scenarios: Scenario[],
  companyId?: string | null,
  userId?: string | null,
) {
  if (output.source === "saved_view") {
    const view = views.find((item) => item.id === output.viewId);
    return view
      ? resolveSavedLiveViewUrl(view, window.location.origin, userId)
      : "";
  }
  if (
    !output.scenarioId ||
    !scenarios.some((scenario) => scenario.id === output.scenarioId)
  ) {
    return "";
  }

  const url = new URL("/views/dashboard/live", window.location.origin);
  if (companyId) url.searchParams.set("company_id", companyId);
  url.searchParams.set("scope_mode", "scenario");
  url.searchParams.set("scope_id", output.scenarioId);
  const reference = saveViewLinkTarget(url, userId, output.linkReference);
  return reference
    ? buildOpaqueViewUrl(
        "/views/dashboard/live",
        reference,
        window.location.origin,
      )
    : "";
}

function resolveOutputScreen(
  output: VideoWallOutput,
  screens: DetectedScreen[],
  index: number,
) {
  if (!screens.length) return readCurrentScreen();
  if (output.screenKey !== "auto") {
    const selected = screens.find((screen) => screen.key === output.screenKey);
    if (selected) return selected;
  }
  return screens[index % screens.length];
}

function buildWindowFeatures(
  screen: DetectedScreen,
  index: number,
  screenCount: number,
) {
  const cascade = screenCount === 1 ? index * 28 : 0;
  return [
    "popup=yes",
    "resizable=yes",
    "scrollbars=no",
    `left=${screen.availLeft + cascade}`,
    `top=${screen.availTop + cascade}`,
    `width=${screen.availWidth}`,
    `height=${screen.availHeight}`,
  ].join(",");
}

function readCurrentScreen(): DetectedScreen {
  const current = window.screen as Screen & {
    availLeft?: number;
    availTop?: number;
  };
  return {
    availHeight: current.availHeight || current.height,
    availLeft: current.availLeft ?? 0,
    availTop: current.availTop ?? 0,
    availWidth: current.availWidth || current.width,
    isPrimary: true,
    key: screenGeometryKey(
      current.availLeft ?? 0,
      current.availTop ?? 0,
      current.availWidth || current.width,
      current.availHeight || current.height,
    ),
    label: "Monitor atual",
  };
}

function normalizeDetectedScreen(
  screen: ScreenDetailsLike["screens"][number],
  index: number,
): DetectedScreen {
  const availLeft = screen.availLeft ?? screen.left ?? 0;
  const availTop = screen.availTop ?? screen.top ?? 0;
  const availWidth = screen.availWidth ?? screen.width ?? 1280;
  const availHeight = screen.availHeight ?? screen.height ?? 720;
  return {
    availHeight,
    availLeft,
    availTop,
    availWidth,
    isPrimary: Boolean(screen.isPrimary),
    key: screenGeometryKey(availLeft, availTop, availWidth, availHeight),
    label:
      screen.label?.trim() ||
      `Monitor ${index + 1}${screen.isPrimary ? " (principal)" : ""}`,
  };
}

function screenGeometryKey(
  left: number,
  top: number,
  width: number,
  height: number,
) {
  return `screen-${left}-${top}-${width}-${height}`;
}

function openedWindowCount(windows: Map<string, Window>) {
  let count = 0;
  windows.forEach((popup, id) => {
    if (popup.closed) windows.delete(id);
    else count += 1;
  });
  return count;
}
