import {
  normalizeCardLayoutLevel,
  type CardLayoutLevel,
} from "@/lib/card-layout-sizing";
import {
  getScopedStorageKey,
  getUserViewScopedStorageKey,
} from "@/lib/master-company-scope";
import {
  hasUserGridKnownDeletion,
  writeUserGridPreference,
} from "@/lib/user-grid-local";

export type CardMenuKey =
  | "live"
  | "reports"
  | "analysis"
  | "occupancy"
  | "demographics";

export type CardSize = "compact" | "wide" | "large" | "full";

export type CardHeight = "short" | "standard" | "tall";

/* Compatibilidade de visões já salvas: estes pontos correspondem exatamente
   às proporções do seletor anterior. Os níveis intermediários 2 e 4 ampliam
   a escala sem deslocar compact/wide/large/full existentes. */
const CARD_SIZE_LAYOUT_LEVELS: Record<CardSize, CardLayoutLevel> = {
  compact: 1,
  wide: 3,
  large: 5,
  full: 6,
};

/* 164px, 344px e 524px continuam sendo as três alturas da grade antiga.
   Indicadores curtos podem optar por um footprint compacto sem alterar este
   espelho persistido. */
const CARD_HEIGHT_LAYOUT_LEVELS: Record<CardHeight, CardLayoutLevel> = {
  short: 1,
  standard: 3,
  tall: 5,
};

const CARD_SIZE_BY_LAYOUT_LEVEL: Record<CardLayoutLevel, CardSize> = {
  1: "compact",
  2: "compact",
  3: "wide",
  4: "large",
  5: "large",
  6: "full",
};

const CARD_HEIGHT_BY_LAYOUT_LEVEL: Record<CardLayoutLevel, CardHeight> = {
  1: "short",
  2: "standard",
  3: "standard",
  4: "tall",
  5: "tall",
  6: "tall",
};

export function cardSizeToLayoutLevel(size: CardSize): CardLayoutLevel {
  return CARD_SIZE_LAYOUT_LEVELS[size];
}

export function cardHeightToLayoutLevel(height: CardHeight): CardLayoutLevel {
  return CARD_HEIGHT_LAYOUT_LEVELS[height];
}

export function cardLayoutLevelToCardSize(level: CardLayoutLevel): CardSize {
  return CARD_SIZE_BY_LAYOUT_LEVEL[level];
}

export function cardLayoutLevelToCardHeight(level: CardLayoutLevel): CardHeight {
  return CARD_HEIGHT_BY_LAYOUT_LEVEL[level];
}

export type CardChartType = "bar" | "line" | "rose" | "treemap";

export const CARD_ZOOM_LEVELS = [80, 90, 100, 110, 120] as const;
export type CardZoom = (typeof CARD_ZOOM_LEVELS)[number];
export type CardScenarioSelectionMode = "inherit" | "all" | "custom";

export type CardScenarioSelection = {
  mode: CardScenarioSelectionMode;
  scenarioIds: string[];
};

export type CardPreference = {
  chartType?: CardChartType;
  color?: string;
  height?: CardHeight;
  heightLevel?: CardLayoutLevel;
  id: string;
  scenarioIds?: string[];
  scenarioSelectionMode?: CardScenarioSelectionMode;
  title?: string;
  visible: boolean;
  size?: CardSize;
  widthLevel?: CardLayoutLevel;
  zoom?: CardZoom;
};

export type CardDefinition = {
  id: string;
  label: string;
  description: string;
};

export type CardMenuDefinition = {
  key: CardMenuKey;
  label: string;
  description: string;
  cards: CardDefinition[];
};

export type CardViewUpdatedDetail = {
  menuKey: CardMenuKey;
  companyId?: string | null;
  userId?: string | null;
  viewId?: string | null;
};

export const CARD_VIEW_UPDATED_EVENT = "ipxdata-card-view-updated";
export const CARD_VIEW_STORAGE_KEY = "ipxdata.card-views.v1";

