# Streaming, erros e resiliência

## Streaming do guia

Requisição confirmada conceitualmente:

```json
{
  "destino": "<string>",
  "dias_estadia": "<schema pendente>",
  "estilo_viagem": "<schema pendente>",
  "clima_info": "<objeto pendente>",
  "atrativos": "<coleção pendente>",
  "gastronomia": "<coleção pendente>"
}
```

Resposta `200 text/event-stream`, com frames mínimos:

```text
data: {"chunk":"texto parcial","done":false}\n\n
data: {"chunk":"","done":true}\n\n
```

Como o endpoint é `POST`, o cliente deve usar `fetch` e ler `response.body` com
`ReadableStream`; a API nativa `EventSource` não suporta o corpo POST requerido. O
parser precisa manter buffer entre leituras, separar frames completos, decodificar
UTF-8 de modo incremental, acrescentar chunks na ordem recebida e encerrar loading em
`done: true` ou fechamento. Cancelar o reader/fetch ao desmontar, trocar planejamento
ou perder a validade da solicitação.

**Pendente:** limite de tamanho, timeout total e formato final de evento de erro. A
referência atual envia um último chunk textual com `done: true`; há proposta de evento
`error` tipado, ainda não aprovada.

## Estado assíncrono, concorrência e resiliência

Fluxo esperado no cliente:

```text
ocioso -> enviando -> resultado estruturado -> streaming -> concluído
                    \-> degradado
         \-> validação/erro/conflito/cancelado
```

Regras obrigatórias/derivadas:

- desabilitar nova submissão enquanto a atual estiver ativa;
- ainda assim tratar `409`, pois o servidor é a proteção autoritativa;
- associar resposta e stream a uma chave/versão da solicitação e ignorar respostas
  antigas quando outra viagem assumir o estado ativo;
- usar `AbortController` (**proposto**) para cancelar `fetch` e stream ao trocar a
  solicitação ou desmontar a tela;
- não persistir no cliente um resultado parcial como se fosse concluído;
- manter mapa, duração, custos, paradas e relevo da mesma alternativa de rota;
- comunicar estado offline e permitir nova tentativa consciente após reconexão;
- falhas parciais de provedores devem ser exibidas como degradação, não convertidas
  em dados inventados.

O backend executará geocodificação de origem/destino e depois clima/rota em paralelo,
com cancelamento em desconexão, circuit breakers, cache e fallbacks. O frontend apenas
representa o resultado; não replica essas regras.

## Erros

| Status/evento | Significado confirmado | Comportamento do cliente |
| --- | --- | --- |
| `200` | JSON concluído ou stream iniciado | validar runtime antes de usar |
| `409` | planejamento equivalente já ativo | manter estado atual e explicar conflito |
| `422` | payload inválido | associar detalhes aos campos quando disponíveis |
| `499` | cliente desconectou/cancelou | não apresentar como falha interna nem concluir roteiro |
| stream `done: true` | término inequívoco | finalizar loading |

Outros status e o envelope de erro ainda são propostas. O frontend deve aceitar
falha sem envelope conhecido com mensagem segura e incluir o request ID no suporte,
sem mostrar stack trace, corpo bruto de provedor ou segredos.

Envelope sugerido na documentação global, ainda **não aprovado**:

```json
{
  "error": {
    "code": "ROTEIRO_EM_ANDAMENTO",
    "message": "Já existe uma requisição em andamento para este roteiro.",
    "request_id": "<correlation-id>",
    "details": []
  }
}
```

`ErrorBoundary` cobre falhas de renderização, não erros de `fetch`, handlers ou código
assíncrono. Esses devem ser capturados no hook/service e traduzidos para estado de UI.
