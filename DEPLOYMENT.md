# Implantacao do IPXData Frontend

Este projeto e um frontend Next.js. Em producao ele atende o navegador e faz proxy das chamadas `/api/v1` para a API. Por padrao, o destino usa o mesmo hostname ou IP aberto no navegador e a porta `8080`.

## Requisitos

- Node.js `>=20.9.0`
- npm `>=10.0.0`
- Acesso de rede do computador do frontend para o backend da API
- Porta liberada para o frontend, por padrao `3000`

## Arquivos importantes

- `.env.production`: configuracao real de producao, nao deve ir para o Git.
- `.env.production.example`: modelo para criar o `.env.production`.
- `package-lock.json`: deve ser mantido junto com o projeto para `npm ci`.
- `.ipxdata/dashboard-views.json`: layouts salvos de cards do dashboard.

## Instalacao em outro computador

1. Instale Node.js 20 LTS ou superior.
2. Copie o projeto ou descompacte o pacote `release/ipxdata-frontend-deploy-*.zip`.
3. Na raiz do projeto, crie o arquivo de ambiente:

```powershell
Copy-Item .env.production.example .env.production
notepad .env.production
```

4. Mantenha o destino dinamico para usar o IP ou hostname aberto no navegador:

```env
IPXDATA_API_URL=
IPXDATA_API_PROTOCOL=http
IPXDATA_API_PORT=8080
```

Por exemplo, ao abrir `http://10.0.0.20:3000`, as chamadas `/api/v1` serao encaminhadas para `http://10.0.0.20:8080`.

Defina `IPXDATA_API_URL` apenas quando o backend estiver em outra maquina ou dominio:

```env
IPXDATA_API_URL=http://10.0.0.30:8080
```

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

- Com `IPXDATA_API_URL` vazio, o proxy resolve o destino em cada requisicao usando `Host` ou `X-Forwarded-Host`, sem gravar o IP no build.
- `IPXDATA_API_PROTOCOL` e `IPXDATA_API_PORT` definem o protocolo e a porta usados com o hostname do navegador. O padrao e `http` e `8080`.
- `IPXDATA_API_URL` e um override opcional e deve ser usado somente quando frontend e backend estiverem em hosts diferentes.
- Alteracoes em `IPXDATA_API_URL`, `IPXDATA_API_PROTOCOL` ou `IPXDATA_API_PORT` exigem reiniciar o processo do frontend, mas nao exigem novo build.
- Em proxy reverso, configure o proxy para sobrescrever `X-Forwarded-Host` com o host publico confiavel. Nao preserve esse header quando ele vier diretamente do cliente.
- `NEXT_PUBLIC_IPXDATA_API_BASE_URL` deve ficar como `/api/v1` na maioria dos casos. Isso evita problemas de CORS usando o proxy do Next.
- `NEXT_PUBLIC_REPORT_HISTORY_START_YEAR` define o primeiro ano consultado pela matriz anual de Relatorios. O padrao e `2020`; ajuste para o inicio real da base antes do build e mantenha o valor estavel.
- A tela de login pode ser customizada por empresa via `NEXT_PUBLIC_IPXDATA_LOGIN_BRANDS`. A empresa e resolvida antes do login por query string, como `/login?empresa=cliente-a`, ou por subdominio, como `cliente-a.seudominio.com`.
- O vinculo `Location -> Worker` implementado no frontend fica salvo no navegador por empresa ate o backend expor `worker_id` em `Location` ou uma tabela de relacao. Em producao multiusuario, o backend precisa persistir esse vinculo para todos enxergarem a mesma configuracao.
- Widgets personalizados, configuracoes de cenarios por periodo e grupos locais de cameras ainda usam `localStorage`. Eles nao acompanham outro navegador ou computador ate serem persistidos pelo backend.
- `.ipxdata/dashboard-views.json` precisa ficar em volume persistente com backup. Para varias instancias do frontend, substitua esse arquivo por persistencia compartilhada no backend/DB.
- `npm audit` ainda reporta vulnerabilidade moderada herdada de `exceljs -> uuid`. O `npm audit fix --force` sugere downgrade quebravel do `exceljs`, entao nao foi aplicado automaticamente.

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
- API acessivel no hostname do navegador e em `IPXDATA_API_PORT`, ou no override `IPXDATA_API_URL`
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
