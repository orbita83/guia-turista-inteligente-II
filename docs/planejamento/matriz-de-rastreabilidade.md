# Matriz de rastreabilidade

## Finalidade

Esta matriz conecta necessidades de produto, regras, atributos de qualidade, casos de uso, contratos, aceite e fases de implementação. Ela deve ser atualizada sempre que um identificador for incluído, alterado ou removido.

## Cobertura por capacidade

| Capacidade | Requisitos funcionais | Regras de negócio | Requisitos não funcionais | Casos de uso | Contratos | Critérios de aceite | Roadmap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Autenticação e sessão | `RF-AUT-001`–`006` | `RN-AUT-001`–`005` | `RNF-AUT-001`–`004` | `UC-AUT-001` | `API-AUT-001` | `CA-AUT-001`–`003` | Fase 5 |
| Planejamento | `RF-PLN-001`–`007` | `RN-PLN-001`–`007` | `RNF-DES-001`–`005`, `RNF-OPS-001`–`002` | `UC-PLN-001`–`002` | `API-PLN-001` | `CA-PLN-001`–`005`, `CA-DES-001` | Fase 3 |
| Mapa, rota e relevo | `RF-MAP-001`–`005` | `RN-MAP-001`–`003` | `RNF-DES-009` | `UC-MAP-001` | `API-MAP-001` | `CA-MAP-001`–`003` | Fase 4 |
| Custos e autonomia | `RF-CST-001`–`005` | `RN-CST-001`–`005` | — | `UC-MAP-001` | `API-CST-001` | `CA-CST-001` | Fase 4 |
| Guia, clima e atrações | `RF-GUI-001`–`006` | `RN-GUI-001`–`007` | `RNF-DES-004`, `006`, `009` | `UC-GUI-001`–`002` | `API-GUI-001`, `API-HIS-003` | `CA-GUI-001`–`003`, `CA-DES-002` | Fase 3 e Fase 6 |
| Histórico | UI `RF-HIS-001`–`003` implementada no frontend | `RN-HIS-001`–`004` conforme contratos vigentes | UX coberta por testes frontend; persistência/isolamento server-side fora desta entrega | `UC-HIS-001` | `API-HIS-*` são dependências existentes, sem alteração | `CA-HIS-001`–`002` cobertos na UI conforme sinais disponíveis | Fase 5 |
| Exportação e compartilhamento | `RF-EXP-001`–`004` | `RN-EXP-001`–`002` | `RNF-DES-006` | `UC-EXP-001` | `API-EXP-001`–`002` | `CA-EXP-001`–`002` | Fase 6 |
| Telemetria | `RF-TEL-001`–`003` implementados no frontend; `004`–`005` operacionais | — | `RNF-TEL-001`, `004` cobertos no painel; `002`–`003`, `005` operacionais | `UC-TEL-001` | headers atuais de `API-PLN-001`; `API-TEL-001`–`002` futuros; `API-OPS-001`–`002` | `CA-TEL-001` implementado no frontend; `CA-TEL-002` operacional | Fase 3 e Fase 7 |
| Concorrência e resiliência | `RF-PLN-005`–`007` | `RN-DES-001`–`005` | `RNF-DES-001`–`009` | `UC-PLN-001` | `API-PLN-001` | `CA-PLN-002`, `CA-DES-001`–`003` | Fase 2, Fase 3 e Fase 7 |
| Operação e qualidade | `RF-TEL-004`–`005` | — | `RNF-OPS-003`–`009`, `RNF-UX-001`–`006` | — | `API-OPS-001`–`002` | `CA-OPS-001`–`004`, `CA-PLN-004` | Fase 1 e Fase 7 |

Na integração atual, `API-PLN-001` fornece geometria e alternativas, altimetria,
autonomia, paradas projetadas e custos parciais por rota; `API-HIS-003` persiste
visitas para a identidade ativa. `CA-MAP-001` e a exibição de `CA-PLN-003` são
cobertos pelos testes de mapa e contrato; `CA-CST-001` permanece parcial enquanto
não houver fonte de pedágios. Pontos projetados não são postos confirmados e não
há fator validado para efeito do relevo no consumo (`CA-MAP-003`). Verificações em
`test_http_api.py`, `apiGeometry.test.ts` e `MapaRota.test.tsx` usam provedores
controlados; elas não substituem validação visual da SPA em execução.

## Documentos de evidência

| Evidência | Documento |
| --- | --- |
| Escopo e atores | [Visão e escopo](../produto/visao-e-escopo.md) |
| Comportamentos esperados | [Requisitos funcionais](../produto/requisitos-funcionais.md) |
| Atributos de qualidade | [Requisitos não funcionais](../produto/requisitos-nao-funcionais.md) |
| Restrições do domínio | [Regras de negócio](../produto/regras-de-negocio.md) |
| Jornadas | [Casos de uso](../produto/casos-de-uso.md) |
| Fronteiras técnicas | [Visão de arquitetura](../arquitetura/visao-geral.md) |
| Interface HTTP | [Contratos da API](../api/contratos.md) |
| Comportamentos de falha | [Erros e idempotência](../api/erros-e-idempotencia.md) |
| Verificação | [Critérios de aceite](../qualidade/criterios-de-aceite.md) |
| Estratégia executável | [Estratégia de testes](../qualidade/estrategia-de-testes.md) |
| Decisão de frontend | [ADR-001 — TypeScript e Vite+](../arquitetura/decisoes/ADR-001-typescript-e-vite-plus.md) |
| Organização do repositório | [ADR-002 — Monorepo com Turborepo](../arquitetura/decisoes/ADR-002-monorepo-com-turborepo.md) |
| Painel de telemetria frontend | [Especificação e evidências](../../specs/001-painel-telemetria/quickstart.md) |
| Histórico e persistência | [Especificação e cenários](../../specs/002-historico-viagens/quickstart.md) |

## Lacunas de cobertura conhecidas

1. Nem todo requisito funcional possui critério de aceite individual; os critérios atuais cobrem jornadas e riscos principais por capacidade.
2. `API-AUT-001`, `API-CST-001`, `API-EXP-001`, `API-EXP-002` e `API-TEL-001` ainda dependem da estabilização de métodos, caminhos ou schemas; o painel atual usa apenas os headers e o payload já existentes em `API-PLN-001`.
3. Metas de latência ainda não possuem ambiente, volume e percentis definidos; portanto não são SLOs de produção.
4. Emissões (`RF-CST-005`), estado online/offline (`RNF-UX-006`) e encerramento com `sendBeacon` (`RF-AUT-005`) precisam de critérios específicos antes da homologação final.
5. O histórico já usa exclusivamente a sessão assinada; `X-User-Id` não autentica
   nem seleciona catálogo. A evolução futura de autenticação não pode regredir esse
   isolamento.

## Regra de atualização

Uma pull request que altera comportamento público deve:

1. atualizar o requisito ou regra correspondente;
2. atualizar o contrato, se houver impacto HTTP;
3. criar ou ajustar critério de aceite e teste;
4. atualizar esta matriz e o roadmap quando a ordem de entrega mudar.

