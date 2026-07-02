"use client";

import * as React from "react";
import { Copy, ExternalLink, Link2, MonitorUp, RefreshCw } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  filterScopedApiRows,
  getStoredMasterCompanyScope,
  useEffectiveCompanyScopeId,
} from "@/lib/master-company-scope";
import { apiFetch } from "@/lib/api";
import type { Scenario } from "@/lib/types";

const viewOptions = [
  {
    description: "Comparativo do acumulado do dia entre cenários cadastrados.",
    label: "Hoje por cenário",
    value: "today-scenario",
  },
  {
    description: "Comparativo do acumulado do dia entre locais cadastrados.",
    label: "Hoje por local",
    value: "today-location",
  },
  {
    description: "Comparativo do acumulado do dia entre sublocais cadastrados.",
    label: "Hoje por sublocal",
    value: "today-sub-location",
  },
  {
    description: "Hora a hora do dia atual para um cenário específico.",
    label: "Hora a hora por cenário",
    value: "scenario-hour",
  },
] as const;

export function ViewsManager() {
  const { user } = useAuth();
  const companyScopeId = useEffectiveCompanyScopeId(user);
  const [origin, setOrigin] = React.useState("");
  const [chart, setChart] = React.useState<(typeof viewOptions)[number]["value"]>(
    "today-scenario",
  );
  const [title, setTitle] = React.useState("Hoje por cenário");
  const [scenarios, setScenarios] = React.useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = React.useState("");
  const [loadingScenarios, setLoadingScenarios] = React.useState(false);
  const selectedView = viewOptions.find((option) => option.value === chart);
  const selectedScenario = scenarios.find(
    (scenario) => scenario.id === selectedScenarioId,
  );
  const masterScope = getStoredMasterCompanyScope();
  const generatedUrl = React.useMemo(() => {
    if (!origin) return "";

    const params = new URLSearchParams({
      chart,
      refresh: "5",
    });
    if (title.trim()) params.set("title", title.trim());
    if (companyScopeId) {
      params.set("company_id", companyScopeId);
    }
    if (chart === "scenario-hour" && selectedScenarioId) {
      params.set("scope_id", selectedScenarioId);
    }

    return `${origin}/views/live?${params.toString()}`;
  }, [chart, companyScopeId, origin, selectedScenarioId, title]);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    async function loadScenarios() {
      setLoadingScenarios(true);
      try {
        const rows = await apiFetch<Scenario[]>("/scenarios", {
          headers: companyScopeId
            ? ({ "X-Company-ID": companyScopeId } satisfies HeadersInit)
            : undefined,
        });
        const scopedRows = filterScopedApiRows(rows, companyScopeId);
        setScenarios(scopedRows);
        setSelectedScenarioId((current) =>
          current && scopedRows.some((scenario) => scenario.id === current)
            ? current
            : scopedRows[0]?.id ?? "",
        );
      } catch {
        setScenarios([]);
        setSelectedScenarioId("");
      } finally {
        setLoadingScenarios(false);
      }
    }

    loadScenarios();
  }, [companyScopeId]);

  function updateChart(value: (typeof viewOptions)[number]["value"]) {
    setChart(value);
    const nextView = viewOptions.find((option) => option.value === value);
    if (nextView) setTitle(nextView.label);
  }

  async function copyUrl() {
    if (!generatedUrl) return;

    try {
      await navigator.clipboard.writeText(generatedUrl);
      toast.success("URL copiada.");
    } catch {
      toast.error("Não foi possível copiar a URL.");
    }
  }

  function openUrl() {
    if (!generatedUrl) return;
    window.open(generatedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorUp className="h-4 w-4 text-primary" />
              Gerador de visão
            </CardTitle>
            <CardDescription>
              Configure uma URL autenticada para exibir somente o gráfico em tela
              inteira do conteúdo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Visão">
                <Select
                  value={chart}
                  onValueChange={(value) =>
                    updateChart(value as (typeof viewOptions)[number]["value"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {viewOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Título da visão">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={selectedView?.label}
                />
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {chart === "scenario-hour" ? (
                <FormField label="Cenário">
                  <Select
                    value={selectedScenarioId}
                    onValueChange={setSelectedScenarioId}
                    disabled={loadingScenarios || !scenarios.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cenário" />
                    </SelectTrigger>
                    <SelectContent>
                      {scenarios.map((scenario) => (
                        <SelectItem key={scenario.id} value={scenario.id}>
                          {scenario.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              ) : (
                <FormField label="Cenário">
                  <Input readOnly value="Não se aplica a este gráfico" />
                </FormField>
              )}

              <FormField label="Atualização automática">
                <Select value="5" onValueChange={() => undefined}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 segundos</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Empresa usada">
                <Input
                  readOnly
                  value={
                    masterScope?.name ||
                    user?.company_name ||
                    user?.company?.name ||
                    companyScopeId ||
                    "Empresa do login"
                  }
                />
              </FormField>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Autenticada</Badge>
                <Badge variant="outline">Sem sidebar</Badge>
                <Badge variant="outline">100vw x 100vh</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Essa URL usa a sessão do navegador. Se abrir sem login ativo, o
                sistema redireciona para o login antes de mostrar o gráfico.
              </p>
            </div>

            <FormField label="URL gerada">
              <Textarea
                readOnly
                className="min-h-[110px] font-mono text-xs"
                value={generatedUrl}
              />
            </FormField>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={copyUrl} disabled={!generatedUrl}>
                <Copy className="h-4 w-4" />
                Copiar URL
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openUrl}
                disabled={!generatedUrl}
              >
                <ExternalLink className="h-4 w-4" />
                Abrir visão
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Resumo
            </CardTitle>
            <CardDescription>Parâmetros enviados na URL.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryRow label="Gráfico" value={selectedView?.label ?? chart} />
            <SummaryRow
              label="Descrição"
              value={selectedView?.description ?? "Visão configurada."}
            />
            <SummaryRow
              label="Atualização"
              value="A cada 5 segundos"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            />
            {chart === "scenario-hour" ? (
              <SummaryRow
                label="Cenário"
                value={selectedScenario?.name ?? "Nenhum cenário selecionado"}
              />
            ) : null}
            <SummaryRow
              label="company_id"
              value={companyScopeId || "Empresa do usuário logado"}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
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

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}
