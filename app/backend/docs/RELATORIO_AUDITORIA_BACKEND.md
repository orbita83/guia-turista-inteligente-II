# Relatório de conformidade com a atividade original

**Fonte principal:** `docs/modulo-guia-turista-inteligente.md` (conteúdo recuperado de `HEAD` porque o arquivo está removido da árvore de trabalho). Uma cópia não rastreada existe em `app/backend/modulo-guia-turista-inteligente.md` (41.136 bytes, 640 linhas); seu texto foi lido integralmente. **Atenção:** o Git informa `D docs/modulo-guia-turista-inteligente.md`, preexistente nesta sessão. Não restaurei nem editei a fonte.

**Código analisado:** branch `integracao/frontend-backend`, HEAD `d4b4cbcd957ddd194c32b89f1d3e8055b839abd0`.

**Critério:** “implementado” requer fluxo funcional compatível, não apenas módulo com nome relacionado. “Parcial” inclui serviço existente sem integração HTTP/fluxo exigido, ou evidência/teste insuficiente. Requisitos explícitos da atividade são separados de componentes enumerados como arquitetura de referência; recomendações do relatório anterior não viram obrigações sem apoio no documento.

## Leitura integral e responsabilidades

A documentação consultada tem 640 linhas e cobre visão/arquitetura (seções 1–2), funcionalidades de tela descritas como comportamento esperado (seção 3), padrões de engenharia assíncrona (seção 4), execução/testes (seção 5), apresentação e responsabilidades (seção 6), avaliação (seção 7) e aviso de gabarito ainda não liberado (seção 8).

Na matriz explícita de responsabilidade (seção 6.1, linhas 614–629):

- **Aluno 2 — Backend Core Engineer:** `app/main.py`, endpoint `/planejar`, dependências e circuit breaker. Deve demonstrar resposta inferior a 1.000 ms e explicar ASGI/FastAPI, dois estágios de `asyncio.gather`, pool HTTP no lifespan, cancelamento ativo, circuit breaker e injeção de dependências.
- **Aluno 3 — Data & Altimetry Engineer:** schemas, altimetria, postos/autonomia e custos. Deve demonstrar erro 422 para UF inválida, perfil topográfico, Open-Elevation, efeito altimétrico no consumo e autonomia/rateio.
- **Aluno 4 — DevOps, QA & Streaming Lead:** SSE, Gemini, GPX, testes backend/frontend. Deve demonstrar streaming e GPX 1.1, explicar `StreamingResponse`, 409, Prometheus e testes com aprovação total.

Outros comportamentos de backend estão descritos nas seções 2.1, 3.2–3.6 e 4, mas não são automaticamente tarefas exclusivas de um aluno. A nota individual depende da defesa do código implementado (seção 7).

## Conclusão executiva

O projeto contém implementação real e testes extensos para planejamento, geocodificação, OSRM, clima, guia/SSE, sessões, histórico, schemas, altimetria, custos, autonomia, visitas e métricas. A funcionalidade central do planejamento e boa parte da responsabilidade dos alunos 2 e 3 estão representadas no fluxo de serviços, embora não tenha sido possível produzir uma validação runtime completa nesta execução.

Há divergências materiais frente à atividade: não foi localizado endpoint GPX, apesar de a seção 3.3 e a responsabilidade do aluno 4 pedirem download GPX 1.1; não foi localizado `/mapa-rota` nem endpoint HTTP de custos, mas a geometria/alternativas e os cálculos de custo podem estar incluídos no planejamento e no payload, portanto não os classifico como ausentes sem distinguir a função. Compartilhamento via WhatsApp e Google Maps é apresentado como ação da UI, não exige por si só endpoint de backend; a seção 4.5 menciona despacho em background como exemplo técnico, não como prova de requisito independente.

Configuração de sessão contém chave padrão previsível em `app/backend/app/core/config.py:21`, risco real para qualquer ambiente que não a substitua. A atividade pede configuração ambiental e `.env.example` na estrutura de referência (seção 2.1), então a configuração default não satisfaz essa expectativa de forma segura.

## Inventário real de rotas por registro de código

Não foi possível importar `/openapi.json` no `.venv` local (FastAPI ausente); a inspeção estática encontrou as rotas abaixo. FastAPI normalmente habilita `/docs` e `/redoc`, mas isso permanece por confirmar em runtime.

| Método | Caminho | Evidência |
|---|---|---|
| GET | `/healthz` | `app/backend/app/main.py:209` |
| GET | `/readyz` | `app/backend/app/main.py:214` |
| GET | `/api/v1/operacao/telemetria` | `main.py:219` |
| GET | `/circuits` | `main.py:233` |
| GET | `/metrics` | `main.py:240` (excluído do OpenAPI) |
| GET | `/api/v1/auth/session` | `routers/auth.py:96` |
| POST | `/api/v1/auth/google` | `routers/auth.py:137` |
| POST | `/api/v1/auth/visitor` | `routers/auth.py:180` |
| POST | `/api/v1/auth/restore-google` | `routers/auth.py:232` |
| POST | `/api/v1/auth/logout` | `routers/auth.py:287` |
| GET | `/api/v1/roteiros/minhas-viagens` | `routers/trips.py:69` |
| GET | `/api/v1/roteiros/minhas-viagens/json` | `routers/trips.py:80` |
| POST | `/api/v1/roteiros/planejar` | `routers/trips.py:89` |
| DELETE | `/api/v1/roteiros/{trip_id}` | `routers/trips.py:172` |
| PATCH | `/api/v1/roteiros/{trip_id}/visitas` | `routers/trips.py:181` |
| POST | `/api/v1/roteiros/stream-guia` | `routers/streaming.py:112` |

