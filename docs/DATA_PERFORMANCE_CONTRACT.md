# Contrato de desempenho entre Next.js e PostgreSQL

Este documento registra o contrato necessário para que a otimização do
frontend seja acompanhada pelo backend. O Swagger atual permite reduzir e
reutilizar requisições no navegador, mas ainda não oferece todos os recursos
necessários para consultas longas com baixa latência.

## Objetivos mensuráveis

- Catálogos: uma única leitura física por usuário, empresa e janela de
  validade, mesmo com remontagem do React.
- Ao Vivo: somente fotografia/bucket aberto a cada 5 segundos; nenhum período
  histórico fechado deve ser relido nesse pulso.
- Análises e Relatórios: nenhuma atualização automática. Uma execução explícita
  deve produzir um plano finito e compartilhado entre os widgets.
- Resposta inicial do banco: p95 abaixo de 300 ms para Ao Vivo e abaixo de
  1,5 s para agregações históricas usuais.
- Toda resposta histórica precisa declarar cobertura e completude; quantidade
  de linhas nunca pode funcionar como paginação implícita.

## Responsabilidade já aplicada no Next.js

- Coalescer GETs semanticamente idênticos em um único transporte.
- Isolar cache por sessão, empresa efetiva, cabeçalhos e parâmetros.
- Invalidar leituras após CRUD e nunca armazenar respostas HTTP de erro.
- Manter cancelamento independente por consumidor e cancelar o transporte
  somente quando não restar consumidor.
- Reutilizar catálogos estáveis por TTL curto, sem cache público de dados JWT.
- Separar prefixo fechado da cauda móvel nas leituras ao vivo.
- Solicitar Brotli/gzip no salto Next.js → API e expor `Server-Timing`.
- Limitar concorrência e carregar somente as fontes de widgets materializados.

## Extensões prioritárias da API

### Envelope certificado

Todo agregado deve responder, no mínimo:

```json
{
  "scope": {
    "company_id": "empresa-efetiva",
    "timezone": "America/Sao_Paulo"
  },
  "from": "2026-09-01T03:00:00Z",
  "to": "2026-10-01T03:00:00Z",
  "as_of": "2026-10-01T03:05:00Z",
  "complete": true,
  "status": "complete",
  "next_cursor": null,
  "data": []
}
```

`from` é inclusivo e `to` exclusivo. O escopo deve ser derivado e autorizado
no backend a partir do JWT e, para Master, da empresa explicitamente validada.

### Agregação demográfica

Criar uma consulta agregada, em vez de devolver um ano de buckets brutos de um
minuto:

```text
GET /demographics/aggregate
  ?from=&to=
  &granularity=hour|day|month|auto
  &camera_ids=
  &dimensions=gender,age,emotion
```

A resposta deve trazer totais marginais, séries temporais e a matriz
idade × emoção. `GROUPING SETS` permite ao PostgreSQL produzir essas visões em
uma única leitura.

### Ocupação civil e lote

- Agregar `day`, `week` e `month` no timezone IANA certificado da empresa.
- Aceitar vários `scenario_ids`, `camera_ids` e áreas em uma requisição.
- Preservar soma ponderada e duração observada; nunca calcular média de médias.
- Para filtros grandes, disponibilizar `POST /analytics/query` idempotente com
  corpo JSON, limite explícito e hash estável da consulta.

### Delta ao vivo

Uma resposta ao vivo consolidada deve devolver fotografia atual, bucket aberto,
novos alertas e novas permanências com um único `as_of`/watermark. O cliente
envia `since` ou `If-None-Match`; sem alteração, a API responde `304` ou delta
vazio. SSE pode substituir o polling quando o Redis de ingestão estiver
disponível, mantendo REST para Análises e Relatórios.

### Permanência individual

- O resumo deve expor `count`, `sum_duration`, `min_duration` e
  `max_duration`; a média final é `SUM(sum_duration) / SUM(count)`.
- Sessões precisam de `session_id`, `limit` e cursor composto
  `(ended_at, session_id)`. `ended_at` sozinho não é único.

