"use client";

import * as React from "react";
import {
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Undo2,
} from "lucide-react";

import { useWidgetColor } from "@/components/app/widget-appearance";
import { useTheme } from "@/components/app/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  createOccupancyHexEditorState,
  isOccupancyHexEditorStateDirty,
  OCCUPANCY_HEX_EDITOR_MAX_CAPACITY,
  occupancyHexEditorReducer,
  validateOccupancyHexEditorDocument,
  type OccupancyHexEditorDocument,
} from "@/lib/occupancy-hex-editor-state";
import {
  arrangeOccupancyHexLayout,
  bindOccupancyHexScenariosToAvailableCells,
  createDefaultOccupancyHexLayout,
  expandOccupancyHexLayout,
  moveOccupancyHexCell,
  OCCUPANCY_HEX_MAX_CELLS,
  OCCUPANCY_HEX_MAX_COLUMNS,
  OCCUPANCY_HEX_MAX_ROWS,
  OCCUPANCY_HEX_MIN_COLUMNS,
  recommendedOccupancyHexColumns,
  reflowOccupancyHexLayout,
  type OccupancyHexLayout,
  type OccupancyHexLayoutCell,
  type OccupancyLayoutPreset,
} from "@/lib/occupancy-hex-layout";
import {
  getOccupancyHexPalette,
  occupancyHexDisplayRadiusRatio,
  occupancyHexTextColor,
  occupancyHexValueColor,
  type OccupancyHexPalette,
  type OccupancyHexSemanticColors,
} from "@/lib/occupancy-hex-palette";
import {
  buildOccupancyHexVisualScale,
  type OccupancyHexVisualEntry,
  type OccupancyHexVisualState,
} from "@/lib/occupancy-hex-visual";
import {
  classifyOccupancyTotal,
  normalizeOccupancyCapacity,
} from "@/lib/occupancy-comparison";
import type {
  OccupancyHexDisplayMode,
  OccupancyWidgetSettings,
} from "@/lib/occupancy-widget-settings";
import type { OccupancyScenario } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

type Snapshot = {
  scenarioId: string;
  total: number | null;
};