As rotas declaradas em `/api/v1/roteiros` são funcionais em nomes equivalentes: planejamento reúne geocodificação, clima, rota e composição de resposta. Custos e altimetria aparecem como capacidades de domínio e dados associados ao planejamento; não encontrei endpoint próprio para calculá-los isoladamente. Não há implementação GPX localizada.

## Matriz integral dos requisitos anteriores (REQ-01…REQ-97)

A coluna “fonte primária” aponta o trecho/seção correspondente na atividade original. Os REQ da auditoria anterior que não encontram requisito direto são marcados como **adicional**, **extrapolação** ou **não obrigatório isoladamente**. A evidência de código/tests é representativa; os arquivos de teste citados devem ser consultados junto à suíte completa.

| ID | Fonte primária / natureza | Evidência no backend e testes | Estado |
|---|---|---|---|
| REQ-01 | §1, §5.1, §6.1 aluno 2 | `app/backend/package.json` script dev Uvicorn `--port 8001`; `main.py` cria FastAPI. Sem resposta HTTP observada. | parcial |
| REQ-02 | §2.1 arquitetura por camadas | `app/backend/app/{core,routers,schemas,services}` separa responsabilidades; chamadas de routers para serviços. | implementado |
| REQ-03 | §2.1 config Pydantic-Settings e `.env.example` | `core/config.py`; `secret_key` default literal conhecido (`:21`); `GEMINI_API_KEY` configurável. `.env.example` da raiz precisa verificação no workspace. | incorreto |
| REQ-04 | §1.3 CORS :5173/:3000; §2.1 | `main.py` configura CORS; `test_http_api.py::test_cors_permite_patch...`. | implementado |
| REQ-05 | §1.3, §4.1 client pool/lifespan | `main.py::lifespan` cria e fecha `httpx.AsyncClient` com limits. | implementado |
| REQ-06 | §2.1 dependencies; §6.1 aluno 2 | `core/dependencies.py`; uso de `Depends` em `routers/trips.py`; testes API com overrides/mocks. | implementado |
| REQ-07 | §1.1 OpenAPI, §5.1 probes e docs | `/healthz`, `/readyz`, `/metrics`, `/circuits` em `main.py`; readiness não testa dependências; docs/redoc sem runtime. | parcial |
| REQ-08 | §3.2 X-Process-Time com `perf_counter` | `main.py::RequestObservabilityMiddleware`, valor em ms; testes `test_main_observability.py`, `test_http_api.py`. | implementado |
| REQ-09 | §2.1 logging Correlation-ID, §3.2 telemetria | middleware valida/gera `X-Request-ID`; testes de headers. Logging estruturado correlacionado não comprovado como requisito explícito completo. | parcial |
| REQ-10 | §2.1 lista cache TTL; referência arquitetural | cache TTL genérico não localizado; `atrativos.py` usa `lru_cache`, sem mesma garantia. Item de arquitetura, não demonstração individual. | ausente |
| REQ-11 | §2.1 circuit breaker e §6.1 aluno 2 | `core/circuit_breaker.py`; `main.py::build_circuit_breakers`; `test_circuit_breaker.py`. Cobre weather/guide, não cada provedor listado. | parcial |
| REQ-12 | §3.1 bloqueio 409, §4.3, §6.1 aluno 4 | `_locks_guard`, `_active_requests`, cooldown e finally em `routers/trips.py`; testes em `test_http_api.py` e `test_streaming.py`. | implementado |
| REQ-13 | §1.1, §4.4 desconexão e não persistir incompleto | `routers/trips.py::create_trip` monitora `http.disconnect`, cancela task; testes de desconexão em `test_http_api.py`. | implementado |
| REQ-14 | §1.1, §4.1 não bloqueante | `services/trips.py` usa gather; I/O com httpx async; storage em `run_in_threadpool`. | implementado |
| REQ-15 | §1.1 ~800 ms, §3.2, §6.1 <1000 ms | `test_http_api.py::test_planning_endpoint_meets_mocked_latency_target_with_concurrent_stages`; teste mockado não prova desempenho real. | parcial |
| REQ-16 | §1.3/§3.1 planejamento; §4.1 | `POST /planejar`, `TripCreateRequest`, `services/trips.py::plan_trip`. | implementado |
| REQ-17 | §1.1/§4.1 paralelismo duplo | `services/trips.py` gather linhas ~109,129 e gather adicional para candidatos/IA-elevação (~191,194). | implementado |
| REQ-18 | §4.1 clima/perfil/contexto alimentam Gemini | `services/trips.py` passa clima, atrativos, gastronomia e perfil para guia. `test_guide.py`. | implementado |
| REQ-19 | §3.1 formulário cidade/UF; §6.1 validação UF | `schemas/trips.py`; `services/integrations.py` geocoding; testes `test_schemas.py`, `test_http_api.py` para UF/homônimos. | implementado |
| REQ-20 | §3.5 banner Open-Meteo | `services/integrations.py` integra forecast; composição em `services/trips.py`; mocks em `test_http_api.py`/`test_migrated_services.py`. | implementado |
| REQ-21 | §3.3 geometria rodoviária/Leaflet | `services/integrations.py` OSRM; integração em `services/trips.py`; `test_route_geometry.py` e teste API de geometria. | implementado |
| REQ-22 | §3.3 abas alternativas e recálculo | `services/trips.py` avalia candidatos OSRM; critérios de preferência; evidências em teste de rota/planejamento. Alegação “mais econômica” depende dos dados apresentados. | parcial |
| REQ-23 | §1.3 lista `/mapa-rota`; §2.1 estrutura de referência | Não há rota própria; geometria/alternativas integradas a `/planejar` podem constituir equivalente funcional. Contrato e integração SPA não foram demonstrados integralmente. | parcial |
| REQ-24 | §4.1 `preferencia_rota` | schema/serviço de trips encaminha preferência a OSRM e seleciona alternativa. | implementado |
| REQ-25 | §3.3 recalcular métricas ao alternar | backend associa geometria/altimetria/custos à rota planejada; seleção interativa é frontend; fluxo de alternância ponta-a-ponta sem comprovação suficiente. | parcial |
| REQ-26 | §1.1 resiliência; §2.1 circuit breaker | integrações verificam erros e retornam diagnóstico/fallback; testes de falha. Coordenadas/trajetos falsos precisam revisar caso a caso. | parcial |
| REQ-27 | §1.1 Pydantic v2/422; §2.1 schemas | schemas Pydantic v2; `test_schemas.py` cobre limites; API 422 em `test_http_api.py`. | implementado |
| REQ-28 | §3.1 e §6.1 aluno 3 UF inválida 422 | validadores em `schemas/trips.py`; testes de UF incluindo inválida. | implementado |
| REQ-29 | §2.1 sanitização de cidades | validadores em `schemas/trips.py`; testes cidade vazia/tamanho/acentos. | implementado |
| REQ-30 | §3.1 tipo combustão e parâmetros | schemas Pydantic de veículo em `schemas/trips.py`/`schemas/roteiros.py`; `test_schemas.py`. | implementado |
| REQ-31 | §3.1 tipo EV e parâmetros | schemas e validação de compatibilidade; testes de schema. | implementado |
| REQ-32 | §3.1 duração do roteiro | `TripCreateRequest` permite dias até 365 (e schema de stream até 365), não o intervalo 1–5 alegado anteriormente; atividade mostra duração sem declarar esse limite. | parcial |
| REQ-33 | §3.1 perfis | enum/schema de perfil precisa comparar valores em runtime; documento lista Cultural, Gastronômico, Ecoturismo/Aventura, Família, Econômico. | não verificável |
| REQ-34 | §3.1 parâmetros veículo; §3.3 consistência | request de planejamento inclui campos e persistência preserva dados; `test_http_api.py` incompatibilidade/planejamento. Alternância de rota ainda parcial. | parcial |
| REQ-35 | §3.3 até 8 passageiros | `TripCreateRequest` e schema custos `ge=1, le=8`; `test_schemas.py`, `test_custos_service.py`. | implementado |
| REQ-36 | §2.1 contratos; §3.3 métricas | schemas em `schemas/roteiros.py` cobrem unidades/valores; testes schemas/custos/altimetria. | implementado |
| REQ-37 | §3.3 e §6.1 consulta Open-Elevation | `services/altimetria_service.py`; mock HTTP e testes `test_altimetria_service.py`. | implementado |
| REQ-38 | §3.3 perfil de relevo | serviço retorna perfil/amostras ordenadas; testes de geometria e distâncias em `test_altimetria_service.py`. | implementado |
| REQ-39 | §3.3 subida/descida/altitude | cálculo em `altimetria_service.py`; testes de subida, descida, perfil misto e resumo. | implementado |
| REQ-40 | §3.3 penalização/ganho consumo | informação/fator de relevo em schemas e custo; `test_custos_service.py` cobre fator. Fórmula de produto não fixada pela fonte. | parcial |
| REQ-41 | §3.3 seleção alternativa + relevo | planejamento mede candidatos e elevação por rota em `services/trips.py`; testes de geometria necessários. | implementado |
| REQ-42 | §1.1 resiliência e §3.3 relevo | serviço classifica falhas Open-Elevation e testes de timeout/HTTP/dados inválidos; efeito exato no plano integrado parcialmente validado. | parcial |
| REQ-43 | §3.3 autonomia combustão | `postos_service.py` calcula autonomia nominal/efetiva e projeção; testes dedicados aparecem em `test_postos_service.py`. | implementado |
| REQ-44 | §3.3 autonomia EV | mesma implementação com tipo elétrico; testes dedicados. | implementado |
| REQ-45 | §3.3 reserva de ~18% | política de autonomia em `postos_service.py`; verificar valor default exato e teste de fronteira. | implementado |
| REQ-46 | §3.3 postos/eletropostos | serviço de postos/catálogo pode anexar estabelecimento verificado; também explicita parada projetada não verificada. Evidência de provedor real depende de `test_postos_service.py`. | parcial |
| REQ-47 | §3.3 rotas alternativas e métricas | planejamento agrega métricas por candidato; seleção visual de frontend não auditada aqui. | parcial |
| REQ-48 | §3.3 custos combustível e energia | `services/custos_service.py`; `test_custos_service.py` cobre combustível/EV. | implementado |
| REQ-49 | §3.3 pedágio regional por praça | cálculo/schema distingue pedágio verificado, estimado e indisponível; fonte original não fixa base tarifária. Não declarar preço real sem fonte. | parcial |
| REQ-50 | §3.3 custo total e rateio até 8 | custo total e Decimal/rateio em `custos_service.py`; testes de centavos e até 8. | implementado |
| REQ-51 | §2.1 custos menciona emissões ESG | nenhum critério ESG mensurável aparece na atividade original convertida além da arquitetura de módulo. Implementação não verificada e não requisito de apresentação claro. | não verificável |
| REQ-52 | não há requisito autônomo direto; extensão do mapa | estimativas/precisão de economia não fixadas na fonte. | adicional |
| REQ-53 | §3.3 custos e alternativa | custos service modela estados de dados; integração com opções visuais precisa teste frontend. | parcial |
| REQ-54 | §3.5 Gemini; §4.2 SSE; §6.1 aluno 4 | `services/guide.py`, integração `services/integrations.py`, breakers/fallback; `test_guide.py`. | implementado |
| REQ-55 | §3.5 contexto clima/atrativos/gastronomia | prompt/guia recebe contexto via `services/trips.py`; `test_guide.py`. | implementado |
| REQ-56 | §3.5 frase até 20 palavras | regras existem no prompt em `services/guide.py`; testes focam parâmetros/fallback, não conformidade semântica garantida de saída livre. | parcial |
| REQ-57 | §3.5 turnos e uma frase até 15 palavras | instruções no prompt; sem validador determinístico da resposta identificável. | parcial |
| REQ-58 | §3.5 gastronomia 2–3 pratos/local | prompt orienta; prova de saída consistente não localizada. | parcial |
| REQ-59 | §3.5 orientação usa clima real | contexto de clima é transmitido ao serviço; formato factual da saída não validado de forma determinística. | parcial |
| REQ-60 | §3.5/§4.2 streaming progressivo SSE | `routers/streaming.py`, `StreamingResponse`; `test_streaming.py` inclui servidor TCP real. | implementado |
| REQ-61 | §4.2 formato chunk/done | gerador SSE serializa eventos e finalização; testes de fluxo. | implementado |
| REQ-62 | §4.2 headers SSE | `routers/streaming.py` define headers SSE; testes streaming. | implementado |
| REQ-63 | §4.2/§4.4 desconexão/cancelamento | fluxo SSE monitora desconexão e encerra iterador; testes de cancelamento/close em `test_streaming.py`. | implementado |
| REQ-64 | §4.2 erro SSE | eventos de erro sanitizados no router e testes `test_terminal_failure_is_safe_error_event...`; não expõe exc bruto como exemplo da fonte. | implementado |
| REQ-65 | §3.3 download GPX 1.1; §6.1 aluno 4 | nenhum gerador/endpoint GPX identificado em `app/backend/app`; a função pedida não está presente. | ausente |
| REQ-66 | §3.3 GPX como ação de produto, não fixa path | sem rota GPX observada. Pode ser endpoint ou download equivalente, mas backend não expõe arquivo neste código. | ausente |
| REQ-67 | §4.5 BackgroundTasks para despacho | exemplo técnico explícito de tarefa em background; não encontrei endpoint/dispatcher de compartilhar. Como ação WhatsApp aparece na UI (§3.3), o backend não é obrigatório para abrir link; webhook/despacho é lacuna se escopo inclui o exemplo. | parcial |
| REQ-68 | §3.3 Google Maps/WhatsApp | a documentação atribui ações aos botões frontend; não exige serviço backend dedicado. Dados de rota são devolvidos no planejamento. | não obrigatório isoladamente |
| REQ-69 | §2.1 catálogo curado; §3.5 cards | `app/data/atrativos.json`, `services/atrativos.py`, correspondência por cidade/UF; escopo é catálogo local limitado. | implementado |
| REQ-70 | §3.5 cards detalhados | JSON contém ids, categorias, nomes e links; `services/atrativos.py`; testes catálogo em `test_http_api.py`. | implementado |
| REQ-71 | §3.5 PATCH de visita | `routers/trips.py::update_attraction_visit`; storage valida propriedade; testes API de visita/isolation. | implementado |
| REQ-72 | §2.1 validação OAuth Google | `services/integrations.py::verify_google_token`, auth router; `test_migrated_services.py` audience/credencial. | implementado |
| REQ-73 | §2.1 visitante TTL 2h; §3.6 | `core/dependencies.py::VISITOR_TTL_SECONDS`, router auth e limpeza; testes de sessão. | implementado |
| REQ-74 | §3.6 restauração híbrida | `/restore-google`, preservação de usuário Google na sessão e testes auth em `test_http_api.py`; armazenamento de UI é frontend. | implementado |
| REQ-75 | §2.1 encerramento/sendBeacon | logout POST existe; compatibilidade sendBeacon pertence ao contrato/cliente e deve validar content type. Sem atribuir sendBeacon exclusivamente ao backend. | parcial |
| REQ-76 | §3.4 isolamento por usuário | identidade vem de sessão assinada validada, não do header cliente; storage scoping; `test_spoofed_user_header_does_not_authenticate`, `test_history_isolation.py`. | implementado |
| REQ-77 | §2.1 storage JSON atômico/thread-safe/file lock | `core/storage.py` usa `RLock`, arquivo temporário e replace atômico; não comprova lock entre processos. A atividade menciona file lock na descrição da estrutura. | parcial |
| REQ-78 | §3.4 persistência BackgroundTasks; §4.5 exemplo | `create_trip` aguarda `plan_trip`, que salva em fluxo de serviço antes da resposta; não usa `BackgroundTasks`. Funcionalidade persiste, padrão arquitetural difere. | parcial |
| REQ-79 | §3.4 histórico salvo | `GET /minhas-viagens`, filtrado pela sessão; testes de isolamento/histórico. | implementado |
| REQ-80 | §3.4 DELETE | endpoint DELETE 204 por usuário; `test_history_isolation.py` e `test_http_api.py`. | implementado |
| REQ-81 | §3.2 total de roteiros/conexões | `operational_snapshot`; métrica global exclui visitantes voláteis por semântica documentada. Conexões ativas não confirmadas. | parcial |
| REQ-82 | §5.1 Prometheus/OpenMetrics; §6.1 aluno 4 | `main.py::metrics`, counters/histogram/gauges; testes `test_stream_metrics.py` e `test_main_observability.py`. | implementado |
| REQ-83 | §3.2 “4 provedores ativados” | `/circuits` informa somente breakers weather/guide; não mede saúde individual de OSRM/Open-Elevation/Gemini/Open-Meteo. O wireframe mostra indicador, teste não existe. | parcial |
| REQ-84 | §3.2 latência/total/conexões | request metrics e endpoint operacional têm latência/roteiros; conexões ativas em tempo real não localizadas. | parcial |
| REQ-85 | §3.2 latência API vs frontend; §4.1 etapas | middleware e timers por estágio em `services/trips.py`; duração frontend é responsabilidade frontend, não cobrada do backend isoladamente. | parcial |
| REQ-86 | §2.1/§4.5 auditoria em background | não encontrei dispatcher/event log operacional dedicado. O exemplo de BackgroundTasks é padrão descrito, sem evento de auditoria concreto na tela. | parcial |
| REQ-87 | §3.2 status real dos provedores | `/readyz` retorna ready fixo e breakers parciais; sem probes individuais. | parcial |
| REQ-88 | §5.1 `pytest tests/ -v`; §6.1 aluno 4 | suíte ampla em `app/backend/tests`; execução desta sessão 352 passed e 36 erros de setup `PermissionError` para temp dirs, portanto não há 100% de aprovação verificada. | parcial |
| REQ-89 | §4.3/§4.4 concorrência e cancelamento | testes em `test_http_api.py`/`test_streaming.py`; existem casos simultâneos, 409 e cancelamento. Suíte completa bloqueada pelo ambiente. | parcial |
| REQ-90 | §1.1 422; §6.1 aluno 3 | testes schemas cobrem UF/tipos/veículo/passageiros, mais custos e relevo; a atividade não especifica todos limites da auditoria anterior. | implementado |
| REQ-91 | §1.3/§4.1 provedores assíncronos | mocks e `MockTransport` em tests de integrations, guide, altimetria e planning; breakers limitados a duas categorias. | implementado |
| REQ-92 | §4.2 SSE progressivo/fim/cancelamento | `test_streaming.py` cobre chunks, done, falha, cancelamento e TCP; validação global prejudicada por setup tmp. | parcial |
| REQ-93 | §3.3 GPX; §6.1 aluno 4 | sem implementação GPX, logo testes de GPX 1.1 ausentes. File lock multiprocesso não comprovado. | ausente |
| REQ-94 | §2.2/§4.2 integração SPA leitor SSE | backend tem contrato SSE; testes backend provam entrega. Compatibilidade da SPA exige suíte frontend separada, não executada nesta auditoria. | não verificável |
| REQ-95 | §6.1 aluno 4 “100% de aprovação” | suíte não passou limpidamente na execução disponível (352 pass, 36 setup errors). | incorreto |
| REQ-96 | §1.1 OpenAPI `/docs`/`/redoc`; §5.1 | docs padrões FastAPI esperados, mas não foi possível importar app para obter OpenAPI real; `/metrics` fica fora do schema. | não verificável |
| REQ-97 | §6.1/§7 defesa individual | documentação exige domínio demonstrado individualmente; auditoria estática não pode comprovar capacidade de apresentação. | não verificável |