## PostgreSQL e TimescaleDB

Os nomes abaixo são modelos e devem ser ajustados ao schema real depois de
`EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)`.

### Índices de contagem

```sql
CREATE INDEX CONCURRENTLY ON event_aggregate_1h
  (company_id, metric_type, bucket DESC);

CREATE INDEX CONCURRENTLY ON event_aggregate_1h
  (company_id, camera_id, metric_type, bucket DESC)
  INCLUDE (line_count_id, object_class, total);

CREATE INDEX CONCURRENTLY ON scenario_line_count
  (scenario_id, line_count_id);
```

Aplicar equivalentes apenas nos agregados realmente consultados. Índice sem
evidência em `pg_stat_statements` não deve ser criado.

### Demográfico

```sql
CREATE UNIQUE INDEX CONCURRENTLY ON demographic_bucket_1m
  (company_id, camera_id, bucket, age_bucket, gender, emotion);

CREATE INDEX CONCURRENTLY ON demographic_bucket_1m
  (company_id, camera_id, bucket DESC);
```

Criar continuous aggregates de 1 hora e 1 dia pelas dimensões canônicas.
Comprimir chunks antigos, reter o minuto apenas pelo prazo operacional e manter
os agregados pelo período histórico. A política de refresh precisa sobrepor uma
janela recente para absorver eventos atrasados.

### Ocupação

`area_id` não deve permanecer apenas dentro de JSON para consultas frequentes.
Use coluna normalizada ou generated stored e índices parciais:

```sql
CREATE INDEX CONCURRENTLY ON occupancy_event
  (company_id, camera_id, area_id, object_class, occurred_at DESC)
  WHERE metric_type = 'occupancy';

CREATE INDEX CONCURRENTLY ON loitering_session
  (company_id, camera_id, area_id, ended_at DESC, session_id DESC);
```

Manter a fotografia atual em uma tabela pequena atualizada por upsert:

```sql
PRIMARY KEY (company_id, camera_id, area_id, object_class)
```

Criar agregados `occupancy_area_1m`, `occupancy_area_1h` e
`occupancy_area_1d`. A composição de cenário deve ser uma junção pequena sobre
as áreas, pois o cadastro do cenário pode mudar.

### Operação

- Habilitar `pg_stat_statements` e `track_io_timing`.
- Dimensionar chunks para que o chunk ativo caiba em memória.
- Ajustar autovacuum/analyze para tabelas de alta ingestão.
- Criar estatísticas estendidas para colunas correlacionadas de empresa, tipo,
  câmera e área.
- Usar pgxpool/PgBouncer com limite de conexões e backpressure; mais conexões
  que núcleos úteis podem piorar a latência.
- Definir `statement_timeout` curto para Ao Vivo e separado para relatórios.
- Aplicar predicado explícito de empresa em toda query, mesmo com RLS.

## Cache e segurança multiempresa

Chaves de cache de API/Redis devem conter:

```text
sessão/autorização + empresa efetiva + módulo + filtros + intervalo + versão
```

Para Master, a empresa enviada pelo frontend só pode entrar na chave depois de
autorizada no backend. Respostas autenticadas devem usar cache privado; nunca
CDN público. Quando houver validadores HTTP, responder com:

```text
ETag
Vary: Authorization, X-Company-ID, Accept-Encoding
Cache-Control: private, no-cache
```

## Ordem de implantação

1. Medir as queries atuais com `pg_stat_statements` e planos reais.
2. Entregar completude, `as_of`, timezone e cursor no contrato.
3. Criar agregado demográfico e ocupação civil nativa.
4. Implementar filtros em lote para eliminar N requisições por cenário.
5. Criar continuous aggregates e índices comprovados pelos planos.
6. Acrescentar ETag/watermark e cache privado/Redis com single-flight.
7. Consolidar o Ao Vivo e, se necessário, evoluir para SSE.

Cada etapa deve registrar quantidade de requisições, linhas e bytes retornados,
tempo de banco, tempo total e taxa de cache hit antes e depois.
