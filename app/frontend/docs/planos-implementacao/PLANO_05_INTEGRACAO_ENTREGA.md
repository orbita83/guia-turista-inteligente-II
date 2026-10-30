# PLANO 05 — Integração completa, fidelidade visual e entrega

**Referências:** Figura 2.1 e Figuras 3.1–3.7  
**Prioridade:** P1 — finalização  
**Estado:** integração funcional anterior executada; revisão visual final pendente, começando pela telemetria do Plano 03.

## Referências visuais

As imagens oficiais deste plano são [00 — Tela completa](../wireframes/00-tela-completa.png), [01 — Planejador](../wireframes/01-planejador-de-viagens.png), [02 — Telemetria](../wireframes/02-telemetria.png), [03 — Mapa e autonomia](../wireframes/03-mapa-e-autonomia.png), [04 — Histórico](../wireframes/04-historico-e-persistencia.png), [05 — Guia e streaming](../wireframes/05-guia-e-streaming.png), [06 — Sessão híbrida](../wireframes/06-sessao-hibrida.png) e [07 — Guia do Viajante](../wireframes/07-guia-do-viajante.png). Todos os PNGs 00 a 07 estão disponíveis na pasta.

## Fidelidade visual obrigatória

Os PNGs oficiais são especificações visuais obrigatórias. Preservar e adaptar os componentes React existentes para seguir a estrutura, a hierarquia, a ordem e os elementos visíveis nas imagens de cada área. Não reinterpretar livremente o design, adicionar cards, alterar layouts ou omitir elementos arbitrariamente. Textos exemplificativos e números das imagens não são dados reais da aplicação. A documentação funcional permanece em `app/backend/modulo-guia-turista-inteligente.md`.

## Objetivo

Consolidar as adaptações visuais e integrar as funcionalidades reais do backend sem regressões.

## Etapa 1 — Revisar os contratos atuais

Antes de alterar os serviços do frontend, verificar o código atual do backend, especialmente as mudanças recentes do Codex.

Conferir os contratos reais de:

- Sessão Google e visitante.
- Planejamento de viagens.
- Histórico e persistência assíncrona.
- Seleção e representação das rotas.
- Topografia, autonomia e custos.
- Streaming SSE.
- Atualização de visitas.
- Exportação GPX 1.1.
- Telemetria e diagnóstico operacional.

Não trabalhar exclusivamente com contratos antigos do GitHub caso existam alterações locais mais recentes.

## Etapa 2 — Consolidar os estados da aplicação

Revisar `App.tsx`, `useViagem.ts`, `useAuth.ts` e os hooks existentes.

Garantir:

- Uma viagem ativa por vez.
- Uma seleção de rota efetiva por vez.
- Coerência entre aba ativa e conteúdo exibido.
- Persistência do estado durante mudanças de aba.
- Cancelamento adequado de requisições.
- Isolamento entre sessões.
- Reutilização dos dados já recebidos.
- Atualização consistente entre formulário, mapa, custos, guia, telemetria e histórico.

Não duplicar dados que possam ser derivados do estado existente.

## Etapa 3 — Compatibilidade e regressões

Preservar:

- Login Google.
- Modo visitante e restauração Google.
- Autocomplete e sugestões GPS.
- Planejamento e validação.
- Visualização Leaflet.
- Rotas alternativas.
- SSE e retransmissão.
- GPX do backend.
- Histórico e exclusão.
- Visitas e gastronomia.
- Temas claro e escuro.
- Mensagens de erro e toasts.

Não remover recursos funcionais apenas porque eles não aparecem explicitamente em um recorte do wireframe.

Quando um recurso adicional conflitar visualmente com a referência, reorganizá-lo sem comprometer o fluxo.

## Etapa 4 — Verificação visual final

Comparar a SPA renderizada com cada uma das oito referências visuais:

