# Contrato JWT consumido pelo frontend

Este documento registra o contrato efetivamente observado em 24/08/2026. Ele
complementa o Swagger; não substitui a validação de assinatura e autorização no
backend.

## Claims reconhecidos

O frontend reconhece os claims emitidos pelo IPXData: `sub`, `user_id`,
`company_id`, `role`, `exp`, `iat` e `nbf`, além de aliases explicitamente
permitidos durante migrações. O Swagger vivo não documenta o payload interno
do JWT; por isso os aliases possuem precedência definida, em vez de serem
tratados como campos obrigatoriamente idênticos.

- `user_id` identifica o usuário da aplicação quando presente. `sub` é o
  subject JWT e funciona apenas como fallback; ele também pode representar
  e-mail, username ou o subject do provedor e não precisa coincidir com
  `user_id`. Por isso `user_id` só é comparado com `id`; somente `sub` pode ser
  reconciliado com o e-mail retornado por `/auth/me`.
- `company_id` é a empresa obrigatória de um usuário comum.
- `role` complementa campos omitidos por `/auth/me` somente quando o principal
  do token puder ser ligado ao mesmo usuário; um claim incompatível nunca eleva
  acesso na interface.
- `exp` e `nbf` limitam a validade local da sessão; o frontend nunca estende a
  validade além de `exp`.
- `company_timezone` (e aliases compatíveis) já pode completar o cadastro
  omitido por `/auth/me` quando a identidade for compatível. Durante uma
  migração do subject, o fuso ainda pode completar uma empresa que
  `/auth/me` informou explicitamente com o mesmo `company_id`; papel e acesso
  nunca atravessam essa exceção. O valor precisa ser um nome IANA válido.
  Claims específicos da empresa têm
  precedência sobre `timezone`/`tz` genéricos durante migrações do backend; um
  valor inválido deixa apenas o fuso sem resolução, sem derrubar a sessão.
  `timeZone` e `settings.timezone`/`metadata.timezone` também são aceitos como
  aliases de migração. Depois que `/auth/me` autentica aquele Bearer e informa
  explicitamente o mesmo `company_id`, a resolução do fuso é independente de
  claims de papel, subject e NumericDate: uma mudança nesses campos não pode
  descartar metadado operacional válido nem conceder autorização adicional.

O navegador apenas decodifica o payload para compor contexto e UX. Ele não
consegue certificar a assinatura. Todos os requests continuam enviando
`Authorization: Bearer <token>` e o backend permanece a única fronteira de
autorização.

## Reconciliação com `/auth/me`

O perfil `200` retornado por `/auth/me` é a identidade autenticada autoritativa:
o backend já validou a assinatura e resolveu aquele mesmo Bearer. Campos
explícitos de `/auth/me` têm prioridade; o payload JWT, que não pode ter sua
assinatura validada pelo navegador, somente completa campos omitidos quando os
claims forem compatíveis. Um alias novo, ausente ou com outra semântica não
derruba uma resposta que a API autenticou. Respostas `401` e `403` continuam
sendo decididas exclusivamente pelo backend. Conforme o schema publicado no
Swagger, uma resposta `200` sem `id` é malformada e não é publicada.

Cada resposta também fica vinculada à revisão local desse token. Se login ou
refresh substituir a sessão enquanto `/auth/me` estiver em trânsito, a resposta
antiga é descartada e a identificação recomeça com a sessão vencedora. Erros
atrasados nunca encerram o token novo, e escopo, cache, grid e preferências só
são publicados enquanto a mesma revisão continua ativa.

Na rotação silenciosa, uma autorização master já confirmada por `/auth/me`
permanece vinculada à mesma linhagem apenas quando o token novo não declara
outra identidade nem uma despromoção. Isso mantém `X-Company-ID` restritivo
quando versões do JWT omitem `role`/`is_master`; uma identidade divergente é
tratada como sessão inválida antes de qualquer replay.
Uma troca de schema entre `sub` (por exemplo, e-mail) e `user_id` (UUID) é
considerada indeterminada entre tokens e conferida contra o principal já
autenticado por `/auth/me`, evitando tanto logout falso quanto troca real de
conta durante o refresh.

As permissões do próprio usuário usam `/users/{user_id}/permissions` em modo
JWT-only: a empresa selecionada por um superadmin não é anexada a essa chamada.
O endpoint `/users/me/permissions` não existe no backend atual.

## Empresa efetiva

- Usuário comum: a empresa vem do JWT reconciliado com `/auth/me`. O timezone
  pode vir de claims canônicos no topo ou dentro de `company`/`tenant`
  (inclusive `settings`/`metadata`) e só vale para o mesmo `company_id`; um
  cache anterior também precisa estar ligado exatamente a esse ID. O frontend
  nunca consulta a rota administrativa `/companies/{id}` nesse bootstrap,
  remove qualquer `X-Company-ID`, bloqueia escopo divergente antes da rede e
  não envia `company_id`/`user_id` redundantes no body.
  Uma certificação IANA já vinculada ao tenant é registrada no cache da empresa
  mesmo quando `/auth/me` omite o nome comercial; assim a rotação do token não
  perde o fuso se uma versão do backend deixar de repeti-lo temporariamente.
- Superadmin: o JWT e `/auth/me` confirmam o papel; a empresa escolhida na UI é
  enviada por `X-Company-ID` apenas para endpoints tenant-aware. Cada operação
  congela esse escopo e descarta respostas tardias de outra seleção. O fuso do
  JWT só certifica essa seleção quando o `company_id` também coincide; para
  outro tenant, o frontend localiza o registro exato no catálogo global
  `GET /companies`, autorizado para superadmin. A seleção e o cache só podem
  completar um campo omitido quando também pertencem a esse mesmo ID.
- Rotas administrativas com `/companies/{id}` já são escopadas pelo próprio
  path e não recebem `X-Company-ID`. O frontend ainda bloqueia divergências
  entre o ID do path e o escopo explícito da operação; o backend permanece a
  fronteira final de autorização.
- Se JWT, `/auth/me`, catálogo, seleção e cache não informarem um IANA válido
  para o mesmo tenant, a consulta permanece bloqueada. Não há fallback para o
  fuso do navegador nem para uma empresa diferente.

## Limitação confirmada do backend

No contrato vivo atual, `X-Company-ID` seleciona corretamente câmeras, locais e
cenários de Ocupação. Ele ainda é ignorado por `/workers`, `/workers/{id}`,
`/scenarios` de Contagem e `/users`. Não há rota alternativa
`/companies/{id}/workers` ou `/companies/{id}/scenarios`.

O frontend mantém filtragem fail-closed: registros devolvidos para outra
empresa não são mostrados. Para o superadmin enxergar workers e cenários da
empresa selecionada, o backend precisa aplicar o tenant efetivo derivado do JWT
master + `X-Company-ID` nessas rotas. Não é seguro contornar isso no frontend.
