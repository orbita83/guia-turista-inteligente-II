# Visão e escopo do frontend

[← Índice de produto e experiência](../01-produto-e-experiencia.md)

## Visão do produto

O Guia do Turista Inteligente é uma experiência web para planejamento de
viagens rodoviárias no Brasil. Em um único fluxo, o viajante informa origem,
destino, duração, perfil e veículo e recebe rota, clima, relevo, autonomia,
custos, conteúdo turístico, histórico e opções de exportação/compartilhamento.
O guia textual é transmitido progressivamente para reduzir a espera percebida.

## Público e atores

| Ator | Necessidade atendida pelo frontend |
| --- | --- |
| Viajante autenticado | Planejar e manter histórico associado à identidade Google. |
| Visitante temporário | Usar o produto por até duas horas sem perder uma identidade Google preservada. |
| Operador/desenvolvedor | Observar latência, correlação e disponibilidade dos provedores durante a demonstração. |

## Objetivos que cabem ao frontend

1. Coletar e validar os parâmetros da viagem em um fluxo único.
2. Mostrar resultados coerentes com a rota atualmente selecionada.
3. Tornar perceptíveis o progresso, o streaming, a degradação e os erros.
4. Permitir alternância segura entre sessão Google e visitante.
5. Oferecer histórico, marcação de visitas, Maps, WhatsApp e GPX.
6. Funcionar de forma responsiva, semântica e acessível, visando WCAG 2.1 AA.

## Fora do escopo confirmado

Não assumir compra de hospedagem, passagem, combustível ou ingresso;
navegação curva a curva dentro da SPA; edição colaborativa; aplicativo nativo;
funcionamento offline completo; cobrança; assinatura; painel administrativo;
ou garantia comercial sobre dados dos provedores gratuitos.
