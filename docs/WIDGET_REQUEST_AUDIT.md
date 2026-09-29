# Auditoria de consultas por widget

Revisão em 29/09/2026. Este inventário descreve as fontes efetivamente usadas
pelo frontend em Contagem, Ocupação e Demografia. IDs nesta página são internos;
não aparecem na interface. A verificação cobre o plano de requisições, testes
de regressão e build local. Não é uma medição p95 do backend autenticado.

## Regras comuns

- Apenas o módulo selecionado é montado. Widgets ocultos ficam fora dos planos
  de métricas; na Ocupação Ao Vivo, a fonte também depende da demanda do card
  materializado no viewport, exceto o total principal visível.
- Widgets que precisam da mesma fonte compartilham a leitura. Uma requisição
  separada por card aumentaria o tráfego sem acrescentar informação.
- GETs idênticos em voo são consolidados por sessão, empresa efetiva, URL e
  cabeçalhos. O cache de dados autenticados não é público.
- Análises e Relatórios não têm polling de métricas. Contagem e Demografia
  carregam a análise inicial fechada. Relatórios de Contagem carrega uma vez o
  período inicial configurado; Ocupação e Demografia aguardam a solicitação.
- Catálogos, permissões e preferências são fontes auxiliares da tela, não
  requisições para cada widget. Mudanças de filtro local não devem reler um
  agregado empresarial quando a fonte já contém as séries necessárias.

## Contagem

Fonte de métricas: `GET /analytics/aggregate`, particionado e validado por
intervalo e granularidade. Cenário/local são compostos das séries retornadas;
não há uma consulta física por widget.

### Ao Vivo

| Widgets internos | Fonte mínima e frequência |
| --- | --- |
| `live_intraday_comparison` | Horas de hoje e do dia comparável; minuto apenas da hora aberta. Atualização de corrente em 5 s. |
| `live_target_progress`, `live_chart_hour` | Horas/minuto de hoje mais dias da base pertinente. Compartilham as fontes existentes. |
| `live_month_previous_comparison`, `live_month_year_comparison`, `live_operational_month_comparison`, `live_operational_month_cumulative` | Dias dos meses comparados; hora/minuto apenas para conciliar a borda de hoje. |
| `live_chart_minute_day` | Bootstrap de minutos do dia e cauda móvel de 60 min, sem reler todo o dia a cada pulso. |
| `live_hourly_occupancy`, `live_scenario_cumulative`, `live_today_scenario_comparison`, `live_today_location_comparison`, `live_today_sub_location_comparison` | Mesma leitura de horas de hoje e minuto aberto. |
| `live_scenario_totals_table` | Horas/minuto de hoje e dias do mês para o acumulado. |
| `live_moving_average_trend` | 90 dias diários; revisão a cada 5 min. |
| `live_month_hour_heatmap` | Horas do mês; revisão a cada 5 min. |
| `live_month_access_ranking`, `live_month_peak_days`, `live_scenario_rose` | Dias do mês e borda horária aberta; revisão a cada 5 min. |
| `live_current_year_monthly`, `live_current_year_accumulated` | Histórico mensal compartilhado, com bordas diárias/horárias necessárias; histórico anual tenta revisão uma vez por dia civil da empresa. |
| `live_custom_{id}` | Fonte equivalente ao tipo configurado: minute/hour em corrente, day/week em 5 min, month em 1 h; comparativo fechado não herda polling do painel. |

### Análises

| Widgets internos | Fonte mínima |
| --- | --- |
| `analysis_day_total`, `analysis_summary`, `analysis_scope_totals`, `analysis_scenario_cumulative` | Hora para dia único; dia para período maior. |
| `analysis_target_progress` | Mesma fonte do período mais dias da base. |
| `analysis_totals_table` | Horas do dia e dias do mês para acumulado; período longo usa dia. |
| `analysis_timeline`, `analysis_comparison` | Uma granularidade efetiva (minute/hour/day/week/month) escolhida pelo intervalo e limite de células. |
| `analysis_heatmap`, `analysis_hourly_occupancy`, `analysis_hour_profile` | Fonte horária de detalhe; em período longo, no máximo os últimos 31 dias para heatmap/detalhe. |
| `analysis_daily_comparison`, `analysis_cumulative`, `analysis_month_previous_metric`, `analysis_month_year_metric` | Dias do período e da base correspondente. |
| `analysis_trend` | Dias do período com prefixo de 29 dias. |
| `analysis_ranking`, `analysis_peak_days`, `analysis_rose` | Dias operacionais compartilhados. |
| `analysis_year_monthly`, `analysis_year_accumulated` | Dias de janeiro até o corte, consolidados localmente por mês. |
| Widgets personalizados | Reutilizam a fonte do `kind`/granularidade configurado; não criam novo GET quando já existe fonte equivalente. |

