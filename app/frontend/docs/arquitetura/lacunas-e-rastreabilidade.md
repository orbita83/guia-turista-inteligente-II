# Lacunas, rastreabilidade e fontes

## Rastreabilidade técnica

| Capacidade | Contratos | Requisitos/aceite principais | Evidência frontend esperada |
| --- | --- | --- | --- |
| Sessão/identidade | `API-AUT-001` | `RF-AUT-001–006`, `RNF-AUT-001–004`, `CA-AUT-001–003` | testes de troca, TTL, logout e isolamento |
| Planejamento | `API-PLN-001` | `RF-PLN-001–007`, `CA-PLN-001–005` | formulário, validação, loading e conflito |
| Mapa/relevo | `API-MAP-001` | `RF-MAP-001–005`, `CA-MAP-001–003` | mapa e troca atômica de alternativa |
| Custos/autonomia | `API-CST-001` | `RF-CST-001–005`, `CA-CST-001` | unidades, rateio 1–8 e rota ativa |
| Guia | `API-GUI-001` | `RF-GUI-001–005`, `CA-GUI-001–003` | parser SSE e renderização progressiva |
| Visitas/histórico | `API-HIS-001–003` | `RF-GUI-006`, `RF-HIS-001–003`, `CA-HIS-001–002` | isolamento e atualização sem reload |
| Exportação | `API-EXP-001–002` | `RF-EXP-001–004`, `CA-EXP-001–002` | links codificados, arquivo e rota atual |
| Telemetria | `API-TEL-001–002`, `API-OPS-001–002` | `RF-TEL-001–005`, `CA-TEL-001–002` | headers e tempos apresentados corretamente |
| Qualidade/ops | — | `RNF-OPS-004,006–009`, `CA-OPS-001–004` | gates Vite+/Turbo e evidência de build |
| Acessibilidade | — | `RNF-UX-001–006`, `CA-PLN-004–005` | teclado, foco, contraste, rede e GPS negado |

## Requisitos globais fora do escopo migrado

Os itens abaixo referem-se a capacidades futuras que não existiam no monólito
migrado. Eles não bloqueiam nem devem ser implementados como parte da reorganização
atual:

1. estabilizar schemas Pydantic/OpenAPI de entrada e saída, inclusive unidades,
   nullable/opcional e respostas parciais;
2. definir métodos e payloads de custos, GPX, compartilhamento, autenticação e
   telemetria;
3. definir modelo verificável de autenticação/autorização para `X-User-Id`;
4. definir envelope de erro, erros SSE e mapeamento de falhas/degradação por provedor;
5. definir paginação/ordem do histórico e payload de visitas;
6. definir nomes de variáveis Vite e `.env.example` do frontend;
7. definir timeout, retry/backoff, limite de stream e política de cancelamento;
8. definir browsers, dispositivos assistivos e matriz responsiva suportada;
9. definir hospedagem, proxy SSE, HTTPS/CORS/CSP e pipeline de publicação;
10. definir cobertura, E2E, auditoria de acessibilidade e ambiente de desempenho;
11. decidir se o manifesto implica PWA/offline real;
12. revisar esta lista quando uma futura etapa de produto for autorizada.

Lacunas não bloqueantes para o esqueleto, mas necessárias para homologação: política
de privacidade/retenção, conteúdo permitido no compartilhamento, SLOs/alertas,
metodologia das metas de latência e comportamento por provedor indisponível.

## Fontes consolidadas

- [Visão geral da arquitetura](../../../../docs/arquitetura/visao-geral.md)
- [Arquitetura do frontend](../../../../docs/arquitetura/frontend.md)
- [Arquitetura do backend](../../../../docs/arquitetura/backend.md)
- [Integrações externas](../../../../docs/arquitetura/integracoes.md)
- [Assincronicidade e resiliência](../../../../docs/arquitetura/assincronicidade-e-resiliencia.md)
- [ADR-001 — TypeScript e Vite+](../../../../docs/arquitetura/decisoes/ADR-001-typescript-e-vite-plus.md)
- [ADR-002 — Monorepo com Turborepo](../../../../docs/arquitetura/decisoes/ADR-002-monorepo-com-turborepo.md)
- [Contratos da API](../../../../docs/api/contratos.md)
- [Erros e idempotência](../../../../docs/api/erros-e-idempotencia.md)
- [Critérios de aceite](../../../../docs/qualidade/criterios-de-aceite.md)
- [Estratégia de testes](../../../../docs/qualidade/estrategia-de-testes.md)
- [Observabilidade](../../../../docs/qualidade/observabilidade.md)
- [Ambiente e configuração](../../../../docs/operacao/ambiente-e-configuracao.md)
- [Execução e runbook](../../../../docs/operacao/execucao-e-runbook.md)
- [Roadmap](../../../../docs/planejamento/roadmap.md)
- [Responsabilidades](../../../../docs/planejamento/responsabilidades.md)
- [Matriz de rastreabilidade](../../../../docs/planejamento/matriz-de-rastreabilidade.md)
- [Requisitos não funcionais](../../../../docs/produto/requisitos-nao-funcionais.md)
- Código/configuração atual: `package.json`, `turbo.json`, `vite.config.ts`,
  `tsconfig.json`, `app/backend/**` e `app/frontend/**`.
