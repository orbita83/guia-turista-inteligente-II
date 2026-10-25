# Frontend

SPA React 19 + TypeScript + Vite+ do Guia do Turista Inteligente.

O frontend visual que antes vivia em `templates/index.html`, `static/css/style.css`
e `static/js/app.js` foi migrado para componentes, hooks, serviços e estilos deste
workspace. A aparência e as capacidades atuais foram preservadas: autenticação
Google/visitante, formulário de rota, loading, histórico, accordion, Maps, exclusão
e toasts.

## Transição do monólito

O frontend consome JSON da API FastAPI em `app/backend`. O contrato HTTP está
encapsulado em `src/services/api.ts`; os componentes não conhecem detalhes do
transporte nem do armazenamento.

Em desenvolvimento, `/api` é encaminhado pelo Vite para
`http://127.0.0.1:8001`. O cookie de sessão assinado é enviado junto às requisições.
Em implantação separada, configure `VITE_API_BASE_URL`, proxy reverso e origens
permitidas no backend.

## Execução

Com as dependências do workspace backend instaladas e o arquivo `.env` configurado:

```powershell
npm run dev
```

O Turborepo inicia o backend FastAPI e a SPA. A SPA fica disponível em
`http://localhost:5173` e a API em `http://localhost:8001`. Os scripts `dev`,
`check`, `lint`, `test` e `build` também podem ser executados neste workspace.

## Organização

- `src/components`: interface migrada e componentes acessíveis;
- `src/hooks`: estado e orquestração da SPA;
- `src/services`: cliente dos contratos JSON da API;
- `src/types`: contratos TypeScript do domínio e da API;
- `src/index.css`: identidade visual, responsividade e estados;
- [`docs`](./docs/README.md): requisitos, arquitetura e plano de entrega.

A arquitetura e a toolchain seguem a
[ADR-001](../../docs/arquitetura/decisoes/ADR-001-typescript-e-vite-plus.md).

