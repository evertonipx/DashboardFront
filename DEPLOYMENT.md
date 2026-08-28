# Implantacao do IPXData Frontend

Este projeto e um frontend Next.js. Em producao ele atende o navegador e faz proxy das chamadas `/api/v1` para a API. O destino deve ser configurado explicitamente em `IPXDATA_API_URL`; o proxy nao deriva o backend de headers recebidos em producao.

## Requisitos

- Node.js `>=20.9.0`
- npm `>=10.0.0`
- Acesso de rede do computador do frontend para o backend da API
- Para Insights IA, acesso HTTPS de saida para `api.openai.com` na porta `443`
- Porta liberada para o frontend, por padrao `3000`

## Arquivos importantes

- `.env.production`: configuracao real de producao, nao deve ir para o Git.
- `.env.production.example`: modelo para criar o `.env.production`.
- `package-lock.json`: deve ser mantido junto com o projeto para `npm ci`.
- `.ipxdata/dashboard-views.json`: layouts salvos de cards do dashboard.
- `.ipxdata/ai-insights-config.v1.json`: configuracoes empresariais cifradas de IA.
- `.ipxdata/ai-insights-config.v1.key`: chave local de cifragem; preservar junto ao volume e nunca distribuir publicamente.
- `.ipxdata/ai-insights-reports.v1.json`: ultimo relatorio do IA Advisor por empresa, modulo e tela, cifrado no servidor.
- `.ipxdata/ai-insights-reports.v1.key`: chave de cifragem do historico; preservar junto ao arquivo e ao backup.

## Instalacao em outro computador

1. Instale Node.js 20 LTS ou superior.
2. Copie o projeto ou descompacte o pacote `release/ipxdata-frontend-deploy-*.zip`.
3. Na raiz do projeto, crie o arquivo de ambiente:

```powershell
Copy-Item .env.production.example .env.production
notepad .env.production
```

4. Informe o endereco fixo e confiavel da API:

```env
IPXDATA_API_URL=http://127.0.0.1:8080
IPXDATA_API_PROTOCOL=http
IPXDATA_API_PORT=8080
```

Nesse exemplo, as chamadas `/api/v1` serao encaminhadas para a API local na porta `8080`, independentemente do hostname usado para abrir o Dashboard.

Defina `IPXDATA_API_URL` apenas quando o backend estiver em outra maquina ou dominio:

```env
IPXDATA_API_URL=http://10.0.0.30:8080
```

O menu **Configuracao IA** e exclusivo do superadmin. Depois de selecionar a
empresa, ele cadastra a chave de projeto da OpenAI, define o prompt empresarial,
escolhe o modelo e habilita separadamente o botao para admins e operadores. A
configuracao fica no servidor Next, isolada por empresa, e nao no navegador do
usuario. Restrinja os modelos no `.env.production`:

```env
OPENAI_MODEL=gpt-5.6-terra
OPENAI_ALLOWED_MODELS=gpt-5.6-terra
```

A credencial e write-only: o `PUT /api/v1/ai/insights` aceita uma substituicao
somente de um superadmin autenticado, mas nenhum `GET` retorna a chave. O arquivo
`.ipxdata/ai-insights-config.v1.json` guarda o documento cifrado com AES-256-GCM;
a chave local de cifragem fica separada em
`.ipxdata/ai-insights-config.v1.key`. O ultimo relatorio compartilhado usa o cofre
separado `ai-insights-reports.v1.json` + `ai-insights-reports.v1.key`. Esses quatro
arquivos devem permanecer fora de commits, logs, capturas e pacotes publicos. O
volume precisa ser persistente, protegido e incluido no backup do cliente. A
perda de qualquer arquivo `.key` torna o respectivo cofre ilegivel. Use HTTPS,
chave de projeto restrita, limites de gasto e rotacao periodica. Para colocar os
cofres em outro volume, defina
`IPXDATA_AI_SETTINGS_DIRECTORY` com o diretorio persistente antes de iniciar o
Next.js.

O `user-grid` nao e usado para essa configuracao: o Swagger disponibiliza apenas
`/users/me/grid`, que pertence ao usuario autenticado e devolve o documento ao
navegador. Ele nao representa um escopo empresarial compartilhado e nao deve
transportar credenciais. Admins e operadores enviam somente o snapshot validado;
o servidor resolve chave, prompt e modelo da empresa sem expo-los ao cliente.

5. Instale dependencias e compile:

```powershell
npm ci
npm run check:production
```

6. Inicie o servidor:

```powershell
.\scripts\start-production.ps1
```

Por padrao o frontend sobe em `http://localhost:3000`. Em outro computador da rede, acesse usando o IP da maquina, por exemplo `http://192.168.14.10:3000`.

## Comandos uteis

