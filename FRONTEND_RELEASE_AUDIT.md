# Auditoria de lançamento do frontend IPXData

Data da revisão: **12/08/2026**

## Parecer executivo

Status: **NO-GO para produção multiempresa enquanto os bloqueadores externos P0 não forem concluídos**.

A revisão “Sweeper” eliminou divergências silenciosas importantes no frontend, padronizou escopo, fuso horário, atualização, preferências e apresentação entre Ao Vivo, Análises, Relatórios e Ocupação. Quando o contrato necessário não pode ser certificado, a interface agora falha de forma explícita em vez de converter ausência ou resposta incompleta em valor zero.

Esse endurecimento não substitui a autoridade do backend. A liberação para clientes ainda depende principalmente da certificação dos agregados de Ocupação, da validação server-side do escopo multiempresa e do endurecimento da sessão no navegador.

## Escopo desta revisão

### Integridade dos dados e recortes temporais

- Consultas de Contagem passaram a exigir um timezone IANA cadastrado para a empresa e correspondência com o calendário civil usado pelo navegador antes de agrupar ou exportar valores. Divergências são bloqueadas e dados antigos são limpos, evitando que um gráfico continue exibindo um resultado de outro contexto.
- As consultas de Ocupação usam intervalos com início inclusivo e fim exclusivo. No intervalo personalizado, o dia final selecionado representa todo o dia e a API recebe como limite o início do dia seguinte.
- A atualização periódica de Ao Vivo, Análises e Relatórios de Ocupação foi serializada: uma execução não inicia outra enquanto a anterior estiver pendente. Isso reduz respostas fora de ordem e sobreposição de ciclos de cinco segundos.
- O proxy de snapshots de Ocupação preserva falhas HTTP e converte respostas inválidas ou falhas de rede em erro. Ele não fabrica `data: []` e não interpreta ausência como ocupação zero.
- Falhas no carregamento de alertas de Ocupação foram isoladas dos demais indicadores; um erro nessa consulta não derruba todo o painel nem gera uma contagem falsa.
- Séries agregadas de Ocupação usam validação estrita no frontend. A compatibilidade com o contrato legado é limitada a buckets instantâneos de minuto/hora com timestamps RFC3339 absolutos; esses dados permanecem explicitamente provisórios e não liberam exportação certificada. Agregados civis de dia/semana/mês sem fuso e fechamento continuam indisponíveis, sem preenchimento, inferência ou conversão de ausência em zero.
- Uma falha em uma série agregada não derruba mais o snapshot e os indicadores ao vivo válidos. O erro fica isolado no widget afetado, enquanto qualquer cobertura incompleta ou provisória bloqueia a exportação do painel.
- Comparativos parciais da Contagem agora usam uma base temporal realmente comparável: recortam no mesmo minuto, reconciliam as horas de borda e preservam limites semiabertos em DST, meses curtos e anos bissextos.
- Bases horárias extensas de Ao Vivo, Análises, Relatórios, comparativos e visão embutida são consultadas em meses civis independentes, com cache por empresa e fuso. Cada resposta é validada contra o intervalo semiaberto solicitado; o histórico fechado é reutilizado, enquanto mês e hora abertos são atualizados sem rebaixar buckets já fechados.
- Os comparativos mensal e acumulado do Ao Vivo usam histórico realmente multi-ano. O mês aberto compara somente horas fechadas equivalentes, e períodos acima do limite seguro falham explicitamente em vez de publicar uma série truncada.
- Totais de Ocupação iguais a zero em cenários com várias áreas permanecem zeros certificados; a validação não os confunde mais com soma independente inválida.

### Escopo de empresa, usuário e superadmin

