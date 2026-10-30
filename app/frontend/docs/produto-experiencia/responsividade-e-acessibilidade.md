# Responsividade e acessibilidade

[← Índice de produto e experiência](../01-produto-e-experiencia.md)

## Requisitos documentados

- Layout responsivo com CSS Grid/Flexbox e HTML semântico.
- Temas claro e escuro via `data-theme`, ambos com contraste e foco visível.
- Preferência de tema persistida.
- Design tokens semânticos compatíveis com Material Design 3.
- Não depender de framework visual externo.
- Mapa, gráficos e métricas precisam de alternativa textual.

## Referência legada, não normativa

O frontend Flask usa abordagem mobile-first, breakpoint em `640px`, largura
máxima de `820px`, Plus Jakarta Sans, cartões claros e paleta azul. Esses dados
servem apenas para compreender o produto atual. A atividade-alvo não fixa
fonte, paleta, largura, breakpoint nem composição visual final.

## Recomendações ainda não aprovadas

- Respeitar `prefers-color-scheme` na primeira visita.
- Em mobile, colocar planejamento e resultado atual antes do histórico.
- Reservar altura útil ao mapa sem fazê-lo dominar o fluxo de leitura.
- Usar movimento somente para explicar mudança de estado e respeitar
  `prefers-reduced-motion`.

## Acessibilidade

A meta é WCAG 2.1 AA. A implementação deve:

- usar `header`, `main`, `aside` e `footer` de forma coerente;
- manter ordem de leitura/foco e operação completa por teclado;
- associar rótulos, instruções e mensagens de erro aos campos;
- fornecer foco visível em ambos os temas;
- não usar somente cor para comunicar estado;
- dar nome acessível a botões e ícones;
- anunciar carregamento, conclusão, falha e mudança relevante sem excesso;
- usar semântica adequada para toasts e não depender apenas de som;
- oferecer alternativa textual para mapa, altimetria e métricas gráficas;
- respeitar redução de movimento;
- preservar zoom e uso em dispositivos móveis;
- solicitar geolocalização em contexto compreensível e manter alternativa
  manual quando negada.

O accordion legado responde somente a clique em um cartão `div`; isso não é um
padrão acessível a preservar. Na SPA, expansões devem usar controle nativo ou
botão com estado (`aria-expanded`) e relação com o painel (**Derivado**).