A análise inicial consulta ontem uma vez. Nova carga de métricas ocorre ao
aplicar período, mudar requisito semântico ou pedir atualização — não por timer.

### Relatórios

| Widgets internos | Fonte mínima |
| --- | --- |
| `report_counting_period_total`, `report_counting_end_month`, `report_counting_monthly_average`, `report_counting_access_leader`, `report_counting_year_over_year_month`, `report_counting_annual_comparison`, `report_counting_annual_accumulated_comparison`, `report_counting_access_ranking`, `report_counting_month_year_heatmap` | Histórico mensal compartilhado do intervalo solicitado. Comparações que incluem o presente recebem somente as bordas atuais/equivalentes necessárias. |
| `report_counting_day_month_heatmap` | Fonte diária do ano final no intervalo selecionado. |
| `report_counting_directional_flow` | Fonte horária dos últimos sete dias do intervalo. |
| `report_scenario_period_comparison`, `report_custom_{id}` | Fonte mensal compartilhada quando compatível; caso contrário, apenas a granularidade configurada do widget. |

Relatórios não fazem polling. Alterar apenas o cenário/local da apresentação
filtra os agregados da empresa já carregados; o padrão inicial é quatro anos,
mas o intervalo é configurável.

## Ocupação

As fontes têm semânticas distintas: `/occupancy` é fotografia atual,
`/occupancy/scenarios/{id}/aggregate` é série/tempo de estado e
`/occupancy/loitering/{summary,sessions}` é permanência concluída. Uma fonte
não substitui a outra.

### Ao Vivo

| Widgets internos | Fonte mínima e frequência |
| --- | --- |
| `occupancy_current_total`, `occupancy_active_areas`, `occupancy_scenario_detail`, `occupancy_duration_transitions` e métricas custom `current`/`active_areas`/`utilization` | Uma fotografia `/occupancy` compartilhada, 5 s quando demandada. |
| `occupancy_scenario_half_donut`, `occupancy_scenario_bar_race`, `occupancy_hex_layout`, máximos da hora aberta | Reutilizam a fotografia compartilhada; `/history?at` só no fallback de área ausente. |
| `occupancy_alerts`, `occupancy_alert_list`, alertas custom | `/scenarios/{id}/alerts?limit=12`, 5 s quando visível/demandado. |
| `occupancy_chart_minute` | Agregado minuto de 60 min; revisão em 5 s. |
| `occupancy_chart_hour` | Agregado horário do dia civil; revisão em 1 min. |
| `occupancy_chart_day`, `occupancy_average`, `occupancy_minimum`, `occupancy_peak` | Agregado diário de sete dias compartilhado; revisão em 5 min. |
| `occupancy_chart_week`, `occupancy_chart_month` | Oito semanas/15 min e doze meses/1 h, respectivamente. |
| `occupancy_duration_average`, `occupancy_duration_average_by_scenario`, `occupancy_duration_load`, `occupancy_duration_coverage`, `occupancy_duration_timeline`, `occupancy_duration_by_scenario` | Agregados de estado por hora fechada, com refinamento de minuto somente quando exigido; compartilham o plano. |
| `occupancy_duration_month_heatmap`, `occupancy_duration_scenario_heatmap`, `occupancy_duration_week_heatmap`, `occupancy_duration_daily_profile` | Fontes horárias/minuto do mês compartilhadas; revisão na virada de minuto. |
| `occupancy_loitering_minimum_by_area`, `occupancy_loitering_maximum_by_area`, `occupancy_loitering_range_by_area`, `occupancy_loitering_accumulated_session_time` e média individual do card de duração | Um `/loitering/summary` diário compartilhado; atualização de corrente em 5 s. |
| `occupancy_loitering_summary`, `occupancy_loitering_average_over_time`, `occupancy_loitering_percentiles_by_area`, `occupancy_loitering_area_period_heatmap` | `/loitering/sessions` do dia, seguido apenas de cauda recente em 5 s. |
| Widgets personalizados | Reutilizam snapshot, agregado, alerta ou permanência segundo a métrica/granularidade configurada. |

