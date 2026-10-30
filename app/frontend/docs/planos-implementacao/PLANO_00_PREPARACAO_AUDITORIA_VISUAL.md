# PLANO 00 — Preparação e auditoria visual do SPA

**Prioridade:** P0  
**Objetivo:** estabelecer a referência visual e funcional antes de modificar componentes.  
**Estado:** plano registrado; execução não iniciada.

## Referências visuais

Este plano cobre os wireframes oficiais **00 a 07**. Para cada área, comparar a visão completa `00-tela-completa.png` com o PNG específico correspondente.

| Área | Base geral | Base específica |
| --- | --- | --- |
| Planejador de viagens | [00 — Tela completa](../wireframes/00-tela-completa.png) | [01 — Planejador](../wireframes/01-planejador-de-viagens.png) |
| Telemetria | [00 — Tela completa](../wireframes/00-tela-completa.png) | [02 — Telemetria](../wireframes/02-telemetria.png) |
| Mapa e autonomia | [00 — Tela completa](../wireframes/00-tela-completa.png) | [03 — Mapa e autonomia](../wireframes/03-mapa-e-autonomia.png) |
| Histórico e persistência | [00 — Tela completa](../wireframes/00-tela-completa.png) | [04 — Histórico](../wireframes/04-historico-e-persistencia.png) |
| Guia e streaming | [00 — Tela completa](../wireframes/00-tela-completa.png) | [05 — Guia e streaming](../wireframes/05-guia-e-streaming.png) |
| Sessão híbrida | [00 — Tela completa](../wireframes/00-tela-completa.png) | [06 — Sessão híbrida](../wireframes/06-sessao-hibrida.png) |
| Guia do Viajante | [00 — Tela completa](../wireframes/00-tela-completa.png) | [07 — Guia do Viajante](../wireframes/07-guia-do-viajante.png) |

O PNG 07 está disponível na pasta e integra a comparação visual do Guia do Viajante.

## Fidelidade visual obrigatória

Os PNGs oficiais são especificações visuais obrigatórias. Preservar e adaptar os componentes React existentes para seguir a estrutura, a hierarquia, a ordem e os elementos visíveis nas imagens. Não reinterpretar livremente o design, adicionar cards, alterar layouts ou omitir elementos arbitrariamente. Textos exemplificativos e números das imagens não são dados reais da aplicação. A documentação funcional permanece em `app/backend/modulo-guia-turista-inteligente.md`.

## Fonte obrigatória

Ler integralmente as seções 2.2 e 3.1–3.6 de `app/backend/modulo-guia-turista-inteligente.md`.

Abrir e inspecionar visualmente todas as imagens vinculadas às Figuras 2.1 e 3.1–3.7. Quando disponíveis, utilizar os PDFs originais como referência complementar.

As imagens representam o objetivo visual, enquanto o texto define o comportamento esperado.

## Tarefas

- [ ] Verificar branch, HEAD, alterações locais e novas implementações do backend.
- [ ] Preservar alterações não commitadas e funcionalidades já existentes.
- [ ] Inspecionar `app/frontend/src/App.tsx`, componentes, hooks, serviços e arquivos CSS.
- [ ] Executar a SPA atual e capturar sua aparência real.
- [ ] Comparar as capturas com cada wireframe original.
- [ ] Criar `app/frontend/TASKS_FRONTEND_IMPLEMENTACAO.md`.
- [ ] Registrar diferenças de estrutura, estilos, hierarquia e comportamento.
- [ ] Identificar funcionalidades existentes que precisam apenas de ajustes visuais.
- [ ] Organizar as tarefas por componente e por figura.

## Matriz obrigatória

Para cada figura, registrar:

| Campo | Informação |
| --- | --- |
| Referência | Figura e seção da documentação |
| Componente | Arquivo responsável |
| Situação atual | O que realmente aparece na SPA |
| Situação esperada | O que aparece no wireframe |
| Diferenças | Layout, estilos, conteúdo ou comportamento |
| Alterações | Modificações necessárias |
| Status | Pendente / Em execução / Implementado / Validado |

## Comparação visual

Gerar capturas do frontend nas resoluções de referência para desktop e mobile, incluindo ao menos 1440px e 390px de largura.

Registrar:

- Posicionamento e proporção dos componentes.
- Espaçamentos, bordas, cores e tipografia.
- Estados selecionados e desabilitados.
- Conteúdo e hierarquia dos cards.
- Responsividade e modo escuro.
- Estados de carregamento, erro e ausência de dados.

Não usar imagens geradas por IA como substitutas dos wireframes.

## Regras de execução

Não criar componentes duplicados sem necessidade.

Não reescrever serviços ou hooks que já estejam corretos apenas para modificar a aparência.

Não utilizar números ou informações presentes nas figuras como dados reais da aplicação.

**Critério de conclusão:** matriz visual produzida, divergências identificadas e tarefas registradas com evidências do código atual.
