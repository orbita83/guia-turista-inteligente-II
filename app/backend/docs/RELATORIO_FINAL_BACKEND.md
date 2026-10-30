# Relatório final de implementação do backend

## Base e critério

- Branch: `integracao/frontend-backend`; commit-base: `d4b4cbcd957ddd194c32b89f1d3e8055b839abd0`.
- Fonte principal lida integralmente: `app/backend/modulo-guia-turista-inteligente.md` (cópia da atividade de 640 linhas). A exclusão preexistente de `docs/modulo-guia-turista-inteligente.md` foi preservada.
- `CHECKLIST_AUDITORIA_BACKEND.md` registra os 97 itens. `[x]` significa **investigado**, não significa que o requisito esteja atendido.
- O relatório anterior foi confrontado com o código; endpoints ilustrativos equivalentes não foram duplicados. Cache TTL genérico, webhook de compartilhamento e emissões ESG não viraram obrigações autônomas sem contrato funcional.

## O que foi preservado

Planejamento FastAPI/ASGI com duas etapas `asyncio.gather`, cliente `httpx.AsyncClient` compartilhado no lifespan, `Depends`, controle 409, cancelamento, circuit breakers, CORS, Request ID, clima Open-Meteo, OSRM, Gemini/SSE, Open-Elevation, sessões Google/visitante, histórico isolado, catálogo de atrativos, visitas, custos/rateio e métricas Prometheus. O GPX local do frontend permanece como consumidor de compatibilidade; a ação principal usa o backend.

## Implementações e correções

| Entrega | Fonte original | Código e prova |
| --- | --- | --- |
| Chave de sessão sem fallback previsível | §2.1, §3.6 | `app/core/config.py:22`; `tests/test_config_security.py` |
| Transações JSON protegidas entre processos | §2.1 | `app/core/storage.py:69` e `:184`; `tests/test_history_isolation.py:11` usa dois processos. `filelock` já estava em `requirements.lock`. Leituras de arquivo ausente não gravam base vazia; visitantes continuam em memória. |
| GPX 1.1 da viagem autenticada | §3.3, §6.1 aluno 4 | `app/services/gpx.py:30`, `app/routers/trips.py:212`, `tests/test_gpx.py:38` e `:63`; `src/services/api.ts`, `src/App.tsx`. Usa geometria salva, alternativa escolhida, waypoints e elevação quando disponível. |
| Persistência após a resposta | §3.4, §4.5 | `app/routers/trips.py:109` agenda `persist_trip` com `BackgroundTasks`; `app/services/trips.py` conserva gravação padrão em chamadas diretas; `tests/test_http_api.py:57`. |
| Altimetria ligada a autonomia e custo por rota | §3.3, §6.1 aluno 3 | `app/services/trips.py:230`–`:259` passa o percentual já calculado a `postos_service` e `custos_service`; `tests/test_http_api.py:150` verifica integração. O ajuste fica indisponível se o perfil falhar. |
| Ganho de consumo em descida coerente | §3.3 | `app/services/postos_service.py` aceita ajuste de relevo maior que −100%, positivo ou negativo, com a mesma relação de consumo usada em custos. |
| Duração de 1 a 5 dias | §3.1 item 4 | `app/schemas/trips.py`, `app/schemas/streaming.py`, `src/services/api.ts`; testes de limites em `test_schemas.py` e `test_streaming.py`. Viagens antigas não são reescritas. |
| Prompt Gemini alinhado ao roteiro conciso | §3.5 | `app/services/guide.py:28` inclui identidade local, turnos, limites de palavras, gastronomia e clima factual; `tests/test_guide.py:17`. Mantém as três seções do contrato anterior. |
| Prontidão, atividade HTTP e OpenAPI | §3.2, §5.1 | `app/main.py:73`, `:237`, `:248`; `app/core/operational.py`; `app/routers/trips.py` documenta 401/409/422/502; `test_main_observability.py` e `test_http_api.py`. `requisicoes_http_ativas` mede chamadas ASGI, não sockets TCP. |

