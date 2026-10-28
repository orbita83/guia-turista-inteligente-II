# Critérios de aceite

> Os critérios abaixo tornam verificável o comportamento descrito na fonte. “Estado” indica **Fonte**, **Derivado** ou **Proposto**.

| ID | Critério verificável | Estado |
| --- | --- | --- |
| CA-AUT-001 | Dado login Google válido, o cabeçalho apresenta a identidade ativa e as chamadas usam seu identificador. | Derivado |
| CA-AUT-002 | Ao alternar de Google para visitante, a identidade Google permanece restaurável em um clique. | Fonte |
| CA-AUT-003 | Uma sessão visitante expira após 2 horas e não acessa o histórico de outra identidade. | Fonte/Derivado |
| CA-PLN-001 | Cidade/UF inválida é rejeitada; UF inconsistente resulta em `422`. | Fonte |
| CA-PLN-002 | Durante planejamento ativo, nova submissão idêntica é impedida no cliente e protegida por `409` no servidor. | Fonte |
| CA-PLN-003 | Planejamento concluído apresenta rota, clima, guia, telemetria e dados de custos correspondentes à mesma solicitação. | Derivado |
| CA-MAP-001 | Quando houver alternativas, selecionar uma rota atualiza geometria, duração, custos e paradas de modo coerente. | Fonte/Derivado |
| CA-MAP-002 | O mapa apresenta paradas antes do limite crítico segundo autonomia e margem configurada. | Fonte |
| CA-MAP-003 | Perfil de relevo informa máxima, ganho/perda e efeito no consumo. | Fonte |
| CA-CST-001 | O total reúne energia/combustível e pedágios e é dividido pela ocupação de 1 a 8 pessoas. | Fonte |
| CA-GUI-001 | O guia chega progressivamente e o frontend acrescenta os chunks na ordem recebida. | Fonte |
| CA-GUI-002 | O stream termina com sinal inequívoco de conclusão e não permanece carregando. | Derivado |
| CA-GUI-003 | O roteiro de IA respeita seções e limites de concisão definidos na documentação. | Fonte |
| CA-HIS-001 | A interface mantém visível a viagem retornada pelo contrato existente durante a reconciliação, sem duplicar nem afirmar persistência sem confirmação observável. | Fonte/Derivado; backend fora do escopo desta entrega |
| CA-HIS-002 | A interface remove localmente a viagem após resposta de sucesso do contrato existente, sem recarregar a SPA; falha preserva o card. | Fonte/Implementado no frontend |
| CA-EXP-001 | A aplicação gera GPX 1.1 válido contendo os pontos previstos da rota. | Fonte/Derivado |
| CA-EXP-002 | Ações de Maps e WhatsApp usam a rota ativa e não dados de planejamento anterior. | Derivado |
| CA-TEL-001 | Após o primeiro planejamento, a UI diferencia `X-Process-Time` do tempo total monotônico, mantém sinais ausentes como indisponíveis, mascara `X-Request-ID` e limpa o snapshot ao trocar identidade. | Fonte/Implementado no frontend |
| CA-TEL-002 | `/healthz`, `/readyz` e `/metrics` respondem conforme finalidade operacional. | Fonte |
| CA-DES-001 | Geocodificações e consultas independentes são executadas concorrentemente. | Fonte |
| CA-DES-002 | Desconexão interrompe o pipeline e impede salvar resultado incompleto. | Fonte |
| CA-DES-003 | A meta de resposta de planejamento é inferior a 1.000 ms no cenário e ambiente de medição a definir. | Fonte + questão |
| CA-OPS-001 | Backend inicia em `8001` e frontend em `5173` com configuração documentada. | Fonte |
| CA-OPS-002 | Suítes backend/frontend e lint concluem sem falhas antes da entrega. | Fonte |
| CA-OPS-003 | O frontend usa `.ts`/`.tsx`, passa por verificação estrita de tipos e é servido/construído por Vite+ sem perder os comandos npm esperados pela atividade. | Decisão aprovada |
| CA-OPS-004 | A raiz instala a versão fixada do Turbo sem instalação global, reconhece a configuração `turbo.json` e permite executar tarefas de ambos os workspaces por comando único ou filtro. | Decisão aprovada |
| CA-PLN-004 | Jornada crítica pode ser concluída por teclado e mantém contraste WCAG 2.1 AA nos dois temas. | Fonte/Derivado |
| CA-PLN-005 | Negar geolocalização não impede o planejamento manual. | Derivado |

