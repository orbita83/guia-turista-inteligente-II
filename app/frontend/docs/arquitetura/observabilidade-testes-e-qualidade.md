# Observabilidade, testes e qualidade

## Observabilidade no frontend

### Estado implementado do painel

O frontend implementa `TelemetriaCard` sem endpoint novo, polling ou persistência.
O painel aparece desde o carregamento da identidade, com uma mensagem inicial até a
primeira tentativa. Mede o tempo total com
`performance.now()` e lê defensivamente `X-Process-Time` e `X-Request-ID` somente
na resposta de planejamento. O snapshot fica em memória e é removido antes de
login, entrada como visitante ou logout.

Na tela autenticada, formulário e telemetria compartilham uma faixa: o formulário
fica à esquerda e o `aside` do painel à direita em desktop. O `aside` é montado com
a sessão; abaixo do breakpoint desktop os blocos empilham nessa
ordem.

O quadro “Status da API” consulta o `GET /healthz` existente ao iniciar a sessão e
quando a conectividade do navegador muda. Mostra “ONLINE” apenas quando o retorno
é `{ status: "ok" }`; sem confirmação mostra estado inconclusivo. É uma verificação
pontual, não monitoramento contínuo nem indicação da saúde dos provedores.

São dados reais nesta entrega: Tempo total, Tempo da API, rota, identidade de
exibição, contagem de roteiros do usuário e evidências presentes na resposta para
Open-Meteo, OSRM e Gemini. Processamento interno, rede externa, RTT, tipo de rede,
uptime, conexões ativas, total do sistema, Open-Elevation e durações por provedor
ficam explicitamente **Indisponíveis** ou **Desconhecidos**. `navigator.onLine`
descreve apenas o indício do navegador e não a saúde da API.

`TelemetriaCard` deve apresentar, após consulta:

- usuário/identidade ativa de maneira apropriada;
- `X-Process-Time` como latência do servidor;
- tempo total medido no cliente;
- `X-Request-ID`/correlation ID mascarado e copiável quando adequado;
- estado dos quatro provedores (Open-Meteo, OSRM, Open-Elevation e Gemini), incluindo
  degradação/fallback sem prometer disponibilidade inexistente.

Medições de referência da fonte, ainda sem ambiente/metodologia aprovada:

| Sinal | Meta declarada | Tratamento |
| --- | --- | --- |
| planejamento | abaixo de 1.000 ms no cenário de demonstração | não usar como SLO de produção |
| primeiro chunk do guia | abaixo de 300 ms | medir tempo até primeiro evento |
| provedores | `4/4` quando todos operacionais | permitir estados degradados |

O cliente não deve chamar `/metrics` continuamente nem expor métricas internas sem
necessidade. Logs de navegador são auxiliares; a correlação autoritativa fica no
backend. Alertas, retenção, dashboards e SLOs permanecem pendentes.

## Estratégia de testes do frontend

### Camadas

| Camada | Escopo mínimo | Ferramenta/abordagem |
| --- | --- | --- |
| Unitária | Haversine, parsers, normalização, redutores/estados | Vitest |
| Services/hooks | headers, cancelamento, erros, buffer SSE, sessão/TTL | Vitest + mocks de Fetch/tempo |
| Componente | formulário, feedback, resultados, histórico, controles | Testing Library + user-event |
| Mapa | adaptação do Leaflet, troca de rota e marcadores | componente/adaptador simulado |
| Contrato | payloads, respostas, SSE e download GPX | fixtures aprovadas e validação runtime |
| E2E | jornadas críticas entre SPA e API | ferramenta pendente |
| Não funcional | acessibilidade, latência e resiliência | ferramentas/metodologia pendentes |

APIs externas devem ser simuladas em testes determinísticos; o frontend deve simular
sua API, não Open-Meteo/OSRM/Gemini diretamente. Relógio deve ser controlável em TTL,
timers e toasts. Segredos e dados pessoais reais não entram em fixtures ou snapshots.

### Cenários prioritários

1. Payload inválido/UF inconsistente produz feedback de campo e não inicia stream.
2. Submissão fica bloqueada durante a operação; `409` é tratado sem duplicar estado.
3. Resposta antiga não sobrescreve a viagem ativa; cancelamento limpa loading.
4. Parser SSE suporta frame dividido entre chunks, múltiplos frames por leitura,
   Unicode, `done: true`, fechamento e erro controlado.
5. Alternativa de rota troca geometria, duração, custos, paradas e altimetria juntos.
6. Login Google/visitante, expiração de duas horas e restauração não misturam dados.
7. Listar, excluir e marcar visitas atualizam a UI sem reload e somente para o usuário
   ativo.
8. Geolocalização negada mantém origem/destino manuais utilizáveis.
9. Estado offline é anunciado e a recuperação permite nova tentativa.
10. `ErrorBoundary` contém erro de renderização; toasts possuem semântica acessível.
11. Links/GPX usam somente a rota ativa, inclusive após novo planejamento.
12. Temas, teclado, foco, contraste e redução de movimento são verificados.
13. Telemetria diferencia tempo do servidor, tempo total e primeiro chunk.
14. Telemetria ignora resposta antiga, preserva snapshot anterior em falha e limpa
    imediatamente os dados ao trocar identidade.
15. Correlação aparece mascarada; a cópia integral ocorre somente por ação explícita
    e anuncia sucesso ou falha.

### Gates

Antes de integrar uma capacidade do frontend:

```powershell
cd app/frontend
npm run check
npm test
npm run lint
npm run build
```

Todos devem terminar sem falhas; nenhum teste crítico pode ser ignorado sem
justificativa. Não existe cobertura mínima aprovada: “100% de aprovação” significa
testes existentes passando, não 100% de cobertura. E2E, auditoria automatizada de
acessibilidade e matriz de browsers ainda precisam de ferramenta definida.

## Definition of Done do frontend

Uma capacidade só pode ser considerada concluída quando:

- requisitos, regras e critérios de aceite relacionados estão identificados;
- endpoint, método, headers, payloads, respostas e erros usados estão documentados e
  coerentes com o OpenAPI executável;
- JSON/SSE recebido passa por validação runtime e não usa `any` injustificado;
- estados ocioso, carregando/progressivo, vazio, sucesso, degradado e erro estão
  implementados conforme aplicável;
- solicitações antigas/canceladas não alteram a rota ativa;
- identidade e histórico permanecem isolados;
- sucesso, validação, falha, cancelamento e condição concorrente têm testes;
- fluxo crítico funciona por teclado, com foco visível, nomes acessíveis, contraste
  WCAG 2.1 AA nos dois temas e feedback anunciado;
- comportamento responsivo foi verificado na matriz de tamanhos aprovada;
- nenhum segredo, token ou dado sensível aparece em bundle, log, erro, fixture ou
  screenshot;
- `npm run check`, `npm test`, `npm run lint` e `npm run build` passam;
- evidência reproduzível está ligada aos IDs `RF`, `RN`, `RNF`, `API` e `CA`;
- documentação local e matriz global são atualizadas se o comportamento mudou.
