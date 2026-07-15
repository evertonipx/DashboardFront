# Auditoria de lancamento do frontend IPXData

Data da revisao: 14/07/2026

## Parecer executivo

Status: **GO condicionado para piloto ou instalacao on-premise com uma unica instancia**.

Para producao multiempresa exposta a clientes, o parecer ainda e **NO-GO ate a conclusao dos bloqueadores P0** abaixo. O bundle compila, as rotas sao geradas e os fluxos principais funcionam, mas parte da configuracao operacional ainda depende do navegador ou do disco local do servidor Next.js.

## Entrega desta revisao

- Widgets personalizados agora aceitam dois tipos: visao individual e cenarios por periodo.
- Ao Vivo permite varios comparativos independentes, todos atualizados a cada 5 segundos.
- Relatorios permite varios comparativos e os inclui na exportacao configurada para PDF e Excel.
- Visoes permite configurar, para cada widget comparativo, granularidade, periodo, intervalo personalizado e cenarios selecionados.
- Widgets salvos no formato anterior continuam validos e sao normalizados como visao individual.
- A troca de empresa deixou de depender de um segundo estado `masterScopeId` duplicado em Ao Vivo e Ocupacao.
- Consultas analiticas dessas telas agora enviam `X-Company-ID` explicitamente.
- O logo horizontal da empresa ganhou proporcao legivel no login mobile e desktop.
- Relatorios ganhou uma visao executiva padrao com historico anual cumulativo, matriz ano x meses, acumulado comparavel, media mensal e variacao contra o mesmo mes do ano anterior.
- A inteligencia de contagem foi dividida em oito widgets independentes, todos reordenaveis, redimensionaveis e ocultaveis pelo organizador de Relatorios.
- O topo de Relatorios agora permite selecionar mes inicial e final, com atalhos para historico completo, ano atual e ultimos 12 meses; a escolha fica persistida por empresa.
- A representatividade dos acessos passou a usar o cenario como unidade de portao, com ranking de entradas, saidas, participacao e picos horarios.
- PDF e Excel seguem a ordem e a visibilidade dos widgets configurados e recebem os mesmos indicadores, graficos e tabelas detalhadas; rotulos densos usam orientacao vertical e ocultacao de colisao.
- O PDF completo passou a comprimir as imagens dos graficos sem reduzir a resolucao. No teste real, caiu de aproximadamente 40 MB para 466 KB.
- A grade compartilhada de widgets deixou de forcar cards com 520 px no mobile; a pagina nao apresenta mais overflow horizontal global.
- O projeto passou a executar o lint sem erros ou avisos.
- Relatorios passou a ser uma tela macro por padrao; indicadores intradiarios e graficos operacionais antigos deixaram o layout default e continuam disponiveis como widgets personalizados.
- O periodo macro agora pode incluir o mes parcial ou considerar somente meses fechados.
- O ranking usa barras horizontais, lista vertical, ordem crescente/decrescente e selecao em massa por palavras; a representatividade sempre totaliza 100% da selecao.
- O comparativo do ano atual contra o anterior foi incorporado ao grafico mensal por ano, com rotulos verticais, limiar pela media do ano comparado e tabela matricial separada.
- Ao Vivo passou a concentrar leitura operacional: horas fechadas contra ontem ou o mesmo dia da semana anterior, desempenho contra a media diaria e acumulados mensais comparaveis em dias completos.
- Janelas isoladas de 1, 5 e 60 minutos, projecao linear e o grafico default Dia a dia foram removidos do Ao Vivo; o grafico Mes ate agora ja cobre a leitura diaria.
- Hora a hora operacional usa barras lado a lado para os periodos comparados; a unica linha e o limiar derivado da media historica escolhida.
- O ranking mensal dos acessos usa cenarios, barras horizontais, participacao percentual e volume absoluto, com altura adaptada a quantidade de itens.
- A adicao de widgets fica exclusivamente dentro de Configurar widgets; ordem, visibilidade, tamanho, cor e criacao usam o mesmo organizador compacto.
- O componente modular do ECharts registra `MarkLineComponent`, garantindo a renderizacao das linhas de limiar no bundle de producao.
- O CRUD de cenarios permite adicionar todas as linhas, adicionar por filtro textual e criar cenarios individuais em lote sem duplicar linhas que ja possuem cenario unitario.
- Cor, ordem, tamanho, visibilidade, periodo, widgets personalizados e configuracoes analiticas sao persistidos por empresa, usuario e visao/cenario.
- As consultas escopadas usam JWT mais `X-Company-ID`; o frontend deixou de duplicar `company_id` na query string.
- Registros encadeados criados pela revalidacao de um mesmo worker sao consolidados defensivamente, mantendo aliases de todos os IDs e preservando workers reais distintos.
- O periodo global de Relatorios agora governa indicadores, matrizes, rankings, fluxo horario, comparativos padrao, widgets personalizados e os dados enviados ao Excel/PDF.
- A edicao das duas extremidades do periodo usa uma estabilizacao de 500 ms; consultas e exportacoes so usam o intervalo completo aplicado, sem carregar ou exportar uma selecao intermediaria.
- Linhas de limiar e media passaram a ser estaticas, solidas, sem simbolos ou animacao e com espessura de 1 px.
- As tabelas Ano x meses e comparativa foram consolidadas em uma unica matriz com anos, meses, acumulado, media e variacao do ano mais recente contra o anterior.
- O grafico Comparativo mensal por ano exibe a variacao percentual somente nos meses comparaveis, centralizada sobre cada grupo de barras e sem uma nova linha visual.
- PDF e Excel preservam ordem, visibilidade e cores configuradas; tabelas PDF usam grade por celula, texto limitado a coluna, cabecalho quebravel e altura calculada.

