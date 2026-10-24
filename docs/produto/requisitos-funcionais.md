# Requisitos funcionais

Cada requisito desta lista descreve comportamento observável. **Fonte** indica afirmação explícita na transcrição; **Derivado** apenas decompõe essa afirmação para torná-la implementável.

## Autenticação e sessão

| ID | Requisito | Verificação mínima | Estado |
| --- | --- | --- | --- |
| RF-AUT-001 | O sistema deve autenticar um usuário por token Google e expor seu perfil ativo. | Token válido cria sessão; inválido é recusado. | Fonte |
| RF-AUT-002 | O sistema deve criar sessão temporária de visitante com TTL de duas horas. | Sessão informa expiração e deixa de ser válida após o TTL. | Fonte |
| RF-AUT-003 | O frontend deve alternar de usuário Google para visitante sem apagar a identidade Google salva. | Após alternar, existe ação para restaurar a identidade anterior. | Fonte |
| RF-AUT-004 | O frontend deve restaurar a sessão Google salva em um clique. | A ação no cabeçalho restaura usuário e histórico correspondente. | Fonte |
| RF-AUT-005 | O sistema deve permitir encerrar a sessão, inclusive durante o fechamento da janela. | O frontend aciona o encerramento compatível com `sendBeacon`. | Fonte |
| RF-AUT-006 | As chamadas associadas a dados pessoais devem informar a identidade ativa. | Requisições levam o cabeçalho `X-User-Id` conforme contrato. | Fonte |

