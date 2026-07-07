# Contexto de Codigo para IA

Este projeto usa duas abordagens leves para facilitar leitura, auditoria e colaboracao com IA sem alterar a arquitetura do dashboard.

## Repomix

Use quando precisar enviar o frontend para uma IA revisar, debugar ou planejar refatoracao.

```powershell
npm run context:pack
```

Saida:

```text
context/ipxdata-frontend-repomix.xml
```

Versao comprimida, boa para conversas com limite menor:

```powershell
npm run context:pack:compressed
```

Saida:

```text
context/ipxdata-frontend-compressed.xml
```

O arquivo `repomix.config.json` inclui apenas codigo e documentacao relevante. Artefatos como `node_modules`, `.next`, `release`, logs, `.env`, pasta `frontend` antiga e binarios ficam fora.

## Esqueletizacao AST

Use quando quiser uma leitura rapida da estrutura do projeto sem enviar arquivos completos.

```powershell
npm run context:skeleton
```

Saida:

```text
context/ipxdata-frontend-skeleton.json
```

Esse arquivo lista funcoes, componentes, classes, tipos e interfaces de `app`, `components` e `lib`, com linha e assinatura resumida.

## Por que nao LanceDB neste frontend

LanceDB/ChromaDB fazem sentido quando o proprio software precisa consultar uma base vetorial local em runtime, especialmente em backend on-premise com agente autonomo. Este projeto e um frontend Next.js operacional; incluir banco vetorial aqui aumentaria dependencia, build e superficie de manutencao sem ganho direto para os clientes.

Se futuramente houver um backend/servico de IA local do IPXData, o caminho recomendado e:

1. Gerar esqueletos AST no backend.
2. Persistir embeddings desses esqueletos em LanceDB ou ChromaDB local.
3. Recuperar somente os trechos relevantes quando o agente precisar responder.
4. Manter essa camada fora do frontend do dashboard.
