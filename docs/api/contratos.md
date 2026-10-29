# Contratos da API

Este documento separa os contratos executáveis hoje dos endpoints futuros descritos
na arquitetura de referência. Os contratos abaixo incluem as entregas atuais do
Backend; os itens ainda sem dependências ou responsável definidos permanecem futuros.

## API FastAPI executável

Base REST: `/api/v1`. As respostas de sucesso usam JSON, exceto SSE e as operações
que retornam `204 No Content`.

| Método e caminho | Contrato | Identidade |
| --- | --- | --- |
| `POST /api/v1/auth/restore-google` | saída `{ usuario }` | restaura identidade Google preservada enquanto o vínculo e a sessão visitante forem válidos |
| `GET /api/v1/auth/session` | `{ usuario, google_client_id, ufs, session_started_at?, session_duration_ms? }` | cookie de sessão opcional |
| `POST /api/v1/auth/google` | entrada `{ credential }`; saída `{ usuario, session_started_at, session_duration_ms }` | valida credencial no Google e cria cookie |
| `POST /api/v1/auth/visitor` | saída `{ usuario, session_started_at, session_duration_ms }` | cria sessão visitante com validade de 2 horas e preserva identidade Google autorizada |
| `POST /api/v1/auth/logout` | `204` | encerra sessão e limpa dados temporários do visitante |
| `GET /api/v1/roteiros/minhas-viagens` | `{ viagens: [...] }` | sessão obrigatória; lista somente os roteiros da identidade ativa |
| `GET /api/v1/roteiros/minhas-viagens/json` | metadados legados e envelope `usuarios` contendo somente a identidade ativa | sessão obrigatória; exportação compatível e isolada |
| `POST /api/v1/roteiros/planejar` | entrada com `origem_cidade`, `origem_uf`, `destino_cidade`, `destino_uf`; saída `{ viagem, aviso }` | sessão obrigatória |
| `PATCH /api/v1/roteiros/{roteiro_id}/visitas` | entrada `{ atrativo_id, visitado }`; saída com os IDs visitados atualizados | sessão obrigatória; altera somente roteiro da identidade ativa |
| `POST /api/v1/roteiros/stream-guia` | entrada `{ destino, dias_estadia?, estilo_viagem?, clima_info?, atrativos?, gastronomia? }`; resposta HTTP 200 `text/event-stream` | sessão obrigatória, inclusive visitante |
| `DELETE /api/v1/roteiros/{roteiro_id}` | `204` | sessão obrigatória; exclusão limitada à identidade ativa |

O planejamento mantém os campos de viagem já produzidos pelo Flask: `id`, `criado_em`,
`origem`, `destino`, `clima`, `percurso`, `dicas_destino` e `diagnostico_ia`; também
retorna o objeto `telemetria`. Cidades
são higienizadas e limitadas a 80 caracteres; origem e destino vazios retornam `422`.

O frontend aceita, quando presentes, `clima.sensacao`, `clima.condicao`,
`clima.icone`, `percurso.geometria` (lista de pelo menos duas coordenadas
`[latitude, longitude]`), `rotas`, `atrativos` e `atrativosVisitadosIds`.
Também admite `percurso.perfilElevacao` e `rotas[].perfilElevacao` como listas de
amostras `{ distanciaKm, altitudeM }` com distâncias crescentes dentro da rota.
Esses campos são opcionais e ainda não são garantidos pelos endpoints executáveis.
O cliente valida seus formatos em runtime e ignora itens opcionais inválidos sem
perder a viagem identificada. O formato estruturado de `rotas` e `atrativos` segue
os tipos da SPA e permanece **proposto** até estabilização do contrato no backend.
Solicitações iguais da mesma identidade têm bloqueio de concorrência e cooldown de
quatro segundos, respondendo `409`. Falhas HTTP não tratadas pelos fallbacks dos
provedores respondem `502`.

`viagem.clima` mantém `temperatura`, `umidade` e `vento`, e também retorna
`sensacao_termica` e `condicao`, consultadas no Open-Meteo. `condicao` traduz códigos
WMO suportados para descrições em português; campos ausentes, inválidos ou códigos
desconhecidos são retornados como `"N/D"`, preservando as demais medições válidas.

`viagem.telemetria.duracoes_etapas_ms` contém durações em milissegundos para
geocodificação de origem/destino, clima, roteamento, guia e total dos serviços
integrados. `viagem.telemetria.provedores` sinaliza `disponivel`, `indisponivel` ou
`nao_consultado`; Open-Elevation permanece `nao_integrado` até o serviço do Aluno 3
ser entregue. A duração de uma etapa inclui o tratamento local mesmo quando o
provedor não é consultado; tempos de etapas concorrentes se sobrepõem. O cabeçalho
`X-Process-Time` mede o tempo até o início da resposta HTTP e inclui etapas fora
do total de serviços; não representa o RTT nem o tempo total percebido pelo cliente.

