# Impacto dos eventos no fluxo de veículos do shopping

## Objetivo

Este relatório analisa a relação entre os eventos registrados na planilha
`D:\DashboardFront\eventos e fluxo de carros no estacionamento do shopping.xlsx`
e o movimento de veículos no estacionamento.

O arquivo contém 365 valores diários para 2025, 365 valores para 2026, totais
mensais e 142 comentários associados a dias específicos. Os comentários são a
fonte mais detalhada para relacionar evento, data e fluxo.

A própria planilha identifica a métrica como fluxo de veículos **com motos**.
Consequentemente, os totais não representam exclusivamente automóveis.

> **Leitura correta:** os resultados abaixo representam variação associada ao
> evento, e não causalidade comprovada. Campanhas, clima, férias, feriados,
> inaugurações e eventos simultâneos também podem alterar o movimento.

## Resumo executivo

- A base soma **1.136.447 carros em 2025** e apresenta **1.147.432 carros no
  cenário de 2026**, diferença de **+10.985 carros (+0,97%)**.
- O bloco de 2026 contém datas futuras e muitos valores copiados ou transpostos
  de 2025. Por isso, ele deve ser tratado como **cenário, orçamento ou
  projeção**, e não como um segundo ano integralmente realizado.
- As **corridas** são os eventos com sinal positivo mais forte e consistente.
  Nas ocorrências isoláveis, o acréscimo associado ficou geralmente entre
  aproximadamente **600 e 2.500 carros**.
- A retirada de kits pode gerar tráfego relevante, mas é menos consistente que
  a própria corrida.
- Eventos de vários dias, como **SPFW** e **Evento Casar**, distribuem o ganho ao
  longo da semana e reduzem a dependência de um único pico.
- Pré-estreias e eventos corporativos produzem, em geral, impacto menor no total
  diário, embora possam gerar público qualificado e consumo elevado.
- **Carnaval e Páscoa** produziram redução expressiva de veículos. O impacto
  negativo do calendário pode superar o ganho dos eventos promovidos no mês.
- No cenário de 2026, os dias de jogos da **Copa do Mundo** foram modelados como
  perda de fluxo, e não como ganho. As anotações de `4K` e `5,5K` representam
  ajustes negativos esperados.

## Metodologia

Para cada dia anotado foi utilizada uma referência local:

1. Selecionar os demais dias do mesmo mês e do mesmo dia da semana.
2. Excluir, sempre que identificáveis, dias com eventos ou feriados.
3. Utilizar a mediana desses controles como fluxo esperado.
4. Calcular:

```text
variação associada = fluxo registrado − fluxo esperado
uplift percentual = variação associada ÷ fluxo esperado
```

Para eventos de vários dias, os fluxos e as referências diárias foram somados.
Quando houve mais de um evento no mesmo dia, o resultado foi atribuído ao
**conjunto**, sem divisão artificial entre os eventos.

As quantidades informadas nos comentários, como `1.823 veículos`, representam
volume bruto associado ao evento. Elas não são necessariamente iguais ao ganho
incremental, porque parte do público poderia visitar o shopping mesmo sem o
evento.

### Classificação utilizada

| Uplift associado | Interpretação |
|---:|---|
| Acima de +30% | Muito alto |
| +15% a +30% | Alto |
| +5% a +15% | Moderado |
| -5% a +5% | Sem efeito líquido conclusivo |
| Abaixo de -5% | Negativo ou deslocamento de fluxo |

## Visão mensal

| Mês | Base 2025 | Cenário 2026 | Diferença | Variação |
|---|---:|---:|---:|---:|
| Janeiro | 85.249 | 86.424 | +1.175 | +1,38% |
| Fevereiro | 81.209 | 76.503 | -4.706 | -5,79% |
| Março | 88.222 | 95.180 | +6.958 | +7,89% |
| Abril | 92.228 | 93.641 | +1.413 | +1,53% |
| Maio | 103.796 | 105.319 | +1.523 | +1,47% |
| Junho | 98.726 | 93.165 | -5.561 | -5,63% |
| Julho | 96.027 | 91.476 | -4.551 | -4,74% |
| Agosto | 98.703 | 100.473 | +1.770 | +1,79% |
| Setembro | 83.305 | 89.978 | +6.673 | +8,01% |
| Outubro | 92.528 | 94.839 | +2.311 | +2,50% |
| Novembro | 101.323 | 102.676 | +1.353 | +1,34% |
| Dezembro | 115.131 | 117.758 | +2.627 | +2,28% |
| **Ano** | **1.136.447** | **1.147.432** | **+10.985** | **+0,97%** |

