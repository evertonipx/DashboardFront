export type CardMenuKey = "live" | "reports" | "analysis" | "occupancy";

export type CardSize = "compact" | "wide" | "full";

export type CardPreference = {
  color?: string;
  id: string;
  visible: boolean;
  size?: CardSize;
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
    label: "Ao Vivo",
    description: "Cards operacionais de contagem em tempo real.",
    cards: [
      {
        id: "live_intraday_comparison",
        label: "Horas fechadas hoje",
        description: "Acumulado até a última hora completa contra a base escolhida.",
      },
      {
        id: "live_target_progress",
        label: "Hoje x média-base",
        description: "Progresso de hoje contra a média diária da base escolhida.",
      },
      {
        id: "live_month_previous_comparison",
        label: "Acumulado x mês anterior",
        description: "Dias fechados do mês contra o mesmo intervalo do mês anterior.",
      },
      {
        id: "live_month_year_comparison",
        label: "Acumulado x ano anterior",
        description: "Dias fechados do mês contra o mesmo intervalo do ano anterior.",
      },
      {
        id: "live_scenario_period_comparison",
        label: "Cenários por período",
        description: "Comparação flexível de cenários por período.",
      },
      {
        id: "live_chart_hour",
        label: "Hora a Hora",
        description: "Base histórica e hoje em barras, com média-base tracejada.",
      },
      {
        id: "live_month_hour_heatmap",
        label: "Mapa de calor dia x hora",
        description: "Picos horários distribuídos pelos dias do mês atual.",
      },
      {
        id: "live_moving_average_trend",
        label: "Tendência 7 x 30 dias",
        description: "Direção das médias móveis rápida e lenta em dias fechados.",
      },
      {
        id: "live_operational_month_comparison",
        label: "Dias x meses",
        description: "Dias do mês atual contra a base mensal escolhida.",
      },
      {
        id: "live_operational_month_cumulative",
        label: "Acumulado diário x mês-base",
        description: "Acumulado nos mesmos dias para indicar avanço ou atraso.",
      },
      {
        id: "live_month_access_ranking",
        label: "Ranking dos acessos do mês",
        description: "Volume e representatividade mensal por cenário.",
      },
      {
        id: "live_chart_week",
        label: "Semana a semana",
        description: "Eventos agregados por semana.",
      },
      {
        id: "live_chart_month",
        label: "Mês a mês",
        description: "Eventos agregados por mês.",
      },
      {
        id: "live_scenario_detail",
        label: "Cenário ao vivo",
        description: "Configuração usada na leitura em tempo real.",
      },
    ],
  },
  {
    key: "reports",
    label: "Relatórios",
    description: "Cards de cenários por período.",
    cards: [
      {
        id: "report_counting_period_total",
        label: "Total do período",
        description: "Resultado acumulado no período selecionado.",
      },
      {
        id: "report_counting_end_month",
        label: "Mês final do período",
        description: "Resultado do último mês selecionado e comparação anual.",
      },
      {
        id: "report_counting_monthly_average",
        label: "Média mensal",
        description: "Média dos meses selecionados e base do ano anterior.",
      },
      {
        id: "report_counting_access_leader",
        label: "Acesso líder",
        description: "Cenário com maior participação no fluxo selecionado.",
      },
      {
        id: "report_counting_annual_comparison",
        label: "Comparativo mensal por ano",
        description: "Gráfico sazonal dos meses de cada ano.",
      },
      {
        id: "report_counting_annual_accumulated_comparison",
        label: "Comparativo acumulado por ano",
        description: "Evolução acumulada mês a mês para comparar cada ano.",
      },
      {
        id: "report_counting_year_over_year_month",
        label: "Tabela mensal comparativa",
        description: "Anos nas linhas e meses nas colunas com variação mensal.",
      },
      {
        id: "report_counting_directional_flow",
        label: "Fluxo direcional por hora",
        description: "Entradas e saídas do período selecionado por faixa horária.",
      },
      {
        id: "report_counting_access_ranking",
        label: "Ranking dos acessos",
        description: "Participação, ranking e picos dos cenários de acesso.",
      },
      {
        id: "report_today_total",
        label: "Resultado hoje",
        description: "Resultado do cenário desde 00:00.",
      },
      {
        id: "report_last_hour",
        label: "Última hora",
        description: "Resultado do cenário nos últimos 60 minutos.",
      },
      {
        id: "report_last_7d",
        label: "Últimos 7 dias",
        description: "Resultado do cenário nos últimos 7 dias.",
      },
      {
        id: "report_scenario_count",
        label: "Cenários ativos",
        description: "Total de cenários disponíveis para relatório.",
      },
      {
        id: "report_scenario_period_comparison",
        label: "Cenários por período",
        description: "Comparação flexível de cenários nos relatórios.",
      },
      {
        id: "report_chart_minute",
        label: "Minuto a minuto",
        description: "Cenário agregado por minuto.",
      },
      {
        id: "report_chart_hour",
        label: "Hora a hora",
        description: "Cenário agregado por hora.",
      },
      {
        id: "report_chart_day",
        label: "Dia a dia",
        description: "Cenário agregado por dia.",
      },
      {
        id: "report_chart_week",
        label: "Semana a semana",
        description: "Cenário agregado por semana.",
      },
      {
        id: "report_chart_month",
        label: "Mês a mês",
        description: "Cenário agregado por mês.",
      },
      {
        id: "report_chart_semester",
        label: "Semestre a semestre",
        description: "Cenário agregado por semestre.",
      },
      {
        id: "report_chart_year",
        label: "Ano a ano",
        description: "Cenário agregado por ano.",
      },
      {
        id: "report_scenario_detail",
        label: "Cenário selecionado",
        description: "Configuração do cenário selecionado.",
      },
      {
        id: "report_scenario_table",
        label: "Cenários disponíveis",
        description: "Tabela para alternar entre cenários.",
      },
    ],
  },
  {
    key: "analysis",
    label: "Análises",
    description: "Widgets operacionais por intervalo personalizado.",
    cards: [
      {
        id: "analysis_summary",
        label: "Resumo do período",
        description: "Indicadores consolidados dos cenários escolhidos.",
      },
      {
        id: "analysis_timeline",
        label: "Fluxo por período",
        description: "Fluxo agrupado por dia ou hora.",
      },
      {
        id: "analysis_comparison",
        label: "Comparativo de cenários",
        description: "Séries independentes para os cenários selecionados.",
      },
      {
        id: "analysis_heatmap",
        label: "Mapa de calor dia x hora",
        description: "Intensidade horária no intervalo selecionado.",
      },
      {
        id: "analysis_cumulative",
        label: "Acumulado diário x base",
        description: "Evolução acumulada contra uma base configurável.",
      },
      {
        id: "analysis_trend",
        label: "Tendência 7 x 30 dias",
        description: "Médias móveis no intervalo selecionado.",
      },
      {
        id: "analysis_ranking",
        label: "Ranking de cenários",
        description: "Volume e representatividade dos cenários escolhidos.",
      },
      {
        id: "analysis_hour_profile",
        label: "Perfil horário",
        description: "Média de fluxo para cada uma das 24 horas.",
      },
    ],
  },
  {
    key: "occupancy",
    label: "Ocupação Ao Vivo",
    description: "Cards de ocupação por período e cenário.",
    cards: [
      {
        id: "occupancy_current_total",
        label: "Ocupação agora",
        description: "Soma atual das áreas ou do cenário selecionado.",
      },
      {
        id: "occupancy_peak",
        label: "Máximo hoje",
        description: "Maior ocupação observada hoje.",
      },
      {
        id: "occupancy_minimum",
        label: "Mínimo hoje",
        description: "Menor ocupação observada hoje.",
      },
      {
        id: "occupancy_average",
        label: "Média hoje",
        description: "Ocupação média das áreas monitoradas hoje.",
      },
      {
        id: "occupancy_alerts",
        label: "Alertas",
        description: "Alertas gerados pelos limites do cenário.",
      },
      {
        id: "occupancy_active_areas",
        label: "Áreas ocupadas",
        description: "Áreas com ocupação maior que zero.",
      },
      {
        id: "occupancy_chart_minute",
        label: "Minuto a minuto",
        description: "Ocupação capturada nos últimos 60 minutos.",
      },
      {
        id: "occupancy_chart_hour",
        label: "Hora a hora",
        description: "Ocupação capturada hoje.",
      },
      {
        id: "occupancy_chart_day",
        label: "Dia a dia",
        description: "Ocupação capturada nos últimos 7 dias.",
      },
      {
        id: "occupancy_chart_week",
        label: "Semana a semana",
        description: "Ocupação capturada nas últimas 8 semanas.",
      },
      {
        id: "occupancy_chart_month",
        label: "Mês a mês",
        description: "Ocupação capturada nos últimos 12 meses.",
      },
      {
        id: "occupancy_scenario_detail",
        label: "Cenário de ocupação",
        description: "Áreas e limites do cenário selecionado.",
      },
      {
        id: "occupancy_alert_list",
        label: "Histórico de alertas",
        description: "Lista dos alertas recentes do cenário.",
      },
    ],
  },
];

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
  const byId = new Map(
    (preferences ?? [])
      .filter((preference) => definitionIds.has(preference.id))
      .map((preference) => [preference.id, preference]),
  );
  const normalized = (preferences ?? [])
    .filter((preference) => definitionIds.has(preference.id))
    .map((preference) => ({
      color: isCardColor(byId.get(preference.id)?.color)
        ? byId.get(preference.id)?.color
        : undefined,
      id: preference.id,
      visible: byId.get(preference.id)?.visible ?? true,
      size: isCardSize(byId.get(preference.id)?.size)
        ? byId.get(preference.id)?.size
        : undefined,
    }));
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
      { color: undefined, id, visible: true, size: undefined },
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
  const scopedPreferences =
    readStoredPreferences(companyId, userId, viewId)[menuKey] ??
    (userId || viewId
      ? readStoredPreferences(companyId)[menuKey]
      : undefined);

  return normalizeCardPreferences(
    menuKey,
    scopedPreferences,
    cardIds,
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
  window.localStorage.setItem(
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
  return value === "compact" || value === "wide" || value === "full";
}

function isCardColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
