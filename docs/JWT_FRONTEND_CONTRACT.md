# Contrato JWT consumido pelo frontend

Este documento registra o contrato efetivamente observado em 25/08/2026. Ele
complementa o Swagger; não substitui a validação de assinatura e autorização no
backend.

## Claims reconhecidos

O frontend reconhece os claims emitidos pelo IPXData: `sub`, `user_id`,
`company_id`, `role`, `is_master`, `exp`, `iat` e `nbf`, além de aliases
explicitamente permitidos durante migrações.

- `user_id` identifica o usuário da aplicação quando presente. `sub` é o
  subject JWT e funciona como fallback; ele pode ser e-mail, username ou o
  identificador do provedor e não precisa coincidir com `user_id`.
- `company_id` é a empresa obrigatória de um usuário comum.
- `role: super-admin` e `is_master: true` são indicações aditivas de Master. A
  mesma regra é usada na navegação e nas rotas internas, inclusive quando um
  `/auth/me` legado ainda devolve `is_master: false`.
- `exp` e `nbf` limitam a validade local da sessão; o frontend nunca estende a
  validade além de `exp`. Para `nbf`, há tolerância de até 60 segundos de
  diferença de relógio entre navegador e API; o backend continua validando o
  token em toda chamada.
- `company_id` e timezone também podem vir dentro de `company` ou `tenant`,
  inclusive em `metadata`/`settings`. Claims específicos da empresa têm
  precedência sobre `timezone`/`timeZone`/`tz` genéricos e o IANA precisa ser
  válido.
- O Swagger vivo de `/auth/me` não declara `role` nem `permissions`. Depois que
  a API aceita o mesmo Bearer, o `role` assinado e os claims explícitos
  `permissions`, `permission_slugs` ou
  `permissionSlugs` são autoritativos. As permissões vêm em formato de lista,
  no topo ou em `authorization`,
  `access` e `user`. Strings são convertidas em slugs e objetos precisam
  declarar `slug`; entradas explicitamente negadas ou sem nenhuma capacidade
  positiva são descartadas. Uma lista JWT válida — inclusive vazia — é a
  autorização da sessão e prevalece sobre campos legados. Escopos de empresa,
  formatos ou aliases conflitantes falham fechados com zero grants.

O navegador apenas decodifica o payload para compor contexto e UX. Ele não
consegue certificar a assinatura. Todos os requests continuam enviando
`Authorization: Bearer <token>` e o backend permanece a única fronteira de
autorização.

## Reconciliação com `/auth/me`

O perfil `200` retornado por `/auth/me` é a identidade autenticada autoritativa:
o backend já validou aquele Bearer. Identidade e empresa explícitas continuam
certificadas pelo perfil; `role`, `is_master` e permissões do mesmo JWT compõem
a autorização efetiva da sessão. Um alias novo ou com outra semântica não
fabrica logout e também não atravessa identidade ou tenant.

As permissões do próprio usuário usam `/users/{user_id}/permissions` em modo
JWT-only: a empresa selecionada por um superadmin não é anexada a essa chamada.
Quando o JWT declara grants, essa rota e `/permissions` apenas enriquecem os
grants correspondentes com `action`, `module_id` e `module`; respostas vazias,
extras, ambíguas ou de outra empresa não adicionam nem removem autorização. Se
o JWT omitir o claim, `/users/{user_id}/permissions` permanece a fonte oficial
documentada no Swagger. O endpoint `/users/me/permissions` não existe no
backend atual.

Se o JWT omitir permissões e a leitura oficial não puder certificá-las, o
frontend usa uma lista vazia. Grants de uma sessão anterior não são
reaproveitados. Da mesma forma, um slug compacto sem `action` só autoriza
escrita quando ele próprio declara uma ação mutável conhecida; `*_view` nunca
é elevado a gestão por heurística textual.

## Matriz de acesso efetiva

- Master: `is_master: true` ou `role: super-admin`; acesso global, sempre
  revalidado pelo backend.