- O bootstrap de sessão reconcilia o mesmo JWT aceito por `/auth/me`: `sub` e `user_id` precisam identificar o mesmo usuário e `role` completa campos omitidos. Para usuários comuns, `company_id` não pode divergir do perfil explícito; para Master certificado pelo JWT ou pelo próprio `/auth/me`, a empresa contextual do perfil pode diferir da empresa-base do token sem substituir a identidade do principal. Claims conflitantes, expirados, ainda não válidos ou com timezone inválido são rejeitados.
- A validade local nunca ultrapassa o `exp` assinado. A confirmação master é vinculada ao access token e só atravessa refresh quando a identidade e o papel master continuam presentes no novo JWT.
- Usuários comuns usam exclusivamente a empresa assinada no JWT; qualquer `X-Company-ID` forjado é removido e um `companyScopeId` divergente é bloqueado antes da rede. O frontend não envia `company_id` nem `user_id` redundantes nos payloads operacionais.
- O carregamento das permissões do próprio usuário ignora a empresa visual selecionada pelo superadmin. Rotas administrativas bloqueiam divergência entre a empresa do path e o escopo congelado da operação.
- Respostas tenant-aware que omitem `company_id` só podem ser normalizadas quando o call site fornece a empresa da requisição autenticada. Um `company_id` explícito divergente continua sendo rejeitado.
- Consultas analíticas recebem o `company_id` efetivo de forma explícita por `X-Company-ID`, inclusive nos fluxos de comparação, relatório e visão incorporada.
- Um override de empresa só é aceito pelo Ao Vivo quando coincide com o escopo efetivo selecionado e possui fuso certificado. Overrides inconsistentes são bloqueados.
- O proxy de produção exige `IPXDATA_API_URL` fixo; o destino da API não é mais derivado de headers enviados pelo cliente.
- O proxy encaminha apenas headers permitidos, usa host/protocolo confiáveis, propaga cancelamento e impõe timeout. A rota especializada de snapshots também cancela e limita chamadas ao backend.
- A seleção de empresa do superadmin é propagada ao carregamento de metadados, cenários e agregados, sem reutilizar silenciosamente o contexto anterior.
- A grade de preferências do usuário passou a sincronizar somente chaves pessoais permitidas. Uma falha de leitura remota não autoriza escrita subsequente, dados de outras empresas não são mesclados e a ausência remota não é interpretada como exclusão.
- Preferências locais de módulo são isoladas por usuário. A persistência de visões no fallback em arquivo usa fila, lock interprocesso e substituição atômica, e não sobrescreve um arquivo corrompido como se estivesse vazio.
- Falhas transitórias de rede/5xx ao atualizar o usuário não encerram mais a sessão nem apagam permissões já conhecidas. Respostas de login/refresh são validadas antes de substituir tokens e sua expiração.
- O `localStorage` permanece como cache e fallback de preferências do cliente; ele não deve mais ser descrito como a única persistência de toda a grade. A disponibilidade compartilhada ainda depende do endpoint de preferências do backend.

### Padronização funcional

- Ao Vivo, Análises e Relatórios compartilham a seleção de módulo Contagem/Ocupação, com persistência e suporte a URL. A tela aguarda essa seleção antes de montar o módulo, evitando consultas transitórias do módulo errado.
- Títulos de widgets são individualmente editáveis e reutilizados nas superfícies e exportações cobertas por essa configuração.
- O organizador de widgets respeita a capacidade real de cada componente: controles sem efeito, como cor em gráficos governados por paleta semântica, foram ocultados.
- Preferências de ordem, visibilidade, tamanho, título e aparência passaram a alimentar a mesma composição usada em tela e nos relatórios cobertos pela grade.
- A seleção de intervalo de Contagem e Ocupação usa o mesmo seletor contínuo de datas, com calendário duplo, atalhos, rascunho e aplicação explícita. Cada módulo preserva seu próprio contrato de consulta e limite de período.
- As barras superiores do Ao Vivo e das Análises de Contagem e Ocupação foram compactadas no mesmo padrão: período, contexto e ações permanecem em uma única linha rolável, sem indicadores redundantes. Na análise de Ocupação, comparação temporal e séries históricas ficam reunidas em um painel único sem perder suas configurações.
- A paleta comparativa global ficou compacta no topo; o seletor fechado exibe somente as amostras de cor. Configurações exclusivas do simulador hexagonal permanecem no próprio widget.
- Modos de comparação atuais preservam a ordem cadastrada dos cenários. Barras horizontais/verticais, meia rosca, heatmaps e séries históricas seguem a mesma semântica de cenário.

### Design, UX e acessibilidade operacional