## Requisitos obrigatórios versus itens técnicos adicionais

**Diretamente cobrados pela matriz de apresentação:** aluno 2: gather duplo, pool/lifespan, desconexão, breaker, Depends, demonstração <1.000 ms; aluno 3: 422 para UF, altimetria/Open-Elevation, efeito em consumo, autonomia e rateio; aluno 4: SSE, GPX 1.1, 409, Prometheus e suíte com aprovação total. A descrição funcional ainda pede rota/mapa, clima, custo/pedágio, paradas, histórico, visitas e guia conciso.

**Descritos como arquitetura de referência, mas não como prova isolada de avaliação individual:** cache TTL, diretório/nome exato dos módulos, logging estruturado, endpoint separado para cada cálculo, BackgroundTasks para qualquer persistência, webhook de compartilhamento. A seção 4.5 dá exemplos de tarefas em background; classificar divergência arquitetural quando aplicável, sem transformar automaticamente num requisito de feature independente.

**Ações do frontend:** abrir Maps e WhatsApp e apresentar telemetria cliente/UI são descritas como componentes React. O backend deve fornecer dados necessários; não se deve declarar backend ausente só por não expor endpoint de link. GPX é requisito explícito porque a atividade exige download e atribui sua demonstração ao aluno 4.

## Testes e limites da verificação

