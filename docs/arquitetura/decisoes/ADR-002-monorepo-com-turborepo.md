# ADR-002 — Monorepo com Turborepo

- **Status:** aceita
- **Data:** 2026-10-24
- **Escopo:** organização do repositório e automação de tarefas

## Contexto

A fonte descreve backend e frontend como projetos independentes para garantir separação de responsabilidades. Independência arquitetural não exige repositórios Git diferentes. Manter dois repositórios aumentaria o custo de coordenar mudanças de contrato, testes integrados, documentação e versões compatíveis.

O projeto precisa preservar fronteiras claras entre FastAPI e React, mas permitir evolução atômica das duas aplicações em uma única pull request.

## Decisão

O Guia do Turista Inteligente será mantido em um único **monorepo**, usando:

- npm workspaces para descoberta dos pacotes;
- Turborepo para orquestração, dependências, cache e execução paralela de tarefas;
- `app/backend` para a API FastAPI;
- `app/frontend` para a SPA React 19 + TypeScript + Vite+;
- pacotes compartilhados só serão adicionados quando existir consumo real em mais de um workspace.

Estrutura-alvo:

```text
guia-turista-inteligente-II/
├── app/
│   ├── backend/             # FastAPI, Python, pytest, Ruff e Mypy
│   └── frontend/            # React 19, TypeScript e Vite+
├── docs/                    # especificação e ADRs
├── package.json             # workspaces e comandos globais
├── package-lock.json        # lockfile único do ecossistema npm
└── turbo.json               # grafo e cache das tarefas
```

## Contrato de tarefas

Cada aplicação deve oferecer, quando aplicável, scripts com nomes consistentes:

| Tarefa | Frontend | Backend |
| --- | --- | --- |
| `dev` | `vp dev` | Uvicorn com reload |
| `check` | `vp check` | Ruff + Mypy |
| `lint` | `vp check` ou `vp lint` | Ruff |
| `test` | `vp test` | pytest |
| `build` | `vp build` | validação/empacotamento definido para a API |
| `clean` | artefatos Vite/Vitest | caches e artefatos Python |

O backend continuará gerenciado por Python. Seu `package.json` será apenas um adaptador de tarefas para o Turbo; dependências Python permanecerão no mecanismo Python adotado pelo projeto.

## Estado de transição

O monólito Flask e seus módulos síncronos de serviço foram retirados do runtime. A
SPA React em `app/frontend` e a API FastAPI em `app/backend` são executadas como
workspaces independentes e orquestradas pelo Turborepo.

## Consequências positivas

- mudanças de contrato entre frontend e backend podem ser atômicas;
- documentação, CI e lockfiles ficam centralizados;
- tarefas independentes podem executar em paralelo;
- cache local/remoto pode reduzir tempo de validação;
- filtros permitem trabalhar em apenas uma aplicação quando necessário;
- não há necessidade de sincronizar versões entre dois repositórios.

## Custos e riscos

- o grafo de tarefas precisa refletir dependências reais para evitar cache incorreto;
- segredos e variáveis de ambiente não podem entrar nos artefatos de cache;
- o wrapper npm do backend não substitui a gestão de ambiente Python;
- mudanças no lockfile npm podem afetar múltiplos workspaces;
- pacotes compartilhados indevidos podem acoplar frontend e backend.

## Regras

1. Backend e frontend permanecem executáveis e implantáveis separadamente.
2. Código de negócio do backend não deve ser transferido para `packages` apenas para “compartilhar”.
3. Toda tarefa cacheável deve declarar seus artefatos em `turbo.json`.
4. Tarefas persistentes de desenvolvimento não usam cache.
5. Segredos nunca são declarados como saída ou incluídos em artefatos versionados.
6. A versão do Turbo é fixada como dependência de desenvolvimento na raiz.
7. O lockfile npm da raiz é a fonte única para workspaces JavaScript/TypeScript.

## Referência

- [Adicionar Turborepo a um repositório existente](https://turborepo.com/docs/getting-started/add-to-existing-repository)
- [Estruturar um repositório](https://turborepo.com/docs/crafting-your-repository/structuring-a-repository)

