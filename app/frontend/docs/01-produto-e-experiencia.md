# Produto e experiência do frontend

Este índice organiza tudo o que o frontend precisa entregar do ponto de vista de
produto e experiência. Contratos HTTP e decisões de implementação detalhadas ficam
no eixo de arquitetura desta pasta.

## Como interpretar os módulos

- **Fonte**: exigência explícita da atividade ou da documentação global.
- **Derivado**: detalhamento necessário para tornar uma exigência verificável,
  sem ampliar seu escopo.
- **Proposto**: recomendação de UX ainda dependente de aprovação.
- **Legado**: comportamento observado no frontend Flask atual; serve como
  referência, mas não prevalece sobre a arquitetura-alvo.
- **Em aberto**: decisão ausente ou contraditória; não deve ser inventada na
  implementação.

## Mapa de leitura

| Módulo | Conteúdo |
| --- | --- |
| [Visão e escopo](./produto-experiencia/visao-e-escopo.md) | Produto, público, objetivos e limites do frontend. |
| [Jornadas](./produto-experiencia/jornadas.md) | Sessão, GPS, planejamento, rota, guia, histórico e exportação. |
| [Telas, componentes e estados](./produto-experiencia/telas-componentes-e-estados.md) | Mapa da SPA, estrutura conceitual, estados e responsabilidades de UI. |
| [Conteúdo e regras](./produto-experiencia/conteudo-e-regras.md) | Campos, resultados, microcopy e regras de negócio visíveis. |
| [Responsividade e acessibilidade](./produto-experiencia/responsividade-e-acessibilidade.md) | Direção visual, temas, layout responsivo e WCAG 2.1 AA. |
| [Aceite, lacunas e rastreabilidade](./produto-experiencia/aceite-lacunas-e-rastreabilidade.md) | Checklist de conclusão, decisões pendentes e fontes globais. |

## Percursos recomendados

- Para implementar uma jornada: comece em **Jornadas**, consulte **Conteúdo e
  regras** e finalize com os estados do módulo **Telas, componentes e estados**.
- Para revisar interface: use **Telas, componentes e estados** junto de
  **Responsividade e acessibilidade**.
- Para homologar: use **Aceite, lacunas e rastreabilidade** e siga os links para
  os módulos que detalham cada comportamento.
