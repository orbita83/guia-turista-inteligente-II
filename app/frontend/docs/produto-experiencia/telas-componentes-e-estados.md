# Telas, componentes e estados

[← Índice de produto e experiência](../01-produto-e-experiencia.md)

## Mapa da experiência

A documentação descreve uma SPA/painel, não várias páginas roteadas. As áreas
abaixo podem coexistir na tela principal e mudar conforme sessão e resultado.

| Área/estado de tela | Componente previsto | Conteúdo e ações | Estado |
| --- | --- | --- | --- |
| Entrada sem sessão | `Header.tsx` e controle de acesso | Login Google ou criação de visitante. | Fonte |
| Cabeçalho autenticado | `Header.tsx` | Identidade ativa, tema, alternância/restauração e logout. | Fonte |
| Planejador | `RoteiroForm.tsx` | Origem, destino, sugestões por GPS, duração, perfil, propulsão e passageiros. | Fonte |
| Telemetria | `TelemetriaCard.tsx` | Usuário ativo, latência da API, tempo total, correlação e provedores. | Fonte |
| Rota e viabilidade | `MapaRota.tsx` | Leaflet, alternativas, métricas, paradas, custos e altimetria. | Fonte |
| Resultado de destino | `RoteiroResult.tsx` | Clima, guia em streaming, atrativos e gastronomia. | Fonte |
| Histórico | `HistoricoViagens.tsx` | Viagens do usuário ativo e exclusão reativa. | Fonte |
| Ações da viagem | `BotoesControleViagem.tsx` | Maps, WhatsApp e download GPX 1.1. | Fonte |
| Feedback global | `Toast.tsx`, `ErrorBoundary.tsx` | Sucesso, aviso, erro e contenção de falha de renderização. | Fonte |
| Rodapé | `Footer.tsx` | Créditos pedagógicos em elemento semântico. | Fonte |

## Estrutura conceitual da tela principal

```text
┌──────────────────────────────────────────────────────────────┐
│ Cabeçalho: produto | rede/tema | sessão ativa               │
├──────────────────────────────────────────────────────────────┤
│ Planejador                                                 │
│ origem/destino · sugestões · viagem · veículo · passageiros │
├───────────────────────────────┬──────────────────────────────┤
│ Resultado atual               │ Histórico                    │
│ telemetria · mapa · custos    │ viagens do usuário ativo     │
│ clima · guia · atrativos      │                              │
├───────────────────────────────┴──────────────────────────────┤
│ Ações da viagem e rodapé                                   │
└──────────────────────────────────────────────────────────────┘
```

O arranjo exato em desktop não foi determinado. Em telas estreitas, todas as
áreas devem formar uma sequência de leitura lógica; o mapa não pode ser a única
forma de acessar informações essenciais.

## Estados da interface

| Estado | Comportamento mínimo | Classificação |
| --- | --- | --- |
| Inicial | Formulário disponível e resultados ausentes. | Derivado |
| Sem sessão | Opções Google e visitante; planejador protegido conforme contrato. | Fonte/Derivado |
| Validando | Erro ligado ao campo, instrução de correção e foco recuperável. | Derivado |
| Carregando planejamento | Ação bloqueada, `aria-busy`/status perceptível e dados submetidos estáveis. | Fonte/Derivado |
| Resultado parcial | Painéis estruturados visíveis enquanto o guia recebe chunks. | Fonte |
| Streaming | Texto cresce progressivamente; término explícito. | Fonte |
| Sucesso | Todos os painéis correspondem à rota selecionada. | Derivado |
| Histórico vazio | Explica que não há viagens e direciona para planejar a primeira. | Derivado/Legado |
| Sem alternativa | Somente rota principal, sem aba inerte. | Derivado |
| Erro recuperável | Mensagem específica, ação para tentar novamente e dados anteriores preservados. | Derivado |
| Sessão expirada | Anúncio e retorno a estado seguro, sem expor dados anteriores. | Derivado |
| Offline | Estado de rede explícito; ações que exigem rede indisponíveis. | Fonte/Derivado |
| Degradado | Dados disponíveis permanecem úteis e ausência é identificada. O mínimo por provedor está em aberto. | Fonte/Em aberto |
| Falha de renderização | `ErrorBoundary` contém a falha sem desmontar toda a aplicação. | Fonte |

O legado possui skeletons/spinners, card de carregamento e toasts com descarte
automático em seis segundos. Esses padrões podem orientar a SPA, mas duração,
animação e conteúdo não são requisitos aprovados. Existe uma divergência
importante: o JavaScript legado mantém o botão clicável para demonstrar
idempotência, enquanto a especificação-alvo exige bloquear nova submissão.
Prevalece a especificação-alvo.

## Componentes e responsabilidades de experiência

| Componente | Responsabilidade de UX |
| --- | --- |
| `Header.tsx` | Identidade, alternância/restauração, expiração, tema e estado de rede. |
| `RoteiroForm.tsx` | Fonte única dos parâmetros, campos condicionais por propulsão, sugestões e validação. |
| `MapaRota.tsx` | Mapa e alternativa textual, seleção de rota, métricas coerentes, paradas, custos e relevo. |
| `RoteiroResult.tsx` | Clima, guia progressivo estruturado, gastronomia e estados de visita. |
| `TelemetriaCard.tsx` | Separar tempo do servidor de tempo percebido; identificar correlação e provedores. |
| `HistoricoViagens.tsx` | Estado vazio, lista por identidade e exclusão sem reload. |
| `BotoesControleViagem.tsx` | Ações externas e download, com feedback e preservação do roteiro em falha. |
| `Toast.tsx` | Feedback de sucesso, erro e informação com semântica acessível. |
| `ErrorBoundary.tsx` | Isolar falhas e oferecer recuperação possível. |
| `Footer.tsx` | Créditos pedagógicos e fechamento semântico. |
