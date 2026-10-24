# Backend

Destino da API FastAPI/ASGI do monorepo.

O backend Flask atual permanece temporariamente na raiz. A migração para este diretório ocorrerá por capacidades verticais, conforme o [roadmap](../../docs/planejamento/roadmap.md), sem apagar a baseline antes da cobertura de caracterização.

O `package.json` privado deste workspace já fornece scripts de adaptação para o Turborepo orquestrar comandos Python (`dev`, `check`, `lint`, `test` e `build`) sem transformar o backend em um pacote JavaScript.

As dependências de execução estão em `requirements.txt`, as ferramentas de desenvolvimento em `requirements-dev.txt` e o ambiente validado está registrado em `requirements.lock`. O scaffold FastAPI e seus testes serão adicionados na etapa de implementação.