- Cards comuns deixaram de simular interatividade por hover. A resposta visual de arraste aparece apenas quando a reorganização está habilitada.
- Tema claro e escuro, estados indisponíveis, pontos parciais, textos auxiliares e contraste foram revistos nas superfícies de Contagem e Ocupação.
- O modo monitor usa altura dinâmica de viewport e mantém uma saída acessível também em dispositivos de toque.
- Navegação por teclado ganhou foco visível, seleção exposta nos seletores de cenário, skip-link e indicação acessível nas regiões horizontais. O calendário móvel muda de mês antes de mover o foco e limita a busca ao diálogo ativo.
- Animações dos gráficos respeitam `prefers-reduced-motion`.
- Densidade tipográfica mínima e comportamento responsivo da grade foram ajustados para evitar texto excessivamente pequeno e espaços vazios artificiais.
- Mensagens técnicas extensas foram retiradas da composição principal; bloqueios reais usam estados compactos com ação de tentar novamente quando aplicável.

### Limpeza e manutenção

- Implementações sem consumidor ativo foram removidas.
- Catálogos de widgets e rótulos foram alinhados aos IDs atuais das telas.
- Next.js, ESLint e PostCSS foram atualizados para versões sem vulnerabilidades conhecidas no relatório local de dependências.
- Configurações antigas de atualização da Ocupação e campos órfãos de cor foram removidos ou migrados para o componente que realmente os utiliza.
- Preferências antigas continuam sendo normalizadas quando há caminho de migração seguro; valores desconhecidos não são apagados durante sincronização defensiva.
- Polling da visão embutida separa metadados (30 s) de dados (5 s), usa single-flight/AbortSignal e descarta respostas de outra empresa ou visão.
- Exportações de gráficos sempre liberam canvas/DOM em `finally`, e um mutex síncrono impede exportações duplicadas por duplo clique.

## Bloqueadores externos

### P0 — Certificação dos agregados de Ocupação

O backend precisa certificar cada resposta agregada de Ocupação com, no mínimo:

- `timezone` explícito e igual ao fuso contratado para a empresa;
- `complete` e `status` coerentes com o fechamento do período;
- `as_of` indicando até quando os dados são conhecidos;
- `scenario_total_final` e `area_final` nos valores/buckets para distinguir o fechamento do ponto sem inferi-lo de média, mínimo ou máximo.

Os agrupamentos também precisam respeitar esse fuso nas viradas de hora, dia, mês e ano. A ausência de bucket deve permanecer “sem dado”, nunca “zero”. A API real verificada em 11/08/2026 ainda publica dia/semana/mês em fronteiras UTC e sem os metadados acima; por isso essas séries civis permanecem indisponíveis. Apenas minuto/hora com instantes RFC3339 absolutos podem ser exibidos provisoriamente, sem certificação nem exportação, até o contrato definitivo ser publicado.

### P0 — Autoridade multiempresa no backend

O frontend envia JWT e `X-Company-ID` de forma explícita e mantém a empresa selecionada pelo superadmin no contexto das consultas. Ainda assim, o backend deve:

- validar que um usuário comum ou admin só consulte a própria empresa;
- aceitar troca de empresa apenas para uma identidade master/superadmin autorizada;
- derivar ou validar `company_id` em workers, câmeras, linhas, áreas, locations e agregados;
- rejeitar `X-Company-ID` ausente, inválido ou não autorizado;
- registrar o escopo efetivo para auditoria.

Na API real verificada em 12/08/2026, `X-Company-ID` seleciona corretamente câmeras, locais e cenários de Ocupação, mas ainda é ignorado por `/workers`, `/workers/{id}`, `/scenarios` de Contagem e `/users`. As rotas alternativas `/companies/{id}/workers` e `/companies/{id}/scenarios` não existem. O frontend oculta respostas de outra empresa de forma fail-closed; para o superadmin enxergar esses recursos da empresa escolhida, o backend precisa aplicar o tenant efetivo nessas rotas.

Filtro e bloqueio no navegador não são barreiras de segurança. A garantia de isolamento entre empresas só existe quando essas regras são impostas pelo servidor.

### P0 — Sessão armazenada no navegador e CSP

Access token e refresh token continuam acessíveis em `localStorage`, e a aplicação ainda precisa de uma Content Security Policy de produção verificada. Um XSS poderia ler ambos os tokens.

A recomendação é migrar a sessão para cookies `HttpOnly`, `Secure` e `SameSite` por meio de BFF. Enquanto isso não ocorrer, TLS obrigatório, CSP restritiva, headers de segurança, revisão de dependências e rotação/revogação de tokens são requisitos mínimos de implantação.

### P1 — Granularidade do simulador hexagonal