Janeiro é um exemplo da importância do calendário. O sábado adicional explica
aproximadamente **1.066 dos 1.175 carros** de crescimento mensal. Depois do
efeito-calendário, o residual é de apenas cerca de **109 carros (+0,13%)**.

## Corridas: principais geradores de fluxo

| Evento | Fluxo no dia | Referência informada | Variação associada | Leitura |
|---|---:|---:|---:|---|
| Circuito do Sol | 4.144 | 1.243 veículos | **+1.411 (+51,6%)** | Muito alto; a referência equivale a 30,0% do fluxo diário |
| Athenas Run Faster — março | 4.987 | 1.823 veículos | **+1.905 (+61,8%)** | Muito alto e coerente com o volume informado |
| Sírio-Libanês | 3.680 | 586 | **+598 (+19,4%)** | Alto; impacto menor em volume absoluto, mas claramente positivo |
| Corrida Live | 4.584 | 1.496 veículos | **+1.138 (+33,0%)** | Muito alto; aproximadamente um terço do movimento do dia está associado ao evento |
| T&F — maio | 4.081 | 1.258 veículos | **+1.408 (+52,7%)** | Muito alto; o evento altera materialmente o domingo |
| ASIC | 5.079 | 1.832 | **+2.406 (+90,0%)** | Um dos maiores picos da base |
| Athenas — junho | 5.471 | 1.815 veículos | **cerca de +2.034 (+59,2%)** | Muito alto, mas coincide com a janela do Cine Vista |
| Hoka | 5.128 | 1.832 carros | **+2.212 (+75,9%)** | Muito alto; forte efeito também no estacionamento |
| Track & Field — agosto | 4.541 | 1.398 carros | **+1.276 (+39,1%)** | Muito alto; a referência representa 30,8% do fluxo diário |
| New Balance SP | 4.279 | 1.523 veículos | **+1.014 (+31,1%)** | Muito alto; parte do volume bruto substitui tráfego que já existiria |
| Athenas — outubro | 5.333 | 2.132 | **+2.515 (+89,2%)** | Maior efeito percentual entre as corridas recorrentes |
| Decathlon | 5.480 | Sem volume informado | **+1.590 (+40,9%)** | Muito alto, mesmo sem referência direta de participantes |
| Meia Sampa | 3.620 | Sem volume informado | **-100 (-2,7%)** | Sem ganho líquido conclusivo no total diário |
| Netshoes | 2.170 | Sem volume informado | **-96 (-4,2%)** | Sem ganho líquido conclusivo; o cenário de 2026 diverge fortemente |
| T&F + Finados | 4.170 | Eventos simultâneos | **+450 (+12,1%)** | Positivo, mas corrida e feriado não podem ser separados |

### Conclusão sobre corridas

As corridas são o formato mais confiável para fomentar o tráfego. Athenas,
Hoka, ASIC, Live, Circuito do Sol, T&F, New Balance e Decathlon apresentam
picos consistentes. O efeito é produzido por participantes, acompanhantes,
organização, fornecedores e consumo antes ou depois da prova.

Recomendações:

- manter parcerias com organizadores e marcas esportivas;
- antecipar a abertura de alimentação, estacionamento e serviços;
- criar benefício pós-prova com validade curta;
- medir separadamente inscrição, retirada de kit, largada e pós-evento;
- capturar placas ou vouchers de evento apenas de forma agregada e compatível
  com a política de privacidade.

## Retirada de kits

| Evento | Fluxo registrado | Variação associada | Leitura |
|---|---:|---:|---|
| Kit T&F — maio | 3.845 | -218 (-5,4%) | Não elevou o total diário de forma perceptível |
| Kits Hoka — junho, dois dias | 8.121 | +430 (+5,6%) | Ganho moderado e distribuído |
| Kit Hoka — julho | 4.781 | +1.232 (+34,7%) | Forte ganho; bom potencial de conversão em compras |
| Kit T&F — agosto | 4.449 | +581 (+15,0%) | Ganho alto |
| Kit T&F — novembro | 4.300 | -25 (-0,6%) | Sem efeito líquido conclusivo |

