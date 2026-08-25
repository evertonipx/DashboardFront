# Contrato de ocupação

O Worker publica ocupação como fotografias de estado por região. Um novo evento
é enviado quando o valor muda; portanto, ocupação não pode ser agregada como uma
contagem de eventos.

## Catálogo autorizado de áreas

O Dashboard consulta `GET /api/v1/occupancy/areas` com o token da sessão. A
resposta canônica é:

```json
{
  "complete": true,
  "data": [
    {
      "company_id": "company-id",
      "camera_id": "camera-id",
      "area_id": "opaque-area-id",
      "area_name": "Área principal",
      "active": true,
      "source_kind": "region",
      "object_class": "person",
      "last_seen_at": "2026-08-03T12:30:00Z"
    }
  ]
}
```

Requisitos:

- a autorização e o isolamento da empresa vêm do JWT;
- `/cameras` e `/occupancy/areas` precisam expor exatamente o mesmo escopo de
  câmeras para o usuário autenticado;
- `(company_id, camera_id, area_id)` é único; `object_class` é um atributo
  canônico e versionado dessa identidade, não parte da chave;
- `area_id` é um identificador opaco, estável e não deve ser recomposto pelo
  Dashboard;
- áreas inativas continuam persistidas, mas não entram na criação de cenários;
- o catálogo é atualizado pelo provisionamento/heartbeat do Worker, não apenas
  quando o valor da região muda;
- `source_kind` é `region` e `object_class` identifica a classe medida; um
  cenário só pode selecionar áreas que ofereçam sua própria `object_class`;
- `object_class` é normalizado em lowercase no Worker/API. Se mudar, o Worker
  emite uma nova fotografia mesmo quando o valor numérico permanece igual;
- `last_seen_at` pode ser nulo antes da primeira fotografia válida.
- uma área sem `last_seen_at` ainda não possui baseline e não é oferecida para
  criação de cenários pelo Dashboard;
- `complete: true` só pode ser publicado depois do backfill. A versão atual do
  frontend exige o catálogo completo em uma única resposta e não aceita
  paginação parcial.

Renomear uma área preserva seu `area_id`. Remoção de área ou câmera é lógica e
mantém o histórico; reativação reutiliza a identidade anterior. Heartbeat de
configuração e `last_seen_at` da última medição são campos distintos.

Status atual: o Worker ainda não sincroniza definições de região no heartbeat.
Antes de a API responder `complete: true`, deve existir um full-sync
Worker→API com `worker_id`, `source_id` e geração/versão. Apenas uma leitura XML
concluída com sucesso pode inativar definições ausentes; falha de XML, câmera
offline ou Worker desconectado não equivale a remoção.

O padrão atual de `area_id` costuma conter câmera, canal, GPU, nome e `region`,
mas também pode ser substituído por um ID configurado. Consumidores sempre o
tratam como opaco. Se o nome mudar sem ID persistente, nasce uma nova identidade.
Quando `area_name` vier vazio, a API usa `area_id` como rótulo canônico.
`last_seen_at` é o maior `occurred_at` aceito, em RFC3339 UTC; eventos atrasados
não podem fazê-lo retroceder. `last_received_at` registra ingestão separadamente.

Enquanto a rota não existe (`404` ou `405`), o Dashboard mantém compatibilidade
com instalações anteriores descobrindo áreas pelos snapshots recentes,
metadados embutidos de câmera e line counts legados. Esse fallback não é um
catálogo completo e deve ser removido quando todas as APIs publicarem a rota
canônica. Um `200` com `complete` ausente/falso não pode ser tratado como
catálogo definitivo.

## Estado e agregação

Todas as consultas temporais usam intervalo semiaberto `[from, to)`. Para cada
`(company_id, camera_id, area_id, object_class)`, a API deve:

1. localizar o último valor com `occurred_at < from` como estado inicial;
2. processar mudanças quando `from <= occurred_at < to` — o evento em `from`
   vale desde o início e o evento em `to` pertence à próxima consulta;
3. carregar cada estado até a mudança seguinte;
4. montar a linha do tempo do cenário pela união cronológica das mudanças de
   todas as áreas e só então somar seus valores simultâneos;
5. calcular a média como `Σ(total × duração) / duração efetiva`, além de mínimo,
   máximo e valor final do total do cenário.