```powershell
npm run typecheck
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

O script abaixo automatiza instalacao e build:

```powershell
.\scripts\prepare-production.ps1 -ApiProtocol http -ApiPort 8080
```

Para usar um backend em outro host:

```powershell
.\scripts\prepare-production.ps1 -ApiUrl "http://10.0.0.30:8080"
```

## Observacoes criticas

- `IPXDATA_API_URL` e obrigatorio em producao. Se estiver vazio, o proxy falha de forma fechada e nao encaminha credenciais para um host derivado da requisicao.
- `IPXDATA_API_PROTOCOL` e `IPXDATA_API_PORT` definem o protocolo e a porta usados com o hostname do navegador. O padrao e `http` e `8080`.
- `IPXDATA_API_URL` deve apontar para o endereco interno ou publico confiavel da API.
- Alteracoes em `IPXDATA_API_URL`, `IPXDATA_API_PROTOCOL` ou `IPXDATA_API_PORT` exigem reiniciar o processo do frontend, mas nao exigem novo build.
- `OPENAI_MODEL` define o padrao (`gpt-5.6-terra`) e `OPENAI_ALLOWED_MODELS` limita, em CSV, os modelos selecionaveis pelo superadmin; o padrao e sempre incluido.
- A rota de Insights IA envia somente a captura analitica validada, usa `store: false`, limita o corpo a 384 KiB e remove JWT, e-mail ou credenciais antes de chamar a OpenAI.
- A geracao dos Insights IA pode permanecer aberta por ate 90 segundos em relatorios extensos. Configure o timeout de leitura do proxy/load balancer acima de 100 segundos para que ele nao encerre uma resposta valida antes do Next.js.
- O limite local de Insights IA e de 3 chamadas por minuto e 20 por hora por usuario, com uma chamada simultanea por usuario e quatro globais. Esse limitador vive na memoria do processo; ao usar varias instancias, substitua-o por um armazenamento de rate limit compartilhado.
- Configure tambem limites de gasto e alertas no projeto da OpenAI. O limite local protege rajadas, mas nao substitui a governanca de consumo da conta.
- Em desenvolvimento, onde o fallback dinamico ainda existe, nao aceite `X-Forwarded-Host` enviado diretamente por clientes nao confiaveis.
- `NEXT_PUBLIC_IPXDATA_API_BASE_URL` deve ficar como `/api/v1` na maioria dos casos. Isso evita problemas de CORS usando o proxy do Next.
- `NEXT_PUBLIC_REPORT_HISTORY_START_YEAR` define o primeiro ano consultado pela matriz anual de Relatorios. O padrao e `2020`; ajuste para o inicio real da base antes do build e mantenha o valor estavel.
- A tela de login pode ser customizada por empresa via `NEXT_PUBLIC_IPXDATA_LOGIN_BRANDS`. A empresa e resolvida antes do login por query string, como `/login?empresa=cliente-a`, ou por subdominio, como `cliente-a.seudominio.com`.
- O vinculo `Location -> Worker` implementado no frontend fica salvo no navegador por empresa ate o backend expor `worker_id` em `Location` ou uma tabela de relacao. Em producao multiusuario, o backend precisa persistir esse vinculo para todos enxergarem a mesma configuracao.
- Widgets personalizados, configuracoes de cenarios por periodo e grupos locais de cameras ainda usam `localStorage`. Eles nao acompanham outro navegador ou computador ate serem persistidos pelo backend.
- `.ipxdata/dashboard-views.json`, `ai-insights-config.v1.*` e `ai-insights-reports.v1.*` precisam ficar em volume persistente compartilhado e com backup. Sem esse volume, reiniciar ou recriar a instancia apaga configuracao e historico; com varias instancias usando discos separados, o operador pode nao encontrar a ultima analise. Quando um volume compartilhado nao for possivel, use uma unica replica/sticky session ou mova a persistencia para backend/DB ou secret manager.
- Execute `npm audit` em cada entrega. Na revisao de 12/08/2026, nenhuma vulnerabilidade de dependencia foi reportada.

## Login customizado por empresa

Para configurar uma tela simples com logo da empresa + IPXData, adicione os logos em `public/brands/<chave>/logo.png` e configure o `.env.production` antes do build:

```env
NEXT_PUBLIC_IPXDATA_LOGIN_BRANDS=[{"key":"cliente-a","companyName":"Cliente A","logoUrl":"/brands/cliente-a/logo.png","accentColor":"#0B4EA2","subtitle":"IPXData"}]
```

Formas de abrir o login customizado:

```text
https://dashboard.seudominio.com/login?empresa=cliente-a
https://cliente-a.seudominio.com/login
```

Se nenhuma empresa for informada, o login padrao IPXData continua sendo exibido.

## Checklist de producao

- `.env.production` criado e revisado
- `IPXDATA_API_URL` definido e acessivel pelo processo do frontend
- Para Insights IA, egress HTTPS para `api.openai.com:443` validado e chave cadastrada pelo superadmin para cada empresa habilitada
- Proxy reverso validado para enviar um `X-Forwarded-Host` confiavel, quando aplicavel
- `npm ci` executado sem erro
- `npm run check:production` executado sem erro
- Login testado com usuario comum, admin e superadmin
- Login customizado testado com `/login?empresa=<chave>` para cada cliente
- Tela Ao vivo validada para cenario, local e sublocal
- Tela Visões validada com URL autenticada
- Workers conferidos por empresa no superadmin/manager
- Volume `.ipxdata` persistente e com backup validado
- Widgets validados em um segundo navegador/computador ou limitacao local aceita formalmente