A retirada de kits não deve ser tratada apenas como apoio operacional. Quando
acompanhada por benefício de alimentação, estacionamento ou varejo esportivo,
ela pode transformar uma visita obrigatória em permanência e consumo. Os dados,
porém, mostram que o resultado varia bastante entre edições.

## Moda, entretenimento e eventos empresariais

| Evento ou conjunto | Fluxo/janela | Variação associada | Interpretação |
|---|---:|---:|---|
| Conclave + início do evento Arezzo | 2.703 | +102 (+3,9%) | Sem ganho diário conclusivo; os dois efeitos estão misturados |
| Arezzo — janela de quatro dias inferida | 11.847 | +669 (+6,0%) | Efeito moderado e distribuído; duração não está totalmente anotada |
| Pré-estreia Emilia Pérez | 2.591 | -10 (-0,4%) | Não alterou o total diário de veículos |
| Evento Even Construtora — 600 convidados | 2.703 | +133 (+5,2%) | Efeito moderado; convidados não equivalem a carros |
| Evento Banco Santander | 2.704 | +134 (+5,2%) | Efeito moderado e localizado |
| Sessão especial Bridget Jones | 2.653 | -50 (-1,8%) | Sem ganho líquido conclusivo no total diário |
| Mickey 17 — 488 convidados | 2.844 | +120 (+4,4%) | Sem ganho líquido conclusivo no estacionamento |
| Talk com Moni + Meninas Malvadas + Rocky | 4.908 | +771 (+18,6%) | Alto, mas não é possível dividir entre os três eventos |
| SPFW — três dias anotados | 9.680 | **+1.207 (+14,2%)** | Ganho relevante e distribuído durante o evento |
| Pré-estreia Homem com H | 2.818 | -63 (-2,2%) | Sem ganho líquido conclusivo |
| Pré-estreia Thunderbolts | 2.973 | +419 (+16,4%) | Alto para uma ação de cinema isolada |
| Oportunidade do Bem — quatro dias anotados | 12.913 | **+1.038 (+8,7%)** | Moderado; referências explícitas somam 241 veículos e há outro jantar no período |
| Missão Impossível 8 | 3.071 | -286 (-8,5%) | O dia ficou abaixo da referência; não há evidência de ganho no total diário |
| Evento Casar — seis dias anotados | 22.686 | **+4.076 (+21,9%)** | Forte resultado agregado, mas inclui outros eventos no último dia |
| Evento Casar sem o dia de Plié/Lilo & Stitch | — | **cerca de +2.283** | Melhor estimativa do ganho distribuído exclusivamente pela janela principal |
| Plié + Lilo & Stitch + Evento Casar | 4.466 | +1.793 (+67,1%) | Pico forte, porém impossível atribuir a apenas um dos três eventos |
| Cine Vista — período informado | 31.227 | +604 (+2,0%) | O total fica praticamente neutro e inclui a corrida Athenas |
| Cine Vista sem o dia da corrida Athenas | — | Cerca de -1.400 (-5%) | Não há evidência de ganho independente do Cine Vista nessa janela |
| Pré-estreia F1 | 3.109 | +90 (+3,0%) | Sem ganho líquido conclusivo; a anotação de 1.000 era previsão, não carros certificados |
| Jogo Cruzado | 3.083 | +386 (+14,3%) | Efeito moderado |
| Superman + feriado de 9 de julho | 3.631 | +669 (+22,6%) | Alto, mas filme e feriado não podem ser separados |
| Smurfs + Só Quero Pedalar | 3.076 | +160 (+5,5%) | Moderado; a corrida informa somente 95 veículos |
| Hering — 350 convidados | 2.824 | +126 (+4,7%) | Sem efeito líquido conclusivo no total do estacionamento |
| Amores Materialistas + Ferragamo + Jersey Boys | 3.053 | +356 (+13,2%) | Moderado; resultado pertence ao conjunto |
| Igt Talks — dois dias | 5.797 | +294 (+5,4%) | Moderado e distribuído |
| Black Friday | 4.150 | +697 (+20,2%) | Alto impacto comercial no fluxo de veículos |

### Conclusões sobre cinema, teatro e eventos de marca