Exemplo dos campos de clima e telemetria:

```json
{
  "clima": {
    "temperatura": "28.5 °C",
    "sensacao_termica": "29.0 °C",
    "umidade": "35%",
    "vento": "12.0 km/h",
    "condicao": "Parcialmente nublado"
  },
  "telemetria": {
    "duracoes_etapas_ms": {
      "geocodificacao_origem_ms": 42.1,
      "geocodificacao_destino_ms": 40.3,
      "clima_ms": 125.2,
      "roteamento_ms": 180.4,
      "guia_ms": 310.5,
      "total_servicos_ms": 620.8
    },
    "provedores": {
      "open_meteo_geocoding": "disponivel",
      "open_meteo_weather": "disponivel",
      "osrm": "disponivel",
      "gemini": "disponivel",
      "open_elevation": "nao_integrado"
    }
  }
}
```

`viagem.percurso` preserva `distancia`, `tempo` e `modal` e inclui `status`, `motivo`,
`geometria` e `alternativas`. A geometria principal é a linha completa retornada pelo
OSRM. Cada ponto é `[latitude, longitude]` em graus decimais, compatível com
`CoordenadaGPS` no Frontend. O OSRM fornece GeoJSON na ordem `[longitude, latitude]`;
o Backend valida e converte cada ponto para a ordem do contrato antes de responder.
Distância e duração mantêm as strings formatadas existentes.

`alternativas` contém somente rotas adicionais efetivamente retornadas pelo OSRM. Cada
item possui `geometria`, `distancia` e `tempo`; se o roteador não fornecer uma rota
alternativa utilizável, a lista é vazia. O Backend não sintetiza nem interpola rotas.
Quando a rota principal estiver indisponível ou inválida, `status` será
`"indisponivel"`, `geometria` e `alternativas` serão vazias e `motivo` identificará a
causa; os textos de distância e duração de fallback existentes são mantidos.

Exemplo de sucesso:

```json
{
  "viagem": {
    "percurso": {
      "distancia": "1674.6 km",
      "tempo": "21h 38min de carro",
      "modal": "carro",
      "status": "disponivel",
      "motivo": null,
      "geometria": [
        [-8.05, -34.9],
        [-8.42, -35.03],
        [-9.1, -35.2]
      ],
      "alternativas": [
        {
          "distancia": "1690.2 km",
          "tempo": "22h 4min de carro",
          "geometria": [
            [-8.05, -34.9],
            [-8.5, -35.1],
            [-9.1, -35.2]
          ]
        }
      ]
    }
  },
  "aviso": null
}
```

Exemplo de indisponibilidade sem linha reta substituta:

```json
{
  "percurso": {
    "distancia": "Sem rota direta",
    "tempo": "Considere voos ou barcos",
    "modal": "alternativo",
    "status": "indisponivel",
    "motivo": "sem_rota",
    "geometria": [],
    "alternativas": []
  }
}
```

Os motivos atuais incluem `coordenadas_invalidas`, `sem_rota`, `timeout`,
`falha_http`, `falha_rede`, `resposta_malformada`, `resposta_invalida` e
`geometria_invalida`.
Para falhas de consulta e respostas inválidas, a distância é apresentada como
`Rota indisponível`; `Sem rota direta` é reservado à resposta `sem_rota` do OSRM.
`percurso.geometria` é opcional e contém pontos `[latitude, longitude]` convertidos do
GeoJSON retornado pelo OSRM. Sem geometria válida, o planejamento permanece disponível,
mas o botão GPX não exporta um traçado estimado. O arquivo é gerado no navegador.

### Streaming do guia

O SSE gera um guia separado; não cria nem atualiza a viagem persistida. Usa eventos
`telemetry` com `{stage, requestId, serverTimestamp, session, elapsedStreamMs}`,
`chunk` com `{chunk, done:false}`, `replace` com `{text, done:false}` e `done` com
`{done:true, text, diagnostico_ia}`. Erros terminais usam `error` com código e mensagem
seguros. Uma contingência pode substituir os fragmentos antes da conclusão.

Sessão e payload inválidos retornam 401/422 antes do stream. Pedidos equivalentes
ativos da mesma sessão retornam 409; a chave inclui o payload validado e o usuário.
Esse bloqueio SSE vale apenas no processo e é liberado ao concluir, falhar ou cancelar.
É distinto do cooldown de quatro segundos do endpoint JSON. Após iniciar a resposta,
uma falha terminal é um evento SSE, não outro status HTTP.

Veja [apresentação e exemplos de requisição](../operacao/apresentacao-aluno-4.md).

### Sessão e isolamento

