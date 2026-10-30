# Tarefas de implementação do frontend

**Escopo atual:** Planos 00–05. Integração funcional em andamento; a verificação por novas capturas continua pendente.  
**Branch / HEAD inicial:** `integracao/frontend-backend` / `d4b4cbc`.  
**Árvore inicial:** já havia alterações locais no backend, frontend e documentos, inclusive GPX backend, testes SSE, `App.tsx`, `TripNavigationTabs.tsx` e `api.ts`; todas foram preservadas. Os wireframes 00–07 e os planos eram arquivos não rastreados.  
**Matriz e evidências:** [AUDITORIA_VISUAL_PLANO_00.md](./AUDITORIA_VISUAL_PLANO_00.md).

## Plano 00 — acompanhamento

- [x] Verificar branch, HEAD e alterações locais; preservar a árvore existente.
- [x] Ler integralmente as seções 2.2 e 3.1–3.6 da documentação funcional.
- [x] Inspecionar visualmente os PNGs oficiais 00–07.
- [x] Inspecionar `App.tsx`, componentes, hooks, serviços e CSS envolvidos.
- [x] Identificar funcionalidades existentes e diferenças estruturais comprovadas pelo código.
- [x] Registrar matriz por figura, componente, situação, diferença e status.
- [ ] Capturar a SPA a 1440 px e 390 px; navegador integrado indisponível nesta sessão.
- [ ] Comparar cores, tipografia, proporções, espaçamentos, responsividade, tema escuro e estados reais com os PNGs.
- [ ] Completar evidências visuais e validar a matriz.

**Implementação do Plano 00:** PARCIAL — auditoria documental e de código concluída; captura/comparação visual pendente.  
**Validação:** PENDENTE — sem capturas da SPA renderizada.

## Tarefas de implementação

| ID | Plano / prioridade | Componente e fonte | Problema e comportamento esperado | Dependência / aceitação | Implementação | Validação |
| --- | --- | --- | --- | --- | --- | --- |
| FE-001 | Plano 01 / P1 | `RoteiroForm.tsx`, `useViagem.ts`; Figura 3.1, §3.1 | Falta ação Cancelar durante o planejamento e havia preços de energia/combustível preenchidos sem fonte. | `AbortController` na chamada HTTP; exigir preço informado pelo usuário; manter campos e validações. | Concluída | Testes integrados passaram; visual pendente |
| FE-002 | Plano 01 / P1 | `App.tsx`, `SessionHeader.tsx`, `responsive.css`; Figuras 2.1, 3.1, 3.7, §§2.2, 3.1, 3.6 | Verificar e ajustar proporções das colunas, cabeçalho e empilhamento mobile conforme capturas; preservar sessão. | Capturas 1440/390 px; sem regressão do fluxo Google/visitante. | Estrutura existente preservada | Capturas pendentes |
| FE-003 | Plano 02 / P1 | `MapaRota.tsx`, `map.css`, `App.tsx`, `tripOptionalFields.ts`; Figura 3.3, §3.3 | Indicadores depois do mapa e valores ilustrativos de relevo; alinhar ordem, seleção, custos e GPX à mesma rota. | Sugestões e indicadores antes do mapa; perfil ausente sem números fictícios; GPX da rota ativa. | Implementação funcional concluída | Testes direcionados passaram; visual pendente |
| FE-004 | Plano 03 / P1 | `TelemetriaCard.tsx`, `HistoricoViagens.tsx`, CSS; Figuras 3.2/3.4, §§3.2/3.4 | Resumo com muitos indicadores e seleção do histórico sem teclado. | Quatro indicadores de resumo, detalhes reais, seleção por teclado; persistência pendente visível. | Implementação funcional concluída | Testes direcionados passaram; visual pendente |
| FE-005 | Plano 04 / P1 | `RoteiroResult.tsx`, `guia.css`, `App.tsx`; Figuras 3.5/3.6 e PNG 07, §3.5 | Guia divergia do PNG 07 e remount disparava nova transmissão. | Card lilás, container branco, seções reais, recolher detalhes; SSE somente quando necessário ou por retransmissão. | Implementação funcional concluída | Testes direcionados passaram; visual pendente |
| FE-006 | Plano 05 / P1 | `App.tsx` e componentes; Figuras 2.1 e 3.1–3.7 | Consolidar rota ativa, abas, contratos, regressões e verificação visual. | Seleção única para mapa/custos/GPX, estado do guia preservado, suíte final e capturas. | Integração funcional concluída | Suítes passaram; capturas pendentes |
| FE-007 | Plano 03 / P1 | `TelemetriaCard.tsx`, `telemetry.ts`, `telemetry.css`; PNG 02 | A tela mostrava sete cards extras sob os quatro indicadores principais e comprimira sessão/estado operacional. | Manter aviso de latência; quatro cards principais, banda de provedores, etapas recolhíveis, sessão e três indicadores operacionais; medir apenas valores disponíveis. | Concluída | 45 testes direcionados passaram em conjunto; comparação renderizada pendente |
| FE-008 | Plano 04 / P1 | `RoteiroResult.tsx`, `guia.css`, catálogo backend; PNG 05 | Atrativos e gastronomia apareciam numa seção única vazia para cidades fora do catálogo. | Exibir dois cards separados mesmo sem itens, com estados vazios honestos; conservar filtros e visitas quando houver itens. | Concluída para apresentação e ligação existente | 45 testes direcionados passaram em conjunto; comparação renderizada pendente |
| FE-009 | Plano de correção 02 / P1 | `RoteiroResult.tsx`, catálogo backend; §3.5 e PNG 05 | Abaiara não tinha locais catalogados; aviso de cobertura fixo e filtro escondia o grupo turístico. | Exibir dois locais documentados de Abaiara, zero restaurantes não comprovados, manter ambos os grupos e visitas válidas; Natal continua 5+5. | Implementação concluída; ampliar outras cidades depende de fontes | 18 testes direcionados do componente e suíte geral de 274 frontend aprovados; captura visual pendente |
| FE-010 | Plano de correção 02 / P1 | `api.ts`, `domain.ts`, `RoteiroResult.tsx`; §3.5 | Catálogo fixo não cobre os demais destinos. | Ler fonte/status da consulta municipal, mostrar locais reais e atribuição OSM; informar falha sem inventar cards. | Integração de contrato concluída; consulta real depende de Overpass | 276 testes frontend, check e build aprovados; validação com provedor real pendente |

