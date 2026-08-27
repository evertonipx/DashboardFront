"use client";

import * as React from "react";
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import {
  AI_INSIGHTS_CONFIGURATION_LIMITS,
  AiInsightsApiKeySchema,
  AiInsightsStatusResponseSchema,
  DEFAULT_AI_INSIGHTS_PROMPT,
  type AiInsightModule,
  type AiInsightSurface,
  type AiInsightsAdminConfiguration,
  type AiInsightsStatusResponse,
} from "@/lib/ai-insights-contract";
import {
  clearAiInsightsLocalApiKey,
  clearAiInsightsLocalPrompt,
  loadAiInsightsLocalApiKey,
  loadAiInsightsLocalPrompt,
} from "@/lib/ai-insights-local-settings";
import { useEffectiveCompanyScopeId } from "@/lib/master-company-scope";
import { cn } from "@/lib/utils";

type ConfigurationForm = Pick<
  AiInsightsAdminConfiguration,
  | "constraints"
  | "enabledForAdmins"
  | "enabledForOperators"
  | "model"
  | "prompt"
>;

const LEGACY_PROMPT_SCOPES: ReadonlyArray<{
  module: AiInsightModule;
  surface: AiInsightSurface;
}> = [
  { module: "counting", surface: "live" },
  { module: "counting", surface: "analysis" },
  { module: "counting", surface: "reports" },
  { module: "occupancy", surface: "live" },
  { module: "occupancy", surface: "analysis" },
  { module: "occupancy", surface: "reports" },
];

