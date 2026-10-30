# Acompanhamento da implementação do backend

## Baseline

- Branch: `integracao/frontend-backend`
- HEAD-base: `d4b4cbcd957ddd194c32b89f1d3e8055b839abd0`
- Estado inicial: alteração preexistente `D docs/modulo-guia-turista-inteligente.md`; não rastreados preexistentes `app/backend/AUDITORIA_COMPLETA_BACKEND_GUIA_TURISTA_Codex.md`, `CHECKLIST_AUDITORIA_BACKEND.md`, `RELATORIO_AUDITORIA_BACKEND.md` e a cópia de referência `app/backend/modulo-guia-turista-inteligente.md`. Preservados.
- Documento da atividade lido integralmente. `app/AGENTS.md` (aplicável ao backend) lido; não há `app/backend/AGENTS.md`.
- Os testes tinham falhas de permissão de `tmp_path` já relatadas antes desta rodada.

## P0 — Segurança e estabilidade

### TASK-BE-009 — Proteger transações JSON entre processos

Responsável: Transversal (Aluno 2)
Prioridade: P0
Fonte: Seção 2.1, persistência atômica thread-safe com file lock
Problema: `TripStorage` usa `RLock` local, mas dois processos podem perder atualizações no ciclo leitura-modificação-gravação.
Esperado: lock de arquivo em transações persistentes; visitantes continuam somente em memória.
Arquivos: `app/core/storage.py`, `tests/test_history_isolation.py`.
Dependências: nenhuma.
Aceitação: operações concorrentes em processos distintos preservam as duas viagens; arquivos temporários seguem atômicos.
- [x] Investigar storage e comportamento de visitante
- [x] Proteger transações persistentes com lock de arquivo
- [x] Adicionar teste entre processos
- [x] Validar no lote final
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).

### TASK-BE-010 — Expor requisições HTTP ativas na telemetria

Responsável: Aluno 2 / Aluno 4
Prioridade: P2
Fonte: Seção 3.2, painel de métricas operacionais
Problema: latência e total de roteiros existem; não há medida de atividade simultânea no servidor.
Esperado: contador de requisições HTTP em andamento em JSON e Prometheus, com nome fiel à medida. Não alegar contagem TCP que o ASGI não fornece.
Arquivos: `app/main.py`, `app/core/operational.py`, testes de observabilidade.
Dependências: middleware HTTP existente.
Aceitação: contador aumenta durante uma chamada e volta a zero inclusive após erro; sem labels por usuário.
- [x] Investigar middleware e contrato operacional
- [x] Implementar contador e exportação
- [x] Testar semântica e limpeza
- [x] Validar no lote final
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).

### TASK-BE-001 — Remover segredo de sessão previsível

Responsável: Transversal (Aluno 2/Core)
Prioridade: P0
Fonte: Seções 2.1 e 3.6; proteção de sessão
Problema: `Settings.secret_key` usa valor literal público como fallback.
Esperado: chave aleatória segura por processo quando não configurada e configuração explícita por ambiente; nenhum segredo previsível.
Arquivos: `app/backend/app/core/config.py`, testes de configuração/auth, `.env.example` se aplicável.
Dependências: nenhuma.
Aceitação: fallback não é constante conhecida; configuração por ambiente continua aceita; testes de sessão passam.
- [x] Investigar configuração atual e consumidores
- [x] Implementar fallback seguro
- [x] Adicionar testes de configuração
- [x] Validar conjunto final após todas as alterações
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).
Evidências: `core/config.py` (`secret_key`), `main.py` usa SessionMiddleware.
Observações: cookie Secure em desenvolvimento é decisão de deploy e não será alterado sem regra explícita.

## P1 — Entregas obrigatórias ausentes

### TASK-BE-002 — Exportar GPX 1.1 pela viagem salva