export const cardViewMenus: CardMenuDefinition[] = [
  {
    key: "live",
    label: "Ao Vivo · Contagem",
    description: "Widgets operacionais de contagem em tempo real.",
    cards: [
      card("live_intraday_comparison", "Hoje até agora", "Total do dia com a hora parcial e comparação das horas fechadas."),
      card("live_target_progress", "Hoje x média-base", "Progresso de hoje contra a média diária configurada."),
      card("live_month_previous_comparison", "Acumulado x mês anterior", "Mês corrente contra os dias equivalentes do mês anterior."),
      card("live_month_year_comparison", "Acumulado x ano anterior", "Mês corrente contra os dias equivalentes do ano anterior."),
      card("live_chart_minute_day", "Minuto a minuto · Hoje", "Fluxo do dia em resolução de minuto, de 00h a 23h."),
      card("live_chart_hour", "Hora a hora", "Total horário atual e base comparativa."),
      card("live_moving_average_trend", "Tendência 7 x 30 dias", "Médias móveis diária rápida e lenta."),
      card("live_hourly_occupancy", "Ocupação hora a hora", "Saldo de entradas e saídas desde o horário inicial."),
      card("live_scenario_cumulative", "Acumulado por cenário", "Evolução acumulada dos cenários selecionados."),
      card("live_scenario_totals_table", "Tabela acumulada por cenário", "Totais e participação dos cenários selecionados."),
      card("live_current_year_monthly", "Comparativo mensal por ano", "Meses do ano atual e dos anos anteriores."),
      card("live_current_year_accumulated", "Comparativo acumulado por ano", "Acumulado mês a mês entre anos."),
      card("live_month_hour_heatmap", "Mapa de calor dia x hora", "Intensidade horária ao longo dos dias do mês."),
      card("live_month_access_ranking", "Ranking dos acessos do mês", "Volume e participação mensal por cenário."),
      card("live_month_peak_days", "Top 5 dias de pico", "Dias de maior movimento no período."),
      card("live_scenario_rose", "Composição por cenário", "Participação dos cenários em rosa ou treemap."),
      card("live_operational_month_comparison", "Dias x meses", "Dias do mês atual contra a base escolhida."),
      card("live_operational_month_cumulative", "Acumulado diário x mês-base", "Acumulados equivalentes do mês atual e da base."),
      card("live_today_scenario_comparison", "Hoje por cenário", "Total diário comparado entre cenários."),
      card("live_today_location_comparison", "Hoje por local", "Total diário comparado entre locais."),
      card("live_today_sub_location_comparison", "Hoje por sublocal", "Total diário comparado entre sublocais."),
    ],
  },
  {
    key: "reports",
    label: "Relatórios · Contagem",
    description: "Inteligência de contagem e comparações do período.",
    cards: [
      card("report_counting_period_total", "Total do período", "Resultado acumulado no período selecionado."),
      card("report_counting_end_month", "Mês final do período", "Resultado do último mês selecionado."),
      card("report_counting_monthly_average", "Média mensal", "Média dos meses selecionados e sua base anterior."),
      card("report_counting_access_leader", "Acesso líder", "Cenário com maior participação no fluxo."),
      card("report_counting_annual_comparison", "Comparativo mensal por ano", "Sazonalidade mensal entre anos."),
      card("report_counting_annual_accumulated_comparison", "Comparativo acumulado por ano", "Evolução acumulada mês a mês entre anos."),
      card("report_counting_day_month_heatmap", "Mapa de calor · dias x meses", "Intensidade dos dias fechados ao longo dos meses do ano final do período."),
      card("report_counting_month_year_heatmap", "Mapa de calor · meses x anos", "Intensidade mensal comparada entre os anos do período."),
      card("report_counting_year_over_year_month", "Tabela mensal comparativa", "Matriz de anos, meses, acumulados e variações."),
      card("report_counting_directional_flow", "Fluxo direcional por hora", "Entradas e saídas por faixa horária."),
      card("report_counting_access_ranking", "Ranking dos acessos", "Participação, volume e picos dos cenários."),
      card("report_scenario_period_comparison", "Cenários por período", "Comparação configurável dos cenários no período global."),
    ],
  },
  {
    key: "analysis",
    label: "Análises · Contagem",
    description: "Widgets de contagem aplicados ao intervalo selecionado.",
    cards: [
      card("analysis_day_total", "Total do dia", "Total do dia selecionado."),
      card("analysis_target_progress", "Dia x média-base", "Dia selecionado contra a média configurada."),
      card("analysis_month_previous_metric", "Acumulado x mês anterior", "Acumulado mensal contra o mês anterior."),
      card("analysis_month_year_metric", "Acumulado x ano anterior", "Acumulado mensal contra o ano anterior."),
      card("analysis_summary", "Resumo do período", "Indicadores consolidados do intervalo."),
      card("analysis_timeline", "Fluxo por período", "Fluxo agrupado pela granularidade adequada."),
      card("analysis_comparison", "Comparativo de cenários", "Séries independentes dos cenários selecionados."),
      card("analysis_heatmap", "Mapa de calor dia x hora", "Intensidade por dia e hora no intervalo."),
      card("analysis_hourly_occupancy", "Ocupação hora a hora", "Saldo de entradas e saídas por hora."),
      card("analysis_daily_comparison", "Dias x meses", "Dias do intervalo contra a base mensal."),
      card("analysis_year_monthly", "Comparativo mensal por ano", "Meses comparados entre anos."),
      card("analysis_year_accumulated", "Comparativo acumulado por ano", "Acumulado mês a mês entre anos."),
      card("analysis_cumulative", "Acumulado diário x base", "Evolução acumulada contra a base escolhida."),
      card("analysis_trend", "Tendência 7 x 30 dias", "Médias móveis no intervalo."),
      card("analysis_ranking", "Ranking de cenários", "Volume e participação por cenário."),
      card("analysis_peak_days", "Top 5 dias de pico", "Dias de maior movimento."),
      card("analysis_rose", "Composição por cenário", "Participação por cenário."),
      card("analysis_scenario_cumulative", "Acumulado por cenário", "Evolução acumulada dos cenários."),
      card("analysis_scope_totals", "Totais por visão", "Totais por cenário, local ou sublocal."),
      card("analysis_totals_table", "Tabela acumulada por cenário", "Tabela detalhada dos totais selecionados."),
      card("analysis_hour_profile", "Perfil horário", "Média de fluxo nas 24 horas."),
    ],
  },
  {
    key: "demographics",
    label: "Demographics",
    description:
      "Distribuição percentual das detecções classificadas por gênero, faixa etária e emoção.",
    cards: [
      card("demographics_total", "Detecções classificadas", "Volume retornado no período selecionado."),
      card("demographics_gender_leader", "Gênero predominante", "Maior participação entre as classificações de gênero."),
      card("demographics_age_leader", "Faixa etária predominante", "Faixa etária com maior participação nas classificações."),
      card("demographics_emotion_leader", "Emoção predominante", "Emoção com maior participação nas classificações."),
      card("demographics_gender_mix", "Distribuição por gênero", "Composição percentual das classificações de gênero."),
      card("demographics_age_distribution", "Distribuição por faixa etária", "Participação percentual em cada faixa etária."),
      card("demographics_emotion_distribution", "Distribuição por emoção", "Ranking percentual das emoções classificadas."),
      card("demographics_age_gender_pyramid", "Faixa etária por gênero", "Pirâmide comparativa das faixas etárias por gênero."),
      card("demographics_age_emotion_heatmap", "Faixa etária x emoção", "Mapa de calor da relação entre idade e emoção."),
    ],
  },
  {
    key: "occupancy",
    label: "Ocupação",
    description: "Widgets de ocupação por cenário e período.",
    cards: [
      card("occupancy_current_total", "Ocupação atual", "Estado atual do cenário."),
      card("occupancy_average", "Média hoje", "Média temporal do total do cenário hoje."),
      card("occupancy_minimum", "Mínimo hoje", "Menor ocupação registrada hoje."),
      card("occupancy_peak", "Máximo hoje", "Maior ocupação registrada hoje."),
      card("occupancy_alerts", "Alertas recentes", "Quantidade da janela de até 12 alertas recentes."),
      card("occupancy_active_areas", "Áreas ocupadas", "Áreas com ocupação acima de zero."),
      card("occupancy_chart_minute", "Minuto a minuto", "Ocupação nos últimos 60 minutos."),
      card("occupancy_chart_hour", "Hora a hora", "Ocupação nas horas do dia."),
      card("occupancy_chart_day", "Dia a dia", "Ocupação nos últimos 7 dias."),
      card("occupancy_chart_week", "Semana a semana", "Ocupação nas últimas 8 semanas."),
      card("occupancy_chart_month", "Mês a mês", "Ocupação nos últimos 12 meses."),
      card("occupancy_scenario_detail", "Cenário de ocupação", "Áreas, valores e limites do cenário."),
      card("occupancy_alert_list", "Histórico de alertas", "Janela dos alertas recentes do cenário."),
      card("occupancy_scenario_half_donut", "Comparação atual por cenário", "Estado ou valor real atual, mantendo a ordem configurada."),
      card("occupancy_scenario_bar_race", "Ranking ao vivo por cenário", "Comparação dinâmica dos valores atuais."),
      card("occupancy_scenario_max_hour", "Máximo por hora por cenário", "Pico de cada cenário nas horas de hoje."),
      card("occupancy_scenario_max_month", "Máximo por mês por cenário", "Pico mensal dos últimos 12 meses."),
      card("occupancy_scenario_max_year", "Máximo por ano por cenário", "Pico observado em cada um dos últimos 5 anos."),
      card("occupancy_duration_confirmed", "Tempo ocupado confirmado", "Soma dos minutos integralmente ocupados hoje nos cenários escolhidos."),
      card("occupancy_duration_longest", "Maior período ocupado", "Maior sequência contínua confirmada no dia atual."),
      card("occupancy_duration_load", "Carga de ocupação", "Integral da ocupação média de hoje em unidades-hora, sem inferir permanência individual."),
      card("occupancy_duration_coverage", "Cobertura da duração", "Percentual dos minutos fechados de hoje com dados disponíveis."),
      card("occupancy_duration_timeline", "Linha do tempo de ocupação", "Intervalos ocupados, livres, mistos e sem dados ao longo de hoje."),
      card("occupancy_duration_by_scenario", "Tempo por cenário", "Comparação do tempo confirmado e da cobertura de hoje entre cenários."),
      card("occupancy_hex_layout", "Simulador operacional hexagonal", "Layout configurável para posições operacionais."),
      card("occupancy_day_hour_heatmap", "Ocupação por dias x horários", "Mapa horário do cenário ao longo dos dias."),
      card("occupancy_scenario_hour_heatmap", "Ocupação por cenários x horários", "Mapa comparativo dos cenários nas horas da data."),
    ],
  },
];