Execução tentada: `uv run --with-requirements requirements.lock python -m pytest -q` em `app/backend`. Resultado observado: **352 passed, 36 errors, 3 warnings**; erros de fixture `tmp_path` por `PermissionError [WinError 5]` em `AppData\Local\Temp\pytest-of-mails`. Uma tentativa com `TEMP/TMP` e basetemp no workspace também falhou ao criar/limpar temporários. O `.venv` local não tem FastAPI disponível fora do ambiente `uv`; não consegui obter OpenAPI/runtime. Portanto, requisitos apoiados em testes mas atingidos pelo erro de fixture ficam “parcial” quando a execução passa a ser necessária para validação, e não reprovados funcionalmente.

Nenhum código foi alterado. O documento original permanece removido no working tree como já estava; este relatório usou `git show HEAD:docs/modulo-guia-turista-inteligente.md` e a cópia Markdown não rastreada presente em `app/backend/`.

# Resposta objetiva: existe no backend?

Esta seção responde à presença funcional no código. “SIM” significa que há implementação backend identificável; “PARCIAL” significa que a capacidade está apenas em parte (ex.: lógica sem endpoint exigido, ou alternativa não integrada); “NÃO” significa que a função não está implementada. Teste executado é uma avaliação separada. O texto original da atividade, não os extras da auditoria anterior, define se a capacidade era exigida.

