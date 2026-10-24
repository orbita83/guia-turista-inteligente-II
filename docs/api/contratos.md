# Contratos da API

## Escopo e nível de certeza

Este catálogo reúne somente rotas e campos mencionados na fonte. Onde método, caminho completo ou schema não estão definidos, o item é marcado como pendente em vez de receber um contrato inventado.

**Rastreabilidade:** [Arquitetura de Microsserviços](../modulo-guia-turista-inteligente.md#13-arquitetura-de-microsserviços), [Backend FastAPI](../modulo-guia-turista-inteligente.md#21-backend-fastapi) e [Telas e Componentes](../modulo-guia-turista-inteligente.md#3-telas-e-componentes).

## Convenções HTTP confirmadas

| Elemento | Uso | Estado |
| --- | --- | --- |
| Prefixo | `/api/v1` | Fonte |
| `Content-Type` | `application/json` nas operações REST | Fonte |
| `X-User-Id` | identidade ativa e isolamento do histórico | Fonte |
| `X-Process-Time` | tempo do processamento ASGI, em formato ainda não estabilizado | Fonte |
| `X-Request-ID` | correlação entre requisição, logs e interface | Fonte |
| Erro de validação | `422 Unprocessable Entity` | Fonte |
| Duplicidade ativa | `409 Conflict` | Fonte |
| Cliente desconectado | `499` usado internamente/pela API | Fonte |

## Catálogo de endpoints

| ID | Método e caminho | Finalidade | Certeza |
| --- | --- | --- | --- |
| `API-PLN-001` | `POST /api/v1/roteiros/planejar` | produzir roteiro estruturado e telemetria | Confirmado |
| `API-MAP-001` | `POST /api/v1/roteiros/mapa-rota` | obter geometria e alternativas de rota | Confirmado |
| `API-GUI-001` | `POST /api/v1/roteiros/stream-guia` | transmitir guia por SSE | Confirmado |
| `API-HIS-001` | `GET /api/v1/roteiros/minhas-viagens` | listar histórico do usuário | Confirmado |
| `API-HIS-002` | `DELETE /api/v1/roteiros/{roteiro_id}` | excluir uma viagem e atualizar a interface | Confirmado |
| `API-HIS-003` | `PATCH /api/v1/roteiros/{roteiro_id}/visitas` | marcar atrativos visitados | Confirmado |
| `API-CST-001` | método pendente em `/api/v1/roteiros/custos` | calcular custos e rateio | Caminho mencionado |
| `API-EXP-001` | método pendente em `/api/v1/roteiros/exportar/gpx` | gerar arquivo GPX 1.1 | Caminho mencionado |
| `API-EXP-002` | método pendente em `/api/v1/roteiros/compartilhar` | despachar compartilhamento em background | Caminho mencionado |
| `API-AUT-001` | caminhos pendentes sob `/api/v1/auth` | Google JWT, visitante e encerramento | Somente router confirmado |
| `API-TEL-001` | caminhos pendentes sob `/api/v1/telemetria` | métricas e diagnóstico | Somente router confirmado |
| `API-OPS-001` | `GET /healthz` | liveness probe | Confirmado |
| `API-OPS-002` | `GET /readyz` | readiness probe | Confirmado |
| `API-TEL-002` | `GET /metrics` | métricas OpenMetrics/Prometheus | Confirmado |

## `API-PLN-001` — Planejar roteiro

### Entrada conhecida

| Campo | Evidência | Obrigatoriedade/tipo |
| --- | --- | --- |
| `origem_cidade` | trecho de `RoteiroRequest` usado na orquestração | string; validação exata pendente |
| `origem_uf` | geocodificação e validação de UF | string de duas letras maiúsculas |
| `destino_cidade` | trecho de orquestração | string; validação exata pendente |
| `destino_uf` | geocodificação e validação de UF | string de duas letras maiúsculas |
| `preferencia_rota` | chamada OSRM | enum/domínio pendente |
| `dias_estadia` | geração de guia | numérico; limites pendentes |
| `estilo_viagem` | geração de guia | enum/domínio pendente |
| parâmetros de veículo e passageiros | formulário e calculadora | nomes e limites pendentes |

### Saída conhecida

A fonte descreve, sem fornecer JSON completo:

- origem e destino resolvidos;
- clima;
- percurso, geometria e alternativas;
- guia de viagem;
- atrativos e gastronomia;
- custos, autonomia, paradas e altimetria;
- diagnóstico/telemetria e identificador do roteiro.

O schema final e a distinção entre resposta do planejamento e consultas complementares são questões em aberto.

## `API-GUI-001` — Streaming do guia

### Payload conhecido

```json
{
  "destino": "<string>",
  "dias_estadia": "<valor conforme schema>",
  "estilo_viagem": "<valor conforme schema>",
  "clima_info": "<objeto ainda não estabilizado>",
  "atrativos": "<coleção ainda não estabilizada>",
  "gastronomia": "<coleção ainda não estabilizada>"
}
```

### Resposta

- status de sucesso esperado: `200`;
- mídia: `text/event-stream`;
- quadro incremental:

```text
data: {"chunk":"texto parcial","done":false}\n\n
```

- quadro terminal:

```text
data: {"chunk":"","done":true}\n\n
```

O cliente deve processar frames incompletos entre leituras do `ReadableStream`, preservar UTF-8 e encerrar ao receber `done: true` ou fechamento de conexão.

## Histórico e identidade

- `X-User-Id` seleciona o escopo do usuário.
- `GET .../minhas-viagens` não deve retornar registros de outro identificador.
- `DELETE` e `PATCH` precisam verificar que `roteiro_id` pertence ao usuário ativo.

A última verificação é uma regra derivada de isolamento; o comportamento `403` versus `404` ainda precisa ser decidido.

## OpenAPI

FastAPI deve publicar o contrato executável em:

- `/docs` — Swagger UI;
- `/redoc` — ReDoc.

**Proposto:** cada schema e endpoint deve carregar descrição, exemplos sem dados pessoais, respostas de erro e ID estável deste catálogo.

## Questões necessárias antes da implementação

1. estabilizar schemas Pydantic de entrada e saída;
2. definir autenticação/autorização real associada a `X-User-Id`;
3. definir métodos de custos, exportação e compartilhamento;
4. definir paginação e ordenação do histórico;
5. definir formato dos tempos e unidades numéricas;
6. definir limites de tamanho e timeout de streaming;
7. definir respostas parciais quando provedores falham.

