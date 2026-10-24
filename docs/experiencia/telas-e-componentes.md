# Telas, componentes e fluxos

> **Estado:** inventário de **Fonte** com comportamentos **Derivados** para orientar implementação e testes.

Fonte principal: [Telas e Componentes](../modulo-guia-turista-inteligente.md#3-telas-e-componentes).

## Mapa da experiência

| Área | Componente principal | Dados/ações |
| --- | --- | --- |
| Cabeçalho | `Header.tsx` | identidade, tema e alternância de sessão |
| Planejamento | `RoteiroForm.tsx` | origem, destino, período, perfil e veículo |
| Rota | `MapaRota.tsx` | geometria, alternativas, autonomia, custos e relevo |
| Conteúdo | `RoteiroResult.tsx` | clima, guia progressivo, atrativos e gastronomia |
| Operação | `TelemetriaCard.tsx` | usuário ativo, latência, correlação e provedores |
| Histórico | `HistoricoViagens.tsx` | viagens persistidas e exclusão |
| Ações | `BotoesControleViagem.tsx` | Maps, WhatsApp e GPX |
| Feedback | `Toast.tsx` e `ErrorBoundary.tsx` | estados transitórios e contenção de falhas |

## Fluxo de planejamento

1. Usuário informa origem e destino com cidade e UF.
2. Pode aceitar sugestões de destinos calculadas a partir do GPS e Haversine.
3. Define combustível ou veículo elétrico, consumo/autonomia, ocupação, duração e perfil.
4. Envia uma única solicitação; o controle fica bloqueado enquanto ela estiver ativa.
5. A interface apresenta telemetria, rota, clima, custos, altimetria e histórico.
6. O guia textual aparece progressivamente por SSE.

### Estados mínimos da tela

| Estado | Comportamento esperado | Estado documental |
| --- | --- | --- |
| Inicial | Formulário disponível; resultados ausentes | Derivado |
| Validando | Erros associados ao campo e foco recuperável | Derivado |
| Carregando | Submissão bloqueada e progresso perceptível | Fonte/Derivado |
| Parcial | Dados estruturados visíveis enquanto guia recebe chunks | Fonte |
| Sucesso | Todos os painéis coerentes com a rota escolhida | Derivado |
| Erro | Mensagem acionável, dados anteriores não corrompidos | Derivado |
| Offline | Estado de rede explícito e ação incompatível impedida | Fonte/Derivado |

## Planejador

- UF deve ter duas letras maiúsculas e corresponder a valor aceito pelo backend.
- Sugestões usam a posição do navegador e consideram destinos rodoviários no critério descrito como `>400 km` na fonte.
- Veículo a combustão e elétrico expõem parâmetros próprios.
- Ocupação aceita de 1 a 8 passageiros.
- Perfil do viajante contempla cultural, gastronômico, ecoturismo/aventura, família e romântico/econômico.

> **Questão em aberto:** a expressão `>400 km` é ambígua para “raio” e “mais próximos”. Confirmar se representa distância mínima, máxima ou universo de busca.

## Mapa, custos e autonomia

- Exibir distância, duração, pedágios, autonomia e ganho/perda de elevação.
- Permitir alternância entre pelo menos duas sugestões quando fornecidas pela API.
- Posicionar abastecimentos/recargas antes do limite crítico, com margem informada na fonte como aproximadamente 18%.
- Exibir painel altimétrico expansível.
- Recalcular custo e rateio conforme rota e número de passageiros.
- Oferecer Maps, WhatsApp e arquivo GPX 1.1.

## Guia e conteúdo do destino

- Exibir clima atual do Open-Meteo.
- Acrescentar chunks do Gemini sem substituir conteúdo já recebido.
- Permitir marcar atrativos visitados.
- O texto de IA deve seguir o formato conciso definido na fonte: identidade local, turnos do roteiro, gastronomia e orientação climática.

## Histórico

- Listar apenas viagens do usuário ativo.
- Atualizar a lista após persistência concluída.
- Excluir uma viagem sem recarregar a página.
- Pedir confirmação antes de exclusão é uma decisão **Proposta**.

## Evidências de implementação

Para cada fluxo, anexar ao PR:

- captura ou gravação curta dos estados relevantes;
- teste automatizado correspondente;
- referência ao requisito/critério de aceite;
- evidência de teclado e leitor de tela para controles críticos.