- Pré-estreias isoladas normalmente têm efeito pequeno no total diário. Seu
  valor pode estar mais no consumo noturno e no público qualificado do que no
  volume absoluto.
- Quando cinema, teatro, rooftop e jantar ocorrem juntos, o impacto se torna
  relevante, mas o arquivo não permite determinar qual atração gerou cada
  carro.
- SPFW e Evento Casar indicam que eventos de vários dias podem ser melhores
  para sustentar movimento ao longo da semana.
- Quantidades em **convidados** não devem ser convertidas diretamente para
  veículos. Para isso seriam necessários taxa de comparecimento, uso do
  estacionamento e ocupação média por automóvel.

## Calendário, feriados e grandes eventos externos

| Evento | Variação associada | Impacto observado ou modelado |
|---|---:|---|
| Carnaval 2025 — cinco dias | **-4.689 (-31,9%)** | Forte retração durante o feriado |
| Retorno do Carnaval | **-821 (-28,4%)** | Recuperação não ocorreu imediatamente |
| Carnaval completo, incluindo retorno | Cerca de **-5.510 carros** | O efeito negativo supera diversos eventos promocionais pequenos |
| Paixão de Cristo + Páscoa | **-2.603 (-38,1%)** | Forte deslocamento de fluxo para fora do shopping |
| Tiradentes | +325 (+14,0%) | Resultado positivo naquela configuração de calendário |
| Corpus Christi | -280 (-8,5%) | Redução moderada |
| Independência do Brasil | +88 (+3,1%) | Sem efeito líquido conclusivo |
| Nossa Senhora Aparecida | +266 (+9,4%) | Ganho moderado naquela ocorrência |
| Proclamação da República | -335 (-7,7%) | Redução moderada |
| Consciência Negra | -120 (-3,7%) | Sem efeito líquido conclusivo |

Feriados não têm um comportamento único. Dia da semana, duração, possibilidade
de viagem, operação do shopping e programação de lazer determinam se haverá
ganho ou perda.

## Copa do Mundo e eleições — cenário 2026

Os comentários da planilha mostram que a Copa foi utilizada como redutor do
fluxo projetado:

- jogos de junho: aproximadamente **-4.004 carros** frente à referência local;
- jogos de julho: aproximadamente **-3.992 carros** pela mediana mensal;
- pela lógica de transposição utilizada na própria planilha, julho recebe ajuste
  próximo de **-5.511 carros**, coerente com a anotação `-5,5K`;
- a corrida Hoka no mesmo dia de um jogo praticamente neutraliza a perda
  projetada, demonstrando como dois eventos simultâneos podem se compensar.

Portanto, as anotações `4K` e `5,5K` não devem ser apresentadas como geração de
tráfego. Elas são compatíveis com **perda ou deslocamento de veículos durante
os jogos**. Ativações gastronômicas e transmissão das partidas seriam
necessárias para tentar reter esse público.

Os dois turnos das eleições também foram projetados com redução combinada de
aproximadamente **31,7%** frente aos demais domingos comparáveis. A tendência é
de deslocamento do movimento para depois do período de votação.

## Eventos sem mensuração individual suficiente

Os eventos abaixo aparecem na lista mensal, mas não possuem combinação completa
de data isolada, unidade e fluxo específico. O impacto real individual não pode
ser calculado com segurança apenas com esta planilha.

| Evento | Influência operacional provável | Situação na base |
|---|---|---|
| Reinauguração Sephora | Pico localizado, filas, beleza e alimentação | Somente referência mensal |
| Evento Lindt | Público qualificado, presentes e experimentação | Somente referência mensal |
| Better Man | Tráfego noturno de cinema | Sem data isolada no fluxo diário |
| Meninas Malvadas | Entrada e saída concentradas no teatro | Aparece também em dias com outros eventos |
| Rocky — O Musical | Noite, rooftop, restaurantes e valet | Misturado com outras atrações |
| Comida di Buteco | Almoço, happy hour e permanência gastronômica | Sem data individual certificada |
| Evento Estadão | Público corporativo e consumo qualificado | Sem data individual certificada |
| Evento Nissini | Fluxo concentrado no teatro | Sem data individual certificada |
| Reinauguração Boss | Movimento premium localizado | Somente referência mensal |
| Caudalie | Beleza, relacionamento e evento de dia útil | Sem volume individual |
| Fulgor Milano | Público de arquitetura/design e restaurantes | Sem volume individual |
| Dreamgirls | Pico pré e pós-espetáculo | Sem data isolada |
| Jersey Boys — temporada | Teatro, rooftop e alimentação | Apenas o preview aparece em conjunto com outros eventos |
| GATE | Potencial pico de um dia | Natureza, data e público não descritos |
| Storm | Potencial fluxo esportivo matinal | Sem volume ou data isolável |
| Vênus | Esporte, beleza e bem-estar | Sem volume ou data isolável |
| Track & Field JK | Tráfego esportivo e retirada de kits | Nome usado para diferentes ocorrências |
| Rooftop genérico | Fluxo noturno dependente de clima e programação | Sem identificação da atração |
| Teatro genérico | Picos de entrada e saída | Sem espetáculo e data certificados |

