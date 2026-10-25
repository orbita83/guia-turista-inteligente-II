# Observabilidade e diagnóstico

> **Estado:** sinais descritos são de **Fonte**; padronizações adicionais são **Propostas**.

## Sinais obrigatórios

| Sinal | Origem | Uso |
| --- | --- | --- |
| `X-Process-Time` | middleware FastAPI | latência medida no servidor |
| Correlation-ID / `X-Request-ID` | middleware/logging | correlacionar frontend, API e integrações |
| tempo total | `fetch` até renderização | experiência percebida pelo usuário |
| estado de provedores | Open-Meteo, OSRM, Gemini e Open-Elevation | diagnosticar degradação |
| contadores | roteiros, conexões e operações | saúde operacional |
| circuit breakers | camada core | disponibilidade e fallback |
| `/healthz` | backend | processo vivo |
| `/readyz` | backend | pronto para tráfego |
| `/metrics` | Prometheus/OpenMetrics | coleta de séries temporais |

## Fluxo de correlação

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