## Bloqueadores P0

### 1. Persistencia nao compartilhada

Widgets personalizados, configuracoes dos comparativos, layouts, cores, grupos de cameras e alguns vinculos operacionais usam `localStorage`. As chaves agora separam empresa, usuario e visao, mas as configuracoes continuam presas ao navegador que as criou e nao acompanham outro computador ou perfil do navegador.

Acao necessaria: persistir essas entidades no backend/DB por `company_id`, com versao, auditoria e controle de permissao. Ate isso existir, usar uma unica instancia e volume persistente com backup.

### 2. Contrato de empresa incompleto

No teste autenticado, `/auth/me` forneceu `company_id`, mas nao retornou o nome da empresa. O frontend deixou de executar o fallback proibido `GET /companies/{id}` para usuario comum, eliminando o `403`, mas sem cache previo a interface ainda mostra apenas "Empresa".

Acao necessaria: `/auth/me` deve retornar ao menos `company_id`, `company_name`, `role`, `is_master` e permissoes ou uma referencia autorizada. O backend deve aplicar o escopo da empresa em todas as consultas; o filtro no frontend nao e uma barreira de seguranca.

### 3. Contrato de worker insuficiente

O Swagger atual define `CreateWorkerRequest` e `UpdateWorkerRequest` apenas com `name` e `description`. `WorkerResponse` possui `company_id`, mas nao possui `user_id`; portanto o frontend nao consegue associar de forma auditavel o worker ao usuario que revalidou o login. Em teste real, a API retornou uma cadeia extensa de registros em que o nome do novo worker era o ID do anterior, todos vinculados a uma unica empresa.

Acao necessaria: o backend deve tornar a identidade do agente estavel, atualizar o mesmo registro na revalidacao, derivar e persistir `company_id` do JWT/escopo autorizado e retornar uma referencia de usuario quando essa rastreabilidade fizer parte do dominio. A consolidacao do frontend evita poluicao visual, mas nao pode transferir um worker entre empresas.

### 4. Destino de API dinamico

