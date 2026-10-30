# Plano de correção 02 — Pontos turísticos e gastronomia

**Estado:** catálogo local e busca dinâmica por município implementados; consulta real Overpass e comparação visual pendentes.  
**Responsabilidade:** catálogo e contrato como trabalho transversal de backend, com apresentação no frontend. Se a equipe precisar distribuir a execução entre os alunos 2 e 3, a integração de dados cabe mais naturalmente ao **Aluno 2**; a matriz da atividade não atribui explicitamente a curadoria do catálogo a nenhum deles. O **Aluno 3** responde pela altimetria, não pelos atrativos.  
**Fonte funcional:** `app/backend/docs/modulo-guia-turista-inteligente.md`, seção 3.5.  
**Referências visuais:** `app/frontend/docs/wireframes/05-guia-e-streaming.png`; captura atual de **Abaiara - CE** com `0 locais` e `0 opções`; captura esperada dos cards de **Natal - RN** enviada na conversa. A composição e a hierarquia do wireframe são referência visual, mas seus locais e números não devem ser atribuídos a outro destino.

## Diagnóstico comprovado

- `app/backend/app/services/trips.py::plan_trip` chama `atrativos_por_destino`, inclui `atrativos` e `atrativos_fonte` na viagem e envia nomes ao contexto do guia. Não existe busca dinâmica de estabelecimentos no planejamento.
- `app/backend/app/services/atrativos.py::atrativos_por_destino` só aceita correspondência exata de cidade e UF no catálogo `app/backend/app/data/atrativos.json`. O catálogo contém **13 destinos**. O código também enriquece viagens antigas na leitura quando um destino passa a existir no catálogo, sem mudar o JSON persistido.
- Na investigação inicial, as viagens persistidas para **Abaiara - CE, Teresina - PI e Juazeiro - BA** não tinham atrativos. O catálogo foi ampliado para Abaiara com dois lugares documentados; Teresina e Juazeiro continuam fora da cobertura atual.
- `app/frontend/src/services/api.ts::parseTrip` e `tripOptionalFields.ts::attraction` preservam as entradas válidas. `app/frontend/src/components/RoteiroResult.tsx` já renderiza contêineres separados de pontos turísticos e gastronomia; com lista vazia, exibe mensagens de ausência. Portanto os **cards de locais individuais** não aparecem porque a lista está vazia. O filtro `Gastronomia` também oculta temporariamente o grupo turístico por desenho atual.
- A antiga lista de destinos do aviso vazio era fixa e citava somente oito cidades, embora o catálogo tivesse 13; essa divergência foi removida da interface.
- A captura mostra o card geral “Atrativos & Gastronomia”, seguido dos dois grupos individuais. Ambos estão visíveis, com `0 locais` e `0 opções` e mensagens de catálogo vazio. Portanto o defeito nesse caso é **ausência de conteúdo catalogado para Abaiara - CE**, não desaparecimento dos contêineres React. A imagem não mostra o filtro ativo; não é necessário supor um filtro para explicar o zero.
- A imagem esperada mostra **Natal - RN** com cinco pontos turísticos e cinco opções gastronômicas. O catálogo atual contém exatamente dez entradas para Natal, divididas em **5 não gastronômicas + 5 gastronômicas**, incluindo os nomes da imagem. `RoteiroResult.tsx::renderCard` já produz os cards individuais, badges, destaques e links Maps. Assim, o exemplo de Natal confirma o formato desejado; ele não é um conjunto de dados válido para Abaiara.
- O Open-Elevation é usado pelo perfil altimétrico da rota e **não fornece pontos turísticos ou restaurantes**. Seu HTTP 429 é o problema independente do Plano 01; resolver a quota de elevação não preencherá estes cards.
- Existem testes para destino catalogado, destino homônimo, histórico legado e estado vazio. Nenhum deles demonstra cobertura de Abaiara - CE com locais reais.

## Correção proposta

1. **Reproduzir Abaiara e comparar com Natal.** Conferir `viagem.atrativos` no JSON de `/planejar` ou `/minhas-viagens` e depois no `parseTrip`, sem publicar dados pessoais. A viagem persistida de Abaiara já contém lista vazia; um teste integrado deve confirmar o mesmo para planejamento novo. Para Natal - RN, verificar que o backend retorna as dez entradas catalogadas e o frontend mostra cinco cards em cada grupo. Isso separa falha de cobertura de eventual perda no transporte.
2. **Definir cobertura real do catálogo, começando por Abaiara - CE se houver fonte confiável.** Levantar fonte verificável de pontos turísticos e gastronomia e registrar nome, categoria, descrição, localização e procedência antes de adicionar itens. Preservar IDs estáveis, porque o endpoint `PATCH /api/v1/roteiros/{trip_id}/visitas` e as visitas persistidas dependem deles. Não copiar números ou estabelecimentos dos wireframes como se fossem dados reais. Se não houver fonte confiável, manter a lista vazia com explicação clara; não usar o resultado do Gemini como prova de que um estabelecimento foi verificado.
3. **Corrigir a indicação de cobertura.** Eliminar a lista fixa de oito cidades ou mantê-la sincronizada com o catálogo por um contrato existente/validado. Não criar endpoint redundante só para o aviso. Garantir que cada grupo continue visualmente presente e que filtros não causem a impressão de perda permanente dos locais.
4. **Preservar persistência e identidade.** Verificar que `/planejar` retorna os itens, `/minhas-viagens` mantém a mesma lista, o enriquecimento de viagem legada funciona e `PATCH /visitas` marca somente IDs válidos da viagem/usuário. Não alterar diretamente `app/backend/static/data/viagens.json` para forçar a demonstração.
5. **Ajustar apresentação ao wireframe.** Dois cards externos separados, títulos, contagens, badges, links Maps quando fornecidos e ação de visita. Em ausência real de dados, apresentar estado vazio por grupo, sem contagem positiva, lugares fictícios ou links fabricados.

