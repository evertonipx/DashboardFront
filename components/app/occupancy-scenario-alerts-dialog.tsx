"use client";

import * as React from "react";
import { Bell, RefreshCw } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { requireOccupancyAlertRows } from "@/lib/occupancy-validation";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import type { OccupancyAlertRow, OccupancyScenario } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";

const PAGE_SIZE = 20;

type AlertKind = "all" | "min" | "max";

export function OccupancyScenarioAlertsDialog({
  companyId,
  onClose,
  scenario,
  timeZone,
}: {
  companyId: string;
  onClose: () => void;
  scenario: OccupancyScenario;
  timeZone: string;
}) {
  const [alerts, setAlerts] = React.useState<OccupancyAlertRow[]>([]);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [kind, setKind] = React.useState<AlertKind>("all");
  const [limit, setLimit] = React.useState(100);
  const [page, setPage] = React.useState(0);
  const [refreshVersion, setRefreshVersion] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();

    async function loadAlerts() {
      setLoading(true);
      setError("");
      try {
        if (!companyId || scenario.company_id !== companyId) {
          throw new Error("Cenário fora da empresa selecionada.");
        }
        const response = await apiFetch<unknown>(
          `/occupancy/scenarios/${encodeURIComponent(scenario.id)}/alerts?limit=${limit}`,
          {
            bypassReadCache: true,
            companyScopeId: companyId,
            signal: controller.signal,
          },
        );
        const rows = requireOccupancyAlertRows(
          response,
          scenario.id,
          scenario.object_class,
        );
        if (controller.signal.aborted) return;
        setAlerts(
          [...rows].sort(
            (left, right) =>
              new Date(right.triggered_at ?? 0).getTime() -
                new Date(left.triggered_at ?? 0).getTime() ||
              right.id - left.id,
          ),
        );
      } catch (requestError) {
        if (isAbortError(requestError, controller.signal) || controller.signal.aborted) {
          return;
        }
        setAlerts([]);
        setError("Não foi possível consultar os alertas deste cenário.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAlerts();
    return () => abortRequest(controller, "Consulta de alertas encerrada.");
  }, [companyId, limit, refreshVersion, scenario.company_id, scenario.id, scenario.object_class]);

  const filteredAlerts = React.useMemo(
    () =>
      kind === "all"
        ? alerts
        : alerts.filter((alert) => alert.threshold_kind === kind),
    [alerts, kind],
  );
  const pageCount = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleAlerts = filteredAlerts.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]">
            <Bell className="h-4 w-4 shrink-0" />
            Alertas de {scenario.name}
          </DialogTitle>
          <DialogDescription>
            Registros de acionamento dos limites mínimo e máximo do cenário.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
          <Select
            value={String(limit)}
            onValueChange={(value) => {
              setPage(0);
              setLimit(Number(value));
            }}
          >
            <SelectTrigger aria-label="Quantidade de alertas a consultar" className="min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100">Até 100 registros</SelectItem>
              <SelectItem value="500">Até 500 registros</SelectItem>
              <SelectItem value="1000">Até 1.000 registros</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={kind}
            onValueChange={(value) => {
              setPage(0);
              setKind(value as AlertKind);
            }}
          >
            <SelectTrigger aria-label="Filtrar alertas por limite" className="min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os limites</SelectItem>
              <SelectItem value="min">Limite mínimo</SelectItem>
              <SelectItem value="max">Limite máximo</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRefreshVersion((current) => current + 1)}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        <div className="min-w-0 max-h-[55dvh] space-y-2 overflow-y-auto rounded-md border p-2" aria-busy={loading}>
          {loading ? (
            Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))
          ) : error ? (
            <div className="px-3 py-8 text-center text-sm text-destructive" role="alert">
              {error}
            </div>
          ) : visibleAlerts.length ? (
            visibleAlerts.map((alert) => (
              <div key={alert.id} className="min-w-0 rounded-md border bg-muted/20 p-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge variant={alert.threshold_kind === "min" ? "warning" : "destructive"}>
                    {alert.threshold_kind === "min" ? "Mínimo" : "Máximo"}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums">
                    Registrado: {formatNumber(alert.total_value)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Limite: {formatNumber(alert.threshold_value)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(alert.triggered_at, timeZone)}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {alerts.length
                ? "Nenhum alerta desse tipo entre os registros carregados."
                : "Nenhum alerta registrado para este cenário."}
            </div>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {!loading && !error ? `${filteredAlerts.length} de ${alerts.length} registros carregados` : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {!loading && !error && pageCount > 1 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={currentPage === 0}
                >
                  Anterior
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {currentPage + 1} / {pageCount}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                  disabled={currentPage >= pageCount - 1}
                >
                  Próxima
                </Button>
              </>
            ) : null}
            <Button type="button" onClick={onClose}>Fechar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
