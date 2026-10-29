# Evidências de QA — 28/10/2026

Verificação realizada sobre a `development` baseada em `37c67f9`, preservando as atualizações da equipe. A baseline tinha 40 testes Python e 135 Vitest aprovados, mas o check falhava com 21 erros no backend. O endpoint SSE ainda não existia nessa base.

## Resultado dos gates

| Gate | Resultado |
| --- | --- |
| `npm run check` | Aprovado: Ruff/mypy e frontend sem erros |
| `npm test` | 72 Python + 185 Vitest = 257 aprovados; zero falhas e zero skips |
| `npm run build` | Aprovado: backend compilado e bundle frontend produzido |
| Sensor independente em scratch | Cinco mutações detectadas pelos testes |

O [log completo](evidencias/gates.txt) foi produzido com cache desativado (`TURBO_FORCE=true`). A suíte ganhou 82 testes em relação à baseline de 175. Nenhum teste anterior foi removido ou ignorado. Há um aviso de depreciação do TestClient/httpx e avisos do Turborepo sobre tarefas sem artefatos de saída; não são falhas de teste. Aprovação da suíte não significa cobertura de 100% do código.

## Cenários comprovados

| Área | Prova |
| --- | --- |
| SSE backend | `app/backend/tests/test_streaming.py`: fragmentos, conclusão, contingência após falha, timeout, validação, 401/422/409 e erro terminal seguro |
| Concorrência real | Uvicorn TCP em porta livre: primeiro fragmento liberado por barreira, segundo pedido equivalente recebe 409 antes do fim do primeiro |
| Cancelamento | Fechar conexão cancela espera, fecha iterador/provedor e libera reserva; nova solicitação é aceita. Falha ao fechar também não prende a reserva |
| Isolamento | `test_history_isolation.py`: histórico Alice/Bob separado e tentativa de apagar viagem alheia mantém o dado intacto; exportação JSON isolada coberta na suíte anterior |
| Geometria | `test_route_geometry.py`: pede GeoJSON completo ao OSRM, converte longitude/latitude e rejeita geometria inválida sem inventar dados |
| SSE cliente | UTF-8 e eventos fragmentados, LF/CRLF, replace, ordem, erro HTTP sem falso sucesso, EOF incompleto e abort durante leitura |
| Interface | Conteúdo parcial, conclusão, substituição, erro visível, cancelamento, desmontagem e download com mensagem de indisponibilidade |
| GPX | XML escapado, coordenadas válidas, longitude 180 rejeitada, decimal sem expoente, ausência de elevação inventada; Blob/link/URL limpos inclusive em falha |
| Integração GPX | Parser preserva a geometria da API; botão exporta esses pontos e bloqueia download sem geometria real |
| Métricas | Deltas HTTP exatos, scrape excluído, streams ativos, primeiro conteúdo, término, conflito e contingência; testes TCP leem o endpoint `/metrics` real |

## Ensaio com navegador e serviços locais

Executado em Chromium com a SPA Vite real (`127.0.0.1:15173`) e o FastAPI/Uvicorn real (`127.0.0.1:18001`). O script `scripts/qa_demo_server.py` substituiu apenas os provedores externos por dados controlados e usou armazenamento temporário.

1. Login visitante; formulário Recife/PE → Olinda/PE, perfil Cultural; planejamento retornou HTTP 200.
2. Na aba Guia & Clima, Retransmitir exibiu “Centro histórico e praça central.” enquanto o status ainda era “Transmitindo ao vivo…”. O texto final ainda não havia chegado. Depois apareceu “Guia completo”.
3. Com a primeira transmissão aberta, outro POST com a mesma sessão e o mesmo payload recebeu HTTP 409.
4. Cancelar transmissão apresentou “Transmissão cancelada.”. Retransmitir em seguida completou novamente.
5. Baixar GPX iniciou download sem falha. O [arquivo efetivamente baixado](evidencias/rota-demo.gpx) contém os três pontos controlados fornecidos pela API.
6. `xmllint --noout --schema /tmp/guia-gpx-1.1.xsd docs/qualidade/evidencias/rota-demo.gpx` retornou `validates` usando o esquema oficial [GPX 1.1](https://www.topografix.com/GPX/1/1/gpx.xsd).
7. Prometheus 3.15.1 consultou a API a cada 15 segundos. A consulta retornou `up=1`; após o ensaio, `guia_stream_active=0`. As [séries coletadas](evidencias/prometheus.json) registram resultados e conflitos.

A [captura da interface](evidencias/qa-interface.png) mostra a retransmissão concluída. Ela complementa as asserções; uma captura estática, sozinha, não comprova progressividade.

O Google Sign-In não foi exercitado: a origem isolada não pertence à configuração OAuth do projeto. Foram observados erros externos dessa integração e favicon ausente no console, sem impedir o fluxo visitante. Não se atribui a este ensaio validação do Google OAuth.

## Correções motivadas pela validação

- Router incompleto e tratamento silencioso de erro na expiração de sessão impediam o check.
- O frontend tentava um endpoint SSE inexistente; a geração assíncrona agora está disponível.
- O leitor tratava 409 e EOF sem conclusão como sucesso de contingência; os testes agora detectam esses casos.
- O cliente SSE ignorava `VITE_API_BASE_URL`; o ensaio de origem separada revelou a falha.
- O parser de viagem descartava a geometria; isso bloqueava o download mesmo com dados válidos no backend.
- XML sem escapamento, longitude 180 e notação exponencial invalidavam casos GPX; foram corrigidos e cobertos.

## Limites da evidência

Os provedores controlados demonstram transporte HTTP, estados, cancelamento, exportação e telemetria. Não comprovam disponibilidade do modelo Gemini configurado, precisão de uma rota externa, altimetria, nem as metas de 300 ms/800 ms. A geração SSE atual é separada do planejamento JSON e não persiste a retransmissão. A trava é local ao processo. O GPX é gerado no navegador; o isolamento comprovado é o do histórico e das operações da API.

Para executar e explicar a sequência, siga [apresentacao-aluno-4.md](../operacao/apresentacao-aluno-4.md). A revisão independente e as mutações estão em `.specs/features/qa-apresentacao/validation.md`.
