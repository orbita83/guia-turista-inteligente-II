# Ambiente e configuração

> **Estado:** comandos, portas e variáveis nomeadas são de **Fonte**. TypeScript e Vite+ são **Decisão aprovada**; convenções de segurança são **Derivadas/Propostas**.

## Pré-requisitos

- Python 3.12, conforme `app/backend/.python-version`.
- Node.js 22.23.4, conforme `.node-version`, e npm 11.18.0.
- Dois terminais para execução local independente.
- Acesso às APIs externas quando o modo integrado estiver ativo.

## Backend

```bash
cd app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements-dev.txt
cp .env.example .env
```

No PowerShell, a ativação usual é:

```powershell
.venv\Scripts\Activate.ps1
```

### Configuração conhecida

| Variável | Finalidade | Obrigatória |
| --- | --- | --- |
| `GEMINI_API_KEY` | geração do guia com Gemini | para integração real |
| `GOOGLE_CLIENT_ID` | validação da identidade Google | para login Google |

Outras variáveis devem ser descritas em `.env.example` assim que seus nomes forem definidos (origens CORS, timeouts, storage, nível de log e URLs externas).

## Frontend

```bash
cd <raiz-do-repositorio>
npm install
cd app/frontend
npm run dev
```

Os scripts npm devem delegar para a toolchain local:

| Script compatível | Comando Vite+ | Finalidade |
| --- | --- | --- |
| `npm run dev` | `vp dev` | servidor Vite |
| `npm run check` | `vp check` | formato, lint e tipos |
| `npm run lint` | `vp check` | alias exigido pela atividade |
| `npm test` | `vp test` | testes Vitest |
| `npm run build` | `vp build` | build de produção |

O `src/config.ts` deve ler a URL da API e o Google Client ID a partir do ambiente Vite. Os nomes exatos ainda são **questão em aberto**; não duplicar valores secretos no bundle.

Não é obrigatória uma instalação global de Vite+: o `vite-plus` fixado no projeto é resolvido pelos scripts do `package.json`.

## Monorepo e Turborepo

Na raiz do repositório:

```bash
npm install
npm run dev
```

O primeiro comando instala o Turbo e todos os workspaces npm. O segundo executa as tarefas `dev` disponíveis em `app/*`. Para limitar a execução a uma aplicação, use filtros do Turbo, por exemplo `npm exec -- turbo run dev --filter=@guia/frontend` após o workspace frontend existir.

O ambiente virtual e as dependências Python permanecem independentes do npm. O workspace backend usa scripts adaptadores apenas para permitir orquestração pelo Turbo. `requirements.lock` registra as versões do ambiente validado; os arquivos `requirements*.txt` continuam sendo a declaração editável das dependências.

## Portas e origens

| Serviço | Endereço local |
| --- | --- |
| API | `http://localhost:8001` |
| Swagger | `http://localhost:8001/docs` |
| ReDoc | `http://localhost:8001/redoc` |
| SPA | `http://localhost:5173` |

O CORS documentado aceita desenvolvimento nas portas `5173` e `3000`. Ambientes diferentes devem usar allowlist explícita.

## Segurança de configuração

- `.env` não deve ser versionado.
- `.env.example` contém nomes e exemplos não secretos.
- chaves não devem aparecer em logs, erros, screenshots ou testes.
- frontend nunca recebe `GEMINI_API_KEY`.
- rotação e armazenamento de segredos em produção permanecem por definir.

Fonte: [Instalação e Execução](../modulo-guia-turista-inteligente.md#5-instalacao-e-execucao).