## Contratos

- `GET /api/v1/roteiros/{trip_id}/exportar/gpx?alternative=-1|0..`: 200 `application/gpx+xml` com anexo; 401 sem sessão, 404 se a viagem não pertence à identidade, 422 para índice ou geometria inválida. O frontend envia o índice da alternativa ativa.
- `POST /api/v1/roteiros/planejar`: mantém `{viagem,aviso}`, passa a persistir em background; 409 para conflito, 422 para entrada inválida, 502 para falha de provedor não recuperada. `/planejar` já devolve geometria, alternativas e custos, equivalendo funcionalmente aos exemplos `/mapa-rota` e `/custos`.
- `POST /api/v1/roteiros/stream-guia`: duração nova limitada a 1–5 dias, mantendo o contrato SSE.
- `GET /readyz`: 200 com recursos locais inicializados, 503 sem eles; não declara APIs externas saudáveis.
- `GET /api/v1/operacao/telemetria`: acrescenta `requisicoes_http_ativas`; `/metrics` publica `http_requests_in_flight`. São requisições em andamento no processo.
- Documentação coordenada em `docs/api/contratos.md`, `docs/qualidade/criterios-de-aceite.md` e `docs/planejamento/matriz-de-rastreabilidade.md`.

## Arquivos desta implementação

- Criados: `app/backend/app/services/gpx.py`, `app/backend/tests/test_gpx.py`, `app/backend/tests/test_config_security.py`, `app/backend/TASKS_BACKEND_IMPLEMENTACAO.md` e este relatório.
- Modificados no backend: `core/config.py`, `core/storage.py`, `core/operational.py`, `main.py`, `routers/auth.py`, `routers/trips.py`, `schemas/trips.py`, `schemas/streaming.py`, `services/trips.py`, `services/postos_service.py`, `services/guide.py` e testes correspondentes de guia, histórico, HTTP, observabilidade, autonomia, schemas e streaming.
- Modificados para o consumidor: `app/frontend/src/App.tsx`, `components/TripNavigationTabs.tsx`, `services/api.ts`, `services/api.test.ts` e os três documentos de contrato/aceite/rastreabilidade em `docs/`.
- Preexistentes e preservados: a exclusão de `docs/modulo-guia-turista-inteligente.md` e os arquivos de auditoria anteriores não rastreados.

## Validação executada

| Comando/verificação | Resultado |
| --- | --- |
| `npm test --workspace @guia/backend` | **408 aprovados, 0 falhas, 0 não executados**; 1 aviso de depreciação do TestClient |
| `npm test --workspace @guia/frontend` | **252 aprovados, 0 falhas, 0 não executados** |
| `npm run check --workspace @guia/backend` | Ruff aprovado; Mypy aprovado em 44 arquivos |
| `npm run build` | Backend e frontend aprovados (2/2 tarefas) |
| OpenAPI runtime/TestClient | `/docs` e `/redoc` 200; 16 caminhos; GPX listado; planejamento anuncia 200/401/409/422/502 |
| Check dirigido aos 4 arquivos frontend modificados | Aprovado |
| `npm run check --workspace @guia/frontend` | Falhou em **17 arquivos com formatação preexistente** fora das alterações desta missão; testes e build frontend passaram |

Após a suíte de 408 testes, foi removida a gravação implícita numa leitura inicial de JSON ausente para fechar uma corrida entre processos. `test_history_isolation.py` e `test_migrated_services.py` foram repetidos: **32 aprovados, 0 falhas**. Ruff e Mypy também passaram após a última mudança. Antes da suíte de 408, o ajuste textual do fallback tinha sido validado em 28 testes de guia/SSE.

Os primeiros testes pós-implementação tinham 2 falhas por chamadas diretas ao router sem o novo parâmetro `BackgroundTasks`; os testes foram adaptados e a execução seguinte passou. Não houve uso de credenciais reais nem de rede externa nos testes.

