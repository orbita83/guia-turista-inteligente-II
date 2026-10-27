# Plano de entrega do frontend

Este plano transforma os requisitos globais em incrementos verticais verificáveis.
Ele não é estimativa de calendário. Os estados **Fonte**, **Derivado**, **Decisão
aprovada**, **Proposto** e **Questão em aberto** seguem a legenda do [índice](./README.md).

## Estado do workspace

Em 25/10/2026, os fluxos existentes do monolito foram migrados para o workspace
React e integrados aos contratos JSON do backend reorganizado. A tabela abaixo e
referencia para modulos futuros descritos na arquitetura global; ela nao autoriza
implementar esses recursos no escopo atual de reorganizacao.

### Incremento concluído: painel de telemetria

A parte visual de `UC-TEL-001` foi implementada no frontend com os contratos já
disponíveis. Ela cobre `RF-TEL-001`–`003`, diferencia tempo do servidor e tempo do
cliente, apresenta correlação mascarada, quatro provedores e isolamento por sessão.
Não altera o backend e não promove `API-TEL-001` a contrato atual.

Os sinais ausentes no contrato vigente — processamento interno, rede externa, RTT,
uptime, conexões, totais sistêmicos, elevação e duração por provedor — permanecem
indisponíveis. A disponibilidade mostrada é sempre relativa à última operação, e
não monitoramento em tempo real.

Na tela autenticada, formulário e telemetria compartilham uma faixa: o formulário
fica à esquerda e o `aside` do painel à direita a partir de 1024 px. Antes da
primeira tentativa, não há coluna reservada; abaixo desse breakpoint, formulário e
telemetria são empilhados nessa ordem.

## Ordem de implementacao

| Etapa | Entrega frontend | Dependências | Rastreabilidade principal |
| --- | --- | --- | --- |
| 0 | Tipos de fronteira, configuração, cliente HTTP e fixtures contratuais | schemas/OpenAPI estabilizados | `RNF-OPS-001`, `004`, `007`–`009`; `API-*` |
| 1 | Shell semântico, tokens, temas, Error Boundary, toasts e estado de rede | identidade visual e matriz de navegadores | `RNF-UX-001`–`006`; `CA-PLN-004` |
| 2 | Formulário de planejamento, validação, GPS opcional e bloqueio de reenvio | contrato de planejamento e catálogo de cidades | `RF-PLN-001`–`004`, `007`; `CA-PLN-001`, `002`, `005` |
| 3 | Resultado básico: telemetria, clima e conteúdo estruturado | resposta de planejamento estável | `RF-GUI-001`, `005`; `RF-TEL-001`–`003`; `CA-PLN-003`, `CA-TEL-001` |
| 4 | Leaflet, rotas alternativas, autonomia, paradas, custos e altimetria | contratos de mapa/custos | `RF-MAP-*`, `RF-CST-*`; `CA-MAP-*`, `CA-CST-001` |
| 5 | Google/visitante, expiração e histórico isolado | endpoints de autenticação e histórico | `RF-AUT-*`, `RF-HIS-*`; `CA-AUT-*`, `CA-HIS-*` |
| 6 | Streaming do guia, atrações visitadas, Maps, WhatsApp e GPX | SSE e endpoints de exportação estáveis | `RF-GUI-002`–`006`, `RF-EXP-*`; `CA-GUI-*`, `CA-EXP-*` |
| 7 | Hardening, acessibilidade, desempenho e evidências de homologação | ambiente integrado | `RNF-DES-*`, `RNF-TEL-*`, `CA-DES-*`, `CA-OPS-*` |

Cada etapa deve entregar uma fatia utilizável com estados inicial, carregando,
parcial quando aplicável, vazio, sucesso, erro recuperável e offline quando a ação
depender de rede.

## Estrutura-alvo

```text
src/
├── assets/
├── components/
│   ├── Header.tsx
│   ├── RoteiroForm.tsx
│   ├── MapaRota.tsx
│   ├── RoteiroResult.tsx
│   ├── TelemetriaCard.tsx
│   ├── HistoricoViagens.tsx
│   ├── BotoesControleViagem.tsx
│   ├── ErrorBoundary.tsx
│   ├── Toast.tsx
│   └── Footer.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useTheme.ts
│   ├── useToasts.ts
│   ├── useNetworkStatus.ts
│   ├── useSessionTimer.ts
│   └── useViagem.ts
├── services/
│   ├── api.ts
│   ├── geolocation.ts
│   └── visitanteStorage.ts
├── types/schemas.ts
├── App.tsx
├── config.ts
├── index.css
└── main.tsx
```

A árvore é uma referência aprovada de responsabilidades, não autorização para criar
abstrações vazias. Componentes adicionais devem nascer de comportamento real e
preservar a separação entre apresentação, estado, transporte e contratos.

## Gates por incremento

Antes de concluir qualquer etapa:

