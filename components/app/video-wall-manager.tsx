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
import {
  VIDEO_WALL_UPDATED_EVENT,
  createVideoWallOutput,
  createVideoWallProfile,
  deleteSavedLiveView,
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

export function VideoWallManager({
  companyId,
  loadingScenarios = false,
  onOpenViewBuilder,
  scenarios,
  userId,
}: VideoWallManagerProps) {
  const [savedViews, setSavedViews] = React.useState<SavedLiveView[]>([]);
  const [profiles, setProfiles] = React.useState<VideoWallProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = React.useState("");
  const [screens, setScreens] = React.useState<DetectedScreen[]>([]);
  const [screenApiAvailable, setScreenApiAvailable] = React.useState(false);
  const [detectingScreens, setDetectingScreens] = React.useState(false);
  const [openWindowCount, setOpenWindowCount] = React.useState(0);
  const wallWindowsRef = React.useRef(new Map<string, Window>());
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];

  React.useEffect(() => {
    function syncStoredConfiguration() {
      const nextViews = loadSavedLiveViews(companyId, userId);
      const storedProfiles = loadVideoWallProfiles(companyId, userId);
      const nextProfiles = storedProfiles.length
        ? storedProfiles
        : [createVideoWallProfile("Video wall principal", nextViews[0]?.id)];

      setSavedViews(nextViews);
      setProfiles(nextProfiles);
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
  }, [companyId, userId]);

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
    profile.outputs = activeProfile.outputs.map((output, index) => ({
      ...createVideoWallOutput(index + 1),
      ...output,
      id: createVideoWallOutput(index + 1).id,
    }));
    persistProfiles([profile, ...profiles]);
    setActiveProfileId(profile.id);
  }

  function removeProfile() {
    if (!activeProfile) return;
    const remaining = profiles.filter(
      (profile) => profile.id !== activeProfile.id,
    );
    const nextProfiles = remaining.length
      ? remaining
      : [createVideoWallProfile("Video wall principal", savedViews[0]?.id)];
    nextProfiles[0].outputs[0].scenarioId ||= scenarios[0]?.id ?? "";
    persistProfiles(nextProfiles);
    setActiveProfileId(nextProfiles[0].id);
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
    updateActiveProfile((profile) => ({
      ...profile,
      outputs: [
        ...profile.outputs,
        {
          ...output,
          id: createVideoWallOutput(profile.outputs.length + 1).id,
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
  }

  async function detectScreens() {
    const getScreenDetails = (window as WindowWithScreenDetails).getScreenDetails;
    if (!getScreenDetails) {
      setScreens([readCurrentScreen()]);
      toast.info("O navegador usará posicionamento manual das janelas.");
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
      url: resolveOutputUrl(output, savedViews, companyId),
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
    const url = resolveOutputUrl(output, savedViews, companyId);
    if (!url) {
      toast.error(`Configure a fonte de ${output.name}.`);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function removeSavedView(viewId: string) {
    const nextViews = deleteSavedLiveView(viewId, companyId, userId);
    setSavedViews(nextViews);
    persistProfiles(
      profiles.map((profile) => ({
        ...profile,
        outputs: profile.outputs.map((output) =>
          output.viewId === viewId ? { ...output, viewId: "" } : output,
        ),
      })),
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

          {activeProfile.outputs.map((output, index) => (
            <Card key={output.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
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
                  <Field label="Identificação">
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
                {savedViews.map((view) => (
                  <div key={view.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{view.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{view.path}</div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeSavedView(view.id)} title="Excluir visão" aria-label={`Excluir ${view.name}`}>
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
  companyId?: string | null,
) {
  if (output.source === "saved_view") {
    const view = views.find((item) => item.id === output.viewId);
    return view ? resolveSavedLiveViewUrl(view, window.location.origin) : "";
  }
  if (!output.scenarioId) return "";

  const url = new URL("/views/dashboard/live", window.location.origin);
  if (companyId) url.searchParams.set("company_id", companyId);
  url.searchParams.set("scope_mode", "scenario");
  url.searchParams.set("scope_id", output.scenarioId);
  return url.toString();
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
