# Contratos da API

Este documento separa os contratos executáveis hoje dos endpoints futuros descritos
na arquitetura de referência. A migração atual preserva apenas comportamentos que já
existiam no monólito; os endpoints futuros não devem ser implementados como parte
desta reorganização.

## API FastAPI executável

Base REST: `/api/v1`. As respostas de sucesso usam JSON, exceto logout e exclusão,
que retornam `204 No Content`.

| Método e caminho | Contrato | Identidade |
| --- | --- | --- |
| `GET /api/v1/auth/session` | `{ usuario, google_client_id, ufs }` | cookie de sessão opcional |
| `POST /api/v1/auth/google` | entrada `{ credential }`; saída `{ usuario }` | valida credencial no Google e cria cookie |
| `POST /api/v1/auth/visitor` | saída `{ usuario }` | cria sessão visitante com validade de 2 horas |
| `POST /api/v1/auth/logout` | `204` | encerra sessão e limpa dados temporários do visitante |
| `GET /api/v1/roteiros/minhas-viagens` | `{ viagens: [...] }` | sessão obrigatória; lista somente os roteiros da identidade ativa |
| `GET /api/v1/roteiros/minhas-viagens/json` | metadados legados e envelope `usuarios` contendo somente a identidade ativa | sessão obrigatória; exportação compatível e isolada |
| `POST /api/v1/roteiros/planejar` | entrada com `origem_cidade`, `origem_uf`, `destino_cidade`, `destino_uf`; saída `{ viagem, aviso }` | sessão obrigatória |
| `DELETE /api/v1/roteiros/{roteiro_id}` | `204` | sessão obrigatória; exclusão limitada à identidade ativa |

O planejamento mantém o formato de viagem já produzido pelo Flask: `id`, `criado_em`,
`origem`, `destino`, `clima`, `percurso`, `dicas_destino` e `diagnostico_ia`. Cidades
são higienizadas e limitadas a 80 caracteres; origem e destino vazios retornam `422`.
Solicitações iguais da mesma identidade têm bloqueio de concorrência e cooldown de
quatro segundos, respondendo `409`. Falhas HTTP não tratadas pelos fallbacks dos
provedores respondem `502`.

### Sessão e isolamento

A identidade é obtida exclusivamente do cookie de sessão assinado pelo backend. O
cliente não pode escolher uma identidade enviando `X-User-Id`; esse header não é
aceito como autenticação. Cookies são enviados com credenciais e devem ser protegidos
por HTTPS em produção. O login Google valida o campo `aud` contra `GOOGLE_CLIENT_ID`.
Visitantes mantêm roteiros somente em memória e perdem seus dados ao encerrar ou
expirar a sessão. Usuários Google mantêm histórico em
`app/backend/static/data/viagens.json`. No primeiro startup, se o arquivo não existir,
o backend valida e copia o arquivo legado da raiz sem removê-lo.

### Erros e cabeçalhos

- `401`: sessão ausente/expirada ou credencial Google inválida;
- `409`: planejamento duplicado ativo ou dentro do cooldown;
- `422`: payload inválido;
- `502`: falha de transporte em provedor necessária à operação.
- `X-Process-Time`: duração do processamento em milissegundos;
- `X-Request-ID`: ecoa o ID enviado ou gera um ID para a requisição.

Em chamadas cross-origin, os dois cabeçalhos de resposta são expostos por CORS.

### Operação

| Método e caminho | Resposta | Estado |
| --- | --- | --- |
| `GET /healthz` | `{ status: "ok" }` | executável |
| `GET /readyz` | `{ status: "ready" }` | executável; readiness simples do processo |
| `GET /docs`, `GET /redoc` | OpenAPI interativo | executável |

## Rotas antigas aposentadas

As rotas Flask de SSR e formulário (`/`, `/auth/google/callback`, `/auth/demo`,
`/auth/logout`, `/viagens/criar` e `/viagens/deletar/{id}`) foram retiradas após a
SPA passar a consumir a API FastAPI. Os arquivos de template, CSS e JavaScript de
apresentação também foram removidos.

O Flask antigo expunha `/viagens/json`, `/api/viagens/json` e `/api/viagens`, com a
base agregada de todos os usuários. Essas rotas foram aposentadas; o comportamento
de visualizar JSON é migrado em
`GET /api/v1/roteiros/minhas-viagens/json`, que mantém metadados e estrutura
compatíveis, mas inclui somente o usuário autenticado.

## Contratos futuros ainda não implementados

Os itens a seguir constam na arquitetura global, mas não possuem comportamento
correspondente no frontend monolítico atual; ficam fora desta migração:

| Método e caminho | Finalidade descrita | Estado |
| --- | --- | --- |
| `POST /api/v1/roteiros/mapa-rota` | mapa e alternativas | futuro |
| `POST /api/v1/roteiros/stream-guia` | guia por SSE | futuro |
| `PATCH /api/v1/roteiros/{id}/visitas` | marcar atrativos visitados | futuro |
| método pendente `/api/v1/roteiros/custos` | calculadora de custos | futuro |
| método pendente `/api/v1/roteiros/exportar/gpx` | exportação GPX | futuro |
| método pendente `/api/v1/roteiros/compartilhar` | compartilhamento | futuro |
| `/api/v1/telemetria` | diagnóstico de provedores/circuit breakers | futuro |
| `GET /metrics` | métricas Prometheus/OpenMetrics | futuro; não existe no Flask monolítico |

O schema executável completo também está publicado pelo FastAPI em `/openapi.json`.