- todos os dados externos são tipados e validados na fronteira; não há `any` não
  justificado nos fluxos principais;
- sucesso, validação, indisponibilidade, vazio e repetição são cobertos conforme o
  risco da capacidade;
- requisições antigas não sobrescrevem a viagem ativa e recursos de rede são
  encerrados ao desmontar/trocar o fluxo;
- controles possuem nome acessível, foco visível, operação por teclado e feedback
  não dependente apenas de cor;
- layout funciona nos tamanhos acordados sem perda de conteúdo e preserva zoom;
- mensagens dizem o que ocorreu e a ação possível, sem expor exceções internas;
- testes citam os IDs de requisito/aceite cobertos;
- `npm run check`, `npm test` e `npm run build` passam no workspace do frontend.

## Definition of Done do frontend

O frontend estará concluído quando:

- todas as jornadas `UC-AUT-001`, `UC-PLN-001`–`002`, `UC-MAP-001`,
  `UC-GUI-001`–`002`, `UC-HIS-001`, `UC-EXP-001` e a parte visual de
  `UC-TEL-001` funcionarem com contratos reais;
- critérios `CA-AUT-*`, `CA-PLN-*`, `CA-MAP-*`, `CA-CST-*`, `CA-GUI-*`,
  `CA-HIS-*`, `CA-EXP-*`, `CA-TEL-001` e os gates frontend de `CA-OPS-*`
  tiverem teste automatizado ou evidência manual reproduzível;
- troca de identidade limpar dados da sessão anterior, e histórico/alterações
  permanecerem isolados pelo usuário ativo;
- troca da rota atualizar de forma coerente geometria, duração, custos, autonomia,
  paradas e altimetria;
- o guia anexar chunks em ordem, preservar Unicode, reconhecer `done: true`, tratar
  interrupção e nunca permanecer carregando indefinidamente;
- os temas claro/escuro e todos os estados críticos atingirem a meta WCAG 2.1 AA;
- o usuário conseguir planejar manualmente após negar geolocalização;
- telemetria diferenciar tempo do servidor (`X-Process-Time`) do tempo total do
  cliente e expor o identificador de correlação de modo seguro;
- não houver segredo em variáveis `VITE_*`, bundle, fixtures, logs ou mensagens;
- a aplicação puder ser executada e construída isoladamente e pelo Turborepo.

## Decisões que bloqueiam implementação definitiva

| Prioridade | Decisão pendente | Impacto no frontend |
| --- | --- | --- |
| Bloqueante | Schemas completos de planejamento, mapa, custos, histórico e autenticação | tipos, formulários, adapters e testes contratuais |
| Bloqueante | Métodos/caminhos finais de custos, GPX, compartilhamento, autenticação e telemetria | cliente HTTP e fluxos de ação |
| Bloqueante | Modelo confiável de autenticação/autorização além de `X-User-Id` | sessão, headers e isolamento de dados |
| Bloqueante | Domínios e limites de dias, perfil, veículo e passageiros | validação, controles e mensagens |
| Alta | Interpretação do limiar de `400 km` | sugestões por geolocalização |
| Alta | Semântica de respostas parciais/fallback por provedor | estados degradados e conteúdo disponível |
| Alta | Envelope seguro de erro, inclusive SSE | mensagens, repetição e encerramento de stream |
| Alta | Arredondamento, moedas, unidades e fórmulas de custos/emissões | apresentação e consistência dos cálculos |
| Alta | Política de expiração, retenção e exclusão total de dados | sessão, histórico e privacidade |
| Média | Navegadores, breakpoints e dispositivos assistivos suportados | matriz de homologação |
| Média | Timeouts, repetição, backoff e política de cancelamento no cliente | resiliência e UX |
| Média | Escopo real de PWA/offline | manifesto, cache e comunicação de conectividade |
| Média | Ambiente, percentil e carga para metas de 1.000 ms/300 ms | testes de desempenho e telemetria |

Enquanto uma decisão estiver pendente, podem ser construídos shell, adapters e
fixtures explicitamente provisórios, mas o comportamento não deve ser promovido a
contrato final.

## Evidência de homologação

Para cada jornada, o PR deve trazer:

1. IDs `RF`/`RN`/`RNF` e `CA` atendidos;
2. teste unitário/de componente e, quando necessário, contrato ou E2E;
3. captura ou gravação dos estados visualmente relevantes;
4. verificação de teclado, foco, contraste e alternativa textual para mapa/gráficos;
5. payload de fixture sem dados pessoais e indicação do contrato usado;
6. registro de limitações, fallback e decisão de aceite para falhas conhecidas.

## Responsabilidade de manutenção

O frontend não duplica regras autoritativas do backend: ele antecipa validações para
usabilidade e interpreta contratos. Mudanças em endpoint, payload, regra ou estado de
falha exigem atualização coordenada da documentação global, deste pacote, dos tipos,
fixtures e testes.
