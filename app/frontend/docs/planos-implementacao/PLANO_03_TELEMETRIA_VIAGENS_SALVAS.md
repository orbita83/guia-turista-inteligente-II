# PLANO 03 — Telemetria, desempenho e viagens salvas

**Referências:** Figuras 3.2 e 3.4  
**Páginas:** 18–19 e 22–23  
**Prioridade:** P1  
**Estado:** integração funcional anterior executada; correção de fidelidade visual identificada no print atual e ainda não implementada.

## Referências visuais

As imagens oficiais deste plano são [00 — Tela completa](../wireframes/00-tela-completa.png), [02 — Telemetria](../wireframes/02-telemetria.png) e [04 — Histórico e persistência](../wireframes/04-historico-e-persistencia.png). A 00 orienta o posicionamento lateral; a 02 e a 04 orientam a ordem e a hierarquia de cada card.

## Fidelidade visual obrigatória

Os PNGs oficiais são especificações visuais obrigatórias. Preservar e adaptar os componentes React existentes para seguir a estrutura, a hierarquia, a ordem e os elementos visíveis nas imagens, incluindo telemetria acima de Viagens Salvas na barra lateral. Não reinterpretar livremente o design, adicionar cards, alterar layouts ou omitir elementos arbitrariamente. Textos exemplificativos e números das imagens não são dados reais da aplicação. A documentação funcional permanece em `app/backend/modulo-guia-turista-inteligente.md`.

## Objetivo

Reproduzir o painel lateral do wireframe e conectar todos os indicadores aos dados reais disponíveis.

## Componentes

- `src/components/TelemetriaCard.tsx`
- `src/components/HistoricoViagens.tsx`
- `src/hooks/useViagem.ts`
- `src/services/telemetry.ts`
- `src/services/api.ts`
- `src/styles/telemetry.css`
- `src/styles/trips.css`

## Etapa 1 — Telemetria

Seguir a hierarquia da Figura 3.2:

1. Título “Telemetria & Desempenho”.
2. Aviso de latência quando existir motivo real.
3. Identificação da última viagem.
4. Cards de tempo total, geocodificação, APIs/IA e processamento do servidor.
5. Detalhamento por provedor.
6. Sessão do usuário e conexão.
7. Indicadores operacionais da API.

### Divergências observadas no print atual

Comparação dos dois prints enviados pelo usuário com `02-telemetria.png` (Figura 3.2). O primeiro mostra o topo; o segundo mostra a sessão e a base do mesmo componente:

