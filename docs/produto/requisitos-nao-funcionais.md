# Requisitos não funcionais

Os requisitos abaixo traduzem atributos de qualidade explicitados ou diretamente derivados da fonte. Números sem cenário de medição completo são tratados como metas, não como SLOs de produção.

## Desempenho e concorrência

| ID | Requisito | Evidência esperada | Estado |
| --- | --- | --- | --- |
| RNF-DES-001 | O endpoint de planejamento deve operar de forma não bloqueante sobre ASGI. | Nenhuma chamada HTTP externa síncrona no fluxo assíncrono. | Fonte |
| RNF-DES-002 | Geocodificações independentes e consultas independentes de clima/rota devem executar concorrentemente. | Teste ou instrumentação comprova sobreposição das chamadas. | Fonte |
| RNF-DES-003 | O planejamento deve responder abaixo de 1.000 ms no cenário de demonstração descrito. | Medição reproduzível registra `X-Process-Time < 1.000 ms`. | Fonte |
| RNF-DES-004 | O primeiro fragmento do guia deve ser percebido em menos de 300 ms no cenário descrito. | Medição separa tempo até primeiro evento e tempo total. | Fonte |
| RNF-DES-005 | O cliente HTTP deve ser compartilhado durante o ciclo de vida da aplicação. | Um `httpx.AsyncClient` no `app.state` reutiliza conexões. | Fonte |

