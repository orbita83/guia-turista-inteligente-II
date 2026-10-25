# Estratégia de testes

> **Estado:** ferramentas e áreas são de **Fonte**; pirâmide, gates e cenários são **Derivados/Propostos**.

## Objetivos

1. Proteger os fluxos existentes de planejamento, integrações, persistência e sessões.
2. Validar contratos entre React e FastAPI.
3. Exercitar concorrência, SSE, persistência e degradação de provedores.
4. Tornar requisitos e critérios de aceite executáveis.

## Camadas

| Camada | Escopo | Ferramentas indicadas | Estado |
| --- | --- | --- | --- |
| Unitário backend | schemas, cálculos, cache, circuit breaker e serviços | `pytest` | Fonte/Derivado |
| API/componente backend | endpoints, headers, erros, concorrência e storage | `pytest` + cliente de teste | Fonte |
| Unitário frontend | hooks, services e funções puras TypeScript | `vp test` (Vitest) | Fonte + decisão aprovada |
| Componente frontend | componentes `.tsx`, formulários, mapa adaptado, resultados e histórico | `vp test` + Testing Library | Fonte + decisão aprovada |
| Contrato | payloads, respostas e sessão por cookie | testes de contrato no backend | Implementado |
| E2E | jornadas críticas em dois processos | ferramenta a decidir | Proposto |
| Não funcional | latência, acessibilidade e resiliência | ferramentas a decidir | Derivado |

## Cenários prioritários

### Planejamento e validação

- UF inválida retorna `422` e erro compreensível.
- limites de passageiros, estadia e parâmetros do veículo são respeitados.
- duas geocodificações e consultas de clima/rota são orquestradas sem serialização acidental.
- falha de um provedor segue o fallback/circuit breaker previsto.

### Concorrência e ciclo de vida

- solicitação duplicada ativa retorna `409`.
- chave de bloqueio é liberada no sucesso e na exceção.
- desconexão interrompe trabalho e evita persistência incompleta.
- pool HTTP é criado/encerrado pelo `lifespan`.

### Recursos futuros fora do escopo atual

- resposta usa `text/event-stream` e headers anti-buffering.
- chunks mantêm ordem e caractere Unicode.
- evento final contém `done: true`.
- desconexão encerra o gerador.
- erro durante geração produz término controlado.

### Frontend

- submissão bloqueada enquanto ativa.
- chunks são anexados incrementalmente.
- troca de rota mantém mapa, custos e altimetria coerentes.
- troca Google/visitante não mistura históricos.
- exclusão do histórico atualiza a tela.
- negação de geolocalização mantém entrada manual.
- temas preservam acessibilidade.

## Isolamento

- APIs externas devem ser simuladas nos testes determinísticos.
- storage deve usar diretório/arquivo temporário por teste.
- relógio deve ser controlável nos testes de TTL.
- estado global, locks e circuit breakers devem ser restaurados entre casos.
- segredos reais não entram em fixtures ou logs.

## Gates propostos

- `npm test` aprovado para backend e frontend.
- `npm run check`/`vp check` aprovado, incluindo formato, lint e tipos.
- `npm test`/`vp test` aprovado.
- `npm run build`/`vp build` aprovado.
- `npm run lint` preservado como alias compatível e aprovado.
- nenhum teste crítico ignorado sem justificativa.
- cobertura numérica só será gate após baseline aprovado; “100% de aprovação” significa testes passando, não cobertura de 100%.

## Evidência e rastreabilidade

Nomear ou anotar cada teste com os IDs `RF`, `RN`, `RNF` e `CA` relevantes. A matriz consolidada fica em `../planejamento/matriz-de-rastreabilidade.md`.

Fonte: [Execução e testes](../modulo-guia-turista-inteligente.md#5-instalacao-e-execucao) e [matriz de responsabilidades](../modulo-guia-turista-inteligente.md#61-matriz-de-responsabilidades).

