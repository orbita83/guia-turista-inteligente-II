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

## Geometria rodoviária no planejamento (issue #19)

`POST /api/v1/roteiros/planejar` retorna em `viagem.percurso` a rota principal
do OSRM. `geometria` é uma sequência ordenada de pares `[latitude, longitude]`,
em graus, compatível com Leaflet; o serviço converte a ordem GeoJSON do OSRM.
`distancia` e `tempo` continuam em formato textual. Por exemplo:

```json
{"percurso":{"distancia":"1.0 km","tempo":"0h 2min de carro","modal":"carro","estado":"disponivel","geometria":[[-8.0,-34.0],[-9.0,-35.0]],"alternativas":[]}}
```

`alternativas` contém somente rotas adicionais válidas retornadas pelo OSRM,
com distância, tempo, modal e geometria no mesmo formato; uma lista vazia indica
que nenhuma alternativa válida foi recebida. A integração visual das alternativas
depende de alinhamento com os consumidores e não inventa custos ou paradas.
Quando o provedor falha, não encontra rota ou retorna dados inválidos, o percurso
tem `estado: "indisponivel"`, `motivo` e valores `N/D`, sem geometria fabricada.