## Condições para homologação

- Critério associado a pelo menos um teste ou evidência manual reproduzível.
- Dependências externas simuladas em testes e identificadas em homologação integrada.
- Critérios com “questão” não viram gate numérico até ambiente e método serem aprovados.
- Falhas conhecidas devem registrar impacto, contorno e decisão de aceite.

### Evidência frontend de CA-TEL-001

- `api.test.ts` valida headers ausentes, inválidos e válidos sem coerção para zero.
- `useApp.test.tsx` valida concorrência, snapshot anterior e isolamento de identidade.
- `TelemetriaCard.test.tsx` valida semântica textual, indisponibilidade, provedores e
  correlação mascarada; `App.test.tsx` cobre a integração até o logout.
- `RNF-TEL-001` é atendido pelo uso seguro de `X-Request-ID`; `RNF-TEL-004` é
  atendido sem polling ou requisição adicional de telemetria.

### Evidência frontend de CA-HIS-001 e CA-HIS-002

- `api.test.ts` valida e normaliza respostas completas e parciais, descartando itens
  sem identificador seguro.
- `useApp.test.tsx` cobre item provisório, confirmação, exclusão local sem reload,
  falha preservando o catálogo e resposta atrasada de outra identidade.
- `HistoricoViagens.test.tsx` cobre resumo compacto, “Aguardando dados”, carregamento,
  vazio, erro, persistência pendente e exclusão acessível.

### Evidência frontend de F01 para CA-PLN-003, CA-MAP-001 e CA-HIS-001

- `api.test.ts` verifica que campos opcionais válidos de clima, geometria, rotas,
  atrativos e visitas atravessam o parser; campos malformados são descartados sem
  impedir a leitura de viagens antigas. A disponibilidade desses campos em produção
  ainda depende da evolução do contrato do backend.

### Evidência frontend de F02 para CA-MAP-001

- `MapaRota.test.tsx` valida o estado sem geometria, a preservação do resumo textual e
  a seleção apenas de alternativas recebidas. `routeCalculator.test.ts` confirma que
  o cliente não inventa alternativas quando a API não as fornece.

### Evidência frontend de F03 para CA-MAP-003

- `api.test.ts` rejeita série altimétrica fora de ordem; `MapaRota.test.tsx` verifica
  que o gráfico usa amostras recebidas e mostra indisponibilidade na ausência delas.
  Indicadores de relevo sem dados de origem deixam de ser exibidos.

### Evidência frontend de F04 para CA-PLN-003

- `RoteiroResult.test.tsx` confirma a apresentação de clima parcial recebido e
  mensagens de indisponibilidade no lugar de temperaturas e condição fixas.

### Evidência frontend de F12 para CA-PLN-003

- `atrativosService.test.ts` garante que destinos não catalogados não recebem locais
  inventados; `RoteiroResult.test.tsx` verifica o estado vazio correspondente.

### Evidência frontend de F06 e F07 para CA-PLN-001

- `api.test.ts` verifica extração segura dos detalhes HTTP 422; `RoteiroForm.test.tsx`
  cobre associação aos campos, entradas numéricas vazias, preço zero e exigências
  condicionais para veículo elétrico. O formulário não envia números não finitos.

### Evidência frontend de F08 para CA-PLN-003

- `useApp.test.tsx` cobre confirmação, salvamento apenas local quando o endpoint não
  existe, reversão após falha e sincronização posterior. A tela distingue esses
  estados e oferece nova tentativa quando há alterações locais pendentes.

### Evidência frontend de F09 para CA-GUI-001 e CA-GUI-002

- `streamingGuide.test.ts` diferencia SSE, reprodução de conteúdo existente,
  cancelamento e encerramento sem `done`; `RoteiroResult.test.tsx` verifica que a
  contingência concluída não é apresentada como transmissão ao vivo.

Fonte: [módulo canônico](../modulo-guia-turista-inteligente.md).