export function AiInsightsDashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const [status, setStatus] = React.useState<AiInsightsStatusResponse | null>(null);
  const [form, setForm] = React.useState<ConfigurationForm | null>(null);
  const [apiKey, setApiKey] = React.useState("");
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [confirmingRemoval, setConfirmingRemoval] = React.useState(false);
  const [legacyConfigurationFound, setLegacyConfigurationFound] =
    React.useState(false);
  const requestSequence = React.useRef(0);
  const configured = status?.configuration;
  const apiKeyError = apiKey && !AiInsightsApiKeySchema.safeParse(apiKey).success
    ? "Use a chave completa, sem espaços, entre 20 e 512 caracteres."
    : null;

  const refreshConfiguration = React.useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    setConfirmingRemoval(false);
    setLegacyConfigurationFound(false);
    if (!companyScopeId || !userId) {
      setStatus(null);
      setForm(null);
      setLoading(false);
      return;
    }

    try {
      const payload = await apiFetch<unknown>("/ai/insights", {
        companyScopeId,
      });
      if (requestSequence.current !== requestId) return;
      const parsed = AiInsightsStatusResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(
          "A API não retornou a configuração administrativa da empresa.",
        );
      }

      const nextStatus = parsed.data;
      const configuration = nextStatus.configuration;
      if (!configuration) {
        throw new Error(
          "A API não retornou a configuração administrativa da empresa.",
        );
      }
      let nextPrompt = configuration.prompt;
      let nextConstraints = configuration.constraints;
      let legacyFound = false;

      if (!configuration.updatedAt) {
        const legacyPrompt = findLegacyPrompt(companyScopeId, userId);
        if (legacyPrompt) {
          nextPrompt = legacyPrompt.objective || nextPrompt;
          nextConstraints = legacyPrompt.constraints;
          legacyFound = true;
        }
      }

      const legacyApiKey = configuration.configured
        ? ""
        : loadAiInsightsLocalApiKey({
            companyId: companyScopeId,
            userId,
          });
      if (legacyApiKey) legacyFound = true;

      setStatus(nextStatus);
      setForm({
        constraints: nextConstraints,
        enabledForAdmins: configuration.enabledForAdmins,
        enabledForOperators: configuration.enabledForOperators,
        model: configuration.model,
        prompt: nextPrompt,
      });
      setApiKey(legacyApiKey);
      setShowApiKey(false);
      setLegacyConfigurationFound(legacyFound);
      if (configuration.configured) clearLegacyConfiguration(companyScopeId, userId);
    } catch (cause) {
      if (requestSequence.current !== requestId) return;
      setStatus(null);
      setForm(null);
      setApiKey("");
      setError(toUiError(cause, "Não foi possível carregar a configuração de IA."));
    } finally {
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [companyScopeId, userId]);

  React.useEffect(() => {
    void refreshConfiguration();
    return () => {
      requestSequence.current += 1;
    };
  }, [refreshConfiguration]);

  async function saveConfiguration(options: { removeCredential?: boolean } = {}) {
    if (!companyScopeId || !userId || !form || saving) return;
    if (!options.removeCredential && apiKeyError) {
      setError(apiKeyError);
      return;
    }
    if (!options.removeCredential && !configured?.configured && !apiKey) {
      setError("Informe a chave da API OpenAI antes de habilitar os insights.");
      return;
    }

    const requestId = ++requestSequence.current;
    setSaving(true);
    setError(null);
    setAnnouncement(options.removeCredential ? "Removendo credencial." : "Salvando configuração.");
    try {
      const payload = await apiFetch<unknown>("/ai/insights", {
        method: "PUT",
        body: {
          ...(options.removeCredential
            ? { apiKey: null }
            : apiKey
              ? { apiKey }
              : {}),
          ...form,
        },
        companyScopeId,
        retry: false,
      });
      if (requestSequence.current !== requestId) return;
      const parsed = AiInsightsStatusResponseSchema.safeParse(payload);
      if (!parsed.success || !parsed.data.configuration) {
        throw new Error("A API não confirmou a configuração salva.");
      }

      const nextConfiguration = parsed.data.configuration;
      setStatus(parsed.data);
      setForm({
        constraints: nextConfiguration.constraints,
        enabledForAdmins: nextConfiguration.enabledForAdmins,
        enabledForOperators: nextConfiguration.enabledForOperators,
        model: nextConfiguration.model,
        prompt: nextConfiguration.prompt,
      });
      setApiKey("");
      setShowApiKey(false);
      setConfirmingRemoval(false);
      setLegacyConfigurationFound(false);
      clearLegacyConfiguration(companyScopeId, userId);
      if (options.removeCredential) {
        setAnnouncement("Credencial removida.");
        toast.success("Credencial da empresa removida.");
      } else {
        setAnnouncement("Configuração salva.");
        toast.success("Configuração de IA salva para a empresa.");
      }
    } catch (cause) {
      if (requestSequence.current !== requestId) return;
      setError(toUiError(cause, "Não foi possível salvar a configuração de IA."));
      setAnnouncement("Configuração não salva.");
    } finally {
      if (requestSequence.current === requestId) setSaving(false);
    }
  }

  function updateForm<Key extends keyof ConfigurationForm>(
    key: Key,
    value: ConfigurationForm[Key],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setError(null);
    setConfirmingRemoval(false);
  }

  if (loading) return <ConfigurationSkeleton />;

  if (error && !form) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <h2 className="mt-3 text-base font-semibold">Configuração indisponível</h2>
          <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => void refreshConfiguration()}>
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!form || !configured || !status) return null;

  return (
    <div className="min-w-0 space-y-4">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <section className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">
              Inteligência configurada por empresa
            </h2>
            <p className="mt-0.5 max-w-3xl text-sm leading-5 text-muted-foreground">
              A chave e a diretriz ficam no servidor do frontend. Admin e operador recebem somente o botão de análise quando autorizados.
            </p>
          </div>
        </div>
        <ConfigurationStatus configuration={configured} />
      </section>

      {legacyConfigurationFound ? (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/70 p-3 text-xs leading-5 text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/[0.07] dark:text-blue-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            A configuração que estava neste navegador foi recuperada. Clique em <strong>Salvar configuração</strong> para migrá-la ao escopo empresarial.
          </p>
        </div>
      ) : null}

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader className="border-b border-border p-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 text-primary" />
                Credencial e modelo
              </CardTitle>
              <CardDescription>
                A credencial é write-only: depois de salva, nunca volta para o navegador.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.38fr)]">
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <Label htmlFor="ai-insights-api-key">Chave da API OpenAI</Label>
                  {configured.configured ? (
                    <Badge variant="success" className="shrink-0">
                      Configurada · {configured.credentialFingerprint ?? "protegida"}
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="shrink-0">Pendente</Badge>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="ai-insights-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setError(null);
                      setConfirmingRemoval(false);
                    }}
                    autoComplete="off"
                    autoCapitalize="none"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    spellCheck={false}
                    maxLength={512}
                    disabled={saving}
                    aria-invalid={Boolean(apiKeyError)}
                    aria-describedby="ai-insights-api-key-help"
                    className="pr-10 font-mono"
                    placeholder={configured.configured ? "Digite somente para substituir" : "sk-proj-…"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8 text-muted-foreground"
                    onClick={() => setShowApiKey((current) => !current)}
                    disabled={!apiKey || saving}
                    aria-label={showApiKey ? "Ocultar chave da API" : "Mostrar chave da API"}
                    aria-pressed={showApiKey}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p id="ai-insights-api-key-help" className="text-[11px] leading-4 text-muted-foreground">
                  Deixe vazio para manter a chave atual. Uma nova chave substitui a anterior somente ao salvar.
                </p>
                {apiKeyError ? (
                  <p className="text-[11px] leading-4 text-destructive" role="alert">{apiKeyError}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-insights-model">Modelo</Label>
                <Select
                  value={form.model}
                  onValueChange={(value) => updateForm("model", value)}
                  disabled={saving}
                >
                  <SelectTrigger id="ai-insights-model" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {status.allowedModels.map((allowedModel) => (
                      <SelectItem key={allowedModel} value={allowedModel}>
                        {allowedModel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  O modelo vale para todas as análises desta empresa.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border p-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bot className="h-4 w-4 text-primary" />
                Diretriz da análise
              </CardTitle>
              <CardDescription>
                Este prompt roda por trás do botão. O usuário final não pode visualizá-lo nem alterá-lo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <Label htmlFor="ai-insights-prompt">Prompt empresarial</Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {form.prompt.length}/{AI_INSIGHTS_CONFIGURATION_LIMITS.prompt}
                  </span>
                </div>
                <Textarea
                  id="ai-insights-prompt"
                  value={form.prompt}
                  onChange={(event) => updateForm("prompt", event.target.value)}
                  maxLength={AI_INSIGHTS_CONFIGURATION_LIMITS.prompt}
                  disabled={saving}
                  className="min-h-[180px] resize-y leading-5"
                  placeholder={DEFAULT_AI_INSIGHTS_PROMPT}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <Label htmlFor="ai-insights-constraints">Restrições operacionais</Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {form.constraints.length}/{AI_INSIGHTS_CONFIGURATION_LIMITS.constraints}
                  </span>
                </div>
                <Textarea
                  id="ai-insights-constraints"
                  value={form.constraints}
                  onChange={(event) => updateForm("constraints", event.target.value)}
                  maxLength={AI_INSIGHTS_CONFIGURATION_LIMITS.constraints}
                  disabled={saving}
                  className="min-h-[96px] resize-y leading-5"
                  placeholder="Ex.: respeitar capacidade, orçamento e equipe atual; priorizar testes de baixo risco."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-4">
          <Card>
            <CardHeader className="border-b border-border p-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Disponibilidade do botão
              </CardTitle>
              <CardDescription>
                Defina quais papéis podem solicitar insights. O acesso ao módulo continua obrigatório.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <RoleAccessToggle
                checked={form.enabledForAdmins}
                description="Usuários administradores da empresa."
                disabled={saving}
                icon={UserCog}
                label="Administradores"
                onChange={(checked) => updateForm("enabledForAdmins", checked)}
              />
              <RoleAccessToggle
                checked={form.enabledForOperators}
                description="Usuários de leitura, sem acesso a configurações."
                disabled={saving}
                icon={Users}
                label="Operadores"
                onChange={(checked) => updateForm("enabledForOperators", checked)}
              />
              <div className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                <p className="font-medium text-foreground">Experiência do usuário</p>
                <p className="mt-1">
                  Quando habilitado, aparece somente o ícone de IA na barra da tela. Ao clicar, o resultado abre ali mesmo; chave, prompt e modelo permanecem ocultos.
                </p>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-xs leading-5 text-destructive" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          <Button
            type="button"
            className="w-full"
            onClick={() => void saveConfiguration()}
            disabled={saving || Boolean(apiKeyError) || !form.prompt.trim()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando…" : "Salvar configuração"}
          </Button>

          {configured.configured ? (
            confirmingRemoval ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
                <p className="text-xs leading-5 text-destructive">
                  A remoção oculta imediatamente o botão para todos e interrompe novas análises desta empresa.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void saveConfiguration({ removeCredential: true })}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" />
                    Confirmar remoção
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingRemoval(false)} disabled={saving}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmingRemoval(true)}
                disabled={saving}
              >
                <Trash2 className="h-4 w-4" />
                Remover credencial
              </Button>
            )
          ) : null}

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-3 text-[11px] leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Persistência provisória no servidor local do frontend, isolada por empresa e cifrada em repouso. A chave nunca é retornada pela API nem enviada ao operador.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigurationStatus({
  configuration,
}: {
  configuration: AiInsightsAdminConfiguration;
}) {
  if (!configuration.configured) {
    return (
      <Badge variant="warning" className="h-8 shrink-0 gap-2 px-3">
        <AlertTriangle className="h-3.5 w-3.5" />
        Credencial pendente
      </Badge>
    );
  }
  const enabledRoles = [
    configuration.enabledForAdmins ? "admin" : "",
    configuration.enabledForOperators ? "operador" : "",
  ].filter(Boolean);
  return (
    <Badge variant="success" className="h-8 shrink-0 gap-2 px-3">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {enabledRoles.length ? `Ativa para ${enabledRoles.join(" e ")}` : "Configurada · acesso desativado"}
    </Badge>
  );
}

function RoleAccessToggle({
  checked,
  description,
  disabled,
  icon: Icon,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-primary/30 bg-primary/[0.045]" : "border-border bg-card hover:bg-muted/25",
      )}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", checked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{description}</span>
      </span>
      <span className={cn("flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors", checked ? "bg-primary" : "bg-muted-foreground/25")} aria-hidden="true">
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full bg-white text-primary shadow-sm transition-transform", checked && "translate-x-5")}>
          {checked ? <Check className="h-3 w-3" /> : null}
        </span>
      </span>
    </button>
  );
}

function ConfigurationSkeleton() {
  return (
    <div className="space-y-4" aria-label="Carregando configuração de IA" aria-busy="true">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

function findLegacyPrompt(companyId: string, userId: string) {
  for (const scope of LEGACY_PROMPT_SCOPES) {
    const prompt = loadAiInsightsLocalPrompt({
      companyId,
      module: scope.module,
      surface: scope.surface,
      userId,
    });
    if (prompt) return prompt;
  }
  return null;
}

function clearLegacyConfiguration(companyId: string, userId: string) {
  clearAiInsightsLocalApiKey({ companyId, userId });
  for (const scope of LEGACY_PROMPT_SCOPES) {
    clearAiInsightsLocalPrompt({
      companyId,
      module: scope.module,
      surface: scope.surface,
      userId,
    });
  }
}

function toUiError(error: unknown, fallback: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}