Cada hexágono ainda representa o valor agregado do cenário ao qual foi associado. Repetir um cenário em 40 caixas, 100 mesas ou 300 vagas repete o mesmo agregado; isso não transforma cada célula em uma entidade individual.

Para representar ocupação real por vaga, mesa, posto, área ou fila, o domínio/API precisa fornecer uma identidade estável por entidade ou área e sua medição correspondente. O frontend não deve distribuir nem inventar valores individuais a partir de um total de cenário.

### P1 — Concorrência da grade pessoal

O endpoint `/users/me/grid` ainda recebe o documento completo por `PUT` e não publica revisão, `ETag`, `If-Match` ou operação incremental por chave. O frontend impede escrita depois de uma leitura falha, preserva chaves desconhecidas e faz merge defensivo, mas duas abas ou dispositivos que partam da mesma revisão ainda podem sobrescrever alterações distintas na ordem inversa de chegada.

O contrato recomendado é `PATCH` por chave com tombstone explícito, ou leitura/escrita otimista com revisão e resposta `409` para remerge. A homologação deve incluir dois clientes editando preferências diferentes simultaneamente.

### P1 — Procedência dos totais multiárea

O frontend rejeita o padrão conhecido no qual `AVG`, `MIN` e `MAX` de áreas independentes são somados como se fossem simultâneos. Igualdade numérica, entretanto, não prova sozinha qual algoritmo o servidor utilizou — dois resultados legítimos podem coincidir.

O backend deve publicar a procedência/estratégia do total do cenário (por exemplo, recomposição da linha temporal simultânea) e sua versão de agregação. Até esse metadado existir, coincidências multiárea não triviais permanecem conservadoras e não devem ser tratadas como certificação matemática completa.

## Riscos residuais e dívida técnica

- A sincronização das preferências depende da disponibilidade e do contrato do endpoint de grade do usuário; o cache local continua sendo apenas uma contingência do cliente.
- Muitos widgets independentes ainda podem aumentar linearmente o volume de polling. É necessário testar carga com a quantidade máxima prevista de monitores, empresas e cenários.
- Componentes centrais extensos devem continuar sendo separados por domínio, carregamento, modelo e apresentação para reduzir risco de regressão.
- Gráficos Canvas precisam de alternativa textual/ARIA consistente para leitores de tela.
- A revisão atual cobre verificações estáticas e testes automatizados focados, mas ainda não substitui E2E multiempresa nem homologação com o backend de produção.

## Validações confirmadas nesta revisão

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- Testes de analytics e recortes temporais no projeto principal: **175/175 aprovados**.
- Testes de analytics e regressões adicionais no `DashboardFront`: **197/197 aprovados**.
- Testes de autenticação e escopo multiempresa: **23/23 aprovados em cada projeto**.
- Testes de sincronização da grade do usuário: **3/3 aprovados**.
- `npm audit`: **0 vulnerabilidades conhecidas**.
- `npm run check:production`: **aprovado nos dois projetos** (208 testes no principal, 230 no `DashboardFront`, incluindo autenticação, escopo tenant e grade do usuário, além de lint, typecheck e build).
- `npm run build`: **aprovado nos dois projetos**, com 25 rotas geradas pelo Next.js 16.3.0 em cada um.

Não foram registrados nesta seção testes manuais de navegador, volume ou segurança que não tenham sido repetidos em 12/08/2026.

## Critérios para liberar produção

1. Publicar e validar o contrato certificado de agregados de Ocupação, incluindo fuso e estado parcial/final.
2. Demonstrar, por testes de integração, que o backend valida JWT, `X-Company-ID` e privilégios master em todas as entidades e consultas.
3. Endurecer a sessão no navegador e validar CSP/headers de segurança no ambiente de produção.
4. Repetir build, typecheck, lint e testes após qualquer correção posterior a esta auditoria.
5. Homologar usuário comum, admin e superadmin em pelo menos duas empresas reais, incluindo workers, câmeras, linhas, áreas, locations, Contagem e Ocupação.
6. Validar viradas de hora, dia, mês e ano no fuso da empresa com dados reais e valores conhecidos de ponta a ponta: IPXWorker → IPXData → Dashboard.
7. Executar teste E2E de Ao Vivo, Análises, Relatórios e exportações, além de carga do polling na escala máxima esperada.
8. Definir o modelo de entidade/área para o simulador hexagonal antes de usá-lo como mapa individual de mesas, vagas ou postos.
