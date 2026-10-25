# Responsabilidades de implementação e defesa

## Origem

Esta divisão deriva da seção **6.1 — Matriz de Responsabilidades** da [fonte canônica](../modulo-guia-turista-inteligente.md). A propriedade de código facilita coordenação, mas não elimina revisão cruzada nem responsabilidade coletiva pela integração.

## Matriz

| Papel | Entregas principais | Defesa técnica esperada |
| --- | --- | --- |
| Frontend Developer | `api.ts`, `geolocation.ts`, `MapaRota.tsx`, `App.tsx`, tipos e design system | REST/SSE tipado no cliente, Haversine, Leaflet, paradas, sessão híbrida e acessibilidade |
| Backend Core Engineer | `main.py`, `/planejar`, dependências e circuit breaker | ASGI, `asyncio.gather`, pool HTTP, cancelamento, injeção de dependências e latência |
| Data & Altimetry Engineer | schemas, altimetria, postos e custos | Pydantic v2, Open-Elevation, consumo, autonomia, pedágios e rateio |
| DevOps, QA & Streaming Lead | SSE, Gemini, GPX, testes backend/frontend e métricas | `StreamingResponse`, locks, HTTP 409, Prometheus, pytest e Vitest |

## Responsabilidades compartilhadas

- Revisar contratos consumidos entre frontend e backend.
- Manter testes verdes e documentação coerente com o código.
- Proteger segredos, tokens e identificadores de usuário.
- Demonstrar degradação graciosa quando provedores externos falharem.
- Participar da revisão dos critérios de aceite antes de considerar uma entrega concluída.

## Ritos recomendados

1. **Refinamento:** selecionar requisitos e resolver questões em aberto.
2. **Contrato primeiro:** acordar payloads, erros e exemplos antes da implementação integrada.
3. **Revisão cruzada:** ao menos um responsável de outro domínio revisa cada capacidade vertical.
4. **Demonstração:** executar o cenário do usuário e apresentar evidências de teste e telemetria.
5. **Atualização documental:** registrar decisões ou divergências descobertas durante a implementação.

## Apresentação acadêmica

- A equipe dispõe de 20 a 30 minutos no total.
- Cada integrante defende o código sob sua responsabilidade.
- A avaliação é individual e considera domínio conceitual, clareza e precisão técnica.
- O resultado da equipe é a média aritmética simples das avaliações individuais.