## Pendências e limites explícitos

1. **REQ-22, REQ-46 e REQ-49:** a atividade descreve rota “mais econômica”, postos/eletropostos reais e pedágios por praça. Não há provedor/catálogo de estabelecimentos ou tarifas autorizado e integrado. O backend projeta paradas, distingue estabelecimentos verificados de projeções e marca pedágios indisponíveis; não inventa preço, local ou economia.
2. **REQ-56–REQ-59:** o prompt agora pede o formato conciso da atividade. A resposta livre do Gemini não é validada deterministicamente para contagem exata de frases/palavras nem para comprovação de todo fato; por isso esses itens continuam **parciais**. O fallback informa indisponibilidade quando não há dados.
3. **REQ-97:** a capacidade de defesa oral dos alunos não é verificável por código. O teste de latência é em cenário controlado; latência com rede e Gemini reais depende do ambiente da demonstração.
4. A gravação em `BackgroundTasks` pode terminar depois de uma leitura imediata do histórico. O cliente conserva a viagem retornada enquanto reconcilia o histórico.
5. `SECRET_KEY` aleatória é fallback local por processo; produção ou múltiplos workers exigem chave compartilhada no ambiente. Sessões em memória e contadores operacionais são por processo.
6. O check global frontend tem 17 arquivos preexistentes fora do padrão de formatação. Não foram reformatados em massa para preservar o escopo.

Não há regressão funcional conhecida nos testes. **O backend ainda não deve ser declarado integralmente conforme à atividade**, pois os sete itens parciais acima permanecem. Há 83 itens classificados como implementados, 6 como arquitetura/extensão não obrigatória e 1 defesa oral não verificável.

## Estado por aluno

| Aluno | Requisitos implementados | Pendências obrigatórias | Validação |
| --- | --- | --- | --- |
| Aluno 2 | ASGI/FastAPI, pool/lifespan, `Depends`, gather duplo, cancelamento, 409, breaker, persistência background, file lock, readiness, telemetria e OpenAPI | Demonstrar latência <1.000 ms no ambiente de apresentação | Testes backend e benchmark controlado aprovados |
| Aluno 3 | Pydantic/422, 1–5 dias, Open-Elevation, perfil/altimetria por rota, efeito no consumo/autonomia, paradas projetadas, custos e rateio | Fonte real de postos e tarifas de pedágio; comprovar “mais econômica” depende desses dados | Integração e testes backend aprovados; limites externos documentados |
| Aluno 4 | Gemini/SSE, cancelamento, GPX 1.1 autenticado, Prometheus, testes backend/frontend | Saída Gemini exatamente no formato exigido depende de validação adicional/provedor; demonstração oral | 408 backend e 252 frontend aprovados; build aprovado |

## Integração seletiva do PR #38 (estado posterior ao relatório acima)

Na branch `integracao/frontend-backend` (base `d4b4cbcd`), foram trazidos do PR #38 (`9d5bf20c`) o benchmark Playwright, seu classificador e testes, a documentação de medição, o servidor controlado de QA e um teste de retransmissão incorporado ao teste atual de `RoteiroResult`. `package.json` e lockfile incluem Playwright e comandos `bench:sse` e `test:sse-latency`. Os arquivos do PR que só reformatavam navegação/GPX não foram aplicados; o GPX backend e os demais contratos recentes permanecem preservados.

O benchmark foi corrigido para extrair o diagnóstico do evento SSE real, identificar a requisição de retransmissão e impedir que texto anterior conte como primeiro conteúdo. Validação dirigida: 15/15 testes de `RoteiroResult` e 3/3 testes do classificador passaram. Ensaio controlado: `BLOCKED`, como esperado. Ensaio com Gemini real: `BLOCKED` por `cota_excedida`. Portanto, **não há medição válida que comprove 300 ms**. A inspeção encontrou uma geração de guia no planejamento e outra no streaming ao abrir o resultado; a remoção dessa duplicação depende de preservar o guia persistido e o streaming progressivo e não foi feita nesta integração. A suíte completa e os checks ainda não foram repetidos após a integração; os números anteriores nesta página são o estado anterior ao PR #38.

