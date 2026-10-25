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