function card(id: string, label: string, description: string): CardDefinition {
  return { description, id, label };
}

type CardPreferenceStore = Partial<Record<CardMenuKey, CardPreference[]>>;

export function getCardMenuDefinition(menuKey: CardMenuKey) {
  return cardViewMenus.find((menu) => menu.key === menuKey) ?? cardViewMenus[0];
}

export function getDefaultCardPreferences(menuKey: CardMenuKey) {
  return getCardMenuDefinition(menuKey).cards.map((card) => ({
    id: card.id,
    visible: true,
  }));
}

export function normalizeCardPreferences(
  menuKey: CardMenuKey,
  preferences: CardPreference[] | undefined,
  cardIds?: string[],
) {
  const definitionIds = new Set(
    cardIds?.length
      ? cardIds
      : getCardMenuDefinition(menuKey).cards.map((card) => card.id),
  );
  const byId = new Map<string, StoredCardPreference>();
  const storedOrder: string[] = [];
  if (Array.isArray(preferences)) {
    preferences.forEach((candidate) => {
      if (
        !isStoredCardPreference(candidate) ||
        !definitionIds.has(candidate.id)
      ) {
        return;
      }
      if (!byId.has(candidate.id)) storedOrder.push(candidate.id);
      // Preserve the historical last-write-wins behavior while emitting each
      // card only once at the position of its first valid occurrence.
      byId.set(candidate.id, candidate);
    });
  }
  const normalized = storedOrder.map((id) => {
    const storedPreference = byId.get(id)!;
    const legacyHeight = isCardHeight(storedPreference.height)
      ? storedPreference.height
      : undefined;
    const legacySize = isCardSize(storedPreference.size)
      ? storedPreference.size
      : undefined;
    const heightLevel =
      normalizeCardLayoutLevel(storedPreference.heightLevel) ??
      (legacyHeight ? cardHeightToLayoutLevel(legacyHeight) : undefined);
    const widthLevel =
      normalizeCardLayoutLevel(storedPreference.widthLevel) ??
      (legacySize ? cardSizeToLayoutLevel(legacySize) : undefined);
    const scenarioSelectionMode = normalizeCardScenarioSelectionMode(
      storedPreference.scenarioSelectionMode,
    );
    const scenarioIds = normalizeCardScenarioIds(storedPreference.scenarioIds);

    return {
      chartType: isCardChartType(storedPreference.chartType)
        ? storedPreference.chartType
        : undefined,
      color: isCardColor(storedPreference.color)
        ? storedPreference.color
        : undefined,
      height: heightLevel
        ? cardLayoutLevelToCardHeight(heightLevel)
        : undefined,
      heightLevel,
      id,
      ...(scenarioSelectionMode === "custom" && scenarioIds.length
        ? { scenarioIds }
        : {}),
      ...(scenarioSelectionMode ? { scenarioSelectionMode } : {}),
      title: normalizeCardTitle(storedPreference.title),
      visible: storedPreference.visible ?? true,
      size: widthLevel ? cardLayoutLevelToCardSize(widthLevel) : undefined,
      widthLevel,
      zoom: normalizeCardZoom(storedPreference.zoom),
    };
  });
  const normalizedIds = new Set(normalized.map((preference) => preference.id));
  const defaultOrder = Array.from(definitionIds);
  const merged = [...normalized];

  defaultOrder.forEach((id, defaultIndex) => {
    if (normalizedIds.has(id)) return;

    const nextExistingId = defaultOrder
      .slice(defaultIndex + 1)
      .find((candidate) => normalizedIds.has(candidate));
    const insertionIndex = nextExistingId
      ? merged.findIndex((preference) => preference.id === nextExistingId)
      : merged.length;
    merged.splice(
      insertionIndex < 0 ? merged.length : insertionIndex,
      0,
      {
        chartType: undefined,
        color: undefined,
        height: undefined,
        heightLevel: undefined,
        id,
        title: undefined,
        visible: true,
        size: undefined,
        widthLevel: undefined,
        zoom: undefined,
      },
    );
    normalizedIds.add(id);
  });

  return merged;
}