A identidade é obtida exclusivamente do cookie de sessão assinado pelo backend. O
cliente não pode escolher uma identidade enviando `X-User-Id`; esse header não é
aceito como autenticação. Cookies são enviados com credenciais e devem ser protegidos
por HTTPS em produção. O login Google valida o campo `aud` contra `GOOGLE_CLIENT_ID`.
Visitantes mantêm roteiros somente em memória e perdem seus dados ao encerrar ou
expirar a sessão. Usuários Google mantêm histórico em
`app/backend/static/data/viagens.json`. No primeiro startup, se o arquivo não existir,
o backend valida e copia o arquivo legado da raiz sem removê-lo.

Ao trocar de uma sessão Google para visitante, o Backend guarda o perfil Google
validado e sua expiração no cookie de sessão assinado; o conteúdo de perfil salvo pelo
Frontend não autentica ninguém. `POST /api/v1/auth/restore-google` exige a sessão
visitante válida e o vínculo não expirado, restaura somente a identidade Google e
descarta os dados temporários do visitante sem mesclá-los. Login em outra conta,
logout e expiração removem a possibilidade de restauração. O vínculo dura no máximo
duas horas.

Cada cookie é associado a uma sessão ativa registrada no processo do Backend.
Troca de identidade, logout e restauração revogam o identificador anterior, de
modo que sua reapresentação seja recusada. O registro é mantido em memória:
reiniciar a API encerra as sessões, e uma implantação com múltiplos processos
precisa de um armazenamento compartilhado e atômico para sessões e revogações.

`PATCH /api/v1/roteiros/{roteiro_id}/visitas` recebe `{ "atrativo_id": "...",
"visitado": true }` e retorna `roteiro_id`, `atrativo_id`, `visitado` e
`atrativos_visitados_ids`. A atualização é atômica por usuário/roteiro; IDs de
roteiros pertencentes a outra identidade retornam `404`.

### Erros e cabeçalhos

- `401`: sessão ausente/expirada ou credencial Google inválida;
- `409`: planejamento duplicado ativo ou dentro do cooldown;
- `404`: roteiro não encontrado para a identidade ativa;
- `422`: payload inválido;
- `502`: falha de transporte em provedor necessária à operação.
- `X-Process-Time`: duração até os cabeçalhos em milissegundos; não mede o corpo SSE inteiro;
- `X-Request-ID`: preserva um ID válido enviado ou gera um identificador seguro.

Em chamadas cross-origin, os dois cabeçalhos de resposta são expostos por CORS.
No frontend, uma resposta `422` no formato FastAPI `detail: [{loc, msg}]` associa
mensagens aos campos conhecidos do formulário. Formatos desconhecidos mantêm uma
mensagem geral segura; essa leitura não altera o contrato do servidor.

### Operação

| Método e caminho | Resposta | Estado |
| --- | --- | --- |
| `GET /healthz` | `{ status: "ok" }` | executável |
| `GET /readyz` | `{ status: "ready" }` | executável; readiness simples do processo |
| `GET /metrics` | métricas HTTP, circuit breakers e ciclo SSE | executável; registro local ao processo |
| `GET /circuits` | `{ circuit_breakers: [...] }` | diagnóstico dos circuitos |
| `GET /docs`, `GET /redoc` | OpenAPI interativo | executável |

## Rotas antigas aposentadas

As rotas Flask de SSR e formulário (`/`, `/auth/google/callback`, `/auth/demo`,
`/auth/logout`, `/viagens/criar` e `/viagens/deletar/{id}`) foram retiradas após a
SPA passar a consumir a API FastAPI. Os arquivos de template, CSS e JavaScript de
apresentação também foram removidos.

O Flask antigo expunha `/viagens/json`, `/api/viagens/json` e `/api/viagens`, com a
base agregada de todos os usuários. Essas rotas foram aposentadas; o comportamento
de visualizar JSON é migrado em
`GET /api/v1/roteiros/minhas-viagens/json`, que mantém metadados e estrutura
compatíveis, mas inclui somente o usuário autenticado.

## Contratos futuros ainda não implementados

Os itens a seguir constam na arquitetura global, mas não possuem comportamento
correspondente no frontend monolítico atual; ficam fora desta migração:

| Método e caminho | Finalidade descrita | Estado |
| --- | --- | --- |
| `POST /api/v1/roteiros/mapa-rota` | mapa e alternativas | futuro |
| método pendente `/api/v1/roteiros/custos` | calculadora de custos | futuro |
| método pendente `/api/v1/roteiros/exportar/gpx` | exportação no servidor | futuro; download atual é local no navegador |
| método pendente `/api/v1/roteiros/compartilhar` | compartilhamento | futuro |
| `/api/v1/telemetria` | diagnóstico de provedores/circuit breakers | futuro |

O schema executável completo também está publicado pelo FastAPI em `/openapi.json`.
