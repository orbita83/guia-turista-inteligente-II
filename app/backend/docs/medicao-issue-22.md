# Medição do planejamento — issue #22

Em 29/10/2026 foi feita uma chamada HTTP ao Backend desta branch, em Windows e
Python 3.12.10, usando uma instância Uvicorn local isolada, armazenamento
temporário e sessão de visitante. A solicitação usou Recife/PE → Salvador/BA.
Open-Meteo Geocoding, Open-Meteo Weather e OSRM foram consultados pela rede; a
chave Gemini foi explicitamente esvaziada, portanto a IA não foi consultada.
Foi executada **uma** chamada, sem aquecimento ou teste de carga.

| Medição | Resultado |
| --- | ---: |
| `X-Process-Time` | 2.117,829 ms |
| Geocodificação origem | 890,763 ms |
| Geocodificação destino | 890,186 ms |
| Clima | 485,797 ms |
| OSRM | 1.222,089 ms |
| Guia em contingência | 0,592 ms |
| Total dos serviços até composição | 2.114,219 ms |

O resultado ultrapassou a referência demonstrativa de 1.000 ms nesta amostra.
As geocodificações se sobrepõem, assim como clima e OSRM; não se deve somar todos
os valores. Neste caso o OSRM foi a operação mais longa do segundo estágio, mas
uma amostra não estabelece a causa de lentidão em outros ambientes. Os tempos de
etapa incluem a execução da integração, não apenas rede. O tempo HTTP inclui a
persistência e não é o RTT nem o tempo total do Frontend.

Para reproduzir, inicie o Backend em uma porta livre com `GEMINI_API_KEY` vazia,
`TRIPS_FILE` apontando para um arquivo temporário e `LEGACY_TRIPS_FILE` para um
caminho temporário inexistente. Crie um visitante por `POST /api/v1/auth/visitor`
e, usando o cookie da mesma sessão, envie `POST /api/v1/roteiros/planejar` com os
quatro campos de cidade e UF acima. Registre `X-Process-Time` e
`viagem.telemetria`, sem registrar o cookie. Os testes automatizados de
concorrência e a comparação com serviços simulados estão em `tests/test_http_api.py`
e `tests/test_migrated_services.py`.

Esta evidência não demonstra desempenho com Gemini ativo, sob carga, em múltiplos
workers ou com repetição estatística. A validação desses cenários permanece
pendente de infraestrutura e metodologia acordadas com o Aluno 4.
