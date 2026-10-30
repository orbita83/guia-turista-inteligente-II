# Plano de correção 01 — Topografia e relevo

**Estado:** correção de backend e apresentação implementada; consulta real ao provedor validada. Captura visual de nova viagem ainda pendente.  
**Responsável principal:** Aluno 3 (Data & Altimetry Engineer), com integração visual do frontend.  
**Fonte funcional:** `app/backend/docs/modulo-guia-turista-inteligente.md`, seção 3.3 e matriz de responsabilidades.  
**Referência visual:** `app/frontend/docs/wireframes/03-mapa-e-autonomia.png` e captura de referência enviada na conversa. Os números da imagem são ilustrativos.

## Diagnóstico comprovado

- `app/backend/app/services/trips.py::measured_elevations` consulta `obter_perfil_topografico` para a rota principal e cada alternativa que tenha geometria; coloca o resultado em `percurso.altimetria` ou `alternativas[i].altimetria`.
- `app/backend/app/services/altimetria_service.py::consultar_open_elevation` envia a geometria amostrada ao Open-Elevation por POST. Falhas HTTP retornam estado `erro_provedor`, sem inventar perfil.
- Nas **três viagens atualmente persistidas** em `app/backend/static/data/viagens.json`, as rotas estão `disponivel` e as quatro tentativas altimétricas registradas têm `status: erro_provedor`, sem pontos, com resposta **HTTP 429 / quota anônima de coordenadas excedida**. A geometria está presente. Isso explica o estado vazio mostrado na captura; não é evidência de que o frontend tenha descartado um perfil válido nessas viagens.
- `app/frontend/src/services/tripOptionalFields.ts::providerElevation` preserva o perfil somente quando `sucesso: true`; mantém `statusAltimetria` quando há erro. `app/frontend/src/components/MapaRota.tsx` desenha o SVG apenas com ao menos dois pontos. A UI não usa `statusAltimetria` para explicar a falha e mostra apenas indisponibilidade genérica.
- O frontend associa perfil à rota ativa sem emprestar os pontos de outra alternativa. Essa proteção deve ser preservada.
- O [provedor informa](https://www.open-elevation.com/terms.html) que a franquia depende de coordenadas, que cada coordenada conta e que requisições são recusadas ao atingir o limite. Sua [documentação](https://www.open-elevation.com/index.html) identifica HTTP 429 como limite de requisições ou franquia. Não há evidência de falha de parsing no caso persistido.

## Correção proposta

1. **Restabelecer uma fonte de elevação utilizável.** Confirmar no provedor a configuração atual de chave e a forma de autenticação. Se houver chave autorizada para o projeto, configurá-la somente no backend e em variável de ambiente, sem expô-la ao Vite. Avaliar a franquia frente à amostragem atual (até 100 coordenadas por rota, incluindo alternativas). Se a fonte continuar indisponível, manter o estado explícito; não criar elevações simuladas. Uma instância própria ou outra fonte exige decisão e validação de licença, cobertura e contrato antes de implementação.
2. **Tratar quota como estado operacional específico.** Mapear HTTP 429 de maneira estável, sem mostrar corpo bruto da resposta. Evitar novas consultas inúteis durante a janela de limitação conforme cabeçalhos/contrato reais do provedor; não presumir prazo de recuperação. Preservar o planejamento, geometria, custos parciais e telemetria quando só a altimetria falhar.
3. **Ajustar a apresentação do erro.** Transportar um motivo público seguro para a rota principal e alternativas e mostrar no painel de topografia a diferença entre “provedor sem quota”, timeout, geometria ausente e perfil ainda não medido. Manter o layout e a sanfona da referência. Só exibir gráfico, cotas, subida, descida, tipo de terreno e rendimento ajustado quando os dados reais correspondentes existirem.
4. **Garantir consistência numérica.** Para um perfil bem-sucedido, conferir os mesmos pontos, cotas e ajustes em `percurso.altimetria`, no parser, na rota ativa, na autonomia e nos custos. O exemplo do wireframe não define valores da viagem: um acréscimo de consumo de 6,9% não autoriza copiar “12,0 km/l” como rendimento real sem cálculo coerente com o contrato.
5. **Histórico existente.** Não modificar `viagens.json` nem preencher retroativamente perfis falhos. Uma viagem persistida com `erro_provedor` continua com esse status até haver uma nova consulta explicitamente prevista; não prometer recuperação automática pelo simples ajuste da configuração.

## Verificação de aceite

- Teste backend com sucesso do provedor: geometria real amostrada, pontos e métricas retornados na rota correta; teste com HTTP 429: estado explícito, sem dados fictícios e sem quebrar `/planejar`.
- Teste do parser e do `MapaRota`: sucesso desenha o perfil e as cotas da alternativa selecionada; HTTP 429 mostra motivo claro e nenhum SVG inventado; mudar de alternativa não mistura dados.
- Uma execução real com fonte autorizada e quota disponível comprova o caminho ponta a ponta; registrar o status e as métricas reais sem publicar credenciais. Testes simulados isoladamente não comprovam disponibilidade do provedor.
- Capturas desktop e mobile comparadas ao PNG oficial, preservando os elementos e a hierarquia visual.

## Execução do Plano 01

- O backend lê `OPEN_ELEVATION_API_KEY` do ambiente e a envia exclusivamente no cabeçalho `X-API-Key` das consultas ao Open-Elevation. Nenhuma credencial passa pelo frontend.
- A resposta HTTP 429 agora recebe `cota_excedida` e mensagem segura; os demais erros continuam explícitos, sem construir perfil artificial. A consulta de cada alternativa continua vinculada à sua geometria.
- O parser reconhece também viagens persistidas com a antiga mensagem HTTP 429. O painel de topografia informa quota, timeout, conexão ou geometria inválida para a rota selecionada. O gráfico só aparece com amostras reais.
- Foram adicionados testes do cabeçalho, do erro 429, do encadeamento router → planejamento, do parser e do mapa. Os resultados da validação final constam na TASK-BE-014 e no relatório backend.
- A chave foi configurada localmente, sem exposição no código. Uma consulta real de 10 amostras da geometria salva de Abadia de Goiás - GO a Abaiara - CE retornou `sucesso` e cotas de 225,23 m a 1.052,63 m. Essa verificação não gravou nem alterou viagens. As viagens já persistidas continuam sem amostras; é preciso planejar novamente para ver o perfil no SPA.
- A instrução de evitar novas consultas durante uma janela de limitação permanece sem implementação: o provedor não forneceu uma janela utilizável nas evidências disponíveis, e não se definiu um prazo arbitrário. A aplicação não repete automaticamente uma consulta falha na mesma viagem.

**Dependência externa:** franquia disponível do Open-Elevation em novos planejamentos. **Plano 02 (atrativos) não foi implementado nesta execução.**

**Separação de responsabilidades:** Open-Elevation fornece apenas altitudes para a rota. Seu estado indisponível não explica a lista vazia de pontos turísticos de Abaiara - CE; esse assunto está no Plano 02.