Comparativos/heatmaps de cenário têm seleções independentes, mas agregados
idênticos são compartilhados. O total principal é pré-carregado apenas se
visível; as demais famílias dependem de card visível e demandado no viewport.

### Análises e Relatórios

Análises reutiliza as famílias de agregado, comparação, duração e permanência
acima para o período aplicado, em modo manual. `occupancy_report_current`,
`occupancy_active_areas` e `occupancy_scenario_detail` usam o fechamento
`/history?at` para dia passado; `/occupancy` só quando a consulta é do dia
atual. `occupancy_report_average`, `occupancy_report_peak` e
`occupancy_report_minimum` compartilham `occupancy_report_day`. Os gráficos
`occupancy_report_minute`, `occupancy_report_hour`, `occupancy_report_day`,
`occupancy_report_week` e `occupancy_report_month` pedem apenas suas definições
ativas. Widgets custom reutilizam essas fontes por granularidade.

Relatórios não monta as famílias de comparação/duração/insights de Análises;
carrega KPIs, gráficos, permanência e custom somente após gerar o relatório.
Com média, mínimo e pico comparativos desligados, o período anterior agora
requer **zero** agregados. Ao ligar o comparativo, o período principal já
certificado é reutilizado e só as definições anteriores faltantes são
consultadas; desligá-lo não provoca nova consulta. Atualizar, trocar cenário,
empresa, fuso ou janela invalida esse reaproveitamento. O gráfico atual segue
visível durante a busca da referência, enquanto a exportação aguarda a base
comparativa para não produzir um relatório incompleto.

## Demografia

Os 14 widgets compartilham `GET /demographics/buckets?from&to` (buckets de
minuto). Hora, dia e mês são agrupamentos locais do mesmo conjunto:

| Widgets internos | Fonte mínima |
| --- | --- |
| `demographics_total`, `demographics_gender_leader`, `demographics_age_leader`, `demographics_emotion_leader` | Distribuições totais da fonte principal. |
| `demographics_gender_mix`, `demographics_age_distribution`, `demographics_emotion_distribution` | Mesma fonte principal, sem GET adicional por visualização. |
| `demographics_age_gender_pyramid`, `demographics_age_emotion_heatmap` | Cruzamentos produzidos localmente da mesma fonte. |
| `demographics_gender_timeline`, `demographics_emotion_hourly`, `demographics_age_hourly`, `demographics_daily_evolution` | Séries temporais consolidadas localmente da mesma fonte. |
| `demographics_period_comparison` | Fonte principal mais uma janela de referência no mesmo endpoint, apenas se o comparativo estiver visível. |

Ao Vivo usa partições estáveis e uma cauda móvel, renovada no minuto; o
comparativo só calcula sua janela civil quando está visível e há dados
primários. Análises consulta ontem na entrada e depois apenas período aplicado;
Relatórios espera a solicitação. Todos ocultos significam zero GETs de buckets.

## Limites do contrato e validação pendente em produção

- `analytics/aggregate` de Contagem devolve séries empresariais; o filtro de
  cenário é local. O backend não oferece filtro de cenário para reduzir esse
  payload nas consultas aqui utilizadas.
- `loitering/summary` e `loitering/sessions` aceitam câmera/área, mas não um
  `scenario_id`; a composição do cenário é feita no frontend.
- `/demographics/buckets` não declara completude, paginação nem total de
  linhas. Um intervalo anual pode exigir até 366 partições diárias, mais a
  referência do comparativo. Não se pode certificar truncamento de um dia
  muito denso nem prometer redução dessas leituras sem contrato agregado da API.
- A validação local cobre planos, cancelamento, visibilidade, fuso e resultados.
  Contagem física de requisições e p95 com dados reais requerem uma sessão
  autenticada na empresa e métricas do servidor (`Server-Timing`/banco).

## Validação local desta revisão

- 1.772 testes automatizados passaram; lint, verificação de tipos e build de
  produção concluíram sem erros.
- 36 cenários visuais gerais de Demografia passaram. Os quatro recortes mensais
  de gênero que antes tinham contraste insuficiente também passaram após
  correção restrita ao gráfico de evolução diária, sem mudar suas consultas.