| ID | Existe? | Resposta direta e evidência principal |
|---|---|---|
| REQ-01 | SIM | FastAPI e script Uvicorn porta 8001: `app/backend/app/main.py`, `app/backend/package.json`. |
| REQ-02 | SIM | Camadas `core`, `routers`, `schemas`, `services` existem e são usadas. |
| REQ-03 | PARCIAL | Pydantic Settings e configuração Gemini existem; segredo tem default hardcoded conhecido em `core/config.py:21`. |
| REQ-04 | SIM | CORSMiddleware e origens configuradas em `main.py`; há teste de CORS. |
| REQ-05 | SIM | AsyncClient no lifespan, pool e fechamento em `main.py::lifespan`. |
| REQ-06 | SIM | Dependências FastAPI em `core/dependencies.py` e routers. |
| REQ-07 | PARCIAL | `/healthz`, `/readyz`, `/metrics`, `/circuits` existem; `/readyz` não verifica readiness real; docs são padrão FastAPI, runtime não consultado. |
| REQ-08 | SIM | Middleware mede `perf_counter`, emite X-Process-Time em ms. |
| REQ-09 | PARCIAL | X-Request-ID sanitizado/gerado e retornado; logging estruturado correlacionado não está demonstrado. |
| REQ-10 | NÃO | Não há cache geral thread-safe com TTL; `lru_cache` de catálogo não é equivalente. Item é estrutura de referência, não apresentação individual. |
| REQ-11 | PARCIAL | Circuit breaker existe e é testado, mas apenas `weather` e `guide` são registrados. |
| REQ-12 | SIM | Lock, chave por usuário/rota, 409 e liberação em finally em `routers/trips.py`; testes dedicados. |
| REQ-13 | SIM | Planejamento detecta desconexão, cancela task e evita salvar incompleto; testes em `test_http_api.py`. |
| REQ-14 | SIM | I/O async, gather e storage em threadpool no fluxo de planejamento. |
| REQ-15 | PARCIAL | Teste mockado de latência existe; desempenho com serviços reais e primeiro chunk <300 ms não fica provado por ele. |
| REQ-16 | SIM | `POST /api/v1/roteiros/planejar`, schema e orquestração estão implementados. |
| REQ-17 | SIM | Gather para origens/destinos, clima/rota e etapas adicionais em `services/trips.py`. |
| REQ-18 | SIM | Guia recebe contexto de clima, perfil, dias, atrativos/gastronomia. |
| REQ-19 | SIM | Geocoding, validação UF e testes de UF/homônimos existem. |
| REQ-20 | SIM | Open-Meteo clima do destino integrado. |
| REQ-21 | SIM | OSRM fornece rota, geometria, distância e duração dentro do planejamento. |
| REQ-22 | PARCIAL | OSRM retorna alternativas e seleção por preferência; rótulo “mais econômica/federais” não é demonstrado como garantia. |
| REQ-23 | SIM equivalente | Não há endpoint `/mapa-rota`; geometria e alternativas são parte do resultado de `/planejar`, equivalente para a função de alimentar o mapa. |
| REQ-24 | SIM | Preferência de rota é passada ao serviço/seleção. |
| REQ-25 | PARCIAL | Cálculo associa elevação a candidatos de rota; não há GPX e não foi comprovada a troca completa de alternativa no cliente. |
| REQ-26 | SIM | Há fallback/diagnóstico para falha de geocoding, clima e OSRM; testes de integração/falha. |
| REQ-27 | SIM | Pydantic v2, Field/validadores e respostas 422. |
| REQ-28 | SIM | UF validada e rejeitada quando inválida; testes. |
| REQ-29 | SIM | Cidade normalizada, tamanho/entrada validados, acentos preservados; testes. |
| REQ-30 | SIM | Modelo combustão com consumo, tanque e custo unitário. |
| REQ-31 | SIM | Modelo elétrico com eficiência, bateria e preço por energia. |
| REQ-32 | NÃO conforme limite anterior | Backend aceita duração acima de 5 dias (schema admite até 365). A documentação original não fixa claramente o limite 1–5; logo é divergência da checklist anterior, não falha confirmada da atividade. |
| REQ-33 | SIM | Categorias de perfil estão no schema/prompt; conferir diferenças Romântico/Econômico conforme fonte. |
| REQ-34 | SIM | Parâmetros são validados, usados e persistidos com a viagem. |
| REQ-35 | SIM | Rateio limita 1–8; schemas e testes de fronteira existem. |
| REQ-36 | SIM | Schemas de rota/custo/altimetria validam unidades e valores; testes específicos. |
| REQ-37 | SIM | Open-Elevation consultada em `altimetria_service.py`, com HTTP compartilhado e testes mockados. |
| REQ-38 | SIM | Amostras/perfil ordenados ao longo da geometria; testes. |
| REQ-39 | SIM | Altitude, ganho/perda e métricas topográficas calculados; testes sintéticos. |
| REQ-40 | SIM parcial | Fator de relevo entra nos cálculos de consumo/custos; atividade não define fórmula única. |
| REQ-41 | SIM | Planejamento calcula elevação nos candidatos de rota, associado à geometria de cada um. |
| REQ-42 | SIM | Erros e dados inválidos de Open-Elevation são tratados; testes cobrem timeout/HTTP/formato. |
| REQ-43 | SIM | Autonomia a combustão calculada em `postos_service.py`. |
| REQ-44 | SIM | Autonomia elétrica calculada em `postos_service.py`. |
| REQ-45 | SIM | Projeção de paradas respeita reserva configurada (~18%); função e testes de postos. |
| REQ-46 | PARCIAL | Existem pontos de parada projetados sobre a rota; o próprio serviço informa `estabelecimento_verificado=False` quando não confirma posto real. Logo cálculo existe, catálogo real de postos não é garantido. |
| REQ-47 | SIM parcial | Planejamento gera métricas por geometria/candidato; GPX ausente e consumidor de seleção não auditado aqui. |
| REQ-48 | SIM | Calculadoras de combustível e energia em `custos_service.py`, testes. |
| REQ-49 | PARCIAL | Estruturas e soma de pedágios existem, distinguindo verificado/estimado/indisponível; não há provedor/base regional de tarifas identificado. |
| REQ-50 | SIM | Total conhecido e rateio por até 8, incluindo centavos, implementados/testados. |
| REQ-51 | NÃO identificado | Não encontrei cálculo de emissões/ESG no serviço de custos. A atividade original só cita emissões na lista de módulos de referência, sem roteiro de demonstração do aluno 3. |
| REQ-52 | SIM equivalente | Não existe endpoint dedicado `/custos`; cálculo de custo existe como serviço e compõe dados do planejamento. Endpoint separado não é necessário para equivalência funcional. |
| REQ-53 | SIM | Estados estimado/indisponível e ausência de preço desconhecido são modelados no custo; testes dedicados. |
| REQ-54 | SIM | Gemini isolado em serviço, chave configurável, timeout/fallback/circuit breaker; testes com mocks. |
| REQ-55 | SIM | Guia utiliza duração, perfil, destino, clima e conteúdo local. |
| REQ-56 | PARCIAL | Limite de 20 palavras está no prompt; backend não garante semanticamente toda resposta livre por validação posterior. |
| REQ-57 | PARCIAL | Turnos e frases curtas estão instruídos no prompt; sem validação determinística de cada saída. |
| REQ-58 | PARCIAL | Instrução de 2–3 sabores/local existe no prompt; conteúdo gerado não é validado estruturalmente. |
| REQ-59 | SIM parcial | Dados reais do clima entram no contexto do guia; frase final é gerada por IA sem verificação factual estruturada. |
| REQ-60 | SIM | `StreamingResponse` SSE progressivo em `routers/streaming.py`; teste TCP real. |
| REQ-61 | SIM | Eventos chunk e final done implementados/testados. |
| REQ-62 | SIM | Headers de SSE definidos no router. |
| REQ-63 | SIM | Desconexão encerra stream e fecha provider; testes. |
| REQ-64 | SIM | Erro SSE terminal seguro/sanitizado e liberação de recursos testada. |
| REQ-65 | NÃO | Não há exportador GPX 1.1 nem arquivo GPX para download no backend. É lacuna obrigatória da atividade e responsabilidade explícita do aluno 4. |
| REQ-66 | NÃO | Nenhuma rota ou função de exportação GPX encontrada. |
| REQ-67 | PARCIAL | Não há endpoint/dispatcher de compartilhamento. Abrir WhatsApp é ação frontend; BackgroundTasks/webhook da seção 4.5 é padrão de referência, não requisito demonstrativo explícito na matriz dos alunos. |
| REQ-68 | SIM equivalente | Dados de rota são retornados para o cliente; abrir Google Maps/WhatsApp é ação da UI, não falta de backend. |
| REQ-69 | SIM | Catálogo curado local existe em `app/data/atrativos.json` e serviço filtra destino/UF. |
| REQ-70 | SIM | Atrativos têm identificadores, categorias, nomes e links; testes de catálogo. |
| REQ-71 | SIM | PATCH persiste visitas, confirma que atrativo pertence à viagem e isola usuário; testes. |
| REQ-72 | SIM | Token Google verificado pelo serviço antes de criar identidade; teste de audience/token. |
| REQ-73 | SIM | TTL visitante 2 horas, dados voláteis/limpeza e testes. |
| REQ-74 | SIM | Visitante preserva sessão Google restaurável; endpoints e testes de sessão híbrida. |
| REQ-75 | SIM parcial | Logout existe. sendBeacon é detalhe de transporte cliente; endpoint não é por si só incompatível. |
| REQ-76 | SIM | Sessão backend confiável e storage isolado; header de usuário não autentica; testes de spoof/isolation. |
| REQ-77 | SIM parcial | JSON por usuário, lock thread e replace atômico existem; lock multiprocesso não existe/não é garantido. |
| REQ-78 | NÃO conforme padrão pedido | Persistência acontece sincronamente no caminho de `plan_trip`; não usa BackgroundTasks após resposta. Persistência funcional, padrão de execução ausente. |
| REQ-79 | SIM | GET de histórico filtrado por sessão existe e é testado. |
| REQ-80 | SIM | DELETE 204 por proprietário existe e é testado. |
| REQ-81 | SIM parcial | Contagem global de persistidos e visitante separado existem; conexões ativas não estão implementadas como painel geral. |
| REQ-82 | SIM | Prometheus counters/histogram/gauges e scrape `/metrics` existem/testados. |
| REQ-83 | NÃO completo | Estado individual dos quatro provedores não existe; breakers cobrem weather/guide, e `/readyz` não os consulta. |
| REQ-84 | PARCIAL | Latência HTTP e total de roteiros existem; indicador geral de conexões ativas não foi encontrado. |
| REQ-85 | SIM parcial | Tempos do servidor/etapas medidos; tempo de renderização percebido é responsabilidade do frontend. |
| REQ-86 | NÃO | Não encontrei trilha de auditoria de eventos operacionais em background. |
| REQ-87 | NÃO | `/readyz` retorna “ready” sem avaliar dependências; health não prova saúde de provedores. |
| REQ-88 | SIM parcial | Suíte pytest com TestClient, mocks e testes de schema/serviço existe; execução observada teve 352 pass e 36 erros de fixture por permissão. |
| REQ-89 | SIM | Testes para gather/409/cancelamento/limpeza existem; suíte dinâmica teve restrição em casos que usam tmp_path. |
| REQ-90 | SIM | Testes de UF, schema, veículo, passageiros, relevo e custo existem. |
| REQ-91 | SIM | Integrações simuladas/mocks e circuit breaker testados sem credenciais reais. |
| REQ-92 | SIM | Testes de SSE cobrem chunks, done, erro, desconexão e streaming TCP. |
| REQ-93 | NÃO | GPX e seus testes não existem; storage tem testes, mas não conformidade GPX. |
| REQ-94 | PARCIAL | Contrato backend e teste SSE backend existem; compatibilidade do leitor ReadableStream só pode ser confirmada nos testes frontend. |
| REQ-95 | NÃO atingido nesta verificação | A atividade pede 100% dos testes aprovados na demonstração; nesta execução foram 352 pass/36 errors. Os erros são do ambiente de temp, mas o critério verde não foi demonstrado. |
| REQ-96 | PARCIAL | FastAPI cria docs padrão; sem app importável nesta sessão não confirmei OpenAPI nem status por rota. |
| REQ-97 | NÃO verificável por inspeção de código | Capacidade de cada aluno defender o que implementou só se verifica na apresentação; matriz de responsabilidades e roteiro estão documentados. |

