# Auditoria de consultas dos menus administrativos

Revisão em 29/09/2026. Escopo: Superadmin, Auditoria, Visões, Workers,
Câmeras, Locais e Cenários. Os cadastros usam o escopo efetivo da empresa; o
frontend filtra respostas multiempresa antes de expô-las. Esta auditoria cobre
gatilhos de leitura, invalidação e regressões locais, não latência p95 do
backend autenticado.

| Menu | Leituras necessárias | Quando acontecem |
| --- | --- | --- |
| Superadmin | `/companies` no início; `/modules`, `/permissions`, usuários e módulos da empresa, `/workers` e configuração de IA conforme a aba | Abas carregam sob demanda; edição de permissão consulta detalhes só ao abrir. Sem polling. Atualizar e CRUD invalidam os catálogos afetados. Descoberta global de masters limita concorrência a quatro empresas e sinaliza respostas parciais sem cachear falha como lista vazia. |
| Auditoria | `/audit?page&limit` | Entrada, mudança de escopo/página/tamanho e Atualizar. Detalhe usa a página carregada; zero GET adicional e zero polling. Apenas superadmin. |
| Visões | `/scenarios` para construir/selecionar cenário, quando usuário e empresa permitem; preferências do user-grid | Uma leitura por escopo, sem polling no menu. Perfis do Video Wall aguardam hidratação segura antes de carregar ou persistir; a visão aberta consulta suas fontes específicas, com 5 s somente para intervalo ao vivo. |
| Workers | `/workers` e presença operacional | Catálogo na entrada, Atualizar e após CRUD. Presença a cada 30 s apenas com aba visível e sem diálogo/mutação. Atualizar ignora cache de leitura. |
| Câmeras | `/locations` + `/cameras`; `/cameras/{id}/line-counts` da câmera selecionada; setores somente no editor | Entrada, seleção relevante, Atualizar e pós-CRUD. Sem polling. Mutar câmera relê somente `/cameras`; mutar linha relê somente suas linhas. |
| Locais | `/locations` + `/cameras` para vínculos; `/locations/{id}/sub-locations` somente do local selecionado; `/workers` apenas se há vínculo a exibir ou o editor está aberto | Entrada, seleção de local, Atualizar e pós-CRUD, sem polling. Criar/editar local não depende de haver Worker: o vínculo é opcional e não integra o corpo do cadastro da API. |
| Cenários de Contagem | `/scenarios`; `/scenarios/{id}/result` por linha visível | Lista ao abrir a aba ou Atualizar. Resultados começam quando a linha entra no viewport, com no máximo quatro consultas simultâneas; cache isolado por usuário e empresa. Aba de Ocupação não consulta Contagem. CRUD e Atualizar revalidam a lista. Sem polling. |
| Cenários de Ocupação | `/occupancy/scenarios`; descoberta de áreas via `/occupancy/areas` e `/cameras` (fallback de snapshots/linhas) | A lista abre sem descobrir áreas. O catálogo potencialmente caro é consultado somente ao criar/editar cenário ou ao atualizar um catálogo já usado. Sem polling; edição permite tentar novamente após falha, sem apagar o formulário quando as áreas chegam. |

GETs de atualização explícita e pós-CRUD ignoram o cache de leitura para não
reapresentar um catálogo anterior à mutação. Seleção em lote preserva falhas
individuais e faz uma recarga ao fim, não uma por item.
Catálogos e formulários de infraestrutura/cenários perdem a certificação ao
trocar usuário mesmo que a empresa continue a mesma; respostas pendentes da
identidade anterior não repovoam a sessão nova.

## Limites conhecidos

- `/audit` no Swagger só aceita `page` e `limit`, sem filtro empresarial. Se o
  backend entregar páginas multiempresa, o frontend pode filtrar as linhas,
  mas não consegue prometer paginação nem total exato da empresa selecionada.
- A entrada de Câmeras/Locais ainda certifica `/locations` e `/cameras` como
  catálogo conjunto. Separar tolerância a falha parcial alteraria os contratos
  de habilitação de CRUD e exige revisão própria.
- Requisições físicas, saturação e p95 com dados reais precisam ser medidos
  com sessão autenticada e métricas do servidor. Os testes locais comprovam
  gatilhos e resultados previstos, não o desempenho do PostgreSQL.