| Área | Print atual | Referência e correção a planejar |
| --- | --- | --- |
| Aviso de latência | Contorno, fundo e hierarquia agradam ao usuário. | **Preservar o estilo atual**; revisar apenas o texto para que descreva causas comprovadas, sem trocar cores ou composição. |
| Última viagem | Título comprido quebra no meio da sigla de destino no recorte estreito. | Ajustar quebra e escala da rota sem perder origem, destino ou UF; manter a divisória antes do título. |
| Indicadores principais | Quatro cards existem, mas estão pequenos e compactos; rótulos longos ocupam muito espaço. | Seguir a grade 2×2 da imagem oficial, com cards maiores, mais respiro, rótulo acima do valor e hierarquia cromática: total em alerta, geocodificação e APIs/IA em azul, valor local em verde quando a métrica permitir essa interpretação. |
| Detalhamento das etapas | Geocodificação de origem/destino, clima, roteamento, guia, altimetria e total dos serviços foram transformados em **sete cards extras**. | Remover essa segunda grade da apresentação principal. Exibir o detalhamento disponível de forma compacta no bloco “Detalhamento por API”, abaixo dos quatro cards, sem apagar diagnósticos úteis. |
| Provedores | O bloco de detalhamento e seus estados não aparecem na área visível do print porque os cards extras alongam o painel. | Usar a faixa única e compacta da referência para tempos e estados por provedor; Open-Meteo, OSRM, Open-Elevation e Gemini só recebem tempos/estados quando houver dado correspondente. Não inferir que ausência no recorte significa ausência no componente. |
| Sessão do usuário | O segundo print confirma a seção e os dados, mas o card está mais comprimido, com menos respiro entre linhas e valores quase todos na mesma cor escura. | Reproduzir o bloco interno amplo da referência: linhas de rótulo à esquerda e valor à direita, espaçamento vertical, borda/superfície, ênfases cromáticas somente quando o estado real as justificar e título separado por divisória. Preservar os valores reais de visitante e Google. |
| Conexão | O segundo print mostra RTT estimado e tipo de rede em texto corrido, mais uma linha “Conectividade do navegador”. | Aproximar a hierarquia e o destaque visual do indicador de conexão da figura. Manter o caráter **estimado** do RTT e os indícios do navegador; agrupar a linha adicional discretamente se necessário, sem inventar classificação “Excelente” nem declarar qualidade não medida. |
| Correlação | O `X-Request-ID` mascarado e a ação de copiar aparecem entre sessão e indicadores operacionais; não há esse elemento no PNG. | Preservar a função de observabilidade, mas apresentá-la como detalhe secundário que não quebre a ordem nem as proporções das seções principais. |
| Indicadores operacionais | O segundo print confirma três cards, porém menores e mais densos que os da referência. | Manter a grade de três cards para status da API, uptime e roteiros totais, com dimensões, espaçamento, borda, rótulo e valor próximos do PNG; adaptar a largura móvel sem cortar texto. |
| Rodapé operacional | O print atual traz um parágrafo explicativo longo e a linha de provedores com Open-Elevation; a figura mostra uma linha discreta de provedores. | Manter as ressalvas necessárias sobre `/healthz` e total de viagens, com peso visual secundário. Preservar Open-Elevation quando de fato participa do contrato; não copiar literalmente o conjunto ou os números exemplificativos do wireframe. |

No segundo print, “Meus roteiros: 1” e “Roteiros totais: 0” aparecem juntos no modo visitante. Investigar a origem e o escopo de cada contador antes de tratá-los como erro: viagens da sessão e total persistido no servidor podem medir conjuntos diferentes. Se forem esses conjuntos, explicá-los com rótulos ou ajuda curta sem substituir os valores medidos.

O print atual mostra `67.584,6 ms` de tempo total, `67.442,7 ms` de serviços e `67.532,92 ms` de “Processamento do servidor”. Esses **são dados da execução mostrada**, não valores a substituir pelos exemplos do PNG. Antes de mudar o rótulo ou cálculo do quarto card, investigar se `X-Process-Time` mede toda a requisição (inclusive espera por provedores) e se o backend expõe separadamente tempo de processamento interno. Se não expuser, manter uma descrição verdadeira como “Tempo da API” no card visualmente equivalente ao “Servidor Local”, sem apresentar esse valor como CPU local nem inventar os 7 ms da figura.

## Etapa 2 — Dados reais

- [ ] Obter a latência do servidor a partir de `X-Process-Time`.
- [ ] Utilizar a duração real da requisição observada pelo cliente.
- [ ] Não confundir duração de fetch com tempo total até renderização.
- [ ] Apresentar `X-Request-ID` quando disponível.
- [ ] Mostrar os diagnósticos de Open-Meteo, OSRM, Open-Elevation e Gemini.
- [ ] Distinguir provedor disponível, indisponível e não verificado.
- [ ] Não apresentar “4/4 ativos” sem evidência.
- [ ] Mostrar uptime e contadores apenas quando fornecidos por um endpoint válido.
- [ ] Identificar `requisicoes_http_ativas` como requisições em andamento, não sockets TCP.
- [ ] Evitar consultas redundantes de telemetria.
- [ ] Preservar o último snapshot válido quando apropriado, deixando explícito que não é atual.
- [ ] Conferir a procedência dos quatro números exibidos: `totalTimeMs` no cliente, etapas de geocodificação, `total_servicos_ms` e `X-Process-Time`; não somar etapas paralelas como se fossem tempo sequencial.
- [ ] Conferir no backend se existe uma métrica separada de processamento interno antes de usar “Servidor Local”; se não existir, ajustar apenas o rótulo/explicação sem falsificar o valor.
- [ ] Manter visíveis os estados de provedores que a API realmente informa e um estado explícito para cada dado ausente.
- [ ] Verificar no frontend e no endpoint operacional o escopo de “Meus roteiros” e “Roteiros totais”; distinguir dados temporários do visitante de registros persistidos.
- [ ] Verificar a fonte de RTT/tipo de rede, uptime, status da API e `X-Request-ID` antes de alterar seus rótulos ou cores.