## Correção posterior — Plano 01 de topografia (30/10/2026)

Branch `integracao/frontend-backend`, commit-base `3e37aaf` (alterações locais sem commit). A fonte funcional foi `app/backend/docs/modulo-guia-turista-inteligente.md` §3.3 e matriz §6.1; critérios RF-MAP-004/005 e CA-MAP-003. O planejamento já consultava Open-Elevation com geometria real e associava o perfil à rota principal ou alternativa. Nas três viagens persistidas inspecionadas, as quatro consultas altimétricas falharam com HTTP 429 por limite da franquia anônima. Não faltava a chamada de altimetria; faltavam uma configuração de acesso utilizável e uma explicação pública segura do erro.

Foi adicionado `OPEN_ELEVATION_API_KEY` ao backend (`.env.example`, `app/core/config.py`, `app/routers/trips.py`, `app/services/trips.py`). `app/services/altimetria_service.py` envia a chave no cabeçalho oficial `X-API-Key`, classifica HTTP 429 como `cota_excedida` (`app/schemas/roteiros.py`) e não registra nem devolve o corpo bruto da resposta. O parser `app/frontend/src/services/tripOptionalFields.ts` reconhece o novo estado e o erro 429 de viagens antigas. `app/frontend/src/components/MapaRota.tsx` mostra o motivo seguro somente na rota correspondente, sem criar gráfico ou cotas falsas. A documentação do contrato foi atualizada em `docs/api/altimetria.md`, e o acompanhamento está em `app/backend/TASKS_BACKEND_IMPLEMENTACAO.md` e `app/frontend/docs/planos-correcao/PLANO_01_TOPOGRAFIA.md`. Um teste de isolamento do histórico foi ajustado para aceitar o catálogo já anexado à viagem, sem alterar o código desse fluxo.

Com a chave configurada localmente, uma consulta real com 10 pontos amostrados da geometria salva Abadia de Goiás - GO → Abaiara - CE retornou `sucesso`, altitude mínima de 225,23 m e máxima de 1.052,63 m. A consulta foi somente de leitura e não modificou `viagens.json`. Isso confirma o caminho serviço → provedor nessa amostra; ainda falta criar uma nova viagem na SPA e comparar sua captura ao wireframe. As viagens antigas permanecem sem perfil. A franquia do provedor continua sendo limite externo; não foi criado cooldown arbitrário nem uma fonte de elevação fictícia.

Validação desta alteração: `npm test` passou com **413 testes backend, 272 frontend e 3 do classificador SSE**, zero falhas. Na primeira execução, dois testes falharam: um fake não aceitava a chave e uma expectativa de histórico ignorava o catálogo enriquecido existente; ambos foram corrigidos nos testes, e a repetição passou. `npm run check` e `npm run build` passaram para ambos os workspaces. Após um pequeno ajuste de tipagem em `app/services/trips.py`, o check e o build foram repetidos; os testes direcionados de altimetria e API foram repetidos. Nenhuma mudança foi feita no Plano 02 de atrativos nesta execução.

## Correção posterior — Plano 02 de atrativos (30/10/2026)

Branch `integracao/frontend-backend`, commit-base `3e37aaf`, sem commit nesta execução. Conforme §3.5 da atividade e RF-GUI-005, o backend já incluía `atrativos` em `/planejar`, enriquecia viagens antigas em `/minhas-viagens` e o frontend já possuía os componentes individuais. O motivo dos cards vazios em Abaiara - CE era a ausência dessa cidade no catálogo local, não uma falha de transporte nem do Open-Elevation.