Referência: [Motivação Técnica](../modulo-guia-turista-inteligente.md#11-motivação-técnica) e [Engenharia Assíncrona](../modulo-guia-turista-inteligente.md#4-engenharia-assíncrona).

## Resiliência e consistência

| ID | Requisito | Evidência esperada | Estado |
| --- | --- | --- | --- |
| RNF-DES-006 | O backend deve detectar desconexão antes e durante operações custosas. | Teste simula desconexão e confirma cancelamento sem persistência parcial. | Fonte |
| RNF-DES-007 | Solicitações simultâneas equivalentes do mesmo usuário devem ser rejeitadas com HTTP 409. | Teste concorrente recebe uma execução e um conflito. | Fonte |
| RNF-DES-008 | O bloqueio de idempotência deve sempre ser liberado, inclusive após erro. | Teste de exceção permite nova tentativa posterior. | Fonte |
| RNF-DES-009 | Integrações externas devem possuir disjuntor de circuito e degradação graciosa. | Falha repetida abre circuito; resposta/fallback ocorre sem espera integral. | Fonte |
| RNF-HIS-001 | A persistência em arquivo deve ser atômica e segura para concorrência. | Testes paralelos não corrompem o JSON. | Fonte |
| RNF-HIS-002 | Dados persistidos devem permanecer isolados por usuário. | Usuário A não lista, altera nem exclui registros de B. | Fonte |

Referência: [Idempotência e Bloqueios](../modulo-guia-turista-inteligente.md#43-idempotência-e-bloqueios), [Detecção de Desconexão](../modulo-guia-turista-inteligente.md#44-detecção-de-desconexão) e [Backend FastAPI](../modulo-guia-turista-inteligente.md#21-backend-fastapi).

## Validação, contratos e segurança

| ID | Requisito | Evidência esperada | Estado |
| --- | --- | --- | --- |
| RNF-OPS-001 | Entradas da API devem usar contratos Pydantic v2 estritos. | Payload fora dos limites retorna HTTP 422 padronizado. | Fonte |
| RNF-OPS-002 | Município deve ser sanitizado e UF validada com duas letras maiúsculas. | Casos inválidos são recusados; entrada normalizável é normalizada conforme decisão de contrato. | Fonte |
| RNF-AUT-001 | Token Google deve ser validado com o provedor antes de estabelecer identidade autenticada. | Token adulterado, expirado ou de audiência incorreta é recusado. | Fonte |
| RNF-AUT-002 | Configurações sensíveis devem vir de variáveis de ambiente e não do código-fonte. | `GEMINI_API_KEY` e `GOOGLE_CLIENT_ID` não estão versionados como segredos. | Fonte |
| RNF-AUT-003 | CORS deve permitir apenas as origens de frontend configuradas. | Origem autorizada funciona; origem não autorizada não recebe permissão CORS. | Fonte |
| RNF-AUT-004 | O sistema deve definir proteção verificável para a identidade transmitida em `X-User-Id`. | Modelo de confiança documentado e testes de autorização. | Proposto |

Referência: [Motivação Técnica](../modulo-guia-turista-inteligente.md#11-motivação-técnica), [Backend FastAPI](../modulo-guia-turista-inteligente.md#21-backend-fastapi) e [Instalação](../modulo-guia-turista-inteligente.md#5-instalação-e-execução).

## Usabilidade e acessibilidade

| ID | Requisito | Evidência esperada | Estado |
| --- | --- | --- | --- |
| RNF-UX-001 | A interface deve buscar conformidade WCAG 2.1 AA. | Auditoria automática e manual cobre contraste, teclado, foco, nomes e estados. | Fonte |
| RNF-UX-002 | A interface deve ser responsiva e usar HTML semântico. | Fluxos principais funcionam na matriz de tamanhos definida. | Fonte |
| RNF-UX-003 | Temas claro e escuro devem ser persistidos. | A preferência permanece após recarregar a página. | Fonte |
| RNF-UX-004 | Falhas de renderização devem ser contidas por uma barreira de erro. | Erro em componente não desmonta toda a aplicação. | Fonte |
| RNF-UX-005 | Notificações devem fornecer feedback acessível. | Toasts expõem mensagem e semântica para tecnologia assistiva. | Fonte |
| RNF-UX-006 | O aplicativo deve comunicar estado online/offline. | Mudanças de rede atualizam a interface sem recarga. | Fonte |

Referência: [Frontend React 19](../modulo-guia-turista-inteligente.md#22-frontend-react-19) e [Telas e Componentes](../modulo-guia-turista-inteligente.md#3-telas-e-componentes).

## Observabilidade e operabilidade

| ID | Requisito | Evidência esperada | Estado |
| --- | --- | --- | --- |
| RNF-TEL-001 | Logs devem ser estruturados e correlacionáveis por `X-Request-ID`. | Consulta por ID recupera os eventos do mesmo fluxo. | Fonte |
| RNF-TEL-002 | Métricas devem usar formato compatível com Prometheus/OpenMetrics. | Coletor interpreta `/metrics` sem erro. | Fonte |
| RNF-TEL-003 | Saúde e prontidão devem ser verificadas separadamente. | `healthz` indica processo vivo; `readyz` considera dependências necessárias. | Derivado |
| RNF-TEL-004 | O sistema deve medir separadamente latência do servidor e tempo percebido no cliente. | Telemetria apresenta ambos sem confundi-los. | Fonte |
| RNF-TEL-005 | A documentação OpenAPI deve permanecer coerente com os contratos executáveis. | Teste gera esquema e valida rotas/modelos publicados. | Derivado |

Referência: [Telemetria e Desempenho](../modulo-guia-turista-inteligente.md#32-telemetria-e-desempenho) e [Instalação e Execução](../modulo-guia-turista-inteligente.md#5-instalação-e-execução).

## Manutenibilidade e qualidade

| ID | Requisito | Evidência esperada | Estado |
| --- | --- | --- | --- |
| RNF-OPS-003 | Backend deve separar infraestrutura, rotas, schemas e serviços. | Dependências respeitam a estrutura descrita e não criam ciclos indevidos. | Fonte |
| RNF-OPS-004 | Frontend deve separar componentes, hooks, serviços, tipos e configuração. | Lógica reutilizável não fica duplicada em componentes. | Fonte |
| RNF-OPS-005 | Backend deve possuir testes automatizados com pytest. | Suíte executa sem falhas no ambiente documentado. | Fonte |
| RNF-OPS-006 | Frontend deve possuir testes com Vitest e verificação estática com oxlint. | `npm test` e `npm run lint` terminam com sucesso. | Fonte |
| RNF-OPS-007 | O frontend deve usar TypeScript em modo estrito, sem `any` não justificado nas fronteiras principais. | `vp check` conclui a verificação de tipos e análise estática sem erros. | Decisão aprovada |
| RNF-OPS-008 | O frontend deve usar Vite+ como toolchain, preservando comandos npm compatíveis com a atividade. | `npm run dev`, `npm test`, `npm run lint` e `npm run build` delegam para comandos `vp` e funcionam. | Decisão aprovada |
| RNF-OPS-009 | Backend e frontend devem permanecer no mesmo monorepo e expor tarefas padronizadas ao Turborepo sem perder execução e implantação independentes. | A raiz npm workspace descobre `app/*`; o Turbo executa ou filtra tarefas por aplicação usando um único lockfile npm. | Decisão aprovada |

Referência: [Estrutura dos Projetos](../modulo-guia-turista-inteligente.md#2-estrutura-dos-projetos) e [Instalação e Execução](../modulo-guia-turista-inteligente.md#5-instalação-e-execução).

Decisão complementar: [ADR-001 — TypeScript e Vite+](../arquitetura/decisoes/ADR-001-typescript-e-vite-plus.md).

Organização complementar: [ADR-002 — Monorepo com Turborepo](../arquitetura/decisoes/ADR-002-monorepo-com-turborepo.md).

## Critérios ainda não definidos

- percentil, volume, simultaneidade e ambiente das metas de latência;
- disponibilidade, taxa de erro, recuperação e janela de observação;
- limites de timeout, repetição, cache e abertura/fechamento dos circuit breakers;
- política de privacidade, retenção, exclusão e criptografia de dados;
- versões mínimas de navegador e dispositivos assistivos suportados;
- cobertura mínima de testes e política de qualidade para integração contínua.