## Ranking dos formatos mais eficazes

1. **Corridas com estacionamento no shopping:** maior efeito absoluto e
   percentual, frequentemente acima de 30%.
2. **Grandes eventos esportivos com retirada de kits:** criam duas oportunidades
   de visita, embora o resultado da retirada seja variável.
3. **Eventos de vários dias:** SPFW e Evento Casar sustentam tráfego ao longo da
   semana.
4. **Combinações de teatro, rooftop, jantar e cinema:** podem gerar bons picos,
   mas precisam ser cadastradas separadamente para medir cada componente.
5. **Black Friday e calendário comercial:** efeito forte, desde que comparado
   com a sexta-feira equivalente.
6. **Pré-estreias isoladas e eventos corporativos:** normalmente têm menor
   efeito no total, mas podem gerar público de maior valor.
7. **Feriados e jogos:** podem retirar mais tráfego do que eventos menores
   conseguem adicionar.

## Recomendações para medir os próximos eventos

Cada evento futuro deve ser registrado com:

- identificador único;
- nome e categoria;
- data e horários de início e término;
- espaço utilizado;
- quantidade de inscritos, convidados e veículos, em campos separados;
- retirada de kit separada da corrida;
- campanhas e promoções relacionadas;
- clima e feriados concorrentes;
- fluxo de entrada por hora;
- fluxo de saída por hora;
- permanência média;
- baseline previamente calculada;
- indicação explícita de `observado`, `orçado` ou `projetado`.

Com horário de início e término, a medição pode comparar o pico anterior, a
janela do evento e o período posterior. Isso permite separar geração real de
tráfego, antecipação de visitas e simples deslocamento de horário.

## Problemas de qualidade encontrados

- O bloco de janeiro/2026 informa `87.424`, mas a soma diária e o total correto
  são **86.424**.
- O valor `95.180` no bloco de março é um total mensal, não um evento.
- As datas eleitorais aparecem como `04.11` e `25.11` no bloco de outubro; os
  comentários diários indicam 04/10 e 25/10.
- Agosto/2025 apresenta todos os dias da semana deslocados em um dia.
- Evento Casar informa sete dias, mas há somente seis datas comentadas.
- Oportunidade do Bem informa cinco dias em 2026, mas há quatro datas anotadas.
- Arezzo informa quatro dias, mas somente duas datas possuem comentário direto.
- Comentários de 29 e 30/12/2025 mencionam datas de dezembro de 2023 e devem ser
  descartados como anotações antigas.
- O símbolo `Ø` não possui legenda; foi tratado apenas como marcador visual.
- Os totais estão gravados como valores, sem fórmulas. Eles conferem atualmente,
  mas podem divergir se os dados diários forem alterados manualmente.

## Conclusão

Os dados sustentam que corridas e eventos esportivos bem estruturados são o
principal instrumento para aumentar o fluxo de veículos. Eventos de vários dias
também funcionam, especialmente para distribuir movimento por dias úteis. Já
pré-estreias e eventos corporativos isolados tendem a ter impacto pequeno no
total, embora possam ser comercialmente relevantes.

O maior risco analítico é tratar volume bruto de convidados ou veículos como
incremento líquido. O segundo é ignorar Carnaval, Páscoa, jogos e composição de
dias da semana. A decisão operacional deve utilizar simultaneamente volume
informado, fluxo observado, baseline comparável e eventos concorrentes.
