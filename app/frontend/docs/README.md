# Documentação do frontend

Este diretório é o recorte operacional de tudo o que o frontend precisa para ser
implementado e considerado concluído. A documentação global em [`docs/`](../../../docs/README.md)
continua sendo a fonte de verdade; este material a organiza pela perspectiva da SPA.

## Como usar

Leia nesta ordem:

1. [`01-produto-e-experiencia.md`](./01-produto-e-experiencia.md) — escopo, jornadas,
   telas, componentes, estados, acessibilidade e regras visíveis na interface.
2. [`02-arquitetura-integracoes-e-qualidade.md`](./02-arquitetura-integracoes-e-qualidade.md)
   — stack, contratos, estado, integrações, erros, testes, operação e qualidade.
3. [`03-plano-de-entrega.md`](./03-plano-de-entrega.md) — sequência implementável,
   gates, evidências e decisões bloqueantes.

## Regra de precedência

Em caso de divergência:

1. decisões aprovadas em ADR têm precedência sobre exemplos tecnológicos antigos;
2. contratos executáveis/OpenAPI aprovados têm precedência sobre exemplos narrativos;
3. a fonte canônica e os documentos globais identificados por `RF`, `RN`, `RNF`,
   `UC`, `API` e `CA` prevalecem sobre resumos locais;
4. itens locais marcados como **Proposto** ou **Questão em aberto** não podem ser
   tratados como requisito aprovado.

## Legenda de certeza

| Estado | Significado |
| --- | --- |
| **Fonte** | Está explicitamente descrito na documentação canônica. |
| **Derivado** | Torna a fonte implementável sem ampliar seu escopo. |
| **Decisão aprovada** | Foi formalizado por ADR ou decisão do projeto. |
| **Proposto** | É uma recomendação ainda sujeita a validação. |
| **Questão em aberto** | Falta informação; a implementação não deve inventá-la silenciosamente. |

## Escopo deste pacote

O frontend é uma SPA independente em React 19, TypeScript estrito e Vite+, servida
em desenvolvimento na porta `5173`. Ele é responsável por apresentação, estado de
interação, consumo de REST/SSE, telemetria percebida, sessão no cliente e feedback.
Validação autoritativa, regras persistentes, integrações externas, autorização e
persistência permanecem no backend.

Este pacote cobre autenticação e sessão híbrida, planejamento, mapa e alternativas,
autonomia, custos, altimetria, clima, guia progressivo, atrações, histórico,
exportação/compartilhamento, telemetria, estados degradados, responsividade,
acessibilidade, testes, build e execução.

## Fontes globais consolidadas

- `docs/produto/**`: escopo, requisitos, regras e casos de uso;
- `docs/experiencia/**`: telas, componentes, sessão e acessibilidade;
- `docs/arquitetura/**`: fronteiras, estrutura, integrações, resiliência e ADRs;
- `docs/api/**`: endpoints, payloads conhecidos, SSE, erros e idempotência;
- `docs/qualidade/**`: critérios de aceite, testes e observabilidade;
- `docs/operacao/**`: ambiente, comandos, portas e runbook;
- `docs/planejamento/**`: fases, responsabilidades e rastreabilidade;
- `docs/modulo-guia-turista-inteligente.md`: fonte canônica da atividade;
- implementação legada (`templates/` e `static/`): evidência de comportamento, sem
  precedência sobre a arquitetura aprovada.

## Atualização obrigatória

Toda mudança de comportamento público do frontend deve atualizar o requisito ou a
regra correspondente, o contrato HTTP afetado, o critério de aceite, o teste e este
recorte local. Uma capacidade só pode ser marcada como concluída quando possui
evidência executável e não apenas interface renderizada.