export function loadCardPreferences(menuKey: CardMenuKey, cardIds?: string[]) {
  return loadScopedCardPreferences(menuKey, cardIds);
}

export function loadScopedCardPreferences(
  menuKey: CardMenuKey,
  cardIds?: string[],
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const scopedPreferences = readScopedMenuPreferences(
    menuKey,
    companyId,
    userId,
    viewId,
  );

  return normalizeCardPreferences(
    menuKey,
    scopedPreferences,
    cardIds,
  );
}

export function loadSavedScopedCardPreferences(
  menuKey: CardMenuKey,
  cardIds?: string[],
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const stored = readScopedMenuPreferences(
    menuKey,
    companyId,
    userId,
    viewId,
  );
  if (!Array.isArray(stored)) return null;
  const allowedIds = cardIds?.length ? new Set(cardIds) : null;
  const selected = allowedIds
    ? stored.filter((preference) => allowedIds.has(preference.id))
    : stored;
  return normalizeCardPreferences(
    menuKey,
    selected,
    selected.map((preference) => preference.id),
  );
}

export function saveCardPreferences(
  menuKey: CardMenuKey,
  preferences: CardPreference[],
  cardIds?: string[],
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  if (typeof window === "undefined") return;

  const nextPreferences = normalizeCardPreferences(menuKey, preferences, cardIds);
  const store = readStoredPreferences(companyId, userId, viewId);
  store[menuKey] = nextPreferences;
  writeUserGridPreference(
    getCardViewStorageKey(companyId, userId, viewId),
    JSON.stringify(store),
  );
  window.dispatchEvent(
    new CustomEvent<CardViewUpdatedDetail>(CARD_VIEW_UPDATED_EVENT, {
      detail: { menuKey, companyId, userId, viewId },
    }),
  );
}