Responsável: Aluno 4
Prioridade: P1
Fonte: Seções 3.3 e 6.1; geometria e download GPX 1.1
Problema: frontend gera GPX localmente, mas o backend não oferece exportação da viagem autenticada; o exemplo original também lista `gpx_service.py`.
Esperado: download GPX 1.1 autenticado, baseado somente na geometria real salva, incluindo waypoints de paradas e elevação quando o perfil tiver amostras compatíveis; rejeitar ausência/geometria inválida e não fabricar coordenadas.
Arquivos: `app/backend/app/services/gpx.py` (novo), `routers/trips.py`, `TripStorage` (leitura já existe), `app/frontend/src/services/api.ts` e consumidor `TripNavigationTabs.tsx`, testes backend e frontend.
Dependências: preservar contrato atual de viagem e sessão.
Aceitação: rota do usuário autenticado gera XML GPX 1.1 baixável; não acessível por outra identidade; alternativa ativa selecionável; ausência de geometria responde erro explícito; frontend mantém estado/feedback e usa endpoint.
- [x] Investigar exportador frontend e geometria persistida por rota
- [x] Definir `GET /api/v1/roteiros/{trip_id}/exportar/gpx?alternative=-1|0..n`
- [x] Implementar serialização XML GPX 1.1 segura
- [x] Integrar consumidor frontend existente ao backend
- [x] Adicionar testes backend de XML, elevação, erro e isolamento
- [x] Executar testes direcionados antes da última alteração de persistência
- [x] Validar conjunto final após todas as alterações
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).
Evidências: geometria `services/trips.py`; histórico em `core/storage.py`; exportador frontend existente `services/routeCalculator.ts`.
Observações: preservar a experiência atual do botão de download; não duplicar cálculo geográfico no servidor.

## P2 — Funcionalidades obrigatórias parciais

### TASK-BE-007 — Aplicar altimetria da alternativa à autonomia e aos custos

Responsável: Aluno 3
Prioridade: P2
Fonte: Seções 3.3 e 6.1 (penalização altimétrica, autonomia e custos)
Problema: `plan_trip` calcula o perfil de cada rota, mas chama `projetar_paradas_rota` e `calcular_custos_viagem` sem o ajuste de relevo.
Esperado: usar o percentual já calculado pelo serviço altimétrico em cada alternativa; não aplicar ajuste quando o perfil estiver indisponível.
Arquivos: `app/services/trips.py`, `tests/test_http_api.py`.
Dependências: perfil altimétrico existente.
Aceitação: custo e autonomia usam o mesmo perfil da alternativa; status de ajuste é explícito; não há perfil fictício.
- [x] Investigar integração e fórmulas existentes
- [x] Integrar o percentual por alternativa
- [x] Adicionar teste de contrato
- [x] Validar no lote final
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).

### TASK-BE-008 — Alinhar síntese Gemini ao roteiro conciso da atividade

Responsável: Aluno 4
Prioridade: P2
Fonte: Seção 3.5 (diretriz de síntese e concisão)
Problema: instrução atual pede atrações e pratos em três blocos, sem exigir identidade local, turnos Manhã/Tarde/Noite e limite de palavras.
Esperado: prompt orientar uma frase de identidade até 20 palavras, uma ação por turno até 15 palavras, 2–3 pratos verificáveis e orientação vinculada ao clima fornecido; preservar as três seções do contrato atual.
Arquivos: `app/services/guide.py`, testes de guia.
Dependências: dados reais do planejamento.
Aceitação: instruções enviadas à API refletem a fonte e não pedem invenção de fatos; streaming e guia completo seguem compatíveis.
- [x] Investigar documento, prompt e consumidores
- [x] Ajustar instruções compartilhadas
- [x] Adicionar teste de contrato do prompt
- [x] Validar no lote final
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).

### TASK-BE-006 — Alinhar duração de 1 a 5 dias ao formulário da atividade

Responsável: Aluno 3 / Aluno 4
Prioridade: P2
Fonte: Seção 3.1, item 4 (1 a 5 dias)
Problema: backend aceitava até 365 dias em planejamento e streaming, apesar de o formulário real oferecer 1 a 5.
Esperado: HTTP 422 para 0 e acima de 5, mantendo as viagens legadas já salvas inalteradas.
Arquivos: `app/backend/app/schemas/trips.py`, `app/backend/app/schemas/streaming.py`, `app/frontend/src/services/api.ts`, testes de schema e streaming.
Dependências: nenhuma.
Aceitação: 1 e 5 aceitos, 0 e 6 rejeitados; consumidor frontend alinha o contrato.
- [x] Investigar fonte, backend e formulário React
- [x] Restringir entradas novas de planejamento e SSE a 1–5
- [x] Alinhar validação do consumidor
- [x] Acrescentar testes de fronteira
- [x] Validar no lote final
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).

### TASK-BE-005 — Diferenciar prontidão local de liveness

Responsável: Aluno 2
Prioridade: P2
Fonte: Seção 5.1 (`/healthz` e `/readyz`) e seção 3.2 (telemetria)
Problema: `/readyz` retornava pronto sem verificar se cliente HTTP, storage e breakers foram inicializados.
Esperado: `/healthz` indica processo vivo; `/readyz` responde 503 quando recursos locais estão indisponíveis e 200 quando prontos, sem afirmar saúde dos provedores externos.
Arquivos: `app/backend/app/main.py`, `app/backend/tests/test_main_observability.py`.
Dependências: lifespan existente.
Aceitação: status pronto durante lifespan, indisponível sem recursos; nenhuma chamada externa no probe.
- [x] Investigar implementação anterior
- [x] Implementar checagem dos recursos locais
- [x] Adicionar teste de prontidão
- [x] Validar no lote final
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).
Observações: prontidão local não equivale a disponibilidade de Open-Meteo, OSRM, Open-Elevation e Gemini.