Referência: [Sessão Híbrida](../modulo-guia-turista-inteligente.md#36-sessão-híbrida) e [camada de autenticação](../modulo-guia-turista-inteligente.md#21-backend-fastapi).

## Planejamento

| ID | Requisito | Verificação mínima | Estado |
| --- | --- | --- | --- |
| RF-PLN-001 | O viajante deve informar município e UF de origem e destino. | Formulário envia os quatro valores e exibe erros de validação. | Fonte |
| RF-PLN-002 | O viajante deve selecionar duração da estadia e perfil de viagem. | Valores selecionados integram a solicitação do roteiro. | Fonte |
| RF-PLN-003 | O viajante deve configurar veículo a combustão ou elétrico e seus parâmetros aplicáveis. | Alternar a fonte energética altera os campos e cálculos pertinentes. | Fonte |
| RF-PLN-004 | O frontend deve sugerir quatro destinos turísticos próximos usando a geolocalização e Haversine. | Com permissão de GPS, são calculadas e exibidas sugestões. | Fonte |
| RF-PLN-005 | O sistema deve obter coordenadas de origem e destino concorrentemente. | As duas geocodificações são aguardadas no mesmo estágio assíncrono. | Fonte |
| RF-PLN-006 | O sistema deve obter clima e rota concorrentemente após geocodificar os locais. | Clima e rota são executados em paralelo e compõem a resposta. | Fonte |
| RF-PLN-007 | O frontend deve bloquear uma nova submissão enquanto a atual estiver em andamento. | Cliques adicionais não criam solicitações duplicadas. | Fonte |

Referência: [Planejador de Viagens](../modulo-guia-turista-inteligente.md#31-planejador-de-viagens) e [Orquestração com asyncio.gather](../modulo-guia-turista-inteligente.md#41-orquestração-com-asynciogather).

## Mapa, rota e relevo

| ID | Requisito | Verificação mínima | Estado |
| --- | --- | --- | --- |
| RF-MAP-001 | O sistema deve calcular rota rodoviária e geometria via OSRM. | A resposta contém geometria renderizável, distância e duração. | Fonte |
| RF-MAP-002 | O frontend deve renderizar a rota, origem, destino e paradas no Leaflet. | Elementos aparecem no mapa após o planejamento. | Fonte |
| RF-MAP-003 | O sistema deve oferecer rota principal e uma alternativa econômica quando disponíveis. | O usuário alterna entre as sugestões e as métricas são atualizadas. | Fonte |
| RF-MAP-004 | O sistema deve consultar e apresentar perfil altimétrico da rota. | São exibidos perfil, altitude máxima, ganho e perda de elevação. | Fonte |
| RF-MAP-005 | O sistema deve refletir a influência do relevo no consumo estimado. | O resultado apresenta a penalização ou o ganho percentual aplicado. | Fonte |

Referência: [Mapa e Autonomia](../modulo-guia-turista-inteligente.md#33-mapa-e-autonomia).

## Custos e autonomia

| ID | Requisito | Verificação mínima | Estado |
| --- | --- | --- | --- |
| RF-CST-001 | O sistema deve calcular autonomia conforme tipo e parâmetros do veículo. | A autonomia calculada é apresentada com a rota. | Fonte |
| RF-CST-002 | O sistema deve sugerir paradas antes de atingir a reserva crítica. | Rotas longas apresentam postos ou eletropostos coerentes com a autonomia. | Fonte |
| RF-CST-003 | O sistema deve estimar combustível ou energia, pedágios e custo total. | O painel discrimina componentes e total. | Fonte |
| RF-CST-004 | O sistema deve ratear o custo por até oito passageiros. | Alterar a quantidade recalcula a cota individual. | Fonte |
| RF-CST-005 | O sistema deve calcular emissões associadas à viagem. | A resposta de custos contém estimativa de emissões. | Fonte |

Referência: [Mapa e Autonomia](../modulo-guia-turista-inteligente.md#33-mapa-e-autonomia) e [serviços do backend](../modulo-guia-turista-inteligente.md#21-backend-fastapi).

## Guia, clima e atrações

| ID | Requisito | Verificação mínima | Estado |
| --- | --- | --- | --- |
| RF-GUI-001 | O sistema deve apresentar temperatura, sensação térmica, vento e condição climática do destino. | O banner climático contém os quatro dados quando providos. | Fonte |
| RF-GUI-002 | O sistema deve gerar guia turístico contextualizado por destino, duração, perfil, clima, atrações e gastronomia. | A solicitação à IA recebe esse contexto e produz o guia. | Fonte |
| RF-GUI-003 | O backend deve transmitir o guia progressivamente por SSE. | O cliente recebe eventos parciais e um evento de término. | Fonte |
| RF-GUI-004 | O frontend deve anexar os fragmentos SSE ao conteúdo sem substituir o texto anterior. | O guia cresce progressivamente sem piscar a interface. | Fonte |
| RF-GUI-005 | O sistema deve apresentar atrações e gastronomia do destino. | Cards de conteúdo aparecem no resultado. | Fonte |
| RF-GUI-006 | O usuário deve marcar ou desmarcar atrações visitadas. | A ação persiste por `PATCH` no roteiro correspondente. | Fonte |

Referência: [Guia e Streaming](../modulo-guia-turista-inteligente.md#35-guia-e-streaming) e [Streaming com SSE](../modulo-guia-turista-inteligente.md#42-streaming-com-sse).

## Histórico, exportação e compartilhamento

| ID | Requisito | Verificação mínima | Estado |
| --- | --- | --- | --- |
| RF-HIS-001 | O sistema deve salvar o roteiro concluído sem atrasar a resposta principal. | Persistência é agendada após compor a resposta e só ocorre para conexão válida. | Fonte |
| RF-HIS-002 | O sistema deve listar apenas as viagens do usuário ativo. | Trocar de usuário altera o conjunto retornado. | Fonte |
| RF-HIS-003 | O usuário deve excluir uma viagem do próprio histórico. | A exclusão remove o item e atualiza a interface. | Fonte |
| RF-EXP-001 | O usuário deve abrir o trajeto no Google Maps. | A ação gera um destino navegável coerente com a rota. | Fonte |
| RF-EXP-002 | O usuário deve compartilhar um resumo da viagem pelo WhatsApp. | A ação prepara ou despacha o conteúdo para o canal. | Fonte |
| RF-EXP-003 | O usuário deve baixar um arquivo GPX 1.1 com pontos relevantes da viagem. | O arquivo válido contém waypoints e dados previstos pela fonte. | Fonte |
| RF-EXP-004 | O backend deve aceitar despacho de compartilhamento em segundo plano. | A resposta não aguarda o processamento do canal externo. | Fonte |

Referência: [Histórico e Persistência](../modulo-guia-turista-inteligente.md#34-histórico-e-persistência), [Mapa e Autonomia](../modulo-guia-turista-inteligente.md#33-mapa-e-autonomia) e [Tarefas em Segundo Plano](../modulo-guia-turista-inteligente.md#45-tarefas-em-segundo-plano).

## Telemetria e operação

| ID | Requisito | Verificação mínima | Estado |
| --- | --- | --- | --- |
| RF-TEL-001 | O backend deve informar tempo de processamento em `X-Process-Time`. | Resposta da API contém o cabeçalho mensurável. | Fonte |
| RF-TEL-002 | O sistema deve correlacionar requisições por `X-Request-ID`. | Logs e resposta permitem localizar a mesma requisição. | Fonte |
| RF-TEL-003 | O frontend deve exibir usuário, latência da API, tempo total e estado dos provedores. | O card apresenta os indicadores após uma consulta. | Fonte |
| RF-TEL-004 | O backend deve expor saúde, prontidão e métricas Prometheus. | `/healthz`, `/readyz` e `/metrics` respondem conforme o estado. | Fonte |
| RF-TEL-005 | O backend deve publicar documentação OpenAPI em Swagger UI e ReDoc. | `/docs` e `/redoc` ficam acessíveis no ambiente de desenvolvimento. | Fonte |

Referência: [Telemetria e Desempenho](../modulo-guia-turista-inteligente.md#32-telemetria-e-desempenho) e [Instalação e Execução](../modulo-guia-turista-inteligente.md#5-instalação-e-execução).

## Questões em aberto

- A fonte cita “raio (>400 km)”, mas não define se `400 km` é distância mínima, máxima ou limiar de recomendação.
- O contrato exato dos parâmetros do veículo, das respostas de rota/custos e dos eventos SSE não está integralmente especificado.
- Não há regra para ausência de rota alternativa, clima, elevação ou resposta da IA.
- Não está definido se compartilhamento por WhatsApp ocorre apenas no cliente ou também pelo endpoint em background.
- O comportamento após expiração da sessão visitante precisa ser detalhado.

