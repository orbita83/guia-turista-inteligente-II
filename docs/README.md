# Documentação de engenharia — Guia do Turista Inteligente

Este diretório transforma a transcrição da atividade em documentação operacional para produto, arquitetura, implementação, testes e entrega.

## Fonte canônica

- [`modulo-guia-turista-inteligente.md`](./modulo-guia-turista-inteligente.md): transcrição integral usada como base.

Os documentos derivados devem preservar rastreabilidade até essa fonte. Quando uma definição não estiver explícita nela, o texto deve identificá-la como **decisão proposta**, **hipótese** ou **questão em aberto**.

## Mapa da documentação

```text
docs/
├── README.md
├── modulo-guia-turista-inteligente.md   # fonte canônica
├── produto/
│   ├── visao-e-escopo.md
│   ├── requisitos-funcionais.md
│   ├── requisitos-nao-funcionais.md
│   ├── regras-de-negocio.md
│   └── casos-de-uso.md
├── arquitetura/
│   ├── visao-geral.md
│   ├── backend.md
│   ├── frontend.md
│   ├── integracoes.md
│   ├── assincronicidade-e-resiliencia.md
│   └── decisoes/
│       ├── ADR-001-typescript-e-vite-plus.md
│       └── ADR-002-monorepo-com-turborepo.md
├── api/
│   ├── contratos.md
│   └── erros-e-idempotencia.md
├── experiencia/
│   ├── telas-e-componentes.md
│   └── sessoes-e-acessibilidade.md
├── qualidade/
│   ├── estrategia-de-testes.md
│   ├── observabilidade.md
│   └── criterios-de-aceite.md
├── operacao/
│   ├── ambiente-e-configuracao.md
│   └── execucao-e-runbook.md
└── planejamento/
    ├── roadmap.md
    ├── matriz-de-rastreabilidade.md
    └── responsabilidades.md
```

## Ordem de leitura recomendada

1. [Visão e escopo](./produto/visao-e-escopo.md)
2. [Requisitos funcionais](./produto/requisitos-funcionais.md) e [não funcionais](./produto/requisitos-nao-funcionais.md)
3. [Regras de negócio](./produto/regras-de-negocio.md) e [casos de uso](./produto/casos-de-uso.md)
4. [Visão de arquitetura](./arquitetura/visao-geral.md)
5. [Decisão de frontend: TypeScript e Vite+](./arquitetura/decisoes/ADR-001-typescript-e-vite-plus.md)
6. [Decisão de repositório: monorepo com Turborepo](./arquitetura/decisoes/ADR-002-monorepo-com-turborepo.md)
7. [Contratos da API](./api/contratos.md)
8. [Critérios de aceite](./qualidade/criterios-de-aceite.md)
9. [Roadmap](./planejamento/roadmap.md) e [matriz de rastreabilidade](./planejamento/matriz-de-rastreabilidade.md)

## Convenções

| Prefixo | Finalidade | Exemplo |
| --- | --- | --- |
| `RF` | requisito funcional | `RF-PLN-001` |
| `RNF` | requisito não funcional | `RNF-DES-001` |
| `RN` | regra de negócio | `RN-AUT-001` |
| `UC` | caso de uso | `UC-PLN-001` |
| `CA` | critério de aceite | `CA-PLN-001` |
| `API` | contrato de endpoint | `API-ROT-001` |

Domínios usados nos identificadores:

- `AUT`: autenticação e sessão;
- `PLN`: planejamento de roteiro;
- `MAP`: mapa, rota e altimetria;
- `CST`: custos, autonomia e rateio;
- `GUI`: guia de viagem e IA;
- `HIS`: histórico e persistência;
- `EXP`: exportação e compartilhamento;
- `TEL`: telemetria e observabilidade;
- `DES`: desempenho e concorrência;
- `UX`: usabilidade e acessibilidade;
- `OPS`: operação e configuração.

## Estado dos documentos

- **Fonte:** afirmação explícita na transcrição canônica.
- **Derivado:** detalhamento logicamente deduzido da fonte, sem ampliar o escopo.
- **Proposto:** decisão necessária para implementação, ainda sujeita a validação.
- **Questão em aberto:** informação ausente ou ambígua que não deve ser inventada.

## Decisões aprovadas pelo projeto

- O frontend será implementado com **React 19 + TypeScript + Vite+**.
- A equivalência funcional da atividade será preservada; referências `.js`/`.jsx` da fonte tornam-se `.ts`/`.tsx`.
- Os scripts `npm run dev`, `npm test`, `npm run lint` e `npm run build` permanecerão disponíveis como fachada compatível para a toolchain `vp`.
- Backend e frontend viverão no **mesmo monorepo**, organizados em `app/backend` e `app/frontend` e orquestrados pelo **Turborepo**.