### TASK-BE-003 — Persistir planejamento após a resposta HTTP

Responsável: Aluno 2 / Transversal
Prioridade: P2
Fonte: Seções 3.4 e 4.5
Problema: `plan_trip` salvava a viagem antes de devolver a resposta; a atividade descreve `BackgroundTasks` após a resposta.
Esperado: plano pronto e validado antes de agendar uma única gravação em background; cancelamento antes da conclusão não agenda gravação; chamada direta do serviço preserva comportamento anterior.
Arquivos: `app/backend/app/services/trips.py`, `app/backend/app/routers/trips.py`, `app/backend/tests/test_http_api.py`.
Dependências: sessão e `TripStorage` existentes.
Aceitação: endpoint retorna o mesmo JSON; TestClient observa uma gravação por viagem; chamada direta do serviço continua persistindo; desconexão não gera viagem parcial.
- [x] Investigar fluxo e testes existentes
- [x] Tornar persistência do serviço configurável mantendo default anterior
- [x] Agendar `persist_trip` via `BackgroundTasks` no router
- [x] Adicionar teste de regressão sem executá-lo nesta etapa
- [x] Validar suite final e semântica de desconexão
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).
Observações: leitura imediata no navegador pode ocorrer antes da tarefa de gravação terminar; política da atividade privilegia resposta antes de disco. Falha de background deve ser observada na validação final.

### TASK-BE-004 — Finalizar relatório e matriz de conformidade

Responsável: Transversal
Prioridade: P2
Fonte: documento original completo
Problema: relatório anterior mistura arquitetura ilustrativa e requisitos obrigatórios e não registra implementação desta rodada.
Esperado: relatório final com tarefas, evidências, testes e pendências por aluno.
Arquivos: `app/backend/RELATORIO_FINAL_BACKEND.md` (novo), `TASKS_BACKEND_IMPLEMENTACAO.md`.
Dependências: conclusão das tarefas P0/P1/P2.
Aceitação: todos os achados classificados pelo documento original, sem alegar testes não executados.
- [x] Atualizar contratos, critérios de aceite e rastreabilidade
- [x] Criar relatório final de implementação
- [x] Registrar resultado da suíte final combinada com o usuário
Implementação: CONCLUÍDA
Validação: APROVADA (408 testes backend antes do ultimo ajuste textual; 28 testes guia/SSE e 32 testes storage apos os respectivos ajustes; 252 frontend; Ruff/Mypy e build).
Observações: manter relatório anterior intacto.

## Itens avaliados e preservados sem nova implementação

- Planejamento async/gather, sessão, isolamento, schemas, altimetria, custos, autonomia, SSE, catálogo, visitas, Prometheus: já existem no código e têm testes específicos; não reimplementar.
- WhatsApp/Google Maps são ações do frontend; não criar endpoint de compartilhamento sem necessidade provada.
- Cache TTL genérico e outros detalhes do desenho de referência não são promovidos a feature obrigatória sem critério funcional demonstrado.

## Integração seletiva do PR #38 — Aluno 4

Base desta integração: `integracao/frontend-backend` em `d4b4cbcd`; PR #38 head `9d5bf20c`, draft contra `development`. A árvore atual contém as alterações não publicadas registradas acima; nenhum merge ou checkout destrutivo foi usado.

### TASK-BE-011 — Integrar testes de retransmissão e benchmark de navegador

Responsável: Aluno 4. Prioridade: P1. Fonte: §§1.1, 4.2, 6.1.
Problema: PR #38 acrescenta prova de retransmissão e medição, mas foi desenvolvido antes do GPX backend e da suíte atual.
Esperado: incorporar testes e ferramentas de medição preservando contratos e alterações locais; distinguir Gemini real, fallback e provedor controlado.
Arquivos: testes de `RoteiroResult`, `scripts/verify-sse-latency.mjs`, `scripts/sse-latency-result*.mjs`, `scripts/qa_demo_server.py`, `package.json`, `package-lock.json`, documentação de medição.
Dependências: preservar `TripNavigationTabs.tsx`, `routeCalculator.ts` e GPX backend atuais.
Aceitação: teste de retransmissão e testes da classificação passam; benchmark nunca certifica modo controlado ou fallback; comando padrão inclui teste da classificação.
- [x] Ler fonte e comparar commits/arquivos do PR com a árvore atual
- [x] Integrar seletivamente os artefatos úteis
- [x] Validar testes direcionados: retransmissão frontend 15/15; classificador 3/3
- [ ] Validar na suíte final
Implementação: CONCLUÍDA. Validação: DIRECIONADA APROVADA; suíte final pendente.

