# Data Model: Histórico e Persistência de Viagens

> **Escopo corrigido:** este documento descreve somente modelos de apresentação do
> frontend. Não especifica armazenamento ou implementação backend. Valores opcionais
> ausentes são apresentados como “Aguardando dados” (ou texto equivalente), deixando
> claro que o campo existe e a informação ainda não chegou.

## Identidade ativa

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | string não vazia | Recebido no objeto de sessão fornecido pela API |
| `nome` | string | Exibição segura; não define autorização |
| `tipo` | string de tipo de sessão | Exibição contextual; não implementa política de armazenamento |

Uma identidade possui exatamente um catálogo visível por sessão. Trocar ou encerrar
a identidade invalida listagens, reconciliações e exclusões pendentes da anterior.

## Viagem salva

| Campo | Tipo normalizado | Regra |
| --- | --- | --- |
| `id` | string não vazia | Obrigatório para renderização e exclusão segura |
| `criado_em` | string opcional | ISO-8601 quando fornecido; não ordenado no cliente |
| `origem` | string | “Aguardando dados” quando ausente/inválida |
| `destino` | string | “Aguardando dados” quando ausente/inválida |
| `clima.temperatura` | string | “Aguardando dados” quando ausente/inválida |
| `clima.umidade` | string | Normalizado para compatibilidade, não exibido no resumo desta feature |
| `clima.vento` | string | Normalizado para compatibilidade, não exibido no resumo desta feature |
| `percurso.distancia` | string | “Aguardando dados” quando ausente/inválida |
| `percurso.tempo` | string | “Aguardando dados” quando ausente/inválida |
| `dicas_destino` | string | Preservado para consumidores existentes; não exibido pelo card compacto |
| `diagnostico_ia` | objeto opcional | Não autoriza inferir persistência |

Valores vazios, `N/D`, `null`, tipos inesperados e campos omitidos são normalizados
como indisponíveis. Zero textual válido não é convertido em ausência.

## Catálogo de viagens

| Campo | Tipo | Regra |
| --- | --- | --- |
| `identityId` | string | Deve coincidir com a identidade ativa |
| `items` | lista de Viagem salva | Preserva ordem recebida e deduplica por `id` |
| `loadState` | discriminado | `idle`, `loading`, `ready`, `empty`, `error`, `offline` |

O catálogo não mistura identidades. Uma resposta atrasada só pode substituir o
estado se ainda pertencer à geração de sessão que originou a solicitação.

## Estado de persistência no cliente

| Estado | Significado | Transição |
| --- | --- | --- |
| `pending` | POST retornou a viagem; GET ainda não confirmou | para `confirmed` ou `unavailable` |
| `confirmed` | listagem contém o mesmo `id` | terminal na sessão atual |
| `unavailable` | janela limitada terminou sem confirmação ou falhou | pode confirmar em recarga futura |

O item provisório é mesclado no topo sem duplicar um item confirmado de mesmo `id`.

## Operação de exclusão

| Estado | Regra |
| --- | --- |
| `idle` | ação disponível |
| `deleting` | somente o card alvo mostra “Excluindo...” e bloqueia repetição |
| `confirmed` | item removido localmente após `204` |
| `failed` | item preservado, ação reabilitada e feedback anunciado |

## Limite desta feature

O frontend consome os estados e dados expostos pela API atual. Persistência,
armazenamento e autorização são responsabilidade externa a esta entrega.

