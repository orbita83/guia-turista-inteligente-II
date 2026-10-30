# Jornadas e fluxos

[← Índice de produto e experiência](../01-produto-e-experiencia.md)

## Iniciar ou alternar sessão

1. A pessoa escolhe Google ou visitante.
2. O frontend envia o token Google para validação ou solicita uma sessão
   temporária com TTL de duas horas.
3. O cabeçalho mostra exatamente uma identidade ativa.
4. Ao mudar de Google para visitante, preserva a identidade Google em
   `guia_turista_saved_google_user`.
5. A ação `Voltar para [Nome]` restaura a identidade preservada em um clique,
   enquanto ela for válida.
6. Trocar de identidade limpa da interface dados da identidade anterior antes
   de carregar o histórico correto (**Derivado**).
7. Logout explícito encerra a sessão; o encerramento de visitante ao fechar a
   janela pode usar `sendBeacon`.

Falhas: token inválido é recusado; expiração exige renovação ou autenticação;
indisponibilidade de `localStorage` não deve impedir o uso básico (**Derivado**).

## Obter sugestões pelo GPS

1. Explicar a finalidade antes de solicitar geolocalização (**Derivado**).
2. Com consentimento, obter coordenadas no navegador e calcular Haversine.
3. Exibir quatro destinos turísticos elegíveis e permitir preencher o destino
   pela seleção.
4. Se a permissão for negada ou falhar, manter o preenchimento manual.

O significado de `>400 km` está em aberto: a fonte o chama de “raio” e também
de critério para destinos “mais próximos”. Não codificar como distância mínima
ou máxima até haver decisão.

## Planejar uma viagem

1. Informar município e UF de origem e destino.
2. Escolher duração de 1 a 5 dias e perfil de viagem.
3. Escolher combustão ou veículo 100% elétrico e preencher seus parâmetros.
4. Informar de 1 a 8 passageiros.
5. Validar campos; associar erros aos controles e levar o foco ao primeiro erro
   relevante (**Derivado**).
6. Enviar uma solicitação e impedir submissão duplicada enquanto estiver ativa.
7. Exibir progresso perceptível e, ao chegar a resposta estruturada, mapa,
   telemetria, clima, custos e demais painéis.
8. Exibir o guia progressivamente via SSE, sem apagar chunks anteriores.
9. Atualizar o histórico quando a persistência em background for confirmada.

Entradas inválidas retornam HTTP 422; solicitação equivalente já ativa retorna
HTTP 409. Ambas exigem mensagem acionável, sem corromper resultados anteriores.

## Explorar rota, relevo, autonomia e custos

1. Mostrar origem, destino, traçado e paradas no Leaflet.
2. Se a API fornecer alternativa, permitir alternância entre rota principal
   (menor tempo) e alternativa econômica.
3. Ao trocar de rota, atualizar em conjunto distância, duração, pedágios,
   consumo, custo, autonomia e relevo; não misturar métricas entre rotas.
4. Mostrar paradas antes da reserva crítica, considerando margem aproximada de
   18%.
5. Permitir expandir o perfil altimétrico e apresentar altitude máxima, ganho,
   perda e impacto percentual no consumo.
6. Mostrar custo total (energia/combustível + pedágios), emissões e cota por
   passageiro.

Na ausência de rota alternativa, exibir somente a principal. O modo degradado
para ausência de elevação, clima, rota ou paradas ainda não foi definido.

## Acompanhar o guia em streaming

1. Iniciar o consumo de `/stream-guia` quando houver contexto da viagem.
2. Anexar cada fragmento ao conteúdo existente, sem cintilação ou substituição.
3. Comunicar que a geração está em andamento sem anunciar cada fragmento a
   tecnologias assistivas (**Derivado**).
4. Encerrar o estado de carregamento quando chegar `done: true`.
5. Em falha, preservar o texto já recebido e mostrar o erro terminal controlado
   (**Derivado**, coerente com o evento final documentado).

## Marcar atração visitada

1. A pessoa marca ou desmarca uma atração de um roteiro identificado.
2. A interface envia `PATCH` no contexto do usuário ativo.
3. Após confirmação do backend, mostra o novo estado; em falha, restaura o
   estado anterior e informa como tentar novamente (**Derivado**).

## Consultar e excluir histórico

1. Listar somente viagens pertencentes à identidade ativa.
2. Exibir estado vazio quando não houver viagens.
3. Excluir por chamada assíncrona e atualizar a lista sem recarregar a SPA.
4. A confirmação antes da exclusão é **Proposta**, ainda não requisito aprovado.

## Exportar ou compartilhar

Com um roteiro calculado, oferecer ações claramente nomeadas para abrir no
Google Maps, compartilhar resumo pelo WhatsApp e baixar GPX 1.1. Antes de um
despacho, mostrar canal/destino (**Derivado**). Falha no aplicativo externo ou
no despacho não pode apagar o roteiro. Está em aberto se WhatsApp será somente
ação cliente ou também usará o endpoint de background.
