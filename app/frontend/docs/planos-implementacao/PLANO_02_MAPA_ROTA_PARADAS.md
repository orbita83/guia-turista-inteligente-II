# PLANO 02 — Mapa da Rota & Paradas

**Referência:** Figura 3.3  
**Páginas:** 20–21  
**Prioridade:** P1  
**Estado:** plano registrado; execução não iniciada.

## Referências visuais

- Base geral: [00 — Tela completa](../wireframes/00-tela-completa.png).
- Base específica: [03 — Mapa e autonomia](../wireframes/03-mapa-e-autonomia.png).

## Fidelidade visual obrigatória

Os PNGs oficiais são especificações visuais obrigatórias. Preservar e adaptar os componentes React existentes para seguir a estrutura, a hierarquia, a ordem e os elementos visíveis nas imagens: métricas, sugestões de rota, mapa, topografia, custos e ações. Não reinterpretar livremente o design, adicionar cards, alterar layouts ou omitir elementos arbitrariamente. Textos exemplificativos e números das imagens não são dados reais da aplicação. A documentação funcional permanece em `app/backend/modulo-guia-turista-inteligente.md`.

## Objetivo

Adequar `MapaRota.tsx` à estrutura e à aparência do wireframe oficial, integrando os dados reais já calculados pelo backend.

## Arquivos principais

- `src/components/MapaRota.tsx`
- `src/components/TripNavigationTabs.tsx`
- `src/services/routeCalculator.ts`
- `src/services/api.ts`
- `src/types/domain.ts`
- `src/styles/map.css`
- `src/styles/trip-nav.css`
- `src/App.tsx`

## Etapa 1 — Estrutura visual do mapa

Organizar os elementos na sequência da Figura 3.3:

- [ ] Cabeçalho “Mapa da Rota & Paradas” e descrição.
- [ ] Seletor visual do tipo de veículo, coerente com o formulário.
- [ ] Seleção da Sugestão 01 e Sugestão 02 quando disponíveis.
- [ ] Cards métricos de distância, duração, paradas e autonomia.
- [ ] Indicadores complementares de rota e topografia.
- [ ] Painel de sugestões de trajeto rodoviário.
- [ ] Mapa Leaflet com geometria real.
- [ ] Legenda e marcadores de origem, destino e paradas.
- [ ] Sanfona de topografia e relevo.
- [ ] Custos, pedágios e rateio.
- [ ] Ações de Maps, WhatsApp e GPX.

Reutilizar os componentes e classes existentes sempre que possível.

## Etapa 2 — Uma única rota ativa

Investigar como `App.tsx`, `MapaRota.tsx` e `TripNavigationTabs.tsx` representam a seleção de rotas.

Estabelecer uma única seleção efetiva de rota, sem criar estados concorrentes que causem inconsistência.

Quando uma alternativa for selecionada, todos os elementos abaixo deverão utilizar os dados dessa mesma rota:

- Geometria desenhada.
- Distância e duração.
- Paradas e autonomia.
- Perfil de elevação.
- Ganho/perda de altitude.
- Pedágios e custos.
- Rateio.
- GPX exportado.

Inspecionar tanto `viagem.rotas` quanto `viagem.percurso.alternativas` e preservar compatibilidade com os contratos reais do backend.

Não associar o perfil de uma rota à geometria de outra.

## Etapa 3 — Renderização visual

Adequar o mapa ao wireframe:

- Traçado rodoviário destacado.
- Marcadores visualmente distintos.
- Paradas numeradas quando existentes.
- Enquadramento automático da rota ativa.
- Controles de zoom.
- Legenda legível.
- Responsividade do container.

Exibir somente coordenadas válidas.

Quando a geometria estiver indisponível, apresentar um estado informativo, sem desenhar um trajeto fictício.

## Etapa 4 — Topografia e relevo

Preservar a implementação existente da seção 3.3 e ajustar a apresentação conforme a figura:

- [ ] Sanfona com expansão/recolhimento.
- [ ] Identificação do tipo de terreno.
- [ ] Indicador de variação de consumo.
- [ ] Consumo nominal e rendimento ajustado.
- [ ] Subidas e descidas acumuladas.
- [ ] Desnível líquido.
- [ ] Cotas mínima e máxima.
- [ ] Gráfico SVG de elevação com preenchimento e borda conforme o wireframe.

**Obrigatório:** remover valores numéricos fictícios usados como fallback visual.

Se não houver amostras de elevação, o estado deverá ser “Perfil indisponível”, não um gráfico ou desnível inventado.

Verificar também a apresentação de ajustes negativos de consumo, quando a regra do backend permitir ganho de eficiência.

## Etapa 5 — Autonomia, paradas e custos

- [ ] Exibir a autonomia correspondente ao veículo e à rota selecionados.
- [ ] Diferenciar paradas projetadas de estabelecimentos verificados.
- [ ] Mostrar pedágios apenas quando conhecidos ou estimados com identificação explícita.
- [ ] Exibir custo parcial quando tarifas estiverem indisponíveis.
- [ ] Exibir custo de combustível ou energia com unidade correta.
- [ ] Exibir rateio para a quantidade selecionada de passageiros.
- [ ] Não recalcular no frontend valores que já foram calculados pelo backend, salvo operações puramente apresentacionais.

## Etapa 6 — GPX do backend

Inspecionar a implementação recente da exportação GPX 1.1 e seus contratos.

Conectar a ação “Baixar GPX” ao endpoint autenticado existente:

`GET /api/v1/roteiros/{trip_id}/exportar/gpx`

Encaminhar o índice da alternativa efetivamente ativa conforme o contrato implementado.

Verificar:

- Download do arquivo correto.
- Sessão/cookies.
- Nome de arquivo apropriado.
- Erros 401, 404 e 422.
- Correspondência entre rota exibida e arquivo exportado.

Preservar a exportação local existente apenas como compatibilidade, se isso ainda fizer sentido no código atualizado.

## Critérios de aceitação

A Figura 3.3 deve ser reconhecível na hierarquia e no estilo do componente.

Alterar a Sugestão 01/02 precisa atualizar todos os dados dependentes.

Não pode haver geometria, altitude, posto, tarifa ou custo fictício.

O GPX deve representar a rota selecionada.

A implementação deve continuar utilizando Leaflet e os serviços existentes, sem reescrever a lógica de negócio do backend.