Não declarar o sistema saudável apenas porque `/healthz` retornou 200.

## Etapa 3 — Fidelidade visual

Adequar:

- Exatamente quatro cards **principais** na grade 2×2, com dimensões e respiro próximos da Figura 3.2; as sete etapas adicionais não formam uma segunda grade de cards.
- Hierarquia de títulos e subtítulos.
- Cores de sucesso, alerta e erro.
- Divisórias entre grupos.
- Informações alinhadas em linhas de descrição.
- Indicadores operacionais na base do painel.
- Faixa “Detalhamento por API” diretamente após a grade principal; seção de sessão em card próprio e, na base, três indicadores operacionais lado a lado quando a largura permitir.
- Na sessão, reproduzir as linhas de descrição e o alinhamento da Figura 3.2; usar destaque para permanência da conta e estado de conexão somente quando comprovados, mantendo a informação adicional de conectividade sem competir com as seis linhas principais.
- Tratar o identificador de correlação e a nota sobre `/healthz` como detalhes secundários; preservar sua utilidade e não deixá-los dominar a composição.
- Responsividade que preserve legibilidade da rota e dos quatro números sem cortar siglas, unidades ou valores.

O alerta amarelo/avermelhado do wireframe somente deverá ser exibido quando os dados justificarem o alerta. O estilo do aviso atual foi aprovado pelo usuário e deve ser preservado.

## Etapa 4 — Histórico

Seguir a Figura 3.4:

- [ ] Card “Viagens Salvas” na barra lateral.
- [ ] Listagem vertical de viagens.
- [ ] Origem e destino destacados.
- [ ] Duração, clima e distância quando disponíveis.
- [ ] Ação de exclusão individual.
- [ ] Seleção de uma viagem para exibir seu conteúdo.
- [ ] Estados de carregamento, vazio, erro e persistência pendente.
- [ ] Indicação de qual viagem está selecionada.

## Etapa 5 — Integração da persistência

A implementação recente do backend utiliza `BackgroundTasks`.

Portanto:

- Não presumir que a viagem aparecerá imediatamente na primeira consulta do histórico.
- Preservar a viagem retornada por `/planejar` no estado atual.
- Reconciliar a listagem com o backend após a persistência.
- Evitar duplicatas por ID.
- Não perder o resultado caso a leitura do histórico ainda não o encontre.
- Preservar isolamento entre conta Google e visitante.
- Tratar a exclusão de forma reativa e restaurar o estado quando ela falhar.

## Critérios de aceitação

Telemetria e histórico precisam corresponder à organização visual das Figuras 3.2 e 3.4.

Na telemetria, o print corrigido deverá mostrar somente quatro cards de resumo antes do detalhamento por API, com título de rota legível e sem uma segunda grade de etapas. A sessão deve apresentar rótulos e valores alinhados em card amplo; a base deve ter os três cards operacionais proporcionais à referência, seguidos de ressalvas e provedores em segundo plano. Comparar o painel inteiro com `02-telemetria.png` em largura equivalente à dos prints atuais e no desktop. O aviso de latência deve conservar o estilo aprovado. Valores, datas, nomes e a classificação da conexão deverão refletir a execução real, nunca o exemplo do PNG.

Todos os indicadores devem ter procedência comprovável ou um estado explícito de indisponibilidade.

Nenhuma viagem deve desaparecer da tela apenas porque a persistência em background ainda está sendo concluída.