export function OccupancyHexLayoutEditor({
  capacities,
  defaultScenarioIds,
  displayMode = "actual",
  fallbackColor,
  legacyColumns,
  legacyPreset,
  layout,
  onSave,
  scenarios,
  semanticColors,
  snapshots,
}: {
  capacities: Record<string, number>;
  defaultScenarioIds: string[];
  displayMode?: OccupancyHexDisplayMode;
  fallbackColor?: string;
  legacyColumns: number;
  legacyPreset: OccupancyLayoutPreset;
  layout: OccupancyHexLayout | null;
  onSave: (patch: Partial<OccupancyWidgetSettings>) => boolean;
  scenarios: OccupancyScenario[];
  semanticColors?: OccupancyHexSemanticColors;
  snapshots: Snapshot[];
}) {
  const widgetColor = useWidgetColor(fallbackColor);
  const { effectiveTheme } = useTheme();
  const hexPalette = React.useMemo(
    () => getOccupancyHexPalette(effectiveTheme, widgetColor, semanticColors),
    [effectiveTheme, semanticColors, widgetColor],
  );
  const [open, setOpen] = React.useState(false);
  const initialLayout = React.useMemo(
    () =>
      resolveEditorLayout(
        layout,
        defaultScenarioIds,
        legacyColumns,
        legacyPreset,
      ),
    [defaultScenarioIds, layout, legacyColumns, legacyPreset],
  );
  const [history, dispatchHistory] = React.useReducer(
    occupancyHexEditorReducer,
    { capacities, layout: initialLayout },
    createOccupancyHexEditorState,
  );
  const draft = history.present.layout;
  const draftCapacities = history.present.capacities;
  const [selectedCellId, setSelectedCellId] = React.useState<string | null>(
    initialLayout.cells[0]?.id ?? null,
  );
  const [movingCellId, setMovingCellId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [sidebarTab, setSidebarTab] = React.useState("cell");
  const [scenarioQuery, setScenarioQuery] = React.useState("");
  const [canvasScale, setCanvasScale] = React.useState(1);
  const [batchTarget, setBatchTarget] = React.useState("40");
  const [batchPrefix, setBatchPrefix] = React.useState("Caixa");
  const [batchColumns, setBatchColumns] = React.useState(8);
  const [panning, setPanning] = React.useState(false);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const panRef = React.useRef<{
    left: number;
    pointerId: number;
    top: number;
    x: number;
    y: number;
  } | null>(null);
  const presetSelectId = React.useId();

  const scenarioById = React.useMemo(
    () => new Map(scenarios.map((scenario) => [scenario.id, scenario])),
    [scenarios],
  );
  const totalByScenario = React.useMemo(
    () => new Map(snapshots.map((snapshot) => [snapshot.scenarioId, snapshot.total])),
    [snapshots],
  );
  const cellByCoordinate = React.useMemo(
    () =>
      new Map(
        draft.cells.map((cell) => [coordinateKey(cell.column, cell.row), cell]),
      ),
    [draft.cells],
  );
  const selectedCell = draft.cells.find((cell) => cell.id === selectedCellId);
  const linkedCellByScenarioId = React.useMemo(
    () =>
      new Map(
        draft.cells.flatMap((cell) =>
          cell.scenarioId ? [[cell.scenarioId, cell] as const] : [],
        ),
      ),
    [draft.cells],
  );
  const boundScenarioIds = new Set(
    draft.cells.flatMap((cell) => (cell.scenarioId ? [cell.scenarioId] : [])),
  );
  const missingScenarioIds = defaultScenarioIds.filter(
    (scenarioId) => !boundScenarioIds.has(scenarioId),
  );
  const dirty = isOccupancyHexEditorStateDirty(history);
  const validation = React.useMemo(
    () =>
      validateOccupancyHexEditorDocument(history.present, {
        availableScenarioIds: scenarios.map((scenario) => scenario.id),
      }),
    [history.present, scenarios],
  );
  const visualScale = React.useMemo(
    () =>
      buildOccupancyHexVisualScale(
        draft.cells.map((cell) => {
          const scenario = cell.scenarioId
            ? scenarioById.get(cell.scenarioId)
            : undefined;
          const total = scenario
            ? totalByScenario.get(scenario.id) ?? null
            : null;
          const state = editorCellState(cell, scenario, total);
          return {
            capacity: scenario
              ? normalizeOccupancyCapacity(
                  draftCapacities[scenario.id],
                  scenario,
                )
              : null,
            cellId: cell.id,
            state,
            total,
          };
        }),
      ),
    [draft.cells, draftCapacities, scenarioById, totalByScenario],
  );
  const visualEntryByCellId = React.useMemo(
    () => new Map(visualScale.entries.map((entry) => [entry.cellId, entry])),
    [visualScale.entries],
  );
  const filteredScenarios = React.useMemo(() => {
    const query = scenarioQuery.trim().toLocaleLowerCase("pt-BR");
    return query
      ? scenarios.filter((scenario) =>
          scenario.name.toLocaleLowerCase("pt-BR").includes(query),
        )
      : scenarios;
  }, [scenarioQuery, scenarios]);

  function commitDocument(
    layout: OccupancyHexLayout,
    nextCapacities: Record<string, number> = draftCapacities,
  ) {
    const document: OccupancyHexEditorDocument = {
      capacities: nextCapacities,
      layout,
    };
    dispatchHistory({
      document,
      type: "commit",
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const nextLayout = cloneLayout(initialLayout);
      dispatchHistory({
        document: { capacities: { ...capacities }, layout: nextLayout },
        type: "reset",
      });
      setSelectedCellId(nextLayout.cells[0]?.id ?? null);
      setMovingCellId(null);
      setSidebarTab("cell");
      setScenarioQuery("");
      setCanvasScale(1);
      setBatchTarget(String(Math.max(40, nextLayout.cells.length)));
      setBatchPrefix("Posição");
      setBatchColumns(
        recommendedOccupancyHexColumns(Math.max(40, nextLayout.cells.length)),
      );
      setPanning(false);
      panRef.current = null;
      setAnnouncement("");
    } else if (
      open &&
      dirty &&
      !window.confirm("Descartar as alterações ainda não salvas do layout?")
    ) {
      return;
    }
    setOpen(nextOpen);
  }

  function updateDimensions(columns: number, rows: number) {
    const next = reflowOccupancyHexLayout(
      { ...draft, preset: "custom" },
      { columns, rows },
    );
    commitDocument(next);
    setAnnouncement(
      next.columns === columns && next.rows === rows
        ? `Layout redimensionado para ${next.columns} colunas e ${next.rows} linhas.`
        : `Dimensão ajustada para ${next.columns} colunas e ${next.rows} linhas, o mínimo necessário para preservar todas as células.`,
    );
  }

  function moveCell(cellId: string, column: number, row: number) {
    const source = draft.cells.find((cell) => cell.id === cellId);
    const target = draft.cells.find(
      (cell) => cell.column === column && cell.row === row,
    );
    const next = moveOccupancyHexCell(draft, cellId, column, row);
    if (next === draft) return;
    commitDocument(next);
    setSelectedCellId(cellId);
    setMovingCellId(null);
    setSidebarTab("cell");
    requestCellFocus(cellId);
    setAnnouncement(
      target && source
        ? `Células trocadas entre linha ${source.row + 1}, coluna ${source.column + 1} e linha ${row + 1}, coluna ${column + 1}.`
        : `Célula movida para linha ${row + 1}, coluna ${column + 1}.`,
    );
  }

  function addCell({
    column,
    row,
    scenarioId = null,
  }: {
    column?: number;
    row?: number;
    scenarioId?: string | null;
  } = {}) {
    const linkedCell = scenarioId
      ? linkedCellByScenarioId.get(scenarioId)
      : undefined;
    if (linkedCell) {
      selectCell(linkedCell.id);
      return;
    }
    const result = appendEmptyCell(draft, column, row, scenarioId);
    if (!result.cellId) {
      setAnnouncement("Não há posição disponível para adicionar outra célula.");
      return;
    }
    commitDocument(result.layout);
    setSelectedCellId(result.cellId);
    setMovingCellId(null);
    setSidebarTab("cell");
    requestCellFocus(result.cellId);
    setAnnouncement(
      scenarioId
        ? "Cenário adicionado ao layout em uma nova célula."
        : "Nova célula reservada adicionada ao layout.",
    );
  }

  function removeSelectedCell() {
    if (!selectedCellId) return;
    const remainingCells = draft.cells.filter(
      (cell) => cell.id !== selectedCellId,
    );
    const nextSelectedId = remainingCells[0]?.id ?? null;
    commitDocument({
      ...draft,
      cells: remainingCells,
      preset: "custom",
    });
    setSelectedCellId(nextSelectedId);
    setMovingCellId(null);
    setAnnouncement("Célula removida do layout. Use Desfazer para restaurá-la.");
    if (nextSelectedId) requestCellFocus(nextSelectedId);
  }

  function updateSelectedCell(
    patch: Partial<Pick<OccupancyHexLayoutCell, "label" | "scenarioId">>,
  ) {
    if (!selectedCellId) return;
    const requestedScenarioId = patch.scenarioId;
    const selected = draft.cells.find((cell) => cell.id === selectedCellId);
    const displacedScenarioId = selected?.scenarioId ?? null;
    commitDocument({
      ...draft,
      cells: draft.cells.map((cell) => {
        if (
          requestedScenarioId &&
          cell.id !== selectedCellId &&
          cell.scenarioId === requestedScenarioId
        ) {
          return { ...cell, scenarioId: displacedScenarioId };
        }
        return cell.id === selectedCellId ? { ...cell, ...patch } : cell;
      }),
    });
    if (patch.scenarioId !== undefined) {
      setAnnouncement(
        patch.scenarioId
          ? "Cenário vinculado; um vínculo anterior foi trocado quando necessário."
          : "Vínculo do cenário removido.",
      );
    }
  }

  function fillMissingScenarios() {
    const result = bindOccupancyHexScenariosToAvailableCells({
      layout: draft,
      scenarioIds: missingScenarioIds,
    });
    if (!result.bound) {
      setAnnouncement("Nenhum cenário pôde ser adicionado ao layout.");
      return;
    }
    commitDocument(result.layout);
    setAnnouncement(
      result.skipped
        ? `${result.bound} cenários vinculados; ${result.skipped} excederam o limite seguro do layout.`
        : `${result.bound} cenários vinculados em lote${result.created ? `; ${result.created} novas posições foram criadas` : " usando as posições reservadas"}.`,
    );
  }

  function createBatch({
    columns,
    prefix,
    target,
  }: {
    columns: number;
    prefix: string;
    target: number;
  }) {
    if (
      !Number.isSafeInteger(target) ||
      target < 1 ||
      target > OCCUPANCY_HEX_MAX_CELLS
    ) {
      setAnnouncement(
        `Informe um total entre 1 e ${formatNumber(OCCUPANCY_HEX_MAX_CELLS)} posições.`,
      );
      return;
    }
    const result = expandOccupancyHexLayout({
      columns,
      labelPrefix: prefix,
      layout: draft,
      targetCellCount: target,
    });
    if (!result.added && result.layout.columns === draft.columns) {
      setAnnouncement(
        draft.cells.length >= target
          ? `O layout já possui ${formatNumber(draft.cells.length)} posições; nenhuma célula foi removida.`
          : "Nenhuma posição foi adicionada.",
      );
      return;
    }
    commitDocument(result.layout);
    setSelectedCellId(result.layout.cells.at(-1)?.id ?? selectedCellId);
    setMovingCellId(null);
    setCanvasScale(
      result.layout.cells.length > 240
        ? 0.5
        : result.layout.cells.length > 96
          ? 0.65
          : 0.8,
    );
    setAnnouncement(
      result.added
        ? `${formatNumber(result.added)} posições adicionadas em uma única alteração. Layout com ${result.layout.columns} colunas e ${result.layout.rows} linhas.`
        : `Layout reorganizado para ${result.layout.columns} colunas sem remover posições.`,
    );
  }

  function selectCell(cellId: string) {
    setSelectedCellId(cellId);
    setMovingCellId(null);
    setSidebarTab("cell");
    requestCellFocus(cellId);
  }

  function undo() {
    if (!history.past.length) return;
    dispatchHistory({ type: "undo" });
    setMovingCellId(null);
    setAnnouncement("Última alteração desfeita.");
  }

  function redo() {
    if (!history.future.length) return;
    dispatchHistory({ type: "redo" });
    setMovingCellId(null);
    setAnnouncement("Alteração refeita.");
  }

  function fitCanvas() {
    const availableWidth = Math.max(
      240,
      (canvasRef.current?.clientWidth ?? 640) - 40,
    );
    const naturalWidth =
      draft.columns * 96 + (draft.preset === "queue" ? 0 : 56);
    const availableHeight = Math.max(
      260,
      (canvasRef.current?.clientHeight ?? 480) - 40,
    );
    const naturalHeight = draft.rows * 104;
    const ratio = Math.min(
      availableWidth / naturalWidth,
      availableHeight / naturalHeight,
    );
    setCanvasScale(
      ratio >= 1.1
        ? 1.2
        : ratio >= 0.9
          ? 1
          : ratio >= 0.725
            ? 0.8
            : ratio >= 0.575
              ? 0.65
              : ratio >= 0.425
                ? 0.5
                : 0.35,
    );
    setAnnouncement("Visualização ajustada à largura do canvas.");
  }

  function zoomCanvas(direction: -1 | 1) {
    const levels = [0.35, 0.5, 0.65, 0.8, 1, 1.2];
    const currentIndex = levels.findIndex((level) => level >= canvasScale);
    const nextIndex = Math.min(
      levels.length - 1,
      Math.max(0, (currentIndex < 0 ? levels.length - 1 : currentIndex) + direction),
    );
    setCanvasScale(levels[nextIndex]);
  }

  function beginCanvasPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 1) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    panRef.current = {
      left: canvas.scrollLeft,
      pointerId: event.pointerId,
      top: canvas.scrollTop,
      x: event.clientX,
      y: event.clientY,
    };
    canvas.setPointerCapture(event.pointerId);
    setPanning(true);
  }

  function moveCanvasPan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x);
    event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y);
  }

  function endCanvasPan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPanning(false);
  }

  function navigateCell(
    cell: OccupancyHexLayoutCell,
    key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp",
  ) {
    const offset =
      key === "ArrowLeft"
        ? { column: -1, row: 0 }
        : key === "ArrowRight"
          ? { column: 1, row: 0 }
          : key === "ArrowUp"
            ? { column: 0, row: -1 }
            : { column: 0, row: 1 };
    const target = cellByCoordinate.get(
      coordinateKey(cell.column + offset.column, cell.row + offset.row),
    );
    if (target) {
      selectCell(target.id);
      return;
    }
    setAnnouncement("Não há outra célula nessa direção.");
  }

  function requestCellFocus(cellId: string) {
    window.requestAnimationFrame(() => {
      const button = Array.from(
        canvasRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-hex-cell-id]",
        ) ?? [],
      ).find((candidate) => candidate.dataset.hexCellId === cellId);
      button?.focus();
    });
  }

  React.useEffect(() => {
    if (
      selectedCellId &&
      !draft.cells.some((cell) => cell.id === selectedCellId)
    ) {
      setSelectedCellId(draft.cells[0]?.id ?? null);
    }
  }, [draft.cells, selectedCellId]);

  React.useEffect(() => {
    if (!open) return;
    function handleHistoryShortcut(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const wantsRedo =
        (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      if (wantsRedo && history.future.length) {
        event.preventDefault();
        dispatchHistory({ type: "redo" });
        setMovingCellId(null);
        setAnnouncement("Alteração refeita.");
        return;
      }
      if (key === "z" && !event.shiftKey && history.past.length) {
        event.preventDefault();
        dispatchHistory({ type: "undo" });
        setMovingCellId(null);
        setAnnouncement("Última alteração desfeita.");
      }
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [history.future.length, history.past.length, open]);

  function save() {
    if (!dirty || !validation.valid) return;
    const saved = onSave({
      capacities: draftCapacities,
      hexColumns: draft.columns,
      hexLayout: draft,
      hexPreset: draft.preset,
    });
    if (saved) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          Configurar layout
        </Button>
      </DialogTrigger>
      <DialogContent className="grid max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Editor do simulador operacional</DialogTitle>
          <DialogDescription>
            Modele desde pequenas filas até operações com centenas de caixas,
            mesas ou vagas. Crie posições em lote, navegue pelo canvas e
            vincule cenários sem perder o layout existente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden">
          <div className="order-2 flex min-h-[360px] max-h-[52dvh] flex-col gap-3 overflow-hidden lg:order-1 lg:min-h-0 lg:max-h-none">
            <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2">
              <div className="flex h-8 items-center gap-1 rounded-md border bg-background p-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={!history.past.length}
                  onClick={undo}
                  aria-label="Desfazer alteração do layout"
                  title="Desfazer (Ctrl+Z)"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={!history.future.length}
                  onClick={redo}
                  aria-label="Refazer alteração do layout"
                  title="Refazer (Ctrl+Shift+Z)"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs" htmlFor={presetSelectId}>Modelo</Label>
                <Select
                  value={draft.preset}
                  onValueChange={(value) => {
                    const next =
                      value === "custom"
                        ? { ...draft, preset: "custom" as const }
                        : arrangeOccupancyHexLayout(
                            draft,
                            value as OccupancyLayoutPreset,
                          );
                    commitDocument(next);
                    setAnnouncement(
                      value === "custom"
                        ? "Layout mantido como personalizado."
                        : "Modelo aplicado preservando vínculos e rótulos.",
                    );
                  }}
                >
                  <SelectTrigger id={presetSelectId} className="h-8 w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="queue">Filas</SelectItem>
                    <SelectItem value="showcase">Vitrines</SelectItem>
                    <SelectItem value="workstation">Postos de trabalho</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DimensionSelect
                label="Colunas"
                maximum={OCCUPANCY_HEX_MAX_COLUMNS}
                minimum={OCCUPANCY_HEX_MIN_COLUMNS}
                onChange={(columns) => updateDimensions(columns, draft.rows)}
                value={draft.columns}
              />
              <DimensionSelect
                label="Linhas"
                maximum={OCCUPANCY_HEX_MAX_ROWS}
                minimum={1}
                onChange={(rows) => updateDimensions(draft.columns, rows)}
                value={draft.rows}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={draft.cells.length >= OCCUPANCY_HEX_MAX_CELLS}
                onClick={() => addCell()}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Célula
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={
                  !missingScenarioIds.length ||
                  draft.cells.length >= OCCUPANCY_HEX_MAX_CELLS
                }
                onClick={fillMissingScenarios}
              >
                Preencher selecionados ({missingScenarioIds.length})
              </Button>
              <Select
                value={String(canvasScale)}
                onValueChange={(value) => setCanvasScale(Number(value))}
              >
                <SelectTrigger
                  aria-label="Zoom do editor de layout"
                  className="h-8 w-[88px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.35">35%</SelectItem>
                  <SelectItem value="0.5">50%</SelectItem>
                  <SelectItem value="0.65">65%</SelectItem>
                  <SelectItem value="0.8">80%</SelectItem>
                  <SelectItem value="1">100%</SelectItem>
                  <SelectItem value="1.2">120%</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={fitCanvas}
              >
                Ajustar à tela
              </Button>
              <div className="flex h-8 items-center rounded-md border bg-background p-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-base"
                  disabled={canvasScale <= 0.35}
                  onClick={() => zoomCanvas(-1)}
                  aria-label="Reduzir zoom do canvas"
                  title="Reduzir zoom"
                >
                  −
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-base"
                  disabled={canvasScale >= 1.2}
                  onClick={() => zoomCanvas(1)}
                  aria-label="Aumentar zoom do canvas"
                  title="Aumentar zoom"
                >
                  +
                </Button>
              </div>
              <Badge variant="outline">
                {draft.columns} × {draft.rows} · {draft.cells.length}/
                {draft.columns * draft.rows} posições usadas
              </Badge>
              <Badge variant={validation.valid ? "success" : "destructive"}>
                {validation.valid
                  ? validation.warnings.length
                    ? `${validation.warnings.length} alertas`
                    : "Layout válido"
                  : `${validation.errors.length} erros`}
              </Badge>
            </div>

            <div
              ref={canvasRef}
              className={cn(
                "min-h-0 flex-1 overflow-auto rounded-md border p-4",
                panning ? "cursor-grabbing select-none" : "cursor-default",
              )}
              style={{
                backgroundColor: hexPalette.canvas,
                overscrollBehavior: "contain",
              }}
              aria-label="Canvas do layout hexagonal; use as barras, trackpad ou o botão do meio do mouse para navegar"
              onAuxClick={(event) => event.preventDefault()}
              onPointerCancel={endCanvasPan}
              onPointerDown={beginCanvasPan}
              onPointerMove={moveCanvasPan}
              onPointerUp={endCanvasPan}
              onWheel={(event) => {
                if (!event.ctrlKey && !event.metaKey) return;
                event.preventDefault();
                zoomCanvas(event.deltaY > 0 ? -1 : 1);
              }}
            >
              <div
                className="grid"
                style={{
                  gap: `${8 * canvasScale}px`,
                  gridTemplateColumns: `repeat(${draft.columns}, minmax(${Math.round(88 * canvasScale)}px, 1fr))`,
                  minWidth: `${(draft.columns * 96 + (draft.preset === "queue" ? 0 : 56)) * canvasScale}px`,
                }}
              >
                {Array.from({ length: draft.columns * draft.rows }, (_, index) => {
                  const column = index % draft.columns;
                  const row = Math.floor(index / draft.columns);
                  const cell = cellByCoordinate.get(coordinateKey(column, row));
                  return (
                    <div
                      key={cell?.id ?? `${column}:${row}`}
                      className="w-full"
                      style={{
                        contentVisibility: "auto",
                        containIntrinsicSize: `${96 * canvasScale}px`,
                        transform: editorCellOffset(
                          draft.preset,
                          column,
                          row,
                          canvasScale,
                        ),
                      }}
                    >
                      {cell ? (
                        <HexEditorCell
                          cell={cell}
                          displayMode={displayMode}
                          palette={hexPalette}
                          moving={cell.id === movingCellId}
                          onNavigate={(key) => navigateCell(cell, key)}
                          selected={cell.id === selectedCellId}
                          scenario={cell.scenarioId ? scenarioById.get(cell.scenarioId) : undefined}
                          scale={canvasScale}
                          showDetails={canvasScale >= 0.5}
                          total={
                            cell.scenarioId && scenarioById.has(cell.scenarioId)
                              ? totalByScenario.get(cell.scenarioId) ?? null
                              : null
                          }
                          visual={visualEntryByCellId.get(cell.id)}
                          onMove={moveCell}
                          onSelect={(cellId) => {
                            if (movingCellId && movingCellId !== cellId) {
                              moveCell(movingCellId, cell.column, cell.row);
                            } else {
                              setSelectedCellId(cellId);
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          tabIndex={-1}
                          className={cn(
                            "flex w-full items-center justify-center rounded-md border border-dashed text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            movingCellId && "border-primary bg-primary/5 text-primary",
                          )}
                          style={{ height: `${96 * canvasScale}px` }}
                          aria-label={`Posição vazia, linha ${row + 1}, coluna ${column + 1}; ${movingCellId ? "mover célula selecionada para cá" : "adicionar célula"}`}
                          onClick={() =>
                            movingCellId
                              ? moveCell(movingCellId, column, row)
                              : addCell({ column, row })
                          }
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const cellId = event.dataTransfer.getData("text/plain");
                            if (cellId) moveCell(cellId, column, row);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <HexScaleSample displayMode={displayMode} palette={hexPalette} />
                {displayMode === "actual" ? (
                  <>
                    <span>
                      Tamanho = ocupação certificada · escala comum 0–
                      {formatNumber(visualScale.domainMaximum)}
                    </span>
                    <span>Cor = intensidade gradual do valor real</span>
                  </>
                ) : (
                  <span>
                    Leitura binária: ocupado &gt; 0 ou desocupado = 0
                  </span>
                )}
              </div>
              <span>
                Arraste células; use trackpad, barras ou botão do meio para
                navegar; Ctrl + rolagem ajusta o zoom.
              </span>
            </div>
          </div>

          <div className="order-1 min-h-0 overflow-y-auto rounded-md border p-3 lg:order-2">
            <Tabs value={sidebarTab} onValueChange={setSidebarTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="cell">Célula</TabsTrigger>
                <TabsTrigger value="scenarios">
                  Cenários ({scenarios.length})
                </TabsTrigger>
                <TabsTrigger value="batch">Em lote</TabsTrigger>
              </TabsList>
              <TabsContent value="cell" className="mt-4">
                {selectedCell ? (
                  <CellInspector
                    capacities={draftCapacities}
                    cell={selectedCell}
                    layout={draft}
                    moving={selectedCell.id === movingCellId}
                    onCapacityChange={(scenarioId, capacity) => {
                      const next = { ...draftCapacities };
                      if (capacity === null) delete next[scenarioId];
                      else next[scenarioId] = capacity;
                      commitDocument(draft, next);
                    }}
                    onMove={(column, row) =>
                      moveCell(selectedCell.id, column, row)
                    }
                    onToggleMoving={() =>
                      setMovingCellId((current) =>
                        current === selectedCell.id ? null : selectedCell.id,
                      )
                    }
                    onRemove={removeSelectedCell}
                    onUpdate={updateSelectedCell}
                    scenarios={scenarios}
                    total={
                      selectedCell.scenarioId &&
                      scenarioById.has(selectedCell.scenarioId)
                        ? totalByScenario.get(selectedCell.scenarioId) ?? null
                        : null
                    }
                  />
                ) : (
                  <div className="flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground">
                    Selecione uma célula para editar cenário, rótulo, posição e capacidade.
                  </div>
                )}
              </TabsContent>
              <TabsContent value="scenarios" className="mt-4">
                <ScenarioPalette
                  disabled={draft.cells.length >= OCCUPANCY_HEX_MAX_CELLS}
                  linkedCellByScenarioId={linkedCellByScenarioId}
                  onAdd={(scenarioId) => addCell({ scenarioId })}
                  onSelect={selectCell}
                  query={scenarioQuery}
                  scenarios={filteredScenarios}
                  setQuery={setScenarioQuery}
                  totalByScenario={totalByScenario}
                />
              </TabsContent>
              <TabsContent value="batch" className="mt-4">
                <BatchLayoutPanel
                  columns={batchColumns}
                  currentCount={draft.cells.length}
                  onColumnsChange={setBatchColumns}
                  onCreate={createBatch}
                  onPrefixChange={setBatchPrefix}
                  onTargetChange={setBatchTarget}
                  prefix={batchPrefix}
                  target={batchTarget}
                />
              </TabsContent>
            </Tabs>
          </div>
          <p className="sr-only" aria-live="polite">{announcement}</p>
        </div>

        <DialogFooter className="gap-3 sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const restored = cloneLayout(history.baseline.layout);
                commitDocument(restored, { ...history.baseline.capacities });
                setSelectedCellId(restored.cells[0]?.id ?? null);
                setMovingCellId(null);
                setAnnouncement("Layout restaurado ao estado em que o editor foi aberto.");
              }}
              disabled={!dirty}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restaurar abertura
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (
                  Object.keys(draftCapacities).length &&
                  !window.confirm(
                    "Restaurar o padrão também removerá as capacidades personalizadas. Continuar?",
                  )
                ) {
                  return;
                }
                const restored = createDefaultOccupancyHexLayout({
                  columns: legacyColumns,
                  preset: legacyPreset === "custom" ? "queue" : legacyPreset,
                  scenarioIds: defaultScenarioIds,
                });
                commitDocument(restored, {});
                setSelectedCellId(restored.cells[0]?.id ?? null);
                setMovingCellId(null);
                setAnnouncement("Layout e capacidades personalizados restaurados ao padrão.");
              }}
            >
              Restaurar padrão
            </Button>
            </div>
            {!validation.valid ? (
              <p className="max-w-xl text-xs text-destructive" role="alert">
                Corrija antes de salvar: {validation.errors[0]?.message}
                {validation.errors.length > 1
                  ? ` (+${validation.errors.length - 1})`
                  : ""}
              </p>
            ) : validation.warnings.length ? (
              <p className="max-w-xl text-xs text-amber-700 dark:text-amber-300">
                {validation.warnings.length} alerta(s): células reservadas e cenários indisponíveis continuam explícitos no mapa.
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!dirty || !validation.valid}
              onClick={save}
            >
              Salvar layout
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HexEditorCell({
  cell,
  displayMode,
  moving,
  onNavigate,
  onMove,
  onSelect,
  palette,
  scale,
  scenario,
  selected,
  showDetails,
  total,
  visual,
}: {
  cell: OccupancyHexLayoutCell;
  displayMode: OccupancyHexDisplayMode;
  moving: boolean;
  onNavigate: (
    key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp",
  ) => void;
  onMove: (cellId: string, column: number, row: number) => void;
  onSelect: (cellId: string) => void;
  palette: OccupancyHexPalette;
  scale: number;
  scenario?: OccupancyScenario;
  selected: boolean;
  showDetails: boolean;
  total: number | null;
  visual?: OccupancyHexVisualEntry;
}) {
  const state = editorCellState(cell, scenario, total);
  const label =
    cell.label ||
    scenario?.name ||
    (cell.scenarioId ? "Cenário indisponível" : "Sem vínculo");
  const status = editorCellStatus(state, total);
  const radiusRatio =
    occupancyHexDisplayRadiusRatio(visual, displayMode) ?? 0;
  const valueColor = occupancyHexValueColor(visual, palette, displayMode);
  const textColor = occupancyHexTextColor(visual, palette);
  const surface = palette.surfaces[state];
  const outerStroke = moving
    ? "#f59e0b"
    : selected
      ? palette.selectedBorder
      : surface.border;
  return (
    <button
      type="button"
      draggable
      aria-pressed={selected}
      aria-label={`${label}; linha ${cell.row + 1}, coluna ${cell.column + 1}; ${status}`}
      data-hex-cell-id={cell.id}
      tabIndex={selected ? 0 : -1}
      title={label}
      className={cn(
        "relative w-full rounded-xl px-2 text-center text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
        selected && "z-10",
      )}
      style={{
        height: `${96 * scale}px`,
      }}
      onClick={() => onSelect(cell.id)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", cell.id);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData("text/plain");
        if (sourceId) onMove(sourceId, cell.column, cell.row);
      }}
      onKeyDown={(event) => {
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "ArrowUp"
        ) {
          event.preventDefault();
          onNavigate(event.key);
        }
      }}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <polygon
          fill={surface.fill}
          points="25,5 75,5 100,50 75,95 25,95 0,50"
          stroke={outerStroke}
          strokeLinejoin="round"
          strokeWidth={moving || selected ? 2 : 1}
          style={{
            filter: `drop-shadow(0 2px 2px ${palette.outerShadow})`,
            transition: "fill 180ms ease, stroke 180ms ease",
          }}
          vectorEffect="non-scaling-stroke"
        />
        {radiusRatio > 0 && valueColor ? (
          <polygon
            fill={valueColor}
            points="25,5 75,5 100,50 75,95 25,95 0,50"
            stroke={visual?.overCapacity ? palette.overCapacityBorder : "none"}
            strokeLinejoin="round"
            strokeWidth={visual?.overCapacity ? 1.25 : 0}
            style={{
              transform: `scale(${radiusRatio})`,
              transformBox: "fill-box",
              transformOrigin: "center",
              transition: "fill 180ms ease, transform 500ms ease-out",
            }}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {showDetails ? (
        <span className="relative z-10 flex h-full items-center justify-center">
          <span
            className="block max-w-[78%]"
            style={{
              color: textColor,
              textShadow: [
                `-1px -1px 0 ${palette.labelHalo}`,
                `1px -1px 0 ${palette.labelHalo}`,
                `-1px 1px 0 ${palette.labelHalo}`,
                `1px 1px 0 ${palette.labelHalo}`,
              ].join(", "),
            }}
          >
            <span className="block truncate">{label}</span>
            {scale >= 0.65 ? (
              <span className="mt-1 block text-[11px] font-extrabold">
                {state === "occupied" || state === "unoccupied"
                  ? displayMode === "status"
                    ? state === "occupied"
                      ? "OCUPADO"
                      : "DESOCUPADO"
                    : formatNumber(total ?? 0)
                  : status.toLocaleUpperCase("pt-BR")}
              </span>
            ) : null}
          </span>
        </span>
      ) : null}
    </button>
  );
}

function HexScaleSample({
  displayMode,
  palette,
}: {
  displayMode: OccupancyHexDisplayMode;
  palette: OccupancyHexPalette;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        aria-hidden="true"
        className="h-6 w-8 shrink-0"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <polygon
          fill={palette.surfaces.occupied.fill}
          points="25,5 75,5 100,50 75,95 25,95 0,50"
          stroke={palette.surfaces.occupied.border}
          strokeWidth="1"
        />
        <polygon
          fill={
            displayMode === "status"
              ? palette.occupied
              : palette.valueColors[4]
          }
          points="25,5 75,5 100,50 75,95 25,95 0,50"
          style={{
            transform: `scale(${displayMode === "status" ? 0.84 : 0.54})`,
            transformBox: "fill-box",
            transformOrigin: "center",
          }}
        />
      </svg>
      <span>
        {displayMode === "status" ? "Estado operacional" : "Hexbin gradual"}
      </span>
    </span>
  );
}

function BatchLayoutPanel({
  columns,
  currentCount,
  onColumnsChange,
  onCreate,
  onPrefixChange,
  onTargetChange,
  prefix,
  target,
}: {
  columns: number;
  currentCount: number;
  onColumnsChange: (columns: number) => void;
  onCreate: (options: {
    columns: number;
    prefix: string;
    target: number;
  }) => void;
  onPrefixChange: (prefix: string) => void;
  onTargetChange: (target: string) => void;
  prefix: string;
  target: string;
}) {
  const targetInputId = React.useId();
  const prefixInputId = React.useId();
  const parsedTarget = Number(target);
  const validTarget =
    Number.isSafeInteger(parsedTarget) &&
    parsedTarget >= 1 &&
    parsedTarget <= OCCUPANCY_HEX_MAX_CELLS;
  const effectiveTarget = validTarget
    ? Math.max(currentCount, parsedTarget)
    : currentCount;
  const requiredColumns = Math.max(
    columns,
    Math.ceil(effectiveTarget / OCCUPANCY_HEX_MAX_ROWS),
  );
  const estimatedRows = Math.max(
    1,
    Math.ceil(effectiveTarget / requiredColumns),
  );

  function applyTemplate(template: {
    columns: number;
    prefix: string;
    target: number;
  }) {
    onTargetChange(String(template.target));
    onPrefixChange(template.prefix);
    onColumnsChange(template.columns);
    onCreate(template);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Dimensionamento em lote</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Defina o total desejado. A operação adiciona e nomeia as posições em
          uma única etapa; células existentes nunca são excluídas.
        </p>
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-2.5 text-left"
          onClick={() =>
            applyTemplate({ columns: 8, prefix: "Caixa", target: 40 })
          }
        >
          <span>
            <span className="block font-semibold">40 caixas</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              8 colunas · leitura operacional ampla
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-2.5 text-left"
          onClick={() =>
            applyTemplate({ columns: 10, prefix: "Mesa", target: 100 })
          }
        >
          <span>
            <span className="block font-semibold">100 mesas</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              10 colunas · grade compacta
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-2.5 text-left"
          onClick={() =>
            applyTemplate({ columns: 20, prefix: "Vaga", target: 300 })
          }
        >
          <span>
            <span className="block font-semibold">300 vagas</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              20 colunas · densidade automática
            </span>
          </span>
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={targetInputId}>Total de posições</Label>
        <Input
          id={targetInputId}
          type="number"
          inputMode="numeric"
          min={1}
          max={OCCUPANCY_HEX_MAX_CELLS}
          aria-invalid={!validTarget}
          value={target}
          onChange={(event) => onTargetChange(event.target.value)}
        />
        <p
          className={cn(
            "text-xs",
            validTarget ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {validTarget
            ? `Limite seguro: ${formatNumber(OCCUPANCY_HEX_MAX_CELLS)} posições.`
            : `Informe um inteiro entre 1 e ${formatNumber(OCCUPANCY_HEX_MAX_CELLS)}.`}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={prefixInputId}>Prefixo dos novos rótulos</Label>
        <Input
          id={prefixInputId}
          maxLength={60}
          placeholder="Ex.: Vaga"
          value={prefix}
          onChange={(event) => onPrefixChange(event.target.value.slice(0, 60))}
        />
        <p className="text-xs text-muted-foreground">
          Exemplo: {(prefix.trim() || "Posição")} 001.
        </p>
      </div>

      <DimensionSelect
        label="Colunas da grade"
        maximum={OCCUPANCY_HEX_MAX_COLUMNS}
        minimum={OCCUPANCY_HEX_MIN_COLUMNS}
        onChange={onColumnsChange}
        value={columns}
      />

      <div className="rounded-md border bg-muted/20 p-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Projeção</span>
          <strong>
            {requiredColumns} × {estimatedRows}
          </strong>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Novas posições</span>
          <strong>{formatNumber(Math.max(0, effectiveTarget - currentCount))}</strong>
        </div>
        {validTarget && parsedTarget < currentCount ? (
          <p className="mt-2 text-amber-700 dark:text-amber-300">
            O total informado é menor que o layout atual. Nada será removido.
          </p>
        ) : null}
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={!validTarget}
        onClick={() =>
          onCreate({
            columns,
            prefix,
            target: parsedTarget,
          })
        }
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Dimensionar layout
      </Button>
      <p className="text-[11px] text-muted-foreground">
        A criação inteira ocupa apenas uma etapa no histórico e pode ser
        desfeita com Ctrl+Z.
      </p>
    </div>
  );
}

function ScenarioPalette({
  disabled,
  linkedCellByScenarioId,
  onAdd,
  onSelect,
  query,
  scenarios,
  setQuery,
  totalByScenario,
}: {
  disabled: boolean;
  linkedCellByScenarioId: Map<string, OccupancyHexLayoutCell>;
  onAdd: (scenarioId: string) => void;
  onSelect: (cellId: string) => void;
  query: string;
  scenarios: OccupancyScenario[];
  setQuery: (query: string) => void;
  totalByScenario: Map<string, number | null>;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">Biblioteca de cenários</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Localize um cenário para abrir sua célula ou adicioná-lo na primeira posição disponível.
        </p>
      </div>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
        />
        <Input
          aria-label="Buscar cenário"
          className="pl-8"
          placeholder="Buscar por nome…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="max-h-[48dvh] space-y-2 overflow-y-auto pr-1">
        {scenarios.length ? (
          scenarios.map((scenario) => {
            const linkedCell = linkedCellByScenarioId.get(scenario.id);
            const total = totalByScenario.get(scenario.id) ?? null;
            return (
              <button
                key={scenario.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!linkedCell && disabled}
                onClick={() =>
                  linkedCell ? onSelect(linkedCell.id) : onAdd(scenario.id)
                }
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {scenario.name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {total === null
                      ? "Sem snapshot certificado"
                      : `Ocupação atual: ${formatNumber(total)}`}
                  </span>
                </span>
                {linkedCell ? (
                  <Badge variant="secondary" className="shrink-0">
                    L{linkedCell.row + 1} · C{linkedCell.column + 1}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0">
                    <Plus className="mr-1 h-3 w-3" /> Adicionar
                  </Badge>
                )}
              </button>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum cenário corresponde à busca.
          </div>
        )}
      </div>
    </div>
  );
}

function CellInspector({
  capacities,
  cell,
  layout,
  moving,
  onCapacityChange,
  onMove,
  onRemove,
  onToggleMoving,
  onUpdate,
  scenarios,
  total,
}: {
  capacities: Record<string, number>;
  cell: OccupancyHexLayoutCell;
  layout: OccupancyHexLayout;
  moving: boolean;
  onCapacityChange: (scenarioId: string, capacity: number | null) => void;
  onMove: (column: number, row: number) => void;
  onRemove: () => void;
  onToggleMoving: () => void;
  onUpdate: (patch: Partial<Pick<OccupancyHexLayoutCell, "label" | "scenarioId">>) => void;
  scenarios: OccupancyScenario[];
  total: number | null;
}) {
  const scenario = scenarios.find((item) => item.id === cell.scenarioId);
  const capacity = scenario
    ? normalizeOccupancyCapacity(capacities[scenario.id], scenario)
    : null;
  const scenarioSelectId = React.useId();
  const capacityInputId = React.useId();
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Célula selecionada</h3>
          <Badge variant="outline">L{cell.row + 1} · C{cell.column + 1}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Uma célula sem cenário funciona como espaço ou posição reservada.
        </p>
      </div>
      <Button
        type="button"
        className="w-full"
        variant={moving ? "default" : "outline"}
        onClick={onToggleMoving}
      >
        {moving ? "Cancelar escolha do destino" : "Escolher destino no mapa"}
      </Button>
      <div className="space-y-1.5">
        <Label htmlFor={scenarioSelectId}>Cenário vinculado</Label>
        <Select
          value={cell.scenarioId ?? "__none__"}
          onValueChange={(value) =>
            onUpdate({ scenarioId: value === "__none__" ? null : value })
          }
        >
          <SelectTrigger id={scenarioSelectId}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sem vínculo</SelectItem>
            {cell.scenarioId && !scenario ? (
              <SelectItem value={cell.scenarioId}>Cenário indisponível</SelectItem>
            ) : null}
            {scenarios.map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`hex-label-${cell.id}`}>Rótulo personalizado</Label>
        <EditorLabelInput
          id={`hex-label-${cell.id}`}
          placeholder={scenario?.name ?? "Ex.: Caixa 01"}
          value={cell.label}
          onCommit={(label) => onUpdate({ label })}
        />
      </div>
      <CellPositionEditor cell={cell} layout={layout} onMove={onMove} />
      {cell.scenarioId && scenario ? (
        <div className="space-y-1.5">
          <Label htmlFor={capacityInputId}>Capacidade de referência</Label>
          <EditorCapacityInput
            id={capacityInputId}
            value={capacity}
            onCommit={(value) => onCapacityChange(cell.scenarioId!, value)}
          />
          <p className="text-xs text-muted-foreground">
            Ocupação atual: {total === null ? "sem dados certificados" : formatNumber(total)}.
            {capacity === null
              ? " Capacidade ainda não configurada; nenhum percentual será inferido."
              : ""}
          </p>
        </div>
      ) : null}
      <Button type="button" variant="outline" className="w-full text-destructive" onClick={onRemove}>
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        Remover célula
      </Button>
    </div>
  );
}

function DimensionSelect({
  label,
  maximum,
  minimum,
  onChange,
  value,
}: {
  label: string;
  maximum: number;
  minimum: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const selectId = React.useId();
  const values = Array.from(
    { length: Math.max(1, maximum - minimum + 1) },
    (_, index) => minimum + index,
  );
  return (
    <div className="space-y-1">
      <Label className="text-xs" htmlFor={selectId}>{label}</Label>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger id={selectId} className="h-8 min-w-[82px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {values.map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function CellPositionEditor({
  cell,
  layout,
  onMove,
}: {
  cell: OccupancyHexLayoutCell;
  layout: OccupancyHexLayout;
  onMove: (column: number, row: number) => void;
}) {
  const [row, setRow] = React.useState(cell.row + 1);
  const [column, setColumn] = React.useState(cell.column + 1);
  React.useEffect(() => {
    setRow(cell.row + 1);
    setColumn(cell.column + 1);
  }, [cell.column, cell.id, cell.row]);
  const changed = row !== cell.row + 1 || column !== cell.column + 1;
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2">
      <div className="grid grid-cols-2 gap-2">
        <DimensionSelect
          label="Linha de destino"
          maximum={layout.rows}
          minimum={1}
          onChange={setRow}
          value={row}
        />
        <DimensionSelect
          label="Coluna de destino"
          maximum={layout.columns}
          minimum={1}
          onChange={setColumn}
          value={column}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        disabled={!changed}
        onClick={() => onMove(column - 1, row - 1)}
      >
        Aplicar posição
      </Button>
    </div>
  );
}

function EditorLabelInput({
  id,
  onCommit,
  placeholder,
  value,
}: {
  id: string;
  onCommit: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  function commit() {
    const normalized = draft.slice(0, 80);
    setDraft(normalized);
    if (normalized !== value) onCommit(normalized);
  }

  return (
    <Input
      id={id}
      maxLength={80}
      placeholder={placeholder}
      value={draft}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value.slice(0, 80))}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
    />
  );
}

function EditorCapacityInput({ id, value, onCommit }: { id: string; value: number | null; onCommit: (value: number | null) => void }) {
  const [draft, setDraft] = React.useState(value === null ? "" : String(value));
  const [error, setError] = React.useState("");
  React.useEffect(
    () => {
      setDraft(value === null ? "" : String(value));
      setError("");
    },
    [value],
  );
  function commit() {
    if (!draft.trim()) {
      setError("");
      onCommit(null);
      return;
    }
    const parsed = Number(draft);
    if (
      Number.isSafeInteger(parsed) &&
      parsed > 0 &&
      parsed <= OCCUPANCY_HEX_EDITOR_MAX_CAPACITY
    ) {
      setError("");
      onCommit(parsed);
    } else {
      setError(
        `Informe um número inteiro entre 1 e ${formatNumber(OCCUPANCY_HEX_EDITOR_MAX_CAPACITY)}.`,
      );
    }
  }
  return (
    <div className="space-y-1">
      <Input
        id={id}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        min={1}
        max={OCCUPANCY_HEX_EDITOR_MAX_CAPACITY}
        type="number"
        placeholder="Não configurada"
        value={draft}
        onBlur={commit}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
        }}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function editorCellState(
  cell: OccupancyHexLayoutCell,
  scenario: OccupancyScenario | undefined,
  total: number | null,
): OccupancyHexVisualState {
  if (!cell.scenarioId) return "unlinked";
  if (!scenario) return "unavailable";
  return classifyOccupancyTotal(total);
}

function editorCellStatus(
  state: OccupancyHexVisualState,
  total: number | null,
) {
  if (state === "unlinked") return "sem vínculo";
  if (state === "unavailable") return "cenário indisponível";
  if (state === "unknown") return "sem dados certificados";
  if (state === "unoccupied") return "desocupado certificado";
  return `ocupação ${formatNumber(total ?? 0)}`;
}

function resolveEditorLayout(
  layout: OccupancyHexLayout | null,
  scenarioIds: string[],
  columns: number,
  preset: OccupancyLayoutPreset,
) {
  return layout
    ? cloneLayout(layout)
    : createDefaultOccupancyHexLayout({ columns, preset, scenarioIds });
}

function cloneLayout(layout: OccupancyHexLayout): OccupancyHexLayout {
  return { ...layout, cells: layout.cells.map((cell) => ({ ...cell })) };
}

function firstFreeSlot(layout: OccupancyHexLayout) {
  const occupied = new Set(layout.cells.map((cell) => coordinateKey(cell.column, cell.row)));
  for (let row = 0; row < layout.rows; row += 1) {
    for (let column = 0; column < layout.columns; column += 1) {
      if (!occupied.has(coordinateKey(column, row))) return { column, row };
    }
  }
  return null;
}

function appendEmptyCell(
  layout: OccupancyHexLayout,
  column?: number,
  row?: number,
  scenarioId: string | null = null,
) {
  if (layout.cells.length >= OCCUPANCY_HEX_MAX_CELLS) {
    return { cellId: null, layout };
  }
  let expanded = layout;
  let slot =
    typeof column === "number" && typeof row === "number"
      ? { column, row }
      : firstFreeSlot(expanded);
  if (!slot && expanded.rows < OCCUPANCY_HEX_MAX_ROWS) {
    expanded = reflowOccupancyHexLayout(expanded, {
      rows: expanded.rows + 1,
    });
    slot = firstFreeSlot(expanded);
  }
  if (!slot) return { cellId: null, layout };
  const cell: OccupancyHexLayoutCell = {
    column: slot.column,
    id: createCellId(expanded.cells),
    label: "",
    row: slot.row,
    scenarioId,
  };
  return {
    cellId: cell.id,
    layout: {
      ...expanded,
      cells: [...expanded.cells, cell],
      preset: "custom" as const,
    },
  };
}

function createCellId(cells: OccupancyHexLayoutCell[]) {
  const existing = new Set(cells.map((cell) => cell.id));
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `cell-${crypto.randomUUID()}`
      : `cell-${Date.now().toString(36)}`;
  if (!existing.has(randomId)) return randomId;
  let suffix = 2;
  while (existing.has(`${randomId}-${suffix}`)) suffix += 1;
  return `${randomId}-${suffix}`;
}

function coordinateKey(column: number, row: number) {
  return `${column}:${row}`;
}

function editorCellOffset(
  preset: OccupancyLayoutPreset,
  column: number,
  row: number,
  scale: number,
) {
  if (preset === "showcase" || preset === "custom") {
    return row % 2 === 0 ? undefined : `translateX(${44 * scale}px)`;
  }
  if (preset === "workstation") {
    return `translateX(${Math.floor(column / 2) * 12 * scale}px)`;
  }
  return undefined;
}