Resolvido no frontend: sem `IPXDATA_API_URL`, o proxy usa em tempo de execucao o hostname acessado pelo navegador, com protocolo e porta definidos por `IPXDATA_API_PROTOCOL` e `IPXDATA_API_PORT`. Nao existe mais IP de backend embutido no build.

`IPXDATA_API_URL` permanece como override opcional para implantacoes em que a API esteja em outro host. Em proxy reverso, o header `X-Forwarded-Host` deve ser sobrescrito pelo proxy com o host publico confiavel.

### 5. Sessao no navegador sem endurecimento

Access token e refresh token ficam em `localStorage`. O projeto tambem nao define uma Content Security Policy de producao. Um XSS teria acesso direto aos dois tokens.

Acao necessaria: preferir cookies `HttpOnly`, `Secure` e `SameSite` por meio de BFF. Se a migracao nao for imediata, implantar CSP, TLS obrigatorio, headers de seguranca e revisao de dependencias antes da exposicao publica.

## Riscos P1

- Permissoes operacionais usam aliases e inferencia textual. `canManageLocations` aceita qualquer permissao operacional, o que pode exibir funcoes alem do esperado. O backend precisa continuar sendo a autoridade final e o catalogo deve ser contratual.
- A direcao entrada/saida ainda nao e um campo contratual da API. O relatorio usa, nesta ordem, rotulo da linha, nome/descricao do cenario e multiplicador. Formalizar `direction: entry | exit` por linha elimina ambiguidade em nomes fora da convencao atual.
- Cada widget de cenarios por periodo no Ao Vivo executa seu proprio polling. Muitos widgets e monitores aumentam linearmente as chamadas a `/analytics/aggregate` a cada 5 segundos.
- O branding padrao usa `jk.png`. Sem chave por query/subdominio, empresas nao configuradas podem herdar a marca JK. O padrao deve ser IPXData e a JK deve ter uma chave propria.
- `npm audit --omit=dev` reporta duas vulnerabilidades moderadas herdadas de `exceljs -> uuid`. O fluxo atual nao usa as funcoes de UUID afetadas diretamente, mas a dependencia deve ser monitorada/substituida.
- Nao ha suite automatizada de testes unitarios, integracao ou E2E. Build e teste manual nao protegem regressao de escopo, permissoes e exportacao.
- Graficos Canvas nao possuem alternativa textual/ARIA equivalente para leitores de tela.

## Design e experiencia

### Pontos fortes

- Hierarquia visual consistente, controles compactos e boa densidade para uso operacional em monitores.
- Tema claro/escuro coerente e paleta de graficos adaptada ao dark mode.
- Visao executiva de Relatorios concentra indicadores, matriz anual, comparativo mensal, fluxo horario e ranking em uma unica faixa de leitura.
- Configuracoes complexas ficam recolhidas atras de uma engrenagem integrada a barra de acoes, sem reservar uma faixa exclusiva acima dos widgets.
- Modo monitor remove navegacao e controles de edicao sem perder a configuracao escolhida.
- Formularios e dialogos mantem alinhamento e quebra responsiva sem sobreposicao.

### Melhorias recomendadas

- No celular, graficos vazios mantem altura grande e tornam a pagina excessivamente longa. Usar altura menor para estado vazio ou alternar graficos por abas/carrossel.
- A navegacao mobile e horizontal e pode esconder itens sem indicar continuidade. Adicionar fade lateral ou menu compacto.
- Cards sem dados ocupam a mesma area dos cards com dados. Um estado vazio mais compacto melhora leitura e reduz rolagem.
- Componentes centrais com 2.000 a 3.000 linhas devem ser divididos por dominio, carregamento e apresentacao antes da proxima grande rodada de funcionalidades.

## Duplicidade confirmada