export function orderByCardPreferences<T extends { id: string }>(
  cards: T[],
  preferences: CardPreference[],
) {
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const ordered = preferences
    .filter((preference) => preference.visible)
    .map((preference) => cardMap.get(preference.id))
    .filter(Boolean) as T[];
  const preferenceIds = new Set(preferences.map((preference) => preference.id));
  const missing = cards.filter((card) => !preferenceIds.has(card.id));

  return [...ordered, ...missing];
}

export function getCardViewStorageKey(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  return getUserViewScopedStorageKey(
    CARD_VIEW_STORAGE_KEY,
    companyId,
    userId,
    viewId,
  );
}

function readScopedMenuPreferences(
  menuKey: CardMenuKey,
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  if (typeof window === "undefined") return undefined;

  const personalKey = getCardViewStorageKey(companyId, userId, viewId);
  const personalBaseKey = getCardViewStorageKey(companyId, userId);
  const legacyFallbackBlocked = Boolean(
    userId?.trim() &&
      (hasUserGridKnownDeletion(personalKey) ||
        hasUserGridKnownDeletion(personalBaseKey)),
  );

  for (const key of getCardViewStorageReadKeys(
    companyId,
    userId,
    viewId,
  )) {
    const stored = window.localStorage.getItem(key);
    if (stored === null) continue;

    try {
      const parsed = JSON.parse(stored) as CardPreferenceStore;
      if (!parsed || typeof parsed !== "object") return undefined;
      if (Object.prototype.hasOwnProperty.call(parsed, menuKey)) {
        const alreadyPersonal = Boolean(
          userId?.trim() &&
          (key === personalBaseKey || key.startsWith(`${personalBaseKey}.view.`)),
        );
        if (!alreadyPersonal && legacyFallbackBlocked) continue;
        if (userId?.trim() && !alreadyPersonal && key !== personalKey) {
          const personalStore = readStoredPreferences(
            companyId,
            userId,
            viewId,
          );
          personalStore[menuKey] = parsed[menuKey];
          writeUserGridPreference(personalKey, JSON.stringify(personalStore));
        }
        return parsed[menuKey];
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function getCardViewStorageReadKeys(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const cleanCompanyId = companyId?.trim() ?? "";
  const cleanUserId = userId?.trim() ?? "";
  const cleanViewId = viewId?.trim() ?? "";
  const keys = [
    getCardViewStorageKey(cleanCompanyId, cleanUserId, cleanViewId),
    getLegacyCardViewStorageKey(cleanCompanyId, cleanUserId, cleanViewId),
  ];

  if (cleanViewId) {
    keys.push(getCardViewStorageKey(cleanCompanyId, cleanUserId));
    keys.push(getLegacyCardViewStorageKey(cleanCompanyId, cleanUserId));
  }
  if (cleanCompanyId && (cleanUserId || cleanViewId)) {
    keys.push(getCardViewStorageKey(cleanCompanyId));
    keys.push(getLegacyCardViewStorageKey(cleanCompanyId));
  }
  if (cleanCompanyId) {
    keys.push(getScopedStorageKey(CARD_VIEW_STORAGE_KEY, cleanCompanyId));
  }

  return Array.from(new Set(keys));
}

function getLegacyCardViewStorageKey(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
) {
  const segments = [
    companyId?.trim() ? `company.${encodeURIComponent(companyId.trim())}` : "",
    userId?.trim() ? `user.${encodeURIComponent(userId.trim())}` : "",
    viewId?.trim() ? `view.${encodeURIComponent(viewId.trim())}` : "",
  ].filter(Boolean);
  return segments.length
    ? `${CARD_VIEW_STORAGE_KEY}.${segments.join(".")}`
    : CARD_VIEW_STORAGE_KEY;
}

function readStoredPreferences(
  companyId?: string | null,
  userId?: string | null,
  viewId?: string | null,
): CardPreferenceStore {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(
      getCardViewStorageKey(companyId, userId, viewId),
    );
    if (!stored) return {};

    const parsed = JSON.parse(stored) as CardPreferenceStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isCardSize(value: unknown): value is CardSize {
  return (
    value === "compact" ||
    value === "wide" ||
    value === "large" ||
    value === "full"
  );
}

type StoredCardPreference = Partial<CardPreference> &
  Pick<CardPreference, "id">;

function isStoredCardPreference(
  value: unknown,
): value is StoredCardPreference {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

function isCardHeight(value: unknown): value is CardHeight {
  return value === "short" || value === "standard" || value === "tall";
}

function isCardChartType(value: unknown): value is CardChartType {
  return (
    value === "bar" ||
    value === "line" ||
    value === "rose" ||
    value === "treemap"
  );
}

function isCardColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeCardTitle(value: unknown) {
  if (typeof value !== "string") return undefined;
  const title = value.trim();
  return title ? title.slice(0, 120) : undefined;
}

function normalizeCardScenarioSelectionMode(
  value: unknown,
): CardScenarioSelectionMode | undefined {
  return value === "all" || value === "custom" ? value : undefined;
}

function normalizeCardScenarioIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.flatMap((scenarioId) =>
        typeof scenarioId === "string" && scenarioId.trim()
          ? [scenarioId.trim()]
          : [],
      ),
    ),
  );
}

function normalizeCardZoom(value: unknown): CardZoom | undefined {
  return CARD_ZOOM_LEVELS.find((level) => level === value);
}
