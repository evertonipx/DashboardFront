# Contrato JWT consumido pelo frontend

Este documento registra o contrato efetivamente observado em 12/08/2026. Ele
complementa o Swagger; não substitui a validação de assinatura e autorização no
backend.

## Claims reconhecidos

O frontend reconhece, de forma estrita, os claims canônicos emitidos pelo
IPXData: `sub`, `user_id`, `company_id`, `role`, `exp`, `iat` e `nbf`. Durante
uma migração também aceita aliases explicitamente permitidos, mas rejeita o
contexto inteiro se dois aliases de identidade ou autorização declararem
valores diferentes.

- `sub` e `user_id` identificam o usuário autenticado e devem coincidir.
- `company_id` é a empresa obrigatória de um usuário comum.
- `role` complementa os campos omitidos por `/auth/me`.
- `exp` e `nbf` limitam a validade local da sessão; o frontend nunca estende a
  validade além de `exp`.
- `company_timezone` (e aliases compatíveis) já pode completar o cadastro
  omitido por `/auth/me`, desde que seja um nome IANA válido e o `company_id`
  do token corresponda ao tenant efetivo. Claims específicos da empresa têm
  precedência sobre `timezone`/`tz` genéricos durante migrações do backend; um
  valor inválido deixa apenas o fuso sem resolução, sem derrubar a sessão.

O navegador apenas decodifica o payload para compor contexto e UX. Ele não
consegue certificar a assinatura. Todos os requests continuam enviando
`Authorization: Bearer <token>` e o backend permanece a única fronteira de
autorização.

## Reconciliação com `/auth/me`

O perfil retornado por `/auth/me` é reconciliado com o mesmo JWT que autenticou
a chamada. Identidade ou empresa explicitamente divergentes invalidam a sessão.
Campos explícitos de `/auth/me` têm prioridade; o JWT somente completa campos
omitidos, como `role`.

As permissões do próprio usuário usam `/users/{user_id}/permissions` em modo
JWT-only: a empresa selecionada por um superadmin não é anexada a essa chamada.
O endpoint `/users/me/permissions` não existe no backend atual.

## Empresa efetiva

- Usuário comum: a empresa vem do JWT. O frontend remove qualquer
  `X-Company-ID`, bloqueia escopo divergente antes da rede e não envia
  `company_id`/`user_id` redundantes no body.
- Superadmin: o JWT e `/auth/me` confirmam o papel; a empresa escolhida na UI é
  enviada por `X-Company-ID` apenas para endpoints tenant-aware. Cada operação
  congela esse escopo e descarta respostas tardias de outra seleção. O fuso do
  JWT só certifica essa seleção quando o `company_id` também coincide; para
  outro tenant, o frontend consulta `/companies/{id}` antes de navegar.
- Rotas administrativas com `/companies/{id}` devem usar o mesmo ID no path e
  no escopo selecionado; divergências são bloqueadas no cliente e devem também
  ser rejeitadas no servidor.

## Limitação confirmada do backend

No contrato vivo atual, `X-Company-ID` seleciona corretamente câmeras, locais e
cenários de Ocupação. Ele ainda é ignorado por `/workers`, `/workers/{id}`,
`/scenarios` de Contagem e `/users`. Não há rota alternativa
`/companies/{id}/workers` ou `/companies/{id}/scenarios`.

O frontend mantém filtragem fail-closed: registros devolvidos para outra
empresa não são mostrados. Para o superadmin enxergar workers e cenários da
empresa selecionada, o backend precisa aplicar o tenant efetivo derivado do JWT
master + `X-Company-ID` nessas rotas. Não é seguro contornar isso no frontend.
