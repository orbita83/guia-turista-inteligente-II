# Execução e runbook local

> **Estado:** endpoints e comandos são de **Fonte**; diagnóstico é **Derivado**.

## Subida local

Execute os dois workspaces pela raiz do monorepo:

```bash
npm install
npm run dev
```

Os processos também podem ser iniciados separadamente:

### Terminal 1 — backend

```bash
npm run dev --workspace @guia/backend
```

### Terminal 2 — frontend

```bash
npm run dev --workspace @guia/frontend
```

O script do frontend executa Vite+; o script do backend inicia Uvicorn via `uv`.

## Verificação rápida

1. Abrir `http://localhost:8001/healthz` e confirmar processo vivo.
2. Abrir `http://localhost:8001/readyz` e confirmar prontidão.
3. Abrir `http://localhost:8001/docs` e conferir rotas carregadas.
4. Abrir `http://localhost:5173` e executar planejamento mínimo.
5. Conferir `X-Process-Time`, `X-Request-ID` e os fluxos existentes de histórico e exportação JSON.

## Testes e análise estática

```bash
npm run check
npm test
npm run build
```

## Diagnóstico

| Sintoma | Verificação | Ação provável |
| --- | --- | --- |
| `vp` não encontrado | dependências e `node_modules/.bin` | executar `npm install` e usar scripts npm ou `npm exec -- vp` |
| SPA não chama API | URL configurada e console/rede | corrigir URL/CORS |
| Login Google falha | Client ID e origem autorizada | revisar configuração OAuth |
| Guia não inicia | chave Gemini, logs e circuit breaker | corrigir segredo ou aguardar recuperação |
| Rota/clima degradado | resposta de fallback e logs do backend | conferir disponibilidade dos provedores |
| `409` persistente | conjunto de requisições ativas e bloco `finally` | confirmar liberação do lock |
| Histórico incorreto | cookie de sessão e arquivo de storage | verificar isolamento por usuário |
| `422` | corpo e erros do Pydantic | corrigir campos/UF do payload |

## Encerramento

- Interromper o servidor Vite iniciado por Vite+ e o Uvicorn com `Ctrl+C`.
- Confirmar que o `lifespan` encerrou o pool HTTP.
- Não remover arquivo de dados persistentes sem backup/intenção explícita.

## Prontidão para outros ambientes

Antes de homologação/produção, definir:

- processo de build e publicação;
- servidor/proxy e domínios da API;
- armazenamento durável concorrente;
- HTTPS, domínios e CORS;
- secrets manager;
- SLO, alertas, backup e recuperação;
- migração do JSON se houver múltiplas instâncias.

Referência da organização do repositório: [ADR-002 — Monorepo com Turborepo](../arquitetura/decisoes/ADR-002-monorepo-com-turborepo.md).

Fonte: [Backend FastAPI](../modulo-guia-turista-inteligente.md#51-backend-fastapi) e [Frontend React](../modulo-guia-turista-inteligente.md#52-frontend-react).

