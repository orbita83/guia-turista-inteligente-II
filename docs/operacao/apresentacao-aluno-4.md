# Demonstração de streaming, GPX, métricas e testes

Este roteiro usa a aplicação atual com provedores externos controlados. Não consome cota Gemini, não autentica no Google e não altera o histórico normal: o servidor de demonstração cria dados temporários. Os resultados não comprovam disponibilidade ou latência dos serviços públicos.

## Preparação

Na raiz, instale as dependências com `npm ci`. O backend utiliza `uv` e a versão Python declarada em `app/backend/.python-version`. Use dois terminais:

```bash
# Terminal 1: API de demonstração, porta separada da aplicação normal
cd app/backend
uv run --with-requirements requirements.lock python ../../scripts/qa_demo_server.py --port 18001
```

```bash
# Terminal 2: executar da raiz do repositório
VITE_API_BASE_URL=http://127.0.0.1:18001/api/v1 npm run dev --workspace @guia/frontend -- --host 127.0.0.1 --port 15173
```

Abra `http://127.0.0.1:15173`. Entre como visitante, preencha Recife/PE → Olinda/PE, selecione Cultural e clique em Planejar viagem. Se aparecer validação, confira o perfil do viajante. As portas isoladas evitam reiniciar servidores que já estejam sendo usados pela equipe.

Para execução normal com integrações externas, use `npm run dev`, portas 5173 e 8001, e configure o `.env` conforme `.env.example`. A origem usada no Google Sign-In precisa estar autorizada no projeto Google. O fluxo visitante da demonstração não depende dessa autorização.

## 1. Streaming em tempo real

Abra Guia & Clima e use Retransmitir. Mostre que o primeiro trecho aparece enquanto a indicação ainda é “Transmitindo ao vivo…”, antes de “Guia completo”.

Fala sugerida: “O FastAPI mantém uma resposta HTTP aberta com `StreamingResponse`. O gerador assíncrono fornece eventos SSE, e o React atualiza o texto conforme recebe os fragmentos. O transporte pode dividir um evento ou até um caractere UTF-8 entre pacotes; nosso leitor preserva um buffer e um decodificador incremental.”

Eventos usados: `chunk` acrescenta texto; `replace` substitui o conteúdo por texto validado ou contingência; `done` conclui; `error` encerra com uma mensagem segura. Após os cabeçalhos serem enviados, uma falha é informada por evento, não por mudança retroativa do status HTTP.

## 2. HTTP 409 e concorrência

Em outro terminal, crie uma sessão visitante local:

```bash
curl -s -c /tmp/guia-qa-cookie -X POST http://127.0.0.1:18001/api/v1/auth/visitor
curl -N -b /tmp/guia-qa-cookie -H 'Content-Type: application/json' \
  -d '{"destino":"Cancelar"}' http://127.0.0.1:18001/api/v1/roteiros/stream-guia
```

Espere o primeiro `event: chunk`. Enquanto a conexão estiver aberta, execute a mesma chamada em um segundo terminal:

```bash
curl -i -b /tmp/guia-qa-cookie -H 'Content-Type: application/json' \
  -d '{"destino":"Cancelar"}' http://127.0.0.1:18001/api/v1/roteiros/stream-guia
```

Resultado esperado: HTTP 409. O destino especial “Cancelar” mantém o provedor de demonstração em espera por vinte segundos; é um comportamento exclusivo do script de QA.

Fala sugerida: “O `asyncio.Lock` protege apenas a consulta e a atualização do conjunto de operações ativas. A chamada ao provedor acontece fora do lock. Assim, outra pessoa pode gerar um guia e pedidos duplicados da mesma sessão são rejeitados. Isso vale dentro de um processo; não é idempotência durável nem coordenação entre réplicas.”

## 3. Cancelamento

Interrompa o primeiro `curl` com Ctrl+C. Repita a solicitação: ela deve iniciar com HTTP 200 e produzir um fragmento novamente. Na interface, Retransmitir → Cancelar transmissão deve limpar o texto parcial e apresentar “Transmissão cancelada.”

Fala sugerida: “A desconexão cancela a espera no provedor, fecha o iterador e remove a operação ativa em `finally`. O cancelamento de um guia não apaga a viagem já planejada.”

