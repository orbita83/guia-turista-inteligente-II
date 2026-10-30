# Observabilidade e diagnóstico

> **Estado:** sinais descritos são de **Fonte**; padronizações adicionais são **Propostas**.

## Sinais obrigatórios

| Sinal | Origem | Uso |
| --- | --- | --- |
| `X-Process-Time` | middleware FastAPI | duração até iniciar a resposta, incluindo espera por provedores |
| `processamento_interno_ms` | segmentos locais de `plan_trip` | processamento interno do planejamento, sem blocos de integração |
| Correlation-ID / `X-Request-ID` | middleware/logging | correlacionar frontend, API e integrações |
| tempo total | `fetch` até leitura e tratamento da resposta | duração percebida no cliente, sem medir renderização |
| estado de provedores | Open-Meteo, OSRM, Gemini e Open-Elevation | diagnosticar degradação |
| contadores | roteiros, conexões e operações | saúde operacional |
| circuit breakers | camada core | disponibilidade e fallback |
| `/healthz` | backend | processo vivo |
| `/readyz` | backend | pronto para tráfego |
| `/metrics` | Prometheus/OpenMetrics | coleta de séries temporais |

## Fluxo de correlação

O card **Processamento interno** lê
`viagem.telemetria.duracoes_etapas_ms.processamento_interno_ms`. O backend soma
segmentos sem sobreposição com `perf_counter()`, pausando durante os grupos de
geocodificação, clima/roteamento e Gemini/altimetria. Inclui preparação das entradas,
tratamento dos resultados, catálogo local, cálculos de autonomia/custos e montagem
do objeto final. Inclui também a espera na fila da thread dos cálculos locais.
Não mede CPU pura: exclui os blocos completos de integração (inclusive o trabalho
dos adaptadores), autenticação, validação/serialização HTTP e persistência.
O acumulador pertence a cada execução, sem estado compartilhado entre requisições.
O valor é expresso em milissegundos com três casas decimais; o frontend formata com
até duas. Dados antigos sem o campo exibem **Indisponível**, sem estimativa.

`X-Process-Time` mantém seu significado e aparece no detalhamento como
**Duração da requisição no servidor**. O aviso visual usa somente o tempo total
do cliente acima de 1.000 ms, uma referência de demonstração. O novo indicador
não é obtido subtraindo durações dos provedores e não altera a concorrência.

1. Frontend envia ou recebe um identificador de correlação.
2. Backend inclui o identificador em logs e resposta.
3. Serviços externos são registrados com provedor, duração e resultado.
4. Telemetria visual mostra identificador mascarado e tempos relevantes.

## Logs propostos

- formato estruturado;
- timestamp UTC, nível, request ID, rota, método, status e duração;
- provedor externo e estado do circuit breaker;
- identidade pseudonimizada, nunca token ou payload sensível;
- exceção com stack trace apenas no servidor.

## Métricas propostas

- latência por endpoint e quantis;
- total de respostas por status;
- solicitações ativas e conflitos `409`;
- cancelamentos por desconexão;
- duração/erro por provedor;
- circuit breaker aberto/fechado;
- streams iniciados, concluídos e interrompidos;
- persistências em background concluídas/falhas.

## Alertas — questões em aberto

Ainda devem ser definidos:

- SLO e orçamento de erro;
- limiares de latência e falhas;
- retenção e destino dos logs;
- stack de dashboards/alertas;
- responsabilidade de resposta a incidentes.

Fonte: [Telemetria e Desempenho](../modulo-guia-turista-inteligente.md#32-telemetria-e-desempenho) e [instalação do backend](../modulo-guia-turista-inteligente.md#51-backend-fastapi).