| Referência | Critério |
| --- | --- |
| Figura 2.1 | Composição geral do desktop |
| Figura 3.1 | Formulário e estados de planejamento |
| Figura 3.2 | Telemetria: alerta atual preservado; quatro cards principais em grade 2×2, faixa compacta de provedores, sessão em card amplo com linhas alinhadas e três indicadores operacionais proporcionais à referência. Conferir rótulos e procedência de tempos, contadores e conexão antes de ajustar a apresentação. |
| Figura 3.3 | Mapa, altimetria e custos |
| Figura 3.4 | Histórico de viagens |
| Figura 3.5 | Clima, guia e dois cards externos separados de atrativos e gastronomia quando houver dados reais; confirmar o caminho backend → parser → componente e o estado vazio para destino fora do catálogo. |
| Figura 3.6 | Guia conciso |
| Figura 3.7 | Cabeçalho e sessão híbrida |

Realizar capturas desktop e mobile em estados reproduzíveis.

Usar os **dois prints de telemetria** enviados pelo usuário como evidência do topo e da base atuais e `02-telemetria.png` como objetivo visual. Fazer uma captura integral na verificação final para conferir proporções e continuidade entre as seções. Registrar separadamente divergência de apresentação e divergência de cálculo/contrato; os números do wireframe não substituem os medidos pelo backend e pelo navegador. Preservar o identificador de correlação, as ressalvas sobre `/healthz` e o provedor Open-Elevation como informações adicionais discretas. A tarefa detalhada está no Plano 03.

Para o print sem atrativos, executar futuramente dois cenários de conferência: um destino presente em `app/backend/app/data/atrativos.json` com ambas as categorias (Natal–RN possui dez itens, cinco de gastronomia) e um destino ausente, como Abaiara–CE caso seja a viagem do print. Verificar o JSON `atrativos` da API, o parser e a renderização antes de alterar contratos. Os grupos de cards e a ação de visitas já existem em `RoteiroResult.tsx`; a ausência no print resulta da condição de lista vazia. A cobertura do catálogo e a estrutura de dois cards externos do PNG 05 ficam detalhadas no Plano 04. Não preencher o destino ausente com locais fictícios.

Quando houver diferenças, classificá-las em:

- Divergência visual relevante.
- Divergência funcional.
- Adaptação responsiva necessária.
- Extensão legítima da aplicação.

Corrigir primeiro as divergências relevantes.

## Etapa 5 — Acessibilidade e qualidade

Verificar:

- Navegação por teclado.
- Estados de foco.
- Labels dos formulários.
- Contraste nos dois temas.
- Atributos ARIA.
- Semântica de abas e painéis.
- Estados de erro e carregamento.
- Leitura progressiva de SSE.
- Responsividade sem perda de conteúdo.
- Compatibilidade com WCAG 2.1 AA nas verificações aplicáveis.

## Etapa 6 — Política de testes

Não executar a suíte completa depois de cada modificação.

Adicionar ou atualizar testes para os comportamentos alterados.

Executar testes direcionados por componente ou lote.

Ao finalizar, executar:

- Testes frontend.
- Testes backend relevantes para os contratos.
- Typecheck e lint.
- Build completo.
- Verificação visual e funcional.
- Testes de fluxo integrado.

Se os checks apontarem problemas preexistentes de formatação, distinguir esses problemas de regressões introduzidas pela implementação.

Não declarar testes aprovados sem executá-los.

## Etapa 7 — Relatório e conclusão

Atualizar `app/frontend/TASKS_FRONTEND_IMPLEMENTACAO.md`.

Gerar um relatório final com:

- Componentes preservados.
- Ajustes visuais realizados.
- Funcionalidades integradas.
- Referências atendidas.
- Testes e seus resultados.
- Diferenças visuais remanescentes.
- Pendências de APIs externas.
- Limitações de ambiente.

Marcar separadamente implementação concluída e validação concluída.

Não fazer merge em `development`, reset destrutivo ou force push.

**Critério de encerramento:** o SPA utiliza os contratos reais do backend, preserva as funcionalidades existentes e apresenta fidelidade visual verificável às figuras da atividade, sem divergências críticas não documentadas.
