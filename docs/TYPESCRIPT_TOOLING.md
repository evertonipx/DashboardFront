# TypeScript: aplicação, testes e ferramentas

A aplicação continua em `.ts`/`.tsx`, com `strict: true` e `allowJs: false`.
Os testes e as ferramentas Node usam `.mts` para preservar ESM sem alterar
globalmente o tipo de módulo do projeto. O `tsx` executa esses arquivos;
a verificação estática continua sendo responsabilidade do TypeScript.

## Comandos

```powershell
npm ci
npm run typecheck
npm test
npm run check:production
```

- `typecheck:app`: verifica a aplicação com o `tsconfig.json` do Next.
- `typecheck:tooling`: verifica testes e ferramentas com o `tsconfig.tooling.json`.
- `npm test`: descobre todos os `tests/*.test.mts` automaticamente, inclusive
  novas suítes. Executa no máximo dois arquivos em paralelo para limitar o uso
  de memória das fixtures que compilam TypeScript e renderizam gráficos.
- Os comandos `test:analytics`, `test:auth`, `test:demographics` e demais grupos
  continuam disponíveis para validação direcionada.
- `verify:responsive`, `verify:demographics`, `verify:demographics-circular`,
  `verify:demographics-temporal` e `verify:brand-mark`: verificações em Chrome.
- `context:skeleton`: gera o índice AST da aplicação, sempre relativo à raiz
  do projeto, independentemente do diretório atual do terminal.

Os comandos npm configuram `node --import tsx` e continuam compatíveis com o
requisito Node `>=20.9.0`; não dependem de suporte experimental nativo a TS
nem de expansão de curingas pelo shell do Windows.

## Limites deliberados

`eslint.config.mjs` e `postcss.config.js` permanecem nos formatos compatíveis
com seus carregadores. O JavaScript gerado pelo Next, o bootstrap de tema no
navegador e os scripts de fixtures enviados ao Chrome também permanecem JS.
Converter esses artefatos não tornaria os dashboards mais rápidos.

Algumas suítes injetam módulos e dados propositalmente inválidos para testar
autenticação, isolamento entre empresas, validação e falhas de rede. Seus tipos
dinâmicos (`RuntimeFixture`/`DynamicFixture`) ficam restritos aos testes, com
comentários nas fronteiras de execução. Eles não relaxam o compilador nem os
contratos da aplicação. Testes puros podem importar os módulos reais diretamente;
testes que precisam isolar mocks e estado usam caches próprios por suíte.

Os verificadores visuais compartilham a comunicação com o navegador e usam
esbuild para suas fixtures. Essas dependências são de desenvolvimento e não
são importadas pelos dashboards.

## Atualização de dependências

Next e `eslint-config-next` foram alinhados em `16.3.5`, com correções de
segurança da mesma linha de versão. As atualizações transitivas compatíveis
ficam registradas no `package-lock.json`; use `npm ci` em outro computador.
Após atualizar as dependências, reinicie o servidor de desenvolvimento ou
recompile e reinicie o serviço em produção.

## Validação da migração — 15/09/2026

- 1.275 testes aprovados no Node 20.9.0 e no Node 22.16.0.
- Checagem estrita da aplicação/ferramentas, lint e build de produção aprovados.
- Smoke visual em Chrome: marca, acessos compactos e gráficos demográficos,
  incluindo tema escuro e séries temporais em 320 px.
- `npm audit`: nenhuma vulnerabilidade reportada na árvore instalada.
- Nenhuma alteração em layouts, widgets, consultas ou regras de acesso da aplicação.
