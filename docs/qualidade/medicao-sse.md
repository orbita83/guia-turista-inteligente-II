# Medir o primeiro texto do SSE

O transporte progressivo e o prazo de 300 ms são obrigações diferentes. O benchmark usa Chromium, a SPA real e sua API configurada. Entra como visitante, planeja Recife/PE → Olinda/PE, aguarda o resultado e clica em Retransmitir. Pode consumir múltiplas chamadas Gemini, especialmente em desenvolvimento com StrictMode.

## Execução com provedor real

Instale as dependências com `npm ci`. Configure a chave somente no ambiente do backend ou no `.env` local, inicie a aplicação com `npm run dev` e execute:

```bash
npm run bench:sse -- --url http://localhost:5173 --chromium /usr/bin/chromium-browser
```

O parâmetro `--chromium` aponta para um navegador instalado. Como alternativa, `npx playwright install chromium` instala o navegador do Playwright e permite omitir esse parâmetro. O timeout de cada operação é 150000 ms e pode ser alterado com `--timeout`. `--output` escolhe o diretório de resultados; o padrão fica no diretório temporário do sistema.

O processo usa um contexto visitante novo e não reutiliza a sessão pessoal do operador. Não altera a lógica de persistência do produto. Não guarda cookies, chaves ou corpos completos de resposta nos relatórios. A captura pode conter o texto público do guia.

## O que é medido

`requestAt` é registrado antes do fetch SSE. `contentAt` marca a primeira mudança de conteúdo na área visível do guia; cabeçalhos, telemetry e a mensagem de espera não contam. `screenshotAt` é registrado depois de concluir uma captura daquela área. Todos usam `performance.now()` no mesmo navegador.

Uma mudança no DOM não prova pintura. O intervalo até a captura concluída é usado como **limite superior conservador**: se a captura com texto termina antes de 300 ms, há testemunho de texto representado antes do prazo. Se termina depois, o programa não determina se o primeiro texto já estava pintado antes; apenas informa que não certificou o limite. Custos da automação e da captura estão incluídos. O resultado não é um SLO nem uma garantia de latência futura.

O marco é o início da retransmissão SSE, não o clique inicial em Planejar viagem. O fluxo atual ainda faz o planejamento JSON antes de iniciar o guia SSE; este benchmark não elimina essa geração duplicada nem salva o guia retransmitido no histórico.

## Resultado e códigos de saída

| Saída | Resultado | Condição |
| --- | --- | --- |
| 0 | PASS | Captura concluída em menos de 300 ms e diagnóstico do provedor indica sucesso sem contingência |
| 1 | NOT_CERTIFIED | Testemunho visual não certifica o prazo; não afirma o instante exato de pintura |
| 2 | BLOCKED | Servidor indisponível, contingência, diagnóstico ausente, ausência de prova visual ou provedor controlado |

`result.json` e a captura `first-content-<n>.png` ficam no diretório informado. Os timestamps são relativos ao relógio daquela página, não horários de outros processos.

## Ensaio controlado da ferramenta

Use o servidor isolado de `scripts/qa_demo_server.py` na porta 18001 e Vite com `VITE_API_BASE_URL=http://127.0.0.1:18001/api/v1` na porta 15173. Depois:

```bash
npm run bench:sse -- --url http://127.0.0.1:15173 --chromium /usr/bin/chromium-browser --controlled
npm run test:sse-latency
```

O ensaio controlado sempre sai com 2, mesmo quando rápido: é uma recusa intencional de certificar C18, não uma falha do transporte. O servidor de QA também expõe `X-QA-Provider: controlled`, rejeitado pelo avaliador mesmo se o operador omitir `--controlled`. Não use um proxy que remova essa identificação para avaliar uma simulação como real. A ferramenta confia no ambiente configurado e no diagnóstico do backend; não constitui atestado independente de acesso à infraestrutura do Google.

O teste do avaliador utiliza relógios conhecidos, incluindo 299, 300 e 301 ms. Esses números verificam a regra de classificação; não são medidas do Gemini.
