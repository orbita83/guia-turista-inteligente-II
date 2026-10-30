# Auditoria visual inicial — Plano 00

**Estado:** análise documental e do código concluída; comparação com a SPA renderizada pendente. Nenhum componente foi modificado.  
**Branch / HEAD da inspeção:** `integracao/frontend-backend` / `d4b4cbc`.  
**Fonte funcional lida:** `app/backend/modulo-guia-turista-inteligente.md`, seções 2.2 e 3.1–3.6, integralmente.  
**Referências visuais examinadas:** `docs/wireframes/00-tela-completa.png` a `07-guia-do-viajante.png` dentro de `app/frontend/`.

## Limites da evidência

- O navegador integrado não estava disponível nesta sessão (`agent.browsers.list()` retornou `[]`). O servidor de desenvolvimento foi iniciado em `http://localhost:5174/`, mas não houve captura nem inspeção da interface renderizada. **As colunas de situação atual abaixo descrevem apenas o código; não comprovam a aparência real.**
- Os arquivos `00-tela-completa.png` e `05-guia-e-streaming.png` têm o mesmo hash SHA-256 e exibem o mesmo recorte do guia e dos atrativos. O PNG 00 não mostra a composição completa do SPA; a disposição geral em duas colunas é sustentada pelo código e pela Figura 3.7, ainda sem validação visual no navegador.
- Os PNGs exibem dados e estados exemplificativos, inclusive viagem concluída, usuário Google, alerta de latência e mapa com geometria. A sessão inicial/visitante e uma viagem sem geometria podem exibir estados diferentes, corretamente. Não transformar números, destinos, provedores ou estabelecimentos do PNG em dados reais.
- O PNG 07 mostra apenas o card do guia. O conteúdo real do Gemini pode não seguir todas as seções; a auditoria visual deverá separar formato recebido de estrutura visual.

## Matriz por figura

| Referência | Componente e código atual verificado | Situação esperada no PNG | Diferença comprovada pelo código / alteração necessária | Status |
| --- | --- | --- | --- | --- |
| Figura 2.1; §2.2; PNG 00 | `src/App.tsx` monta planejador/resultados em `planning-column` e telemetria/histórico em `planning-aside`; `styles/responsive.css` define duas colunas a partir de 1024 px. | Composição geral do SPA com coluna principal e lateral, preservando hierarquia. | Estrutura em duas colunas existe. PNG 00 não cobre a tela inteira; proporções, espaçamentos e aparência a 1440/390 px precisam de captura real. | Pendente de validação visual |
| Figura 3.1; §3.1; PNG 01 | `RoteiroForm.tsx` contém origem/destino com UF, sugestões GPS, propulsão, parâmetros avançados, duração/perfis e botão de envio; `forms-buttons.css` e `responsive.css`. | Ordem e grupos do planejador conforme o PNG, com seleção e estado de carregamento/cancelamento. | Estrutura principal existe. O PNG mostra botão **Cancelar** durante o processamento; `RoteiroForm.tsx` não contém essa ação, e `useViagem.ts` não usa `AbortController` para a submissão. Fidelidade de tamanhos, cores e estados exige captura. | Diferença funcional identificada; visual pendente |
| Figura 3.2; §3.2; PNG 02 | `TelemetriaCard.tsx` monta título, aviso condicional, última viagem, métricas por etapa/provedor, sessão e condição do serviço; `telemetry.css`. | Cards métricos compactos, alerta quando justificado e blocos na ordem do PNG. | Os blocos existem; o código exibe mais métricas por etapa do que o recorte do PNG, preservando informação real. Verificar densidade, grade, espaçamentos e estados sem medição. | Pendente de validação visual |
| Figura 3.3; §3.3; PNG 03 | `MapaRota.tsx` monta seleção de rota, Leaflet, descrição, métricas, topografia e custos; `map.css`. | Seleção → métricas e sugestão rodoviária → mapa → topografia → custos e ações. | No JSX, o mapa precede as métricas; a ordem difere do PNG. A seleção de rotas só aparece quando há alternativas. Inspecionar a representação das ações e do perfil sem inventar rota ou altitude. | Diferença estrutural identificada; visual pendente |
| Figura 3.4; §3.4; PNG 04 | `HistoricoViagens.tsx` monta título, lista vertical, origem/destino, duração, clima/distância, exclusão e estados; `trips.css`. | Card lateral “Viagens Salvas”, itens com metadados e ação excluir. | Estrutura principal existe. O código acrescenta estado de persistência e viagem em processamento; preservar esses estados. Aparência e seleção ativa pendentes de captura. | Pendente de validação visual |
| Figura 3.5; §3.5; PNG 05 | `RoteiroResult.tsx` monta resumo da viagem, clima, guia, atrativos e gastronomia; `guia.css`. | Resumo → banner meteorológico → guia → cards de atrativos → gastronomia. | Ordem geral existe. O PNG 05 é idêntico ao 00 e não permite avaliar toda a tela. Verificar visualmente separação dos dois tipos de cards e estados de clima/SSE. | Pendente de validação visual |
| Figura 3.6; §3.5; PNG 07 | `RoteiroResult.tsx` mostra seções extraídas quando reconhecidas, ou texto integral; `guia.css` dá fundo branco ao bloco e alinha ações à direita. | Card externo lilás, container interno branco, quatro seções com títulos azuis, separador tracejado e botão centralizado para recolher detalhes. | O fundo externo branco e a barra de ações à direita divergem do PNG; não há botão “Recolher detalhes”. Preservar fallback de texto real e controles SSE existentes ao adaptar. | Diferença visual/estrutural identificada |
| Figura 3.7; §3.6; PNG 06 | `SessionHeader.tsx` contém marca, subtítulo, tema, avatar/menu, alternância visitante, restauração Google e logout; `session-header.css`. | Barra superior com marca à esquerda e controles de tema/conta à direita; menu aberto conforme a imagem. | Estrutura e ações existem no JSX. Verificar alinhamento, avatar, estado aberto, tema escuro e largura mobile no navegador. | Pendente de validação visual |

## Capturas e estados ainda necessários

| Largura | Estados a registrar | Situação |
| --- | --- | --- |
| 1440 px | Entrada/visitante; formulário; viagem com rota; telemetria; histórico; guia/SSE; menu de sessão; claro/escuro | Não capturado: navegador indisponível |
| 390 px | Mesmos estados, com atenção a ordem empilhada, rolagem horizontal e controles | Não capturado: navegador indisponível |

Para imagens com viagem concluída, usar respostas reais ou fixtures identificadas como dados de demonstração; nunca apresentar os valores dos PNGs como dados obtidos dos provedores. Classificar as diferenças finais em estrutura, estilos, conteúdo, comportamento e adaptação responsiva. Registrar capturas e medições no próprio relatório antes de marcar a comparação visual como validada.