### TASK-BE-012 — Investigar e corrigir gargalos comprovados no SSE

Responsável: Aluno 4. Prioridade: P1. Fonte: §§1.1, 4.2, 6.1.
Problema: planejamento gera guia completo e a interface abre outra geração SSE; meta de 300 ms não foi atingida no ensaio real relatado no PR.
Esperado: mapear tempo de provedor, servidor, transporte, parser e DOM; remover apenas trabalho duplicado que possa ser removido sem perder guia persistido, SSE real ou compatibilidade.
Arquivos: `services/trips.py`, `services/guide.py`, `routers/streaming.py`, `frontend/src/components/RoteiroResult.tsx`, `frontend/src/services/streamingGuide.ts`, conforme evidência.
Dependências: TASK-BE-011.
Aceitação: teste prova qualquer melhoria aplicada; diagnóstico separa tempo do Gemini de buffering e renderização; nenhuma meta de 300 ms é declarada sem medição real.
- [x] Identificar geração Gemini no planejamento e nova geração no mount de `RoteiroResult`
- [x] Medir estágios e inspecionar gargalos com benchmark integrado; ensaio real bloqueado por `cota_excedida`
- [ ] Aplicar correções comprovadamente necessárias
- [ ] Validar regressões de cancelamento, GPX e SSE
Implementação: EM ANDAMENTO. Validação: PENDENTE.
Observação: a análise confirmou duas gerações Gemini no fluxo planejamento + exibição. Removê-las exige preservar guia persistido, streaming e consumidores existentes; não há alteração desse contrato nesta integração seletiva.

### TASK-BE-013 — Fechar relatório e validação da integração

Responsável: Aluno 4. Prioridade: P2. Fonte: §6.1.
Problema: relatório anterior antecede PR #38.
Esperado: atualizar checklist e relatório com comparação, arquivos integrados, medidas por proveniência, testes e limitações.
Arquivos: `CHECKLIST_AUDITORIA_BACKEND.md`, `RELATORIO_FINAL_BACKEND.md`.
Dependências: TASK-BE-011, TASK-BE-012.
Aceitação: suíte backend/frontend, check e build executados ao final; números reais; PR não mesclado em `development`.
- [ ] Atualizar checklist e relatório
- [ ] Executar suíte completa, lint/typecheck e build
Implementação: PENDENTE. Validação: PENDENTE.

## Correção de topografia — Plano 01

### TASK-BE-014 — Restabelecer consulta altimétrica e explicar falhas

Responsável: Aluno 3, com integração frontend. Prioridade: P1. Fonte: §3.3 e §6.1 da atividade; RF-MAP-004/005 e CA-MAP-003.
Problema: viagens reais possuem geometria, mas Open-Elevation recusou quatro consultas com HTTP 429 por franquia anônima excedida; a interface só exibe indisponibilidade genérica.
Esperado: chave opcional de servidor no header oficial, estado público seguro para limite do provedor e mensagem específica no painel da rota correta; nenhum perfil inventado.
Arquivos previstos: `core/config.py`, `services/altimetria_service.py`, `services/trips.py`, `routers/trips.py`, `schemas/roteiros.py`, `.env.example`, parser e mapa do frontend, testes e documentação.
Dependências: chave válida e franquia disponível para comprovação com serviço real; implementação e testes controlados independem disso.
Aceitação: contrato de sucesso preservado; HTTP 429 não vaza corpo bruto; viagens antigas com 429 exibem causa segura; alternativa não herda perfil de outra; testes dirigidos e suíte final aprovados.
- [x] Investigar documentação, código, viagens persistidas e contrato oficial do provedor
- [x] Implementar configuração e tratamento de erros
- [x] Integrar estado ao frontend e atualizar testes
- [x] Validar em lote e atualizar relatório
Implementação: CONCLUÍDA. Validação: APROVADA NOS TESTES E NA CONSULTA REAL; CAPTURA VISUAL PENDENTE.
Evidências: `app/core/config.py`, `app/services/altimetria_service.py`, `app/services/trips.py`, `app/routers/trips.py`, `frontend/src/services/tripOptionalFields.ts`, `frontend/src/components/MapaRota.tsx`; testes em `test_altimetria_service.py`, `test_http_api.py`, `apiGeometry.test.ts` e `MapaRota.test.tsx`. Consulta real com 10 pontos da geometria salva: `sucesso`, cotas 225,23–1.052,63 m. Suíte geral: 413 backend, 272 frontend, 3 SSE aprovados; check e build aprovados. Após a correção de tipagem, os testes direcionados foram repetidos. O perfil das viagens já gravadas não foi alterado.