O PNG 00 e o 05 são arquivos idênticos; o 00 não sustenta sozinho a comparação da página inteira. Os valores das imagens são exemplos, não dados da aplicação. Nenhuma tarefa visual foi marcada como validada sem capturas reais.

## Validação executada nesta etapa

- Frontend: 256 testes passaram, 0 falharam na suíte completa, após todos os ajustes. Os 9 testes direcionados do mapa também passaram.
- Backend: 408 testes passaram, 0 falharam na suíte completa; 64 testes direcionados de HTTP, GPX e SSE também passaram.
- Frontend: `vp check` aprovado após formatação dos arquivos apontados; build aprovado.
- Backend: Ruff, Mypy e compilação Python aprovados.
- Capturas em 1440 px e 390 px, tema escuro e comparação visual: **pendentes**. Uma tentativa anterior de navegação foi negada; esta correção foi conferida pelos PNGs e pelas capturas enviadas pelo usuário, sem nova medição visual reproduzível da SPA.

## Correção das inconsistências enviadas pelo usuário

- Telemetria superior: aviso de latência preservado; quatro cards principais (tempo total, Geocoding, APIs + IA Gemini, tempo da API), banda de provedores e sete etapas dentro de sanfona. `X-Process-Time` inclui a espera por serviços externos e por isso não representa exclusivamente processamento local.
- Telemetria inferior: mais espaço na caixa da sessão, destaque da conexão quando medido e três cards operacionais maiores. Correlação e nota de `/healthz` continuam como dados secundários. `clima_ms` alimenta a duração de Open-Meteo quando disponível.
- Atrativos: o registro anterior documentava uma ausência real de Abaiara - CE. O Plano de correção 02 acrescentou dois locais documentados à cidade, preservou zero restaurantes sem fonte e manteve os dois grupos visíveis. Natal permanece com cinco atrativos e cinco opções gastronômicas; nomes do wireframe não foram transferidos para outra cidade.
- Validação desta correção: 45 testes direcionados aprovados (4 arquivos); suíte completa do frontend com **256/256 testes aprovados**; `npm run check --workspace @guia/frontend` e `npm run build --workspace @guia/frontend` aprovados. Capturas novas não foram produzidas nesta etapa.
