# Relatório de integração frontend — Guia do Turista Inteligente II

## Estado e fonte

- Branch: `integracao/frontend-backend`; HEAD/base de trabalho: `d4b4cbc`.
- Fonte funcional: `app/backend/modulo-guia-turista-inteligente.md`, em especial §§ 2.2 e 3.1–3.6.
- Fontes visuais: PNGs oficiais `app/frontend/docs/wireframes/00` a `07`. O PNG 00 tem o mesmo conteúdo do 05; ele não comprova a composição da SPA inteira.
- A árvore já continha alterações locais de backend, frontend e documentação. Elas foram preservadas. Não houve commit, merge, reset ou alteração da branch principal.

## Implementações e contratos

| Plano | Entrega e evidência | Situação |
| --- | --- | --- |
| 00 | Matriz de código e PNGs em `AUDITORIA_VISUAL_PLANO_00.md`; capturas 1440/390 px e comparação renderizada permanecem pendentes. | Parcial |
| 01 | `RoteiroForm.tsx` mostra Cancelar durante o envio; `useViagem.ts::cancelTrip` aborta o `fetch` por `AbortController`; `api.ts::criarViagem` recebe `signal`. Os preços de combustível/energia deixam de nascer preenchidos sem fonte e a validação abre os parâmetros para que a pessoa os informe. | Funcional implementado; visual pendente |
| 02 | `App.tsx::routeSelection` mantém uma seleção efetiva para rota legada ou alternativa do backend; `MapaRota.tsx` usa essa seleção em geometria, 6 indicadores, sugestões, autonomia, paradas, perfil, cards de custo e rateio. Removeu números de relevo ilustrativos; marcadores de parada numerados só usam coordenadas válidas. GPX do backend recebe o índice da alternativa ativa; rotas legadas preservam exportação local. | Funcional implementado; visual pendente |
| 03 | `TelemetriaCard.tsx` apresenta quatro indicadores principais e detalhamento das etapas reais. `HistoricoViagens.tsx` permite selecionar a viagem por teclado, preserva estados de persistência/erro/exclusão. | Funcional implementado; visual pendente |
| 04 | `RoteiroResult.tsx` conserva guia e SSE ao trocar abas: `App.tsx` mantém o componente montado. O guia recebido por `/planejar` é mostrado sem nova chamada automática ao Gemini; Retransmitir inicia SSE real. O card lilás tem conteúdo interno branco, seções derivadas do texto recebido e ação de recolher. Atrativos e visitas permanecem conectados aos contratos existentes. | Funcional implementado; visual pendente |
| 05 | Integração de estado, manutenção dos contratos e regressão automatizada. Verificação visual no navegador e fluxo com provedores externos reais continuam pendentes. | Parcial |

Os valores exibidos para rotas, tempo, relevo, autonomia, pedágios e custos vêm da viagem, da resposta do backend ou de parâmetros inseridos no formulário. A ausência de perfil de elevação aparece como indisponibilidade; uma alternativa sem topografia não herda os dados da principal. O formulário ainda traz consumo e capacidade iniciais editáveis; esses parâmetros devem ser conferidos pela pessoa antes de interpretar custos como estimativas da sua viagem.

## Funcionalidades preservadas

Login Google, visitante e restauração da sessão, formulário e catálogo de municípios, sugestões GPS, histórico com persistência em segundo plano, tema claro/escuro, Leaflet, alternativas, SSE, visitas, telemetria, compartilhamento, exclusão e exportação GPX. Os contratos HTTP e JSON existentes foram reutilizados.

## Arquivos principais modificados

`src/App.tsx`, `src/components/{RoteiroForm,MapaRota,RoteiroResult,TelemetriaCard,HistoricoViagens}.tsx`, `src/hooks/useViagem.ts`, `src/services/{api,tripOptionalFields}.ts`, `src/styles/{forms-buttons,map,guia,telemetry,trips,tokens-base}.css` e testes relacionados. Outros 13 arquivos do frontend receberam somente a formatação exigida por `vp check`, sem mudança intencional de lógica. O checklist foi atualizado em `TASKS_FRONTEND_IMPLEMENTACAO.md`.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| Suíte frontend `npm test --workspace @guia/frontend` | **256 passaram, 0 falharam**, 21 arquivos de testes |
| Suíte backend `npm test --workspace @guia/backend` | **408 passaram, 0 falharam**, 1 aviso de depreciação do TestClient |
| Contratos backend HTTP, GPX e SSE | **64 passaram, 0 falharam** |
| `npm run check --workspace @guia/frontend` | Aprovado: formatação, lint e tipos |
| `npm run check --workspace @guia/backend` | Aprovado: Ruff e Mypy |
| Builds frontend e backend | Aprovados |
| Capturas da SPA em 1440/390 px, claro/escuro | **Não executadas** nesta etapa; uma tentativa anterior de navegação foi negada |
| Fluxo real com Open-Meteo, OSRM, Open-Elevation e Gemini | **Não executado**; testes automatizados usam provedores simulados |

## Pendências e limitações

1. Abrir a SPA em ambiente com permissão de navegador, capturar desktop/mobile e comparar cada estado com os PNGs 00–07. Corrigir divergências encontradas antes de declarar fidelidade visual validada.
2. Exercitar o fluxo ponta a ponta com os provedores reais e sessão do usuário, inclusive GPX da alternativa selecionada, SSE progressivo e persistência após recarga. Não há medição válida de latência real do Gemini nesta etapa.
3. Avaliar o conteúdo dos PNGs 00 e 05: são idênticos, de modo que a visão geral do desktop não possui uma imagem distinta neste conjunto.

**Status final:** integração funcional e validação automatizada concluídas; Planos 00 e 05 e a validação visual dos Planos 01–04 permanecem abertos. Não há base para declarar fidelidade visual integral ou meta de latência de 300 ms atingidas.

## Revisão das inconsistências de telemetria e atrativos

Após as capturas fornecidas pelo usuário, a telemetria foi reorganizada conforme `02-telemetria.png`: quatro indicadores principais em 2×2, resumo dos provedores logo abaixo e etapas individuais recolhíveis. A caixa de sessão e os três indicadores operacionais ganharam o espaçamento e a hierarquia da referência. O aviso de latência aprovado foi preservado. O card verde agora se chama **Tempo da API**, pois o header `X-Process-Time` engloba também a espera por provedores; o backend não fornece uma medição isolada de CPU local.

Em `RoteiroResult.tsx`, pontos turísticos e gastronomia agora aparecem como dois cards externos separados, como em `05-guia-e-streaming.png`. Os cards mantêm contagens e itens reais quando presentes; quando a API retorna lista vazia, mostram estados vazios por categoria e omitem o progresso 0/0. Filtros e marcação de visitas permanecem conectados ao estado existente.

O backend já integra `atrativos_por_destino` ao planejamento e envia a lista ao frontend. O catálogo em `app/backend/app/data/atrativos.json` possui sete destinos e não inclui **Abaiara - CE**, motivo do resultado vazio observado. Esta correção não adicionou localidades, restaurantes ou tarifas sem fonte verificada. Não houve mudança no backend nem no contrato HTTP.

**Validação adicional:** 45 testes direcionados passaram (telemetria, guia, serviço de telemetria e App); em seguida a suíte completa passou com **256/256 testes**, check de formatação/lint/tipos e build frontend passaram. A validação por captura renderizada continua pendente.