## Correção de atrativos — Plano 02

### TASK-BE-015 — Cobrir Abaiara com locais documentados e validar visitas

Responsável: transversal de backend e frontend. Prioridade: P1. Fonte: §3.5 da atividade e RF-GUI-005.
Problema: Abaiara - CE fora do catálogo, aviso de cobertura fixo e PATCH permissivo quando uma viagem não tinha lista de atrativos.
Esperado: locais comprovados da cidade em cards, persistência de visitas restrita aos IDs válidos, ausência honesta de restaurantes não confirmados e grupos visuais preservados.
Arquivos: `app/data/atrativos.json`, `app/data/FONTES_ATRATIVOS_ABAIARA.md`, `app/core/storage.py`, `frontend/src/components/RoteiroResult.tsx`, testes e plano.
Dependências: curadoria verificável para qualquer ampliação futura da cobertura.
Aceitação: Natal continua com cinco atrativos e cinco opções gastronômicas; Abaiara apresenta dois locais e zero restaurantes; histórico legado recebe locais sem gravação retroativa; PATCH rejeita ID estranho; ambos os grupos aparecem no frontend.
- [x] Investigar contrato, catálogo, histórico e fontes municipais
- [x] Catalogar somente locais documentados e registrar procedência
- [x] Restringir PATCH aos IDs da viagem ou do catálogo correspondente
- [x] Corrigir aviso de cobertura e manter dois grupos na interface
- [x] Adicionar e executar testes direcionados
- [x] Concluir suíte geral
- [ ] Comparar visualmente no navegador
Implementação: CONCLUÍDA. Validação: TESTES, CHECK E BUILD APROVADOS; CAPTURAS PENDENTES.
Resultados: 415 testes backend, 274 frontend e 3 SSE aprovados; zero falhas. `npm run check` e `npm run build` aprovados. Leitura local de uma viagem salva para Abaiara retornou dois locais via serviço de histórico, sem alterar a base.
Observação: não há comprovação de restaurante específico em funcionamento em Abaiara; nenhuma opção gastronômica foi fabricada. A cobertura do catálogo continua parcial por cidade.

### TASK-BE-016 — Buscar locais próprios para municípios fora da cobertura fixa

Responsável: transversal de backend e frontend. Prioridade: P1. Fonte: §3.5 e RF-GUI-005; correção do usuário de que cada destino deve ter seus próprios locais.
Problema: catalogar manualmente Abaiara não escala; demais municípios continuam com zero cards.
Esperado: buscar POIs mapeados estritamente dentro da área municipal e UF, identificar a procedência e falhas, complementar o catálogo quando faltar gastronomia e preservar visitas por IDs estáveis.
Arquivos: `app/services/atrativos_osm.py`, `app/services/trips.py`, `app/core/config.py`, `app/routers/trips.py`, `.env.example`, parser e componente frontend, testes e documentação.
Dependências: instância Overpass disponível e cobertura OSM no município; uma instância própria/autorizada pode ser apontada via `OVERPASS_URL`.
Aceitação: testes verificam seleção de área municipal, rejeição sem área única, separação de restaurantes, integração com planejamento, contrato de status, atribuição OSM e fallback seguro. Consulta real deve ser medida separadamente.
- [x] Investigar fonte, política de uso e contrato do projeto
- [x] Implementar consulta municipal, limite de itens, cache e estados de erro
- [x] Integrar backend/frontend e adicionar testes
- [ ] Validar contra instância Overpass real acessível
- [x] Concluir suíte geral e build após a mudança
Implementação: CONCLUÍDA. Validação: TESTES, CHECK E BUILD APROVADOS; PROVEDOR REAL INDISPONÍVEL NESTE AMBIENTE.
Resultados: 420 testes backend, 276 frontend e 3 SSE aprovados; zero falhas. Check e build aprovados.
Observação: os endpoints públicos testados retornaram HTTP 406/403 ou timeout; testes simulados não comprovam cobertura nem funcionamento do provedor real. Viagens antigas sem catálogo não são reconsultadas automaticamente. A consulta dinâmica pode aumentar a latência de planejamento quando não há cache.
