# 🇧🇷 Guia do Turista Inteligente

Aplicação web de planejamento de viagens pelo Brasil, organizada como monorepo com API **FastAPI/ASGI** e SPA **React 19 + TypeScript + Vite+**. A arquitetura separa interface, contratos HTTP, integrações e persistência, preservando as capacidades existentes do produto.

## 📚 Documentação de engenharia

A documentação do produto e da arquitetura está em [`docs/README.md`](docs/README.md). As specs de migração e os limites de escopo estão em [`specs/README.md`](specs/README.md).

O projeto é orquestrado pelo **Turborepo**. O backend fica em `app/backend`; o
frontend, em `app/frontend`. A migração reorganiza o sistema existente, sem adicionar
funcionalidades de produto.

---

## 🚀 Como Executar o Projeto Localmente

### 1. Clonar o Repositório e Acessar a Pasta

```bash
git clone https://github.com/maykolsampaio/guia-turista-inteligente.git
cd guia-turista-inteligente
```

---

## 2. Instalar as dependências

Instale Node.js conforme `.node-version`, npm e [uv](https://docs.astral.sh/uv/).
O workspace do backend instala/usa as dependências Python fixadas em
`app/backend/requirements.lock` via `uv run`.

---

### 3. Configurar as chaves e variáveis de ambiente

Copie `.env.example` para `.env` na raiz. Preencha `GEMINI_API_KEY` para ativar a
geração de guia; sem a chave, o backend mantém o texto de contingência existente.
`GOOGLE_CLIENT_ID` pode ser ajustado para o projeto OAuth correspondente. Não
publique `SECRET_KEY` nem a chave Gemini.

---

### 4. Iniciar a aplicação

```bash
npm install
npm run dev
```

Acesse a SPA em `http://localhost:5173`. A API FastAPI roda em
`http://localhost:8001`; sua documentação OpenAPI fica em `/docs`.

---

## 📂 Estrutura do Projeto

```text
├── app/backend/           # FastAPI, serviços, schemas, dados e testes da API
├── app/frontend/          # SPA React, estilos, serviços e testes
├── static/data/           # Arquivos antigos preservados para compatibilidade de migração
├── docs/                  # Documentação de produto e arquitetura
├── specs/                 # Ordem e limites da migração
└── package.json           # Workspaces npm e tarefas Turborepo
```

---

## 🧪 Verificação

Os workspaces disponibilizam comandos de verificação pelo Turborepo:

```powershell
npm run check
npm test
npm run build
```

Para executar um workspace isoladamente:

```powershell
npm test --workspace @guia/backend
npm test --workspace @guia/frontend
```

Os testes usam dependências simuladas e não precisam de credenciais reais. Para
gerar guias com Gemini em execução local, configure `GEMINI_API_KEY` no `.env`.