- Admin: `role: admin` no JWT e grants explícitos do módulo. Uma `action`
  mutável certificada pelo catálogo libera a gestão daquele módulo; slugs
  legados específicos, sem metadados, só liberam o recurso correspondente.
- Operador: pode visualizar apenas os módulos concedidos. Grants com formato de
  escrita não transformam um `role: operator` em administrador e os dashboards
  não consultam `workers`, `cameras` ou `locations` para esse papel.

Além dos grants, a sessão consulta `GET /company/modules`. Uma associação
preservada para um módulo desabilitado não monta Contagem/Ocupação nem libera
suas rotas administrativas. Falha nessa certificação fecha o acesso ao módulo;
não assume que uma configuração antiga continua válida.

## Empresa efetiva

- Usuário comum: a empresa vem do JWT. O frontend remove qualquer
  `X-Company-ID`, bloqueia escopo divergente antes da rede e não envia
  `company_id`/`user_id` redundantes no body.
- Superadmin: o JWT e `/auth/me` confirmam o papel; a empresa escolhida na UI é
  enviada por `X-Company-ID` apenas para endpoints tenant-aware. Cada operação
  congela esse escopo e descarta respostas tardias de outra seleção. O fuso do
  JWT só certifica essa seleção quando o `company_id` também coincide; para
  outro tenant, o frontend consulta `/companies/{id}` antes de navegar.
- O timezone do JWT nunca é transferido da empresa-base de um Master para a
  empresa selecionada. Nesse caso, a empresa selecionada precisa ser hidratada
  pelo cadastro/cache do próprio tenant antes de uma consulta civil.
- Rotas administrativas com `/companies/{id}` usam o próprio path como escopo e
  não recebem `X-Company-ID`. Divergências entre o ID do path e a operação são
  bloqueadas antes da rede.

## Gestão cross-company no frontend

Alterações exclusivas de acesso não executam `PUT /users/{id}`. Perfil e
permissões são sincronizados separadamente com o ID certificado por
`GET /companies/{company_id}/users`. Para compatibilidade entre versões da API,
o frontend descobre a variante compatível por requisições `GET` e só avança
para a próxima forma após `404`; um `403` encerra imediatamente. A mutação é
então executada uma única vez na rota descoberta, sem repetir `PUT`, `POST` ou
`DELETE`. São consideradas a forma global com header, a forma global com
`company_id` e a forma administrativa
`/companies/{company_id}/users/{user_id}/...`. Uma falha de atualização do
perfil não cancela uma alteração de acesso já solicitada.

O navegador não pode gravar permissões no banco nem assinar um novo JWT. Se
nenhuma variante puder sequer ser certificada por leitura, não existe
associação local segura: o frontend mantém o acesso inalterado e informa a
falha em vez de simular uma autorização que a API não reconhecerá.

Quando a leitura de permissões termina especificamente em `404`, mas uma nova
leitura de `GET /companies/{company_id}/users` certifica exatamente `id`,
`company_id` e e-mail, a interface oferece um modo restrito de promoção
aditiva para Administrador da empresa. Esse modo não altera perfil, não revoga
acessos e não permite edição granular: envia somente os `POST` documentados em
`/users/{user_id}/permissions`, certifica `user_id`, `company_id`, `slug` e
`permission_id` em cada resposta e reverte os grants criados naquela tentativa
se uma etapa posterior falhar. Respostas `401`, `403`, falhas de rede e erros
`5xx` nunca habilitam esse fallback.

## Limitação confirmada do backend

No contrato vivo atual, `X-Company-ID` seleciona corretamente câmeras, locais e
cenários de Ocupação. Ele ainda é ignorado por `/workers`, `/workers/{id}`,
`/scenarios` de Contagem e `/users`. Não há rota alternativa
`/companies/{id}/workers` ou `/companies/{id}/scenarios`.

O frontend mantém filtragem fail-closed: registros devolvidos para outra
empresa não são mostrados. Para o superadmin enxergar workers e cenários da
empresa selecionada, o backend precisa aplicar o tenant efetivo derivado do JWT
master + `X-Company-ID` nessas rotas. Não é seguro contornar isso no frontend.
