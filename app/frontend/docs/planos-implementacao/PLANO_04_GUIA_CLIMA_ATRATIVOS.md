# PLANO 04 — Guia do Viajante, clima e atrativos

**Referências:** Figuras 3.5 e 3.6  
**Páginas:** 24–26  
**Prioridade:** P1  
**Estado:** integração funcional anterior executada; lacuna de cobertura do catálogo e diferença visual nos cards identificadas no print atual, ainda sem correção.

## Referências visuais

As imagens oficiais deste plano são [00 — Tela completa](../wireframes/00-tela-completa.png), [05 — Guia e streaming](../wireframes/05-guia-e-streaming.png) e [07 — Guia do Viajante](../wireframes/07-guia-do-viajante.png). O PNG 07 está disponível e foi inspecionado visualmente; seu texto e seus números são apenas exemplos.

## Fidelidade visual obrigatória

Os PNGs oficiais são especificações visuais obrigatórias. Preservar e adaptar os componentes React existentes para seguir a estrutura, a hierarquia, a ordem e os elementos visíveis nas imagens: clima, guia, atrativos e gastronomia. Não reinterpretar livremente o design, adicionar cards, alterar layouts ou omitir elementos arbitrariamente. Textos exemplificativos e números das imagens não são dados reais da aplicação. A documentação funcional permanece em `app/backend/modulo-guia-turista-inteligente.md`.

## Objetivo

Adequar o conteúdo turístico aos wireframes, mantendo o streaming real e as operações de visita implementadas no backend.

## Arquivos principais

- `src/components/RoteiroResult.tsx`
- `src/services/streamingGuide.ts`
- `src/hooks/useViagem.ts`
- `src/styles/guia.css`
- `src/types/domain.ts`

## Etapa 1 — Composição visual

Organizar a área de resultados conforme a Figura 3.5:

- Card superior com origem, destino e perfil da viagem.
- Banner de clima em destaque.
- Card do Guia do Viajante.
- Cards de Pontos Turísticos & Atrativos.
- Cards de Restaurantes & Gastronomia.

Preservar a composição responsiva e a hierarquia visual, incluindo superfícies, badges e espaçamentos.

## Etapa 2 — Banner meteorológico

- [ ] Exibir município e UF de destino.
- [ ] Exibir temperatura.
- [ ] Exibir condição meteorológica.
- [ ] Exibir sensação térmica, vento e umidade quando fornecidos.
- [ ] Distinguir dados disponíveis, incompletos e indisponíveis.
- [ ] Não usar temperaturas ou condições ilustrativas do wireframe como fallback.

## Etapa 3 — Guia conciso

Seguir a Figura 3.6:

O card externo do Guia do Viajante tem fundo lilás claro e cabeçalho com ícone e título. Dentro dele, usar um container branco. Manter títulos azuis e hierarquia tipográfica conforme a referência. Na base, incluir separador tracejado e botão centralizado de recolher detalhes.

**Identidade e Atmosfera Local**

Uma frase curta, conforme o contrato de conteúdo.

**Roteiro Sugerido**

Divisão por Manhã, Tarde e Noite ou dias numerados, conforme os dados recebidos.

**Tradições Gastronômicas**

Seção concisa com os alimentos e locais mencionados no guia.

**Orientações Práticas e Clima**

Seção com recomendações associadas aos dados meteorológicos disponíveis.

O frontend deverá renderizar o conteúdo real sem inventar frases ausentes.

Se o Gemini retornar conteúdo fora do formato esperado, apresentar o texto com segurança e registrar a divergência. Não fabricar uma saída artificialmente conforme.

## Etapa 4 — SSE e retransmissão

- [ ] Preservar a leitura progressiva dos eventos SSE.
- [ ] Atualizar visualmente o texto conforme os fragmentos chegam.
- [ ] Exibir estados conectando, transmitindo, concluído e erro.
- [ ] Tratar eventos finais e cancelamento.
- [ ] Evitar duplicação de fragmentos.
- [ ] Preservar o conteúdo ao alternar abas.
- [ ] Não reiniciar automaticamente o Gemini apenas por remontagem do componente.
- [ ] Garantir que “Retransmitir” inicie uma nova transmissão e substitua corretamente a anterior.
- [ ] Não identificar um fallback estático como transmissão ao vivo.

Verificar se os testes e instrumentos úteis do PR #38 já foram integrados ao workspace antes de reaproveitá-los.

Não duplicar a geração do Gemini desnecessariamente.

## Etapa 5 — Atrativos e gastronomia

### Diagnóstico do print recebido

O print mostra o cabeçalho compartilhado “Atrativos & Gastronomia”, progresso `0 de 0` e a mensagem de que não há atrativos confirmados. Isso indica **lista de dados vazia**, não ausência dos dois conjuntos de JSX:

| Elo | Evidência no projeto | Conclusão |
| --- | --- | --- |
| Backend | `app/backend/app/services/trips.py` chama `atrativos_por_destino` e devolve `atrativos` e `atrativos_fonte: catalogo_local`. | O contrato de planejamento inclui o campo mesmo quando a lista está vazia. |
| Fonte | `app/backend/app/services/atrativos.py` procura correspondência exata de cidade e UF em `app/backend/app/data/atrativos.json`. | O catálogo atual contém apenas **sete destinos**: Recife, Salvador, Natal, Gramado, Rio de Janeiro, São Paulo e Ouro Preto. Para cidade fora da lista, retorna `[]`. |
| Caso observado | O print anterior de telemetria mostrava viagem para Abaiara–CE; se este resultado for da mesma viagem, Abaiara não consta do catálogo. | A ausência dos cards é compatível com o retorno vazio esperado do catálogo limitado. Confirmar o destino da viagem ativa ao implementar. |
| Transporte frontend | `src/services/api.ts::parseTrip` e `src/services/tripOptionalFields.ts` aceitam e validam `atrativos`; `src/types/domain.ts::Viagem` possui o campo. | O caminho de dados frontend já existe. Não presumir falha de transporte sem conferir a resposta real. |
| Renderização | `src/components/RoteiroResult.tsx` separa categoria `gastronomia` das demais, reutiliza `renderCard`, mostra “Pontos Turísticos & Atrativos” e “Restaurantes & Gastronomia” somente quando as listas têm itens. | **Os elementos necessários existem** dentro de `RoteiroResult.tsx`; não são arquivos React separados. Com `[]`, ambos os grupos somem por condição explícita. |
| Visitas | `src/services/api.ts::atualizarVisitaAtrativo` chama `PATCH /roteiros/{id}/visitas`; `useViagem.ts` reconcilia o retorno. | A ação de visita tem ligação implementada; ela só pode ser exibida para itens reais. |

O PNG [05 — Guia e streaming](../wireframes/05-guia-e-streaming.png) mostra **dois cards externos brancos distintos**, um de pontos turísticos e outro de restaurantes, cada qual com título, subtítulo, contador e grade de itens. O JSX atual coloca os dois grupos dentro de uma área compartilhada “Atrativos & Gastronomia”; além da lista vazia do print, essa estrutura precisa ser comparada quando houver dados. O catálogo de Natal–RN contém dez itens, sendo cinco de gastronomia, e pode servir como caso reproduzível para verificar os dois grupos sem transformar os locais do wireframe em dados novos.

Adequar os cards ao wireframe:

- Dois cards externos visualmente separados, um para “Pontos Turísticos & Atrativos” e outro para “Restaurantes & Gastronomia”, preservando o componente e a lógica de card já existentes.
- Título, descrição curta, contador e grade responsiva de cada grupo, na ordem do PNG 05.
- Categoria/badge.
- Nome do local.
- Destaque ou descrição.
- Link para Maps quando disponível.
- Ação de marcar como visitado.
- Contagem de atrativos.
- Separação visual entre atrativos turísticos e gastronomia.

Integrar o estado de visitas ao endpoint PATCH existente.

A marcação deve refletir a resposta real do backend e tratar falhas sem perder a consistência.

### Tarefas de dados e estado vazio

- [ ] Inspecionar uma resposta de `/planejar` ou histórico para um dos sete destinos catalogados e para um destino fora do catálogo; distinguir `atrativos: []` de perda de dados no parser.
- [ ] Confirmar a cidade e UF da viagem do print e a correspondência exata com o catálogo antes de atribuir o resultado ao backend.
- [ ] Definir uma fonte verificável para ampliar a cobertura de destinos, se a atividade exigir cards para cidades além das sete catalogadas. Não inventar restaurantes, atrativos, links Maps ou localizações; não mostrar itens de outra cidade como fallback.
- [ ] Manter um estado vazio honesto quando não houver itens verificados; revisar o progresso `0 de 0` para que a ausência de catálogo não pareça uma viagem com visitas concluídas ou faltantes.
- [ ] Com dados reais, renderizar os dois cards externos da Figura 3.5 e preservar filtros, progresso e `PATCH` de visitas sem deixar controles adicionais dominarem a composição.
- [ ] Conferir o caso em que há apenas pontos turísticos ou apenas gastronomia; não fabricar o grupo ausente e manter a separação visual coerente.

## Critérios de aceitação

A composição corresponde às Figuras 3.5 e 3.6.

O texto SSE aparece progressivamente, permanece legível e não se perde em mudanças de aba.

Os cards representam dados existentes, sem atrações fictícias.

Para destino catalogado com ambas as categorias, os dois cards externos devem aparecer com os itens corretos. Para destino sem entradas verificadas, a interface deve explicar a limitação dos dados, sem simular cards ou transferir atrações de outra cidade. O print de Abaiara, se confirmado como esta viagem, deve ser tratado como **lacuna de cobertura do catálogo**, não como componente inexistente.

A marcação de visitas continua funcional e isolada por viagem e usuário.
