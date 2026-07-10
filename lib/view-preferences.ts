export type CardMenuKey = "live" | "reports" | "occupancy";

export type CardSize = "compact" | "wide" | "full";

export type CardPreference = {
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
        id: "live_today_total",
        label: "Acumulado hoje",
        description: "Total desde 00:00 até agora.",
      },
      {
        id: "live_last_minute",
        label: "Último minuto",
        description: "Movimento da barra atual.",
      },
      {
        id: "live_last_5_minutes",
        label: "Últimos 5 minutos",
        description: "Movimento recente do cenário.",
      },
      {
        id: "live_last_hour",
        label: "Última hora",
        description: "Movimento dos últimos 60 minutos.",
      },
      {
        id: "live_scenario_period_comparison",
        label: "Cenários por período",
        description: "Comparação flexível de cenários por período.",
      },
      {
        id: "live_chart_minute",
        label: "Minuto a minuto",
        description: "Eventos agregados por minuto.",
      },
      {
        id: "live_chart_hour",
        label: "Hora a hora",
        description: "Eventos agregados por hora.",
      },
      {
        id: "live_chart_day",
        label: "Dia a dia",
        description: "Eventos agregados por dia.",
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
      id: preference.id,
      visible: byId.get(preference.id)?.visible ?? true,
      size: isCardSize(byId.get(preference.id)?.size)
        ? byId.get(preference.id)?.size
        : undefined,
    }));
  const normalizedIds = new Set(normalized.map((preference) => preference.id));
  const missing = Array.from(definitionIds)
    .filter((id) => !normalizedIds.has(id))
    .map((id) => ({ id, visible: true }));

  return [...normalized, ...missing];
}

export function loadCardPreferences(menuKey: CardMenuKey, cardIds?: string[]) {
  return loadScopedCardPreferences(menuKey, cardIds);
}

export function loadScopedCardPreferences(
  menuKey: CardMenuKey,
  cardIds?: string[],
  companyId?: string | null,
) {
  const scopedPreferences = readStoredPreferences(companyId)[menuKey];

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
) {
  if (typeof window === "undefined") return;

  const nextPreferences = normalizeCardPreferences(menuKey, preferences, cardIds);
  const store = readStoredPreferences(companyId);
  store[menuKey] = nextPreferences;
  window.localStorage.setItem(
    getCardViewStorageKey(companyId),
    JSON.stringify(store),
  );
  window.dispatchEvent(
    new CustomEvent<CardViewUpdatedDetail>(CARD_VIEW_UPDATED_EVENT, {
      detail: { menuKey, companyId },
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

export function getCardViewStorageKey(companyId?: string | null) {
  const cleanCompanyId = companyId?.trim();
  return cleanCompanyId
    ? `${CARD_VIEW_STORAGE_KEY}.${cleanCompanyId}`
    : CARD_VIEW_STORAGE_KEY;
}

function readStoredPreferences(companyId?: string | null): CardPreferenceStore {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(getCardViewStorageKey(companyId));
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