Eventos da mesma área com o mesmo `occurred_at` usam desempate determinístico
por sequência de ingestão e, em seguida, `external_event_id`. Estados com
duração zero não entram no mínimo/máximo. Cálculos mantêm precisão integral ou
decimal completa e só são arredondados na serialização final.

Uma área sem baseline anterior não vale zero: o bucket e o cenário ficam
`unknown/incomplete`. A API deve garantir baseline antes de ativar a área ou
retornar explicitamente essa condição. A política de obsolescência por câmera
offline, região removida ou ausência prolongada também converte o estado em
desconhecido; enquanto qualquer área obrigatória estiver desconhecida, total,
média, mínimo, máximo e alertas não são certificados.

Buckets civis seguem o fuso IANA configurado da empresa: semana começa na
segunda-feira, semestres começam em janeiro/julho e dias podem ter 23, 24 ou 25
horas. Dia/semana/mês/semestre/ano são serializados como datas civis canônicas;
o sufixo `Z` usado no transporte não pode convertê-los em meia-noite UTC.
Minuto/hora continuam sendo instantes RFC3339 absolutos.

No comparativo do relatório, cada bucket semanal é associado ao bucket iniciado
exatamente quatro semanas antes. A relação é um-para-um e não reutiliza nem pula
semanas nas viradas de mês. Mês, semestre e ano usam o mesmo bucket do ano
anterior.

Um único `as_of` é capturado no início da requisição. O bucket aberto termina em
`min(bucket_end, to, as_of)`, nunca no futuro. Zero conhecido produz uma linha
explícita; bucket desconhecido também é retornado com status incompleto, nunca
omitido. Eventos repetidos são idempotentes por `external_event_id`, e eventos
fora de ordem recompõem agregados e alertas afetados.

O `line_count_id` pertence ao fluxo de contagem e não pode excluir fotografias
de ocupação. `last_seen_at` acompanha o último snapshot válido e não substitui a
política de validade do estado.

## Totais certificados

Os endpoints de cenário usados pelo Dashboard são:

- `GET /api/v1/occupancy/scenarios/{id}/history?at=...`;
- `GET /api/v1/occupancy/scenarios/{id}/aggregate?from=...&to=...&granularity=...`;
- `GET /api/v1/occupancy/scenarios/{id}/alerts?limit=...`.

O agregado deve fornecer `scenario_total_avg`, `scenario_total_min`,
`scenario_total_max`, `scenario_total_final`, `as_of` e o status de
completude para cada bucket. Métricas por área obedecem às mesmas regras de
carry-forward e validade. Mínimos e máximos independentes de áreas ou câmeras
não podem ser somados no frontend, pois podem ter ocorrido em instantes
diferentes.

`scenario_total_final` é o estado imediatamente anterior ao fim do bucket
semiaberto. No bucket ainda aberto, seu corte é `as_of`; em buckets fechados,
seu corte é o fim exclusivo do bucket.

`/history?at=` resolve todas as áreas no mesmo instante com
`occurred_at <= at`, devolve `as_of` e sinaliza baseline ausente ou estado
obsoleto. A composição do cenário é versionada temporalmente: editar áreas hoje
não reescreve seus relatórios antigos. Eventos atrasados recompõem os buckets e
os alertas correspondentes de forma idempotente.

## Compatibilidade verificada da API atual

Na auditoria de 04/08/2026, a empresa de teste já estava configurada com
`America/Sao_Paulo`, mas a API agrupou `day` em UTC. Os parâmetros `timezone`,
`tz` e `utc_offset` foram ignorados. Uma consulta com os limites civis
`[03:00Z, 03:00Z)` devolveu dois buckets UTC, portanto os agregados civis ainda
não atendem a este contrato.

Também foi observado que a API atual:

- omite buckets sem evento em vez de retorná-los como incompletos;
- devolve zero no histórico quando falta baseline para uma área;
- usa corte estrito no instante do histórico em vez de `occurred_at <= at`;
- não publica `complete`, `as_of`, `scenario_total_final` ou duração certificada;
- aceita `minute`, `hour`, `day`, `week` e `month`, mas responde `400` para
  `semester` e `year`.

Enquanto essas lacunas permanecerem, o Dashboard exibe buckets omitidos como
`null` e cobertura parcial, nunca como zero. Semestre e ano permanecem fora do
catálogo de relatórios. A média civil diária/semanal/mensal só poderá ser
certificada depois que o backend aplicar o fuso IANA da empresa e publicar os
metadados de completude acima; a resposta atual não permite recomposição exata
e segura no frontend.
