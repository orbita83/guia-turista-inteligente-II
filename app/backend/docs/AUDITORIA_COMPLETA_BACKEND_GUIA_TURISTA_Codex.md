# Auditoria integral do Backend — Guia do Turista Inteligente II

**Documento de trabalho para Codex — AUDITORIA, NÃO IMPLEMENTAÇÃO.**
**Repositório a auditar:** `https://github.com/orbita83/guia-turista-inteligente-II`
**Branch:** `integracao/frontend-backend`
**Baseline solicitada:** commit `f50a3d094191e53e3cf2e3e77e51b2bc0cbd6885` (restaurado após rollback do PR #37).
**Público:** alunos 2, 3 e 4; também auditar serviços backend transversais, independentemente da autoria.
**Fontes obrigatórias:**
- **A — `trabalho-guia-turista-II.pdf`, 44 páginas:** atividade principal do professor e imagens reais dos wireframes.
- **B — `Guia_Turista_Documentacao_Frontend_Backend.pdf`, 16 páginas:** reprodução/consolidação das fontes nas páginas 1–14 e **análise complementar**, não necessariamente requisito original, nas páginas 15–16.

## 0. Instrução operacional ao Codex (executar primeiro)

Você é um **auditor técnico de implementação**, não um programador encarregado de corrigir. Sua missão é determinar rigorosamente, **com evidência executável**, se o backend do Guia do Turista Inteligente II satisfaz integralmente cada requisito descrito neste documento, derivado de duas fontes PDF lidas página a página, incluindo wireframes. **Não altere, formate, crie, delete nem faça commits em arquivos do repositório. Não abra PR nem issue. Não corrija problemas sem autorização posterior.**

1. Verifique qual branch e HEAD estão em uso, e declare o hash. Trabalhe sobre `f50a3d094191e53e3cf2e3e77e51b2bc0cbd6885`, se ainda for a referência desejada; **não** restaure commits de telemetria descartados no rollback.
2. Inspecione toda a árvore de `app/backend/` e os arquivos de configuração, documentação, contratos e testes da raiz. Localize implementações equivalentes, **mesmo quando os nomes e caminhos diferirem** dos PDFs (estes descrevem uma estrutura de referência Python/JSX, enquanto o repositório real é monorepo com FastAPI e React/TypeScript). Não marque como ausente apenas porque um arquivo ou endpoint tem outro nome; siga o fluxo funcional.
3. Levante **todas as rotas** pela OpenAPI de uma instância de teste ou pelo registro efetivo do app, sem inferir apenas pelo nome dos arquivos. Analise para cada rota: método, caminho, status, entrada, saída, autenticação, CORS, erros, fallback e testes.
4. Rastreie cada funcionalidade ponta a ponta: entrada → schema → router → dependências → serviços → resposta → persistência/telemetria → consumidor frontend (somente para validar integração). Examine fluxos felizes, limites, erros e concorrência.
5. Execute os testes existentes que não necessitem de credenciais reais; mocks/fakes de provedores são preferíveis. Tente testes específicos, integração, lint, type checks e build relevantes. Relate os comandos exatos, saídas, erros e restrições do ambiente. **Não confunda testes aprovados com cobertura total.**
6. Para cada item `REQ-xx` abaixo, classifique: **IMPLEMENTADO E VALIDADO**, **IMPLEMENTADO SEM VALIDAÇÃO**, **PARCIAL**, **AUSENTE**, **INCORRETO**, **NÃO VERIFICÁVEL** ou **DIVERGÊNCIA/AMBIGUIDADE DA FONTE**. Traga `arquivo:linha`, função, endpoint, teste e evidência; NÃO use “parece implementado” sem prova.
7. Separe **requisito explícito do professor**, **inferência do wireframe**, **análise complementar do PDF B** e **boa prática recomendada**. Nunca apresente as últimas categorias como ordens explícitas do professor.
8. Faça um relatório final contendo resumo executivo, matriz integral de rastreabilidade, inventário OpenAPI, falhas P0/P1/P2/P3, inconsistências de contratos, cobertura/testes, riscos de segurança, plano sugerido de correção **sem executar** e roteiro de demonstração individual para os alunos 2, 3 e 4.
9. Se uma fonte pedir algo que conflita com segurança, contratos reais, consistência de estado ou outra passagem da fonte, **registre a ambiguidade e proponha uma decisão para o professor/equipe**, não altere silenciosamente a regra.
10. Leia a **totalidade** deste checklist; não interrompa depois da primeira falha ou apenas após `pytest` passar.

## 1. Quadro de interpretação das fontes

- **A, pp. 1–9:** visão, arquitetura, backend `core/`, `routers/`, `schemas/`, `services/`, persistência e testes.
- **A, pp. 15–27:** funcionalidades que o backend precisa alimentar; figuras 3.1 a 3.7 e texto. As imagens originais estão neste PDF e NÃO no PDF B.
- **A, pp. 27–38:** exemplos de concorrência com `asyncio.gather`, SSE, locks, cancelamento e `BackgroundTasks`.
- **A, pp. 38–40:** configuração, serviços, endpoints operacionais, execução e testes.
- **A, pp. 40–44:** matriz oficial de responsabilidade e critérios de apresentação/avaliação.
- **B, pp. 2–14:** transcrição consolidada do material da atividade.
- **B, pp. 15–16:** análise adicional, pontos a verificar e checklist; use como questões para auditoria, sem convertê-los em exigências curriculares automaticamente.

**Regra de leitura:** os exemplos de valores nos wireframes (e.g., 932,5 km; 14h02; 18%; +3285 m; 13.079 ms) são demonstrações, não dados fixos a reproduzir nem provas de precisão. A meta ~800 ms, primeiro chunk SSE <300 ms e apresentação <1000 ms são referências de desempenho declaradas pela atividade, não resultados medidos no projeto real.

## 2. Infraestrutura da API e arquitetura — aluno 2 (e transversal)

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-01 | Backend desacoplado em FastAPI ASGI com servidor Uvicorn na porta 8001, independente da SPA :5173. | Comandos reais de execução, import do app e resposta HTTP. | A pp.1,3–5,38–40 |
| REQ-02 | Estrutura modular `core`, `routers`, `schemas`, `services` e separação de responsabilidades, aceitando nomes equivalentes. | Rastrear chamadas reais, acoplamentos e ciclos de import. | A pp.5–9 |
| REQ-03 | Configurações por Pydantic-Settings e `.env.example`; chaves Google/Gemini configuráveis e não hardcoded em produção. | Valores default, validações, vazamento em frontend/logs e testes. | A pp.5–9,39 |
| REQ-04 | CORSMiddleware permite as origens declaradas (localhost :5173 e :3000), métodos e headers necessários. | Teste de preflight com `Origin` e autenticação; verificação de credenciais. | A p.4; B pp.4,16 |
| REQ-05 | Um `httpx.AsyncClient` compartilhado em `app.state` criado no lifespan e corretamente fechado; pool keep-alive. | Código de startup/shutdown e simulação de falha de lifespan. | A pp.3–4,27–31,42 |
| REQ-06 | Injeção por `Depends` de cliente HTTP, storage, identidade atual, configurações e circuit breakers. | Dependências e overrides em testes. | A pp.6,9,31,42 |
| REQ-07 | Endpoints operacionais `/healthz`, `/readyz`, `/metrics`, `/docs`, `/redoc`; distinção entre liveness, readiness e métricas. | HTTP/OpenAPI; `/metrics` Prometheus válido. | A pp.38–39; B pp.12,16 |
| REQ-08 | Middleware mede latência com `time.perf_counter()` e expõe `X-Process-Time` em **ms** sem confundir com duração total do cliente. | Header em 200/4xx/5xx, formato de unidades, timing real. | A pp.5,18–19,42 |
| REQ-09 | Correlation-ID `X-Request-ID` para rastreabilidade/logging estruturado, sem expor identificadores pessoais ou aceitar entradas arbitrárias perigosas. | Header, logs correlacionados, sanitização e propagação. | A pp.6,9; B pp.15–16 |
| REQ-10 | Cache em memória thread-safe com TTL e expiração conforme infraestrutura de referência. | Módulo ou equivalente, chaves, expiração concorrente, testes. | A pp.6,9 |
| REQ-11 | Circuit Breakers de integrações com limiares, estados, recuperação, fallback e degradação graciosa. | Falhas repetidas/timeout, circuito aberto, recuperação e status. | A pp.6,9,42 |
| REQ-12 | `asyncio.Lock` protege submissões concorrentes duplicadas de mesmo usuário + mesmo trajeto; retorna HTTP **409** e limpa estado no `finally`. | Duas solicitações simultâneas, mesmas/rotas distintas, troca de usuário, cancelamento e erros. | A pp.3,17,35–36,42–43 |
| REQ-13 | Detecção de desconexão/cancelamento interrompe tarefas pesadas e impede persistir viagem incompleta. | Abort do cliente, tasks canceladas, sem gravação residual. Verificar comportamento HTTP 499 apenas como exemplo de fonte. | A pp.3,27–28,33,36–37 |
| REQ-14 | Trabalho efetivamente assíncrono: chamadas HTTP não-bloqueantes; tarefas CPU/arquivo não travam event loop. | Inspeção de `await`, `asyncio.to_thread`, chamadas síncronas e testes de concorrência. | A pp.3,9,27–31 |
| REQ-15 | Metas demonstráveis de latência: objetivo de apresentação **<1000 ms** no cenário controlado; referência aproximada ~800 ms para pipeline, primeiro chunk SSE <300 ms. | Benchmark mockado reproduzível, registrando percentis e ambiente; não tratar como garantia com IA/rede externas reais. | A pp.3,42; B pp.2,16 |

## 3. Planejamento, geocodificação, clima e rota — aluno 2 + integrações transversais

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-16 | `POST /api/v1/roteiros/planejar` recebe origem/destino, UF, dias, perfil e parâmetros opcionais relacionados. | Request/response OpenAPI e fluxo real de geração. | A pp.4,9,16–17,27–30 |
| REQ-17 | Duplo paralelismo: geocodificar **origem e destino** via `asyncio.gather`; em seguida buscar **clima e rota OSRM** em paralelo. | Prova no código e testes com delays mostrando sobreposição. | A pp.27–31,42 |
| REQ-18 | Síntese do guia Gemini ocorre depois, recebendo cidade/UF e contexto verdadeiro de clima, atrativos, gastronomia, dias e perfil quando aplicável. | Inspeção dos argumentos; mocks verificam contexto. | A pp.29–30,25–26 |
| REQ-19 | Geocodificação de municípios brasileiros e UF válida; não selecionar cidade homônima de outro estado silenciosamente. | Casos de homônimos, inexistente, diacríticos, erro de provedor. | A pp.16–17,27–28; inferência de correção a partir do objetivo de UF |
| REQ-20 | Open-Meteo fornece temperatura, sensação térmica, vento e condição climática do **destino**. | Contrato JSON e fallback seguro para dados indisponíveis. | A pp.4,17,24–25 |
| REQ-21 | OSRM fornece traçado geográfico real, distância, duração estimada e geometria utilizável pelo Leaflet. | Validação de coordenadas, direção da rota, ordem dos pares e falhas. | A pp.4,7,20–21 |
| REQ-22 | Suporte às alternativas de rota: Sugestão 01 (menor tempo) e Sugestão 02 (rodovias federais/mais econômica) quando reais e disponíveis; diferenças de distância e tempo. | Resposta com alternativas e geometria de cada uma; conferir como se justifica “mais econômica”, sem inventar economia. | A pp.20–21; figura 3.3 |
| REQ-23 | Endpoint específico `/mapa-rota` é descrito na arquitetura, mesmo que a implementação possa incluir geometria em `/planejar`; verificar **equivalência funcional e aderência ao contrato da atividade**. | Comparar OpenAPI, frontend e formato da rota. | A pp.4,9; B p.15 |
| REQ-24 | Preferência de rota participa da seleção/orquestração quando fornecida. | Entrada `preferencia_rota`, encaminhamento para rota, impactos efetivos. | A pp.29–30; B pp.9–10 |
| REQ-25 | Parâmetros e dados de rotas alternativas não geram versões inconsistentes entre mapa, custos, relevo e GPX. | Ao trocar alternativa, comparar distância, tempo, perfil, custos e paradas. | A pp.20–21; B pp.6,15 |
| REQ-26 | Falhas externas geram fallback/diagnóstico legítimo, sem coordenadas ou trajetos falsificados como fatos. | Timeout, HTTP inválido, ausência de rota, coordenadas 0,0 e dados incompletos. | A pp.6,9; B p.15 (critérios adicionais de segurança) |

## 4. Schemas, validação e contratos — aluno 3

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-27 | Contratos Pydantic v2 estruturados com `Field`, tipos estritos, `@field_validator`/validadores equivalentes, erros HTTP **422**. | Exemplos de request validado e inválido, saída OpenAPI. | A pp.3,7,9,42 |
| REQ-28 | UF: duas letras maiúsculas e validação de siglas brasileiras; rejeição de UF inválida. | Ex.: `XX` retorna 422; investigar normalização de `pe`, espaços e vazio. | A pp.16–17,42 |
| REQ-29 | Cidades: entrada não vazia, tamanho/controladores razoáveis e normalização sem destruir acentos; segurança na serialização. | Testar vazio, whitespace, Unicode e payload malformado. | A pp.9,16–17; extensão de teste proposta |
| REQ-30 | Seleção **combustão** com consumo médio **km/l**, capacidade do tanque **litros**, preço **R$/l**. | Tipos, limites >0, impossibilidade de dados inconsistentes. | A pp.16–17; figura 3.1 |
| REQ-31 | Seleção **100% elétrico** com eficiência **km/kWh**, bateria **kWh**, preço **R$/kWh**. | Tipos, limites >0, exclusão/compatibilidade de parâmetros. | A pp.16–17; figura 3.1 |
| REQ-32 | Duração do roteiro de **1 a 5 dias** conforme atividade, refletida na geração por dias. | Validar limites 0,1,5,6; comparar código real e contrato. | A p.17; figura 3.1 |
| REQ-33 | Perfis de viajante: Cultural, Gastronômico, Ecoturismo/Aventura, Família e Romântico/Econômico (texto) / Econômico (wireframe). | Comparar enum real; registrar divergência entre texto e tela, sem inventar categoria. | A pp.16–17, figura 3.1 |
| REQ-34 | Preferências de rota e dados de veículo não desaparecem no JSON nem são trocados entre viagens. | Contratos de planejamento, armazenamento e histórico. | A pp.16–17,20–21; B p.15 |
| REQ-35 | Passageiros: rateio para até **8** pessoas; rejeição segura de 0, negativos e >8. | Schema, testes de limites e regra de centavos. | A p.21,42 |
| REQ-36 | Schemas de rota, custos e altimetria preservam unidades, estados de indisponibilidade e restrições de valores não-finitos. | GeoJSON/lat-lon, km, metros, minutos, kWh, reais, percentuais, NaN/Infinity. | A pp.7,20–21; exigência técnica inferida da validação defensiva |

## 5. Altimetria e relevo — aluno 3

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-37 | Integração à **Open-Elevation API**, consultando amostras ao longo da geometria real da rota. | Cliente HTTP, formato da requisição/resposta, timeout e erro. | A pp.4,7,20–21,42 |
| REQ-38 | Perfil topográfico consistente por rota/alternativa: lista ordenada de amostras/distâncias e elevações. | Ordem, limites, continuidade, reamostragem, ausência de geometria. | A p.21; figura 3.3 |
| REQ-39 | Métricas derivadas: altitude mínima/máxima, subida acumulada, descida acumulada, desnível líquido e perfil de relevo. | Testes em trajetórias sintéticas com subidas, descidas e trechos constantes. | A pp.7,20–21,42 |
| REQ-40 | Penalização/ganho percentual de consumo nominal associado a relevo, com regra reproduzível e comportamento dos dois tipos de veículo. | Fórmula e hipóteses documentadas; sem tratar exemplo visual como fórmula obrigatória. | A pp.7,21,42 |
| REQ-41 | Para rota alternativa, recalcular/associar altitude, consumo e autonomia **à própria geometria**, não reutilizar perfil de outra rota. | Teste com duas geometrias diferentes e perfis correspondentes. | A pp.20–21; inferência necessária da seleção |
| REQ-42 | Fallback para serviço de elevação indisponível; dados incompletos não geram desnível fictício nem travam o planejamento. | HTTP 500/timeout, pontos faltantes, valores inválidos. | A pp.6–7,9,20–21 |

## 6. Autonomia, paradas, custos, pedágios e ESG — aluno 3

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-43 | Autonomia nominal de combustão derivada de **km/l × litros**; efetiva considera ajustes pertinentes (relevo, reserva). | Testes numéricos, unidades e limites. | A pp.17,20–21,42 |
| REQ-44 | Autonomia nominal EV derivada de **km/kWh × kWh**; efetiva considera ajustes pertinentes (relevo, reserva). | Testes numéricos e casos sem bateria suficiente. | A pp.17,20–21,42 |
| REQ-45 | Planejamento de paradas antes de atingir margem crítica de reserva de aproximadamente **18%**. | Simular rota curta, longa e limite; analisar posição progressiva das paradas. | A p.21; figura 3.3 |
| REQ-46 | Abastecimento/recarga: identificar pontos viáveis para combustão ou EV, em coerência com trajeto. | Evidência real de provedores/catálogo; evitar inventar postos em coordenadas sem serviços. | A pp.7,20–21; figura 3.3 |
| REQ-47 | Autonomia, paradas e custos acompanham a opção de rota escolhida. | Testes cruzados de alternativas com distâncias diferentes. | A pp.20–21; figura 3.3 |
| REQ-48 | Calculadora de combustível **e** energia elétrica, com custos na unidade correta. | Cenários com consumo, eficiência, preços, distâncias e arredondamento. | A pp.7,17,21,42 |
| REQ-49 | Pedágios previstos por praça/região, discriminados e integrados ao total do trajeto. | Fonte/criterio de tarifas, região, direção de viagem e ausência de dados. | A pp.7,21 |
| REQ-50 | Custo total = combustível ou energia **+ pedágios**; rateio exato para até 8 passageiros. | Soma de cotas não excede/ignora centavos; 1, 2, 3 e 8 passageiros. | A pp.7,21,42 |
| REQ-51 | Emissões/indicadores ESG mencionados para `custos_service.py`. | Identificar se existem fórmulas, fatores, unidades e documentação; não presumir valores do professor. | A p.7 |
| REQ-52 | Endpoint próprio `/custos` é referido na fonte; verificar existência ou equivalência funcional no planejamento/resposta. | Método/path reais, schema, cálculo repetível e integração. | A pp.6,9; B p.16 |
| REQ-53 | Fallback para rota/elevação/tarifa/posto desconhecido não apresenta preço, emissão ou economia inventados. | Casos com dados parciais e indisponíveis. | A pp.6–9,20–21; ponto de avaliação técnica |

## 7. Gemini, narrativa e SSE — aluno 4

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-54 | Integração Gemini por serviço isolado, chave em ambiente, erros/timeouts com contingência apropriada. | Mock de chave ausente, erro de rede, resposta vazia, indisponibilidade e circuit breaker. | A pp.4,7,9,25–26,42–43 |
| REQ-55 | Guia personalizado por duração, perfil, cidade, **clima real**, atrativos e gastronomia. | Verificar construção do prompt e dados efetivamente passados. | A pp.25–26,29–30 |
| REQ-56 | **Identidade/atmosfera local:** uma frase objetiva de **até 20 palavras**. | Teste sobre prompt e, se aplicável, pós-validação da saída. | A p.26; figura 3.6 |
| REQ-57 | **Manhã, Tarde, Noite** ou dias numerados, **exatamente uma frase de ação por turno**, até **15 palavras** cada. | Gerar guia com duração 1 e 5 dias, conferir estrutura e instruções. | A pp.17,26; figura 3.6 |
| REQ-58 | **Gastronomia:** uma frase concisa com **2 a 3 pratos/sabores** e indicação de onde saboreá-los. | Inspecionar prompt e conteúdo de fallback. | A p.26 |
| REQ-59 | **Orientações práticas/clima:** uma frase funcional que vincula dados reais de temperatura/condições a vestuário e horários. | Não usar clima aleatório em texto factual. | A p.26 |
| REQ-60 | `POST /api/v1/roteiros/stream-guia` usa `StreamingResponse(media_type="text/event-stream")` e transmite **chunks progressivos**. | Testar TTFB/chunks em streaming, não resposta JSON completa simulando SSE. | A pp.4,25,31–34,43 |
| REQ-61 | Contrato SSE exemplificado: `data: {"chunk": "...", "done": false}\n\n` e evento final `done:true`. | Teste de parser, eventos parciais, UTF-8 e terminação. | A pp.32–34 |
| REQ-62 | Headers apropriados para SSE: `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`, onde aplicável. | Cabeçalhos reais no endpoint. | A p.34 |
| REQ-63 | Cancelamento de stream quando o cliente desconecta, sem continuar consumindo IA desnecessariamente. | Cancelar streaming e inspecionar finalização do iterador/tarefa. | A pp.32–33,36–37 |
| REQ-64 | Tratamento seguro de erros no streaming, término sinalizado e sem vazamento de segredo/stack trace. | Simular exceção no gerador; comparar exemplo do PDF com práticas seguras. | A p.33; B pp.15–16 |

## 8. GPX, compartilhamento, atrativos e catálogo — aluno 4 e transversais

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-65 | Exportação **GPX 1.1** da rota para download; inclui trajeto/waypoints e, se houver, elevação. | Validar XML por parser/schema, MIME, caracteres especiais, lat/lon, rota selecionada. | A pp.7,9,21,43 |
| REQ-66 | Endpoint `/exportar/gpx` citado; método/path exatos precisam ser confirmados por OpenAPI. | Conferir disponibilidade, integração SPA e autorização para a viagem. | A pp.6,9; B p.16 |
| REQ-67 | Endpoint `/compartilhar` e `BackgroundTasks` para despacho externo/webhooks conforme seção técnica. | Verificar contrato, canal, proteção de destinatário, falhas e se há integração real ou mera simulação. | A pp.9,37–38; B pp.12,16 |
| REQ-68 | Dados suficientes para ações WhatsApp e Google Maps; distinguir link gerado no frontend de serviço realmente necessário no backend. | Contrato de rota, ponto inicial/final e resumo; não criar backend para links que a UI gera. | A pp.14,21 |
| REQ-69 | Catálogo curado de destinos, pontos turísticos/históricos e gastronomia regional. | Fonte dos dados, modelagem, correspondência com destino/UF, não fabricar atrativos. | A pp.6,9,24–25; figura 3.5 |
| REQ-70 | Detalhes por atrativo: identificação estável, categoria, nome e informações necessárias à interface (ex.: destaque e localização quando existente). | Forma real do JSON e compatibilidade com cards/links Maps. | A pp.24–25; figura 3.5 |
| REQ-71 | `PATCH /api/v1/roteiros/{roteiro_id}/visitas` persiste marcações, aceita somente atrativo pertencente à viagem e isola usuários. | Casos marcar/desmarcar/repetir, id inválido, roteiro alheio, viagem inexistente. | A pp.9,25; figura 3.5 |

## 9. Autenticação, sessão e persistência — transversal aos alunos 2–4

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-72 | Autenticação Google: validar credencial/token nos provedores OAuth2 antes de formar identidade persistente. | Token inválido, audiência incorreta, expirado, tentativa de falsificação. | A pp.6,9,27 |
| REQ-73 | Modo visitante com TTL de **2 horas**, dados voláteis e limpeza ao encerrar/expirar. | Clock mockado, expiração, logout e isolamento. | A pp.6,9,27 |
| REQ-74 | Sessão híbrida: permitir alternar para visitante e restaurar identidade Google válida sem perda de histórico. | Fluxo ida/volta, expiração e preservação apenas quando autorizada. `localStorage` é responsabilidade do frontend. | A p.27; figura 3.7 |
| REQ-75 | Logout/encerramento compatível com uso do navegador e `sendBeacon`, quando aplicável ao contrato atual. | Endpoint/método e proteção contra requisições forjadas. | A p.9 |
| REQ-76 | Cada identidade lê/modifica/apaga somente suas viagens. `X-User-Id` da figura não basta como autenticação confiável. | Testes A/B e headers falsificados; checar sessão/cookie/token real. | A pp.4–5,9,23; B pp.15–16 |
| REQ-77 | JSON persistente agrupado por usuário, leitura, gravação atômica e isolamento; lock para integridade concorrente. | Escrita simultânea, arquivo parcial, corrupção, restart, I/O, múltiplas threads/processos. | A pp.7–9,22–23 |
| REQ-78 | Persistência por `BackgroundTasks` depois de gerar a resposta, como especificada na atividade; se for síncrona/`to_thread`, documentar divergência e garantias de consistência. | Inspecionar fluxo de gravação, latência, corrida GET-imediato, falhas e recuperação. | A pp.23,37–38 |
| REQ-79 | `GET /api/v1/roteiros/minhas-viagens` com histórico isolado e ordenação/contrato correto. | Listar usuário A/B, sem sessão, após criação/remoção/restart. | A pp.4,9,22–23 |
| REQ-80 | `DELETE /api/v1/roteiros/{roteiro_id}` remove só recurso autorizado; formato e status compatíveis com SPA. | 204/404, propriedade, duplicidade, persistência e isolamento. | A pp.21–23; B p.15 |
| REQ-81 | Métricas de total global de roteiros, histórico pessoal e visitantes têm semânticas distintas. | Checar contador real, mudanças após criar/excluir e privacidade. | A pp.9,18–19,23; análise semântica necessária |

## 10. Telemetria, auditoria e confiabilidade — aluno 4, transversal

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-82 | Exportador Prometheus em `/metrics` com contadores/histogramas/gauges mensuráveis, sem inventar valores. | Saída compatível com parser Prometheus, unidades e labels de cardinalidade controlada. | A pp.6,9,19,39,43 |
| REQ-83 | Diagnósticos de provedor: **Open-Meteo, OSRM, Open-Elevation, Gemini**; não confundir nome listado com serviço saudável. | Status individual, timeout, degradação, fallback e situação desconhecida. | A pp.4,19; figura 3.2 |
| REQ-84 | Latência recente, total de roteiros e conexões ativas/telemetria operacional, quando requeridos pelo card. | Endpoint real, contrato, contadores, atualização e estados indisponíveis. Não pressupor que `/metrics` fornece JSON. | A pp.9,18–19; figura 3.2 |
| REQ-85 | Medidas por provedor/etapa e duração total coerentes sob concorrência; não somar tempos paralelos como duração de parede. | Tempo de geocodificação, clima, rota, IA, altimetria, API e fim-a-fim. | A pp.18–19,27–31 |
| REQ-86 | Auditoria de eventos operacionais em background sem registro de tokens/chaves/dados sensíveis. | Confirmar implementação e utilidade dos eventos; distinguir plano de requisito. | A p.9 |
| REQ-87 | Probes não declaram todos os provedores íntegros só porque FastAPI está online; sem leaks e sem efeitos colaterais de leitura. | Validar semântica `/healthz`, `/readyz`, `/circuits`, `/metrics`. | A pp.9,19,39; B p.15 |

## 11. Testes, validação e entrega — alunos 2, 3 e 4

| ID | Requisito a auditar | Evidência/teste obrigatório | Fonte |
|---|---|---|---|
| REQ-88 | `pytest` backend com fixtures isoladas, TestClient, testes de API, schema, infraestrutura e serviços; sem exigir chaves reais. | `pytest tests/ -v` ou comando equivalente do workspace; testes que falham/skipados. | A pp.8,39,43 |
| REQ-89 | Testes de concorrência `asyncio.gather`, idempotência 409, desconexão e recurso liberado. | Testes simultâneos, timeouts e verificação de gravação. | A pp.3,27–31,35–37,42–43 |
| REQ-90 | Testes Pydantic 422, UF inválida, tipos estritos, limites de passageiros/veículo, altimetria e custos. | Parâmetros limites e casos extremos. | A pp.3,7,17,21,42–43 |
| REQ-91 | Testes de integração simulada Open-Meteo, OSRM, Open-Elevation, Gemini e fallback/circuit-breakers. | `httpx.MockTransport` ou equivalente, sem depender da rede. | A pp.3–9,39,42–43 |
| REQ-92 | Testes SSE: primeiro chunk, progressão, conclusão `done:true`, erro e cancelamento; UTF-8 e fragmentação. | TestClient/stream/client de teste. | A pp.31–34,43 |
| REQ-93 | Testes GPX 1.1, agrupamento de usuários, segurança e persistência atômica. | Parser XML, IDOR, file lock, restart e leitura/remoção. | A pp.7–9,22–23,43 |
| REQ-94 | Compatibilidade backend–frontend: teste de contrato, SSE via leitor ReadableStream e rotas críticas da UI. | Consumir respostas reais/mockadas na SPA. Vitest integra a apresentação do aluno 4. | A pp.11–14,34,40,43 |
| REQ-95 | Suíte automatizada com **100% dos testes aprovados** na demonstração; não interpretar como obrigação de **100% de cobertura de linhas**. | Comandos e resultados detalhados por pacote; lint/typecheck/build. | A pp.40,43 |
| REQ-96 | OpenAPI `/docs` e `/redoc` refletem schemas reais e status 422/409/401; sem endpoints anunciados mas inexistentes. | Inspecionar `/openapi.json`, exemplos e status. | A pp.3,39 |
| REQ-97 | Cada aluno consegue apontar e defender o código de sua responsabilidade, com demonstração funcional na apresentação de 20–30 min para os quatro. | Roteiro e evidências individuais por aluno. | A pp.40–44 |

## 12. Inventário de endpoints — verificar em runtime (não assumir implementação)

| Operação descrita | Método/caminho na fonte | Observação para auditoria |
|---|---|---|
| Planejar | `POST /api/v1/roteiros/planejar` | Contrato central; orquestração concorrente. |
| Mapa e alternativas | `POST /api/v1/roteiros/mapa-rota` | Mesmo se integrado ao planejamento, reportar diferença de rota. |
| Streaming Gemini | `POST /api/v1/roteiros/stream-guia` | `text/event-stream`, eventos `chunk`/`done`. |
| Histórico pessoal | `GET /api/v1/roteiros/minhas-viagens` | Sessão e isolamento. |
| Excluir roteiro | `DELETE /api/v1/roteiros/{roteiro_id}` | Autorização por proprietário. |
| Marcar atrativo | `PATCH /api/v1/roteiros/{roteiro_id}/visitas` | Atualizar status de visita. |
| Custos | `/api/v1/roteiros/custos` | **Método não inequivocamente fixado nas fontes.** Confirmar por OpenAPI. |
| GPX | `/api/v1/roteiros/exportar/gpx` | **Método não inequivocamente fixado nas fontes.** Conferir binário XML. |
| Compartilhar | `/api/v1/roteiros/compartilhar` | **Método não inequivocamente fixado nas fontes.** Despacho via BackgroundTasks. |
| Auth Google | `app/routers/auth.py`, prefixo `/api/v1/auth` | Rotas precisas de login/restore/logout precisam ser descobertas. |
| Auth visitante | `app/routers/auth.py`, prefixo `/api/v1/auth` | TTL de 2h. |
| Telemetria | router `/api/v1/telemetria` | Endpoints específicos não enumerados por completo. |
| Health | `GET /healthz` | Liveness. |
| Readiness | `GET /readyz` | Prontidão. |
| Prometheus | `GET /metrics` | OpenMetrics/Prometheus, não JSON por padrão. |
| Swagger/ReDoc | `GET /docs`, `GET /redoc` | Documentação autogerada. |

**Importante:** o PDF não estabelece payload e resposta exatos de todos os serviços. Para aqueles sem especificação integral, registrar como lacuna do material, localizar o contrato real e sugerir validação de produto, sem inventar campos.

## 13. Ambiguidades e pontos que EXIGEM registro no relatório

1. **Performance:** os exemplos (~800 ms, SSE <300 ms, apresentação <1000 ms) dependem de cenário; documentar rede, mocks e percentis. Não reprovar indiscriminadamente testes com Gemini real, nem proclamar cumprimento por um único teste mockado.
2. **Três estágios, dois paralelos:** geocodificação paralela e clima/OSRM paralelos; IA é terceiro estágio dependente, apesar do texto dizer “dois estágios paralelos”.
3. **Duração 1–5 dias:** requisito da atividade; comparar com validações atuais. Se o código permitir mais, registrar diferença; não reduzir automaticamente sem decisão.
4. **Categorias de perfil:** texto diz “Romântico / Econômico”; o wireframe mostra “Econômico” e “Ecoturismo”. Registrar divergência.
5. **Idempotência:** lock em processo evita corrida local; múltiplos workers precisam ser avaliados separadamente, sem exigir coordenação distribuída onde a fonte não a especifica.
6. **HTTP 499:** aparece nos exemplos, mas não é status HTTP padronizado universal; avaliar cancelamento observável em vez de exigir resposta 499 após desconexão.
7. **`X-User-Id`:** aparece como identificador de isolamento; não tomar header controlado pelo cliente como prova de autenticação. Comparar comportamento real do token/cookie Google/visitante.
8. **BackgroundTasks para persistência:** fonte exige gravação fora do caminho crítico; auditar compatibilidade com leitura imediata do histórico, perda de tarefas e integridade. Registre trade-offs antes de recomendar mudanças.
9. **Dados de rotas e pedágios:** o texto exige duas sugestões e valores regionais, mas não entrega base tarifária, fórmula exata de economia, nem fonte oficial de postos. Não inventar cálculos nem dados.
10. **Penalização altimétrica:** percentual previsto, mas **fórmula exata não está definida**; auditar documentação do algoritmo real e testes, marcar parâmetro de produto a confirmar.
11. **Autonomia ~18%:** a fonte usa aproximadamente; validar a regra atual e deixar claro se é aproximação ou parâmetro configurável.
12. **Persistência temporária x global:** visitante é volátil; métricas globais e histórico do usuário são conceitos diferentes. O que conta como “total roteiros” requer declaração clara.
13. **Disponibilidade de serviços:** “4/4 ativos” no wireframe não prova que chamadas externas deram certo; saúde do backend não é saúde de todos os provedores.
14. **SSE com erros:** o exemplo envia texto de `exc` em um chunk; auditar eventual vazamento de segredos e propor formato sanitizado sem mudar código nesta etapa.
15. **Implementação de referência vs repositório real:** o material usa `backend/app/routers/roteiros.py`, `.jsx` e caminhos `completo/backend`; o repositório real pode usar `app/backend/app/routers/trips.py`, `.tsx` e serviços distribuídos. A equivalência funcional prevalece; diferenças de rota/contrato devem ser reportadas.
16. **Figura vs regra:** números, nomes de cidades, preços, status e tempos dos wireframes são exemplos e não constantes exigidas.
17. **Fonte A x B:** a parte II do PDF B é análise complementar; suas recomendações de segurança/robustez podem virar pendências técnicas, mas não são automaticamente tarefas expressamente cobradas pelo professor.
18. **Não mesclar nem reverter:** houve rollback explícito ao commit `f50a3d0`; a auditoria deve respeitar o estado atual e não reintroduzir alterações descartadas.

## 14. Evidências de testes sugeridas (Codex deve adaptar à estrutura real)

```bash
# Na raiz do monorepo: verificar scripts antes de executar
npm run check
npm test
npm run build

# Backend: usar scripts/configuração reais do workspace
npm test --workspace @guia/backend
npm run check --workspace @guia/backend

# Dentro de app/backend, quando houver dependências instaladas
uv run --with-requirements requirements.lock python -m pytest -v

# Frontend apenas para contrato/integrabilidade
npm test --workspace @guia/frontend
```

Antes da suíte, confira dependências reais, toolchain e variáveis do repositório; evite chamadas de rede externas e não insira segredos. Confira que `pytest` cobre `422`, `409`, SSE, GPX, OpenAPI, persistência, segurança e os dois `asyncio.gather` como comportamentos, e não apenas funções isoladas. Inspecione se a inicialização da API e o teste de `/openapi.json` revelam import errors que testes unitários não encontraram.

## 15. Formato de entrega obrigatório do Codex

### 15.1 Resumo executivo
- HEAD/branch efetivamente analisados, estrutura real, data e ambiente.
- Quantidade de itens por status, sem marcar como implementado sem teste/evidência.
- Top 10 lacunas concretas, impacto no professor e no usuário.

### 15.2 Matriz integral de rastreabilidade

| ID | Aluno | Exigência | Natureza da fonte | Status | Evidência `arquivo:linha` | Endpoint/serviço | Teste executado | Lacuna | Severidade |
|---|---|---|---|---|---|---|---|---|---|
| REQ-01 ... REQ-97 | ... | ... | ... | ... | ... | ... | ... | ... | ... |

**Não omitir nenhum ID.** Cada item deve conter referência de páginas A/B, mesmo que fique sem evidência de implementação.

### 15.3 Inventário de contratos
Para cada endpoint: método, caminho, parâmetros (com limites e defaults), resposta, status de erro, autenticação, consumidor, código e testes; comparar com a tabela da seção 12.

### 15.4 Defeitos ordenados por impacto
- **P0:** aplicação não inicia, acesso indevido entre usuários, perda/corrupção de dados, execução insegura.
- **P1:** requisito central obrigatório ausente ou incorreto: planejar, geometria real, validação, altimetria, custos, SSE, GPX, persistência.
- **P2:** lacuna de observabilidade, contrato auxiliar, fallback, teste relevante ou diferença visível com o wireframe.
- **P3:** melhorias técnicas não exigidas expressamente; indicar como recomendação.

### 15.5 Matriz por aluno
- **Aluno 2:** demonstrar dois `gather`, lifespan HTTP, Depends, 409, cancelamento, breakers e latência controlada.
- **Aluno 3:** demonstrar 422 UF, altimetria de rota, subida/descida, consumo/auto­nomia por tipo, paradas, tarifas, custos e até 8 passageiros.
- **Aluno 4:** demonstrar SSE progressivo com `done`, cancelamento, GPX válido, Prometheus, pytest/Vitest e estado dos testes.

### 15.6 Plano de correção NÃO executado
Prioridade, causa raiz, arquivos sugeridos, efeito no frontend, testes a adicionar, dependências de produto/professor. Não fazer alterações de implementação sem uma nova autorização expressa.

---

## 16. Definição de “backend completo” para esta auditoria

O backend **só pode ser descrito como integralmente atendido** quando cada requisito explícito A2/A3/A4 e cada funcionalidade transversal necessária tiver evidência de código e comportamento/testes compatíveis (ou divergência formalmente aceita pelo projeto/professor). Não confundir presença de funções com funcionamento, screenshot com teste integrado, nem `pytest` verde com requisitos totalmente atendidos. Pendências não testáveis devem continuar marcadas como **NÃO VERIFICÁVEL**, não como “concluído”.