Foram adicionados dois locais documentados ao catálogo de Abaiara: Praça da Igreja Matriz e Mercado Público Municipal Amâncio Tavares Leite (`app/data/atrativos.json`). A procedência e os limites de cada informação estão em `app/data/FONTES_ATRATIVOS_ABAIARA.md`. Os IDs são estáveis. Não foi cadastrado restaurante: a fonte municipal menciona espaço destinado a restaurante no mercado, mas não comprova operação atual de estabelecimento específico. Links Maps são pesquisas textuais pelo nome e cidade, sem coordenadas inventadas. Outras cidades continuam dependentes de curadoria.

`app/core/storage.py` agora valida o ID de uma visita contra os atrativos da viagem ou o catálogo usado para enriquecê-la, retornando 422 para ID não reconhecido. A viagem antiga de Abaiara foi lida com dois atrativos pelo serviço de histórico sem regravar `viagens.json`. `app/frontend/src/components/RoteiroResult.tsx` remove a lista fixa de oito cidades, conserva ambos os grupos visíveis durante o filtro de gastronomia e só exibe Maps quando o item fornece link. O parser e os componentes existentes foram preservados. Testes em `test_http_api.py`, `test_migrated_services.py` e `RoteiroResult.test.tsx` conferem Natal com cinco atrativos e cinco opções gastronômicas, Abaiara com dois locais e nenhum restaurante, visitas válidas, isolamento e estado vazio.

Validação final desta etapa: `npm test` **415 backend, 274 frontend e 3 SSE aprovados; zero falhas**. `npm run check` e `npm run build` aprovados. A comparação visual por capturas de tela desktop/mobile permanece pendente; não há comprovação de cobertura gastronômica para Abaiara. O Plano 01 de topografia não foi alterado nesta etapa.

## Ampliação do Plano 02 — locais próprios por município

A correção anterior cobria apenas Abaiara e não atendia à necessidade de consultar locais próprios de outros destinos. Foi incluído `app/services/atrativos_osm.py`: para cidades sem catálogo local, ou com catálogo sem gastronomia, consulta uma [área municipal Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL) dentro da UF, usando `admin_level=8` e nome exato. Uma área ambígua ou não encontrada não produz cards. A consulta limita os resultados a até 15 pontos turísticos/patrimoniais e 15 restaurantes nomeados, com IDs OSM estáveis. O catálogo local permanece prioritário; restaurantes mapeados podem complementá-lo. `app/services/trips.py` executa a consulta junto com clima e roteamento, inclui fonte/status e duração da etapa. Há cache em memória de uma hora para respostas, dois minutos para falhas. `OVERPASS_URL` no ambiente do backend permite usar uma instância autorizada.

`app/frontend/src/services/api.ts` e `app/frontend/src/types/domain.ts` transportam a procedência e o estado. `app/frontend/src/components/RoteiroResult.tsx` exibe os cards somente quando há dados, diferencia falha de consulta de ausência de locais e credita [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Os itens mapeados não são apresentados como estabelecimentos verificados em funcionamento. A [política da instância pública Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) limita uso intensivo; uma instância própria será necessária para operação em escala.

**Limite externo comprovado:** as instâncias públicas testadas neste ambiente retornaram HTTP 406/403 ou timeout. Não há demonstração real de cards dinâmicos para um município novo; os testes usam resposta OSM controlada. Viagens antigas sem catálogo não recebem consulta retroativa. A consulta externa pode acrescentar até 10 segundos ao planejamento sem cache, portanto a meta de latência do planejamento não foi comprovada com essa fonte. Não se deve declarar cobertura universal: cada município depende da disponibilidade do Overpass e da presença de POIs mapeados.

Validação após a ampliação: `npm test` **420 backend, 276 frontend e 3 SSE aprovados, zero falhas**. `npm run check` e `npm run build` passaram. Testes em `test_atrativos_osm.py`, `test_local_processing.py`, `apiGeometry.test.ts` e `RoteiroResult.test.tsx` cobrem seleção municipal, rejeição sem área única, erro do provedor, integração no planejamento, status e atribuição.