Para demonstrar contingência após conteúdo parcial, use `{"destino":"Falha"}`. O script emite um fragmento, provoca uma falha controlada e o serviço substitui o texto por um guia de contingência.

## 4. GPX 1.1

Clique em Baixar GPX. Abra o arquivo em um editor XML ou visualizador GPX. Verifique `version="1.1"`, namespace Topografix, `trk/trkseg/trkpt` e atributos `lat` e `lon`.

Fala sugerida: “GPX é um formato XML de intercâmbio geográfico. O backend pede ao OSRM a geometria GeoJSON, que usa longitude/latitude; converte-a para latitude/longitude, formato usado pela interface. O download local usa esses pontos e escapa caracteres especiais. Se a viagem não tiver geometria válida, não exportamos a curva estimada pela interface. Elevação desconhecida é omitida.”

O arquivo da demonstração contém coordenadas controladas. A validação XML/XSD não certifica a precisão rodoviária de dados externos. O GPX é produzido no navegador: não existe endpoint de download GPX no backend desta branch. O isolamento é verificado no histórico e nas ações por identidade da API; não há autorização de servidor adicional no ato de gerar um Blob local.

## 5. Prometheus

Consulte a API em operação:

```bash
curl -s http://127.0.0.1:18001/metrics | rg 'guia_stream|http_requests_total'
```

Observe `guia_stream_active` voltar a zero e os resultados `completed`, `cancelled` e `error`. `guia_stream_conflicts_total` conta conflitos; `guia_stream_fallback_total` conta contingências. `guia_stream_first_content_seconds` mede o primeiro fragmento real recebido do provedor; `guia_stream_duration_seconds` mede o fluxo inteiro. O tempo HTTP existente mede até os cabeçalhos e não substitui a duração do corpo SSE.

Se o Prometheus estiver instalado, use um arquivo de coleta apontando para a porta de QA:

```bash
sed 's/127.0.0.1:8001/127.0.0.1:18001/' prometheus.yml > /tmp/guia-qa-prometheus.yml
prometheus --config.file=/tmp/guia-qa-prometheus.yml \
  --storage.tsdb.path=/tmp/guia-qa-prometheus-data \
  --web.listen-address=127.0.0.1:18090
```

Em `http://127.0.0.1:18090`, consulte `up` e `guia_stream_active`. O alvo deve estar em 1 e a coleta usa intervalo de 15 segundos. O processo da API mantém as métricas em memória e elas reiniciam junto dele. Não há nomes de usuário, destino ou IDs individuais nos rótulos novos de streaming.

## 6. Testes e defesa técnica

Execute da raiz:

```bash
npm run check
npm test
npm run build
```

Para destacar o servidor real e a concorrência:

```bash
npm test --workspace @guia/backend -- -v
```

O script de workspace chama pytest; para selecionar diretamente os testes TCP:

```bash
cd app/backend
uv run --with-requirements requirements.lock python -m pytest tests/test_streaming.py -v
```

Fala sugerida: “Os testes do serviço usam provedores controlados. Os testes TCP sobem Uvicorn em uma porta livre e usam uma barreira para impedir o término: comprovam que o fragmento chegou antes da conclusão, que o segundo pedido recebeu 409 e que fechar a conexão libera o bloqueio. O Vitest verifica o leitor SSE, os estados e o Blob do GPX. Todos os testes passarem significa aprovação da suíte executada; não significa automaticamente cobertura de 100% do código.”

## Limitações que devem ser explicadas

- A interface atual cria a viagem com JSON e gera/retransmite o guia em uma chamada separada. A retransmissão não salva o novo texto na viagem existente. O plano anterior de um único POST para todo o planejamento não descreve esta versão integrada da equipe.
- A trava SSE rejeita operações equivalentes ativas. O planejamento JSON preserva sua regra anterior, incluindo cooldown de quatro segundos. São operações distintas e não há deduplicação durável entre elas.
- O modo sem chave Gemini devolve contingência; não demonstra geração por IA externa. A demonstração controlada comprova transporte e comportamento, não a latência do Gemini.
- As metas de 300 ms/800 ms do enunciado precisam ser medidas com ambiente e credenciais reais. Não foram certificadas por esta execução.
- Um processo por instância é a topologia validada. Readiness simples não prova saúde de todos os provedores.

As evidências e contagens da execução estão em [evidencias-qa.md](../qualidade/evidencias-qa.md).