## Resposta curta às perguntas principais

- **O que existe:** fluxo `/planejar` com geocoding/clima/OSRM, sessões Google/visitante, histórico isolado, validação Pydantic, altimetria, autonomia/paradas projetadas, custos/rateio, guia Gemini, SSE, catálogo/visitas e métricas Prometheus.
- **O que existe parcialmente:** alternativas com alegação de economia, estações/postos reais, pedágios com tarifa oficial, painel de saúde dos provedores, indicador de conexões ativas, regra de saída concisa do Gemini, integração de alternativa com todos os consumidores, persistência/background e segurança de segredo padrão.
- **O que não existe:** GPX 1.1/download, cálculo ESG identificável, cache geral TTL, compartilhamento backend/webhook e auditoria operacional em background. Algumas dessas ausências são requisitos explícitos (GPX) e outras são itens da arquitetura/checklist anterior.
- **O que é equivalente sem endpoint próprio:** mapa/geometria e alternativas dentro do planejamento; custos dentro do serviço e resposta de planejamento; links Maps/WhatsApp como ação frontend.

A suíte, nesta máquina, terminou com `352 passed, 36 errors`; todos os erros reportados decorreram de `PermissionError` ao preparar/limpar diretórios temporários pytest. Isso não altera a resposta binária sobre presença no código, mas impede declarar todos os comportamentos dinamicamente validados.
