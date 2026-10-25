# Conteúdo e regras visíveis

[← Índice de produto e experiência](../01-produto-e-experiencia.md)

## Campos do planejador

| Grupo | Campos/opções | Validação conhecida |
| --- | --- | --- |
| Origem | Município e UF | Cidade sanitizada; UF com 2 letras maiúsculas e aceita pelo catálogo. |
| Destino | Município e UF | Mesmas regras; autocomplete de cidades brasileiras é exigido, catálogo não definido. |
| Duração | 1 a 5 dias | Inteiro dentro do intervalo. |
| Perfil | Cultural; gastronômico; ecoturismo/aventura; família; romântico/econômico | A fonte não esclarece se “romântico/econômico” é uma ou duas opções. |
| Combustão | km/l, capacidade do tanque em litros, preço por litro | Limites numéricos e casas decimais em aberto. |
| Elétrico | km/kWh, capacidade da bateria em kWh, preço por kWh | Limites numéricos e casas decimais em aberto. |
| Ocupação | 1 a 8 passageiros | Inteiro no intervalo. |

## Resultados obrigatórios

- Clima: temperatura, sensação térmica, vento e condição climática.
- Rota: distância, duração, pedágios e rota selecionada.
- Autonomia: alcance, paradas de abastecimento/recarga e margem usada.
- Relevo: perfil, altitude máxima, ganho, perda e efeito no consumo.
- Custos: energia/combustível, pedágios, total, rateio e emissões.
- Guia: identidade local, roteiro por turno/dia, gastronomia e orientação de
  clima/vestuário.
- Telemetria: identidade ativa mascarada quando necessário, `X-Process-Time`,
  tempo total do frontend, `X-Request-ID`, provedores e métricas resumidas.

## Regras do texto gerado

- Identidade/atmosfera: uma frase direta, até 20 palavras.
- Cada turno ou dia: exatamente uma frase de ação, até 15 palavras.
- Gastronomia: uma frase com 2 ou 3 pratos/sabores e onde experimentá-los.
- Clima/orientação prática: uma frase ligando tempo/temperatura a vestuário e
  horários.
- A interface deve conservar essas divisões e não transformar o texto em um
  bloco contínuo difícil de escanear (**Derivado**).

## Vocabulário de interface

Há uma microcopy explícita: `Voltar para [Nome]`. Os demais textos definitivos
não foram aprovados. Como regra **Derivada**, usar verbos diretos e manter o
mesmo nome da ação no botão e na confirmação: por exemplo, “Baixar GPX” → “GPX
baixado”. Erros devem dizer o que ocorreu e o próximo passo.

O legado contém `Planejar Novo Roteiro`, `Gerar Guia com APIs & IA (Python)`,
`Seus Roteiros Salvos`, `Nenhum roteiro salvo ainda. Planeje sua primeira rota
acima!`, `Maps`, `Excluir`, `Processando`, `Falha na Requisição`, `Sucesso` e
`Aviso`. Esses textos são **Legado**, não cópia obrigatória para a SPA.

## Regras de negócio visíveis no cliente

- Uma sessão visitante dura no máximo duas horas.
- Só uma identidade fica ativa; dados e histórico seguem essa identidade.
- Mudar para visitante não apaga a identidade Google preservada.
- UF contém exatamente duas letras maiúsculas aceitas pelo catálogo.
- O formulário envia origem, destino, dias e perfil, além do contexto do
  veículo e passageiros.
- Uma requisição equivalente já ativa não deve ser duplicada.
- Métricas sempre pertencem à rota selecionada.
- A troca de rota recalcula tempo, consumo e custos.
- Paradas respeitam margem aproximada de 18% antes da reserva crítica.
- Rateio usa no máximo oito passageiros.
- Chunks do guia são anexados; `done: true` termina o streaming.
- Um usuário só lista, altera ou exclui seus próprios roteiros.
- A remoção visual só ocorre após confirmação do backend.