## Verificação de aceite

- Natal - RN: resposta backend e parser preservam os dez IDs e categorias; o frontend mostra **5 cards turísticos e 5 gastronômicos**, como na referência, com títulos e links do catálogo; marcação de visita confirma resposta do servidor e sobrevive à leitura do histórico.
- Destino não catalogado: resposta vazia permanece explícita; ambos os grupos aparecem com estado vazio honesto, sem cards individuais falsos.
- Filtros e mudança de aba/viagem não descartam itens existentes nem misturam visitas de usuários diferentes.
- Capturas desktop/mobile de **Abaiara - CE** e de um destino catalogado comparadas ao PNG 05. Se Abaiara receber dados verificados, o cenário novo deverá mostrar a contagem e os cards correspondentes, sem copiar os exemplos do wireframe.

## Execução do Plano 02

- `app/backend/app/data/atrativos.json` agora contém dois locais de Abaiara - CE identificados em fontes municipais: Praça da Igreja Matriz e Mercado Público Municipal Amâncio Tavares Leite. IDs estáveis, descrições conservadoras e links Maps por pesquisa textual. As fontes e limites estão em `app/backend/app/data/FONTES_ATRATIVOS_ABAIARA.md`. Não foi cadastrado restaurante sem comprovação de operação.
- O backend já envia `atrativos` em `/planejar` e enriquece viagens antigas em `/minhas-viagens` sem alterar o JSON persistido. Leitura local da viagem salva de Abaiara retornou dois locais pelo mesmo serviço do histórico. `PATCH /visitas` agora só aceita IDs que constem na viagem ou no enriquecimento do catálogo; aceita os dois IDs novos em viagens antigas de Abaiara.
- `RoteiroResult.tsx` preserva os dois grupos visíveis ao filtrar gastronomia, elimina a lista fixa de oito cidades e só mostra Maps quando o item contém link. O parser e os componentes existentes foram reutilizados.
- Testes de catálogo, enriquecimento, visitas, parsing e renderização demonstram Natal - RN com cinco locais e cinco opções gastronômicas e Abaiara com dois locais e zero restaurantes. Suíte final: 415 testes backend, 274 frontend e 3 SSE aprovados; check e build aprovados. Resultados também estão no checklist e no relatório.
- Cobertura de outras cidades e restaurantes de Abaiara depende de fontes verificáveis. Não foram copiados locais do wireframe de Natal para Abaiara. Comparações visuais desktop/mobile continuam pendentes.

**Dependência de conteúdo:** cobertura adicional exige dados verificáveis. **Correção implementada dentro da cobertura comprovada.**

## Ampliação após correção do usuário — cobertura por destino

O cadastro de apenas Abaiara não atende à expectativa de locais próprios para cada destino. A consulta `app/backend/app/services/atrativos_osm.py` busca dados OpenStreetMap via Overpass dentro da área municipal selecionada por **nome do município e nome da UF**, sem usar um raio que possa incluir cidades vizinhas. A resposta só é aceita quando a consulta identifica exatamente uma área municipal. São selecionados elementos nomeados de turismo, patrimônio e restaurantes, com IDs OSM estáveis e link para o elemento de origem; o máximo é de 15 atrativos e 15 restaurantes por consulta. O backend mantém o catálogo existente e o complementa por OSM quando não há gastronomia, ou usa apenas OSM para cidades sem catálogo. Resultados são armazenados em cache de processo por uma hora; falhas por dois minutos.

O contrato adiciona `atrativos_fonte` (`openstreetmap` ou `catalogo_local+openstreetmap`) e `atrativos_status` (`disponivel`, `sem_resultados`, `municipio_nao_identificado` ou `indisponivel`). A interface informa indisponibilidade e atribui os dados aos colaboradores OSM. Não são inventados locais quando o provedor falha. As viagens antigas sem catálogo continuam sem busca dinâmica retroativa; uma viagem nova recebe a consulta. Uma instância pública do Overpass não respondeu com dados neste ambiente (HTTP 406 ou timeout nos ensaios); a integração foi comprovada por testes com transporte simulado, não por resposta real do provedor. `OVERPASS_URL` permite configurar outra instância autorizada. Não há garantia de que todo município tenha POIs mapeados ou de que o provedor público esteja disponível.

Validação da ampliação: 420 testes backend, 276 frontend e 3 SSE aprovados, além de check e build. Não houve medição válida da disponibilidade do Overpass para um município real neste ambiente.
