# PLANO 01 — Estrutura do SPA e formulário de planejamento

**Referências:** Figura 2.1, Figura 3.1 e Figura 3.7  
**Páginas:** 2, 16–17 e 27  
**Prioridade:** P1  
**Estado:** plano registrado; execução não iniciada.

## Referências visuais

As imagens oficiais deste plano são [00 — Tela completa](../wireframes/00-tela-completa.png), [01 — Planejador de viagens](../wireframes/01-planejador-de-viagens.png) e [06 — Sessão híbrida](../wireframes/06-sessao-hibrida.png). A imagem 06 orienta o cabeçalho e os estados da sessão; a 01 orienta a hierarquia do formulário; a 00 orienta a composição em colunas.

## Fidelidade visual obrigatória

Os PNGs oficiais são especificações visuais obrigatórias. Preservar e adaptar os componentes React existentes para seguir a estrutura, a hierarquia, a ordem e os elementos visíveis nas imagens, incluindo a posição do planejador, dos resultados e da barra lateral. Não reinterpretar livremente o design, adicionar cards, alterar layouts ou omitir elementos arbitrariamente. Textos exemplificativos e números das imagens não são dados reais da aplicação. A documentação funcional permanece em `app/backend/modulo-guia-turista-inteligente.md`.

## Objetivo

Reproduzir a composição visual principal do SPA e adequar o formulário e o cabeçalho aos wireframes, preservando o fluxo de autenticação e planejamento.

## Componentes principais

- `src/App.tsx`
- `src/components/SessionHeader.tsx`
- `src/components/RoteiroForm.tsx`
- `src/components/TripNavigationTabs.tsx`
- `src/styles/tokens-base.css`
- `src/styles/session-header.css`
- `src/styles/forms-buttons.css`
- `src/styles/responsive.css`

## Etapa 1 — Estrutura visual do desktop

- [ ] Adequar o layout à composição em duas colunas exibida na Figura 2.1.
- [ ] Manter o planejador e os resultados na coluna principal.
- [ ] Posicionar Telemetria e Viagens Salvas na coluna lateral.
- [ ] Ajustar larguras, espaçamentos, superfícies e alinhamentos conforme a imagem original.
- [ ] Preservar navegação reativa entre Visão Geral, Mapa & Paradas e Guia & Clima.
- [ ] Garantir que a aba escolhida determine corretamente o conteúdo exibido.
- [ ] Evitar que mudanças de aba reiniciem requisições ou apaguem dados.

## Etapa 2 — Cabeçalho

Implementar a estrutura visual da Figura 3.7:

- Marca e nome Guia do Turista Brasil à esquerda.
- Descrição curta abaixo do nome, conforme a referência.
- Alternância claro/escuro.
- Avatar e menu do usuário.
- Identificação visual do modo Google ou visitante.
- Ação de alternância para visitante.
- Ação de restauração da sessão Google preservada.
- Logout e indicação de sessão quando aplicável.

Preservar `useAuth`, `useTheme`, temporizador e contratos existentes.

Não guardar tokens sensíveis no `localStorage`.

## Etapa 3 — Planejador de viagens

Ajustar a Figura 3.1 mantendo a seguinte hierarquia:

1. Cabeçalho e descrição do planejador.
2. Cidade de origem e seletor de UF.
3. Cidade de destino e seletor de UF.
4. Sugestões de destinos acima de 400 km.
5. Seletores de Combustão e 100% Elétrico.
6. Parâmetros avançados de consumo e preço.
7. Grupo visual de duração de 1 a 5 dias.
8. Grupo de perfis do viajante.
9. Botão principal de planejamento e ação de cancelamento durante o processamento.

## Etapa 4 — Integração funcional

- [ ] Preservar autocomplete IBGE e validação de municípios.
- [ ] Preservar sugestões GPS/Haversine e seus estados de indisponibilidade.
- [ ] Alternar corretamente os campos de combustão e elétrico.
- [ ] Enviar somente parâmetros compatíveis com o schema do backend.
- [ ] Exibir mensagens de validação HTTP 422 junto aos campos.
- [ ] Impedir submissões duplicadas.
- [ ] Implementar o botão Cancelar do estado de planejamento, conectando-o ao cancelamento real da requisição por `AbortController`.
- [ ] Tratar HTTP 409 sem perder o formulário preenchido.
- [ ] Preservar os campos após erros recuperáveis.

## Critérios de aceitação

- A composição corresponde visualmente às Figuras 2.1, 3.1 e 3.7.
- O formulário mantém as validações existentes.
- Planejar e Cancelar funcionam corretamente.
- As sessões Google/visitante continuam operacionais.
- O desktop não apresenta sobreposições e o mobile não possui rolagem horizontal indevida.
- As alterações ficam concentradas nos componentes e estilos necessários.

Ao concluir, atualizar `TASKS_FRONTEND_IMPLEMENTACAO.md`.
