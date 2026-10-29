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

## Sessões e revogação

O Backend associa cada cookie assinado a uma sessão ativa no armazenamento do
processo. Logout, troca de identidade e restauração revogam a sessão anterior;
um cookie antigo não permite reativá-la. O vínculo visitante/Google expira conforme
o prazo da sessão visitante.

As sessões ativas e as viagens de visitante ficam em memória: reiniciar a API
encerra as sessões e múltiplos workers independentes não compartilham revogações.
Para execução distribuída, é necessário armazenamento compartilhado e atômico
para as sessões antes de habilitar múltiplos processos.

## Diagnósticos de provedores

Na telemetria do planejamento, `nao_consultado` identifica operações que não
chegaram ao provedor por ausência de coordenadas ou chave, ou por circuito aberto.
As durações das etapas incluem esse tratamento local e não representam, por si
sós, o tempo de uma chamada de rede; operações paralelas não devem ser somadas.

