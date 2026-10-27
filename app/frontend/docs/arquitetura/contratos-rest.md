# Contratos REST consumidos pelo frontend

O frontend usa somente os contratos JSON executáveis em `app/backend`. A lista
abaixo descreve o escopo migrado do monólito; contratos futuros da arquitetura global
estão em [Contratos da API](../../../docs/api/contratos.md) e não fazem parte desta
entrega.

## Convenções atuais

- Prefixo REST: `/api/v1`; em desenvolvimento, Vite encaminha `/api` para
  `http://127.0.0.1:8001`.
- Respostas REST usam JSON; logout e exclusão respondem `204 No Content`.
- A identidade é mantida pelo cookie de sessão assinado pelo backend. O frontend
  envia credenciais com `credentials: 'include'` e não envia `X-User-Id`.
- A sessão visitante expira em duas horas. O backend isola os dados pela identidade
  da sessão ativa.
- `X-Process-Time` e `X-Request-ID` são retornados pela API; o request ID informado
  é preservado ou gerado pelo backend.
- OpenAPI em `/docs` e `/redoc`; probes em `/healthz` e `/readyz`.

## Contratos usados pela SPA

| Método e caminho | Uso no cliente | Resposta |
| --- | --- | --- |
| `GET /api/v1/auth/session` | restaurar sessão e carregar Google Client ID/UFs | `{ usuario, google_client_id, ufs }` |
| `POST /api/v1/auth/google` | enviar a credencial Google para validação | `{ usuario }` e cookie assinado |
| `POST /api/v1/auth/visitor` | iniciar sessão de visitante | `{ usuario }` e cookie assinado |
| `POST /api/v1/auth/logout` | encerrar sessão | `204` |
| `GET /api/v1/roteiros/minhas-viagens` | carregar o histórico da sessão | `{ viagens: [...] }` |
| `GET /api/v1/roteiros/minhas-viagens/json` | visualizar envelope e metadados do histórico | envelope legado filtrado ao usuário ativo |
| `POST /api/v1/roteiros/planejar` | planejar viagem a partir de cidade/UF | `{ viagem, aviso }` |
| `DELETE /api/v1/roteiros/{roteiro_id}` | excluir roteiro próprio | `204` |

## Planejamento

A entrada reproduz o formulário existente:

```json
{
  "origem_cidade": "Recife",
  "origem_uf": "PE",
  "destino_cidade": "Salvador",
  "destino_uf": "BA"
}
```

O backend sanitiza nomes de cidades e preserva o formato existente de viagem:
`id`, `criado_em`, `origem`, `destino`, `clima`, `percurso`, `dicas_destino` e
`diagnostico_ia`. Cidades vazias retornam `422`; repetição ativa ou dentro do
cooldown de quatro segundos retorna `409`.

## Histórico e validação de fronteira

Esta documentação descreve apenas o consumo frontend dos endpoints existentes; não
é especificação de implementação backend. Campos ausentes ficam visíveis com texto
provisório amigável como “Aguardando dados”.

O frontend valida o envelope `{ viagens }` e cada item antes de atualizar o estado.
Itens sem `id` são descartados; origem, destino, temperatura, duração e distância
ausentes, vazios ou `N/D` são apresentados como “Aguardando dados”. A resposta de
planejamento entra imediatamente como card e é deduplicada por `id`. A UI comunica
pendência ou confirmação apenas conforme os sinais já oferecidos pela API; não
presume gravação em segundo plano.

Troca ou encerramento de sessão invalida consultas e ações pendentes. A exclusão só
remove o card após `204`; qualquer falha preserva o item e produz feedback acionável.

## Itens fora do escopo atual

Mapa dedicado, SSE, custos, altimetria, visitas, GPX, compartilhamento, métricas de
produto e autenticação por `X-User-Id` aparecem em documentos de arquitetura como
alvos futuros, mas não existiam nos fluxos do monólito migrados. Não implementar ou
expor esses itens como parte desta reorganização.
