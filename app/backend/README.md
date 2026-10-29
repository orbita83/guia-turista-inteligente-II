# Backend

API FastAPI/ASGI do monorepo. Responsável por sessão, planejamento de roteiros,
integrações, persistência e contratos consumidos pela SPA.

## Execução

Com `uv` instalado, execute na raiz do monorepo:

```powershell
npm run dev
```

O Turborepo executa esta API em `http://localhost:8001` junto com o frontend em
`http://localhost:5173`. Para executar somente o backend:

```powershell
npm run dev --workspace @guia/backend
```

Os comandos do workspace usam `requirements.lock` com `uv run`, sem exigir ativação
manual de ambiente virtual. O arquivo `.env` da raiz fornece `GEMINI_API_KEY`,
`GOOGLE_CLIENT_ID` e `SECRET_KEY`. A API publica OpenAPI em `/docs`, health em
`/healthz` e readiness em `/readyz`.

## Estrutura

- `app/main.py`: aplicação, ciclo de vida e middleware;
- `app/routers/`: fronteiras HTTP de autenticação e roteiros;
- `app/schemas/`: modelos de request/response;
- `app/services/`: casos de uso e integrações;
- `app/core/`: configuração, dependências e persistência;
- `tests/`: testes de serviço e contrato HTTP.

## Telemetria do planejamento (issue #21)

O middleware informa `X-Process-Time` em milissegundos e `X-Request-ID`; o CORS
expõe ambos os cabeçalhos. O tempo HTTP é medido até a resposta começar a ser
produzida e não representa RTT nem o tempo total percebido pelo navegador.

Em `POST /api/v1/roteiros/planejar`, `viagem.telemetria` contém `pipeline_ms`
(do início do planejamento até a persistência), `geocodificacao` (duração do
estágio e das duas operações), e `provedores` (estado e `duracao_ms` por operação).
Os tempos incluem a execução dos serviços locais e eventuais chamadas externas;
etapas concorrentes se sobrepõem e não devem ser somadas. `null` indica que o
provedor não foi executado. Open-Elevation permanece `nao_executado` até sua
integração; fallback não confirma a saúde de um provedor. A telemetria é da
operação atual e não é acrescentada ao histórico persistido.

Exemplo parcial: `{"telemetria":{"pipeline_ms":800.0,"geocodificacao":{"duracao_ms":200.0,"origem_ms":180.0,"destino_ms":190.0},"provedores":{"open-elevation":{"estado":"nao_executado","duracao_ms":null}}}}`.

`GET /metrics` já está disponível em formato Prometheus; sua operação e os
contratos de indicadores globais continuam sob responsabilidade do Aluno 4.
O consumo dos novos campos no painel depende de alinhamento com o Frontend.

Na verificação de 29/10/2026, uma instância temporária do Backend recebeu uma
requisição HTTP autenticada como visitante para Recife/PE → Salvador/BA, com
Gemini sem chave. A resposta foi 200, expôs ambos os cabeçalhos via CORS e
preservou o ID enviado; `X-Process-Time` foi 2086,917 ms e `pipeline_ms`,
2084,609 ms. Clima e OSRM retornaram sucesso; Gemini e Open-Elevation não foram
executados. É uma única medição, sem validação da exibição no navegador. O teste
`test_planejamento_expoe_cabecalhos_e_diagnostico` reproduz a verificação de
contrato com integrações simuladas e sem credenciais reais.