Ha implementacoes antigas sem rota consumidora, incluindo `components/app/live-dashboard.tsx`, `components/app/occupancy-dashboard.tsx`, `components/app/scenario-filter.tsx` e `lib/custom-aggregate-charts.ts`.

Elas nao entram no bundle atual, mas aumentam o risco de manutencao no arquivo errado. Remover em uma entrega isolada, apos registrar quais comportamentos ainda precisam ser preservados.

## Validacoes executadas

- `npm ci`: concluido usando o `package-lock.json`.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado sem avisos.
- `npm run build`: aprovado; 22 rotas geradas.
- Login desktop e mobile: inspecionado em Chromium.
- Ao Vivo autenticado: inspecionado em desktop e mobile com dados reais.
- Dialogo de novo widget: inspecionado em viewport desktop com configuracao completa do comparativo antes da criacao.
- Atualizacao de 5 segundos: 54 requisicoes analiticas observadas em 12,2 segundos no modo de desenvolvimento, cobrindo tres ciclos autenticados.
- Escopo de API: todas as requisicoes analiticas testadas enviaram `X-Company-ID` correto junto ao JWT e nenhuma incluiu `company_id` na query string.
- Teste de API: backend acessivel; a consulta proibida de empresa para usuario comum foi removida e a rodada final nao apresentou respostas HTTP de erro.
- Agregado mensal: janela de cinco anos aceita pelo backend e todas as linhas testadas retornaram `line_count_id`.
- Relatorios: inspecionado em Chromium a 1440 x 1000 e 390 x 844, em light e dark, sem overflow global.
- Ranking e comparativo anual: inspecionados em desktop, mobile, light e dark; canvases renderizaram com dimensoes validas e sem sobreposicao.
- Ao Vivo reformulado: sete widgets default no cenario testado, sem os indicadores de 1/5/60 minutos ou Dia a dia; ranking mensal e comparativos operacionais inspecionados em desktop e mobile dark.
- Organizador: nenhuma acao Adicionar widget aparece fora da engrenagem; Ao Vivo e Relatorios exibem exatamente uma acao dentro do dialogo e abrem um unico formulario de criacao.
- Cenarios: editor assistido e dialogo de criacao individual em lote inspecionados com linhas reais da API.
- Periodo de Relatorios: intervalo personalizado e modo aberto/fechado persistiram por empresa, usuario e cenario; os oito widgets macro apareceram no organizador.
- Persistencia: chaves de layout e configuracao verificadas com segmentos de empresa, usuario e visao.
- Workers: teste isolado consolidou uma cadeia de tres registros em uma identidade com tres aliases sem unir um segundo worker real no mesmo host.
- Exportacao completa: Excel com 11 planilhas (481 KB) e PDF com 24 paginas (457 KB) gerados com dados reais.
- Periodo global ponta a ponta: janeiro a marco de 2025 gerou apenas consultas finais do intervalo, sem requisicoes intermediarias; o Excel registrou o contexto e o periodo selecionado, e Excel/PDF repetiram a mesma consulta do comparativo.
- Artefatos da validacao de apresentacao: Excel de 266 KB, PDF de 401 KB com 17 paginas e captura completa de Relatorios, sem erros no console do Chromium.
- Matriz comparativa: 15 colunas com posicao e largura identicas entre cabecalho e corpo; Excel com bordas, quebra de cabecalho e cores de variacao; PDF com 1.006 retangulos de celula desenhados.

## Criterio para liberar producao

1. Resolver ou aceitar formalmente os cinco bloqueadores P0.
2. Testar usuario comum, admin e superadmin em pelo menos duas empresas reais.
3. Validar criacao, reordenacao e leitura dos mesmos widgets em dois computadores diferentes.
4. Executar teste de carga do polling com a quantidade maxima esperada de monitores e widgets.
5. Validar exportacao PDF/Excel com comparativos personalizados e mais de 12 cenarios.
6. Fixar DNS/TLS, variaveis de ambiente, backup do volume e estrategia de rollback.
