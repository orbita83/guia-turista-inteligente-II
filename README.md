# 🇧🇷 Guia do Turista Inteligente (Flask + HTTPX + Google Auth + Gemini AI)

Aplicação web desenvolvida com o microframework **Flask** e Python moderno para orquestração de APIs externas com autenticação via **Google Identity Services (OAuth JWT)**, gerando roteiros de viagem com dados meteorológicos, cálculo de percurso rodoviário e guia turístico & culinário com inteligência artificial.

## 📚 Documentação de engenharia

A especificação modular para a evolução do projeto está em [`docs/README.md`](docs/README.md). Ela organiza visão de produto, requisitos, regras de negócio, arquitetura-alvo FastAPI + React, contratos de API, critérios de aceite, operação e roadmap de migração.

O projeto será evoluído como **monorepo Turborepo**, com a API em `app/backend` e a SPA React 19 + TypeScript + Vite+ em `app/frontend`. O monólito Flask atual permanece temporariamente na raiz durante a migração incremental.

---

## 🚀 Como Executar o Projeto Localmente

### 1. Clonar o Repositório e Acessar a Pasta

```bash
git clone https://github.com/maykolsampaio/guia-turista-inteligente.git
cd guia-turista-inteligente
```

---

## 2. Criar e Ativar o Ambiente Virtual (`.venv`)

=== "Linux / macOS"
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate
    ```

=== "Windows (PowerShell)"
    ```powershell
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    ```

---

### 3. Instalar as Dependências

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

---

### 4. Configurar as Chaves e Variáveis de Ambiente

Configure as variáveis no seu terminal:

Você também pode preencher `GEMINI_API_KEY` no arquivo `.env` na raiz do
projeto. Se ele não existir, copie `.env.example` para `.env`. O arquivo é
carregado automaticamente por `config.py` e ignorado pelo Git. Variáveis já
definidas no terminal têm prioridade sobre o `.env`. Reinicie a aplicação
depois de alterar a chave.

Para priorizar a geração pela IA, a espera padrão agora é de 60 segundos.
Ela pode ser ajustada no `.env` com `GEMINI_TIMEOUT_SEGUNDOS=60` (até 120).
Use `GEMINI_TIMEOUT_SEGUNDOS=6` para reproduzir o limite original da issue #1.
O timeout HTTP nunca é inferior a 10 segundos, mínimo exigido pelo provedor.
Em caso de erro ou de espera esgotada, o módulo continua retornando contingência.

=== "Linux / macOS"
    ```bash
    export GEMINI_API_KEY="SUA_CHAVE_GEMINI_AQUI"
    export GOOGLE_CLIENT_ID="776335673676-dk7od4ljhh43bio4bppf94i8ou0u9v9i.apps.googleusercontent.com"
    export PORT="8001"
    ```

=== "Windows (PowerShell)"
    ```powershell
    $env:GEMINI_API_KEY="SUA_CHAVE_GEMINI_AQUI"
    $env:GOOGLE_CLIENT_ID="776335673676-dk7od4ljhh43bio4bppf94i8ou0u9v9i.apps.googleusercontent.com"
    $env:PORT="8001"
    ```

> **Obtenção da Chave Gemini:** Acesse o [Google AI Studio](https://aistudio.google.com/), crie sua chave e defina na variável `GEMINI_API_KEY`.

---

### 5. Iniciar o Servidor Flask

```bash
python app.py
```

Acesse a aplicação no navegador em:  
👉 **`http://localhost:8001`**

---

## 📂 Estrutura do Projeto

```text
├── app.py                 # [A IMPLEMENTAR] Aplicação Flask (Autenticação Google no Python com Sessão, SSR e Rotas)
├── config.py              # Constantes, UFs do Brasil, Client ID do Google e variáveis de ambiente
├── services.py            # [A IMPLEMENTAR] Integrações com APIs externas via HTTPX (Open-Meteo, OSRM e validação de token Google OAuth)
├── planejamento.py        # [A IMPLEMENTAR] Módulo de IA Gemini para geração de guia turístico e gastronomia
├── templates/
│   └── index.html         # Frontend Server-Side Rendering (Jinja2, Google Login URI, Cards e Accordion)
├── static/
│   ├── css/style.css      # Estilização responsiva em CSS
│   ├── js/app.js          # Comportamento de interface (Accordion e bloqueio de cliques)
│   └── data/
│       ├── estados_brasil.json # Mapeamento oficial das 27 UFs do Brasil
│       └── viagens.json        # Persistência em JSON dos roteiros dos usuários logados
├── requirements.txt       # Lista de dependências Python
└── README.md              # Documentação e instruções de execução
```

---

## 🧪 Qualidade de Código e Linter

### Atalhos de testes e demonstrações (pytest + Taskipy)

Os testes automatizados ficam em `tests/`. As demonstrações manuais ficam em
`scripts/testar.py`, executado pelos atalhos abaixo ou por `python -m scripts.testar`.

Na raiz do projeto, ative o ambiente e instale as dependências:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
task --list
```

| Comando | Resultado |
| --- | --- |
| `task test` | Todos os testes automatizados, sem rede nem chave real |
| `task test-ia` | Testes automatizados de IA e contingência |
| `task test-servicos` | Testes automatizados de clima e percurso |
| `task fallback` | Mostra o guia de contingência, sem alterar o `.env` |
| `task ia` | Mostra uma resposta real do Gemini e seu diagnóstico |
| `task clima` | Consulta o clima real em Recife |
| `task percurso` | Consulta uma rota real de Recife a João Pessoa |
| `task demo` | Executa as quatro demonstrações acima de uma vez |
| `task lint` / `task tipos` | Ruff / Mypy do projeto inteiro |

Exemplos:

```powershell
task ia --destino "Olinda, PE"
task fallback --destino "Natal, RN"
task clima --lat -8.05 --lon -34.9
task percurso --lat -8.05 --lon -34.9 --lat-d -3.85 --lon-d -32.42
task test -v
```

O texto de `--destino` é usado apenas pela IA; clima e percurso usam as
coordenadas numéricas. `task ia` e `task demo` leem a chave do `.env`, podem
consumir cota e esperam até o timeout configurado. As demonstrações retornam
código 1 quando um serviço real cai na contingência; `task fallback` retorna
0, pois nesse comando a contingência é o resultado esperado. `task demo`
continua mostrando os demais serviços mesmo se algum retornar contingência.
Os testes automatizados usam fixtures, parametrização e mocks, com acesso
HTTP real bloqueado. Os cenários anteriores foram reaproveitados.

Ruff e Mypy ainda apontam as pendências preexistentes dos outros alunos;
os atalhos mostram essas falhas sem ocultá-las.

Para validar o código com as ferramentas da disciplina:

```bash
# Formatação e checagem de boas práticas (PEP 8)
ruff check . --fix

# Checagem estática de tipos (Type Hints)
mypy app.py services.py planejamento.py config.py
```
