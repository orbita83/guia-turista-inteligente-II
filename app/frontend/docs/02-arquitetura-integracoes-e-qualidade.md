# Arquitetura, integrações e qualidade do frontend

Este índice organiza as informações técnicas necessárias para concluir a SPA em
`app/frontend`. Para requisitos de produto e experiência, consulte o documento
correspondente neste diretório.

## Convenções

- **Confirmado:** consta na documentação global ou em ADR aceita.
- **Implementado:** foi observado no código/configuração atual.
- **Derivado:** consequência técnica necessária de requisitos confirmados.
- **Proposto:** recomendação ainda sujeita a aprovação.
- **Pendente:** informação necessária que a documentação global não estabiliza.

Itens propostos não são contratos definitivos. Mudanças de comportamento público
exigem atualização do requisito, contrato, critério de aceite, teste e matriz global
de rastreabilidade.

## Mapa de leitura

1. [Estado, stack e estrutura](./arquitetura/estado-stack-e-estrutura.md) — baseline,
   topologia, toolchain, scripts e responsabilidades internas.
2. [Contratos REST](./arquitetura/contratos-rest.md) — convenções HTTP, catálogo de
   endpoints e entrada/saída conhecida do planejamento.
3. [Streaming, erros e resiliência](./arquitetura/streaming-erros-e-resiliencia.md) —
   parser SSE, ciclo assíncrono, concorrência, cancelamento e erros.
4. [Identidade, segurança e configuração](./arquitetura/identidade-seguranca-e-configuracao.md)
   — sessões, proteção de dados, ambiente, build e implantação.
5. [Observabilidade, testes e qualidade](./arquitetura/observabilidade-testes-e-qualidade.md)
   — sinais, camadas de teste, cenários, gates e Definition of Done.
6. [Lacunas, rastreabilidade e fontes](./arquitetura/lacunas-e-rastreabilidade.md) —
   matriz técnica, decisões bloqueantes e referências globais.

## Caminhos por necessidade

| Necessidade | Documento |
| --- | --- |
| Começar a implementação | Estado, stack e estrutura |
| Implementar o cliente HTTP | Contratos REST |
| Implementar o guia incremental | Streaming, erros e resiliência |
| Implementar login, visitante ou deploy | Identidade, segurança e configuração |
| Criar testes ou homologar uma capacidade | Observabilidade, testes e qualidade |
| Descobrir o que ainda precisa ser decidido | Lacunas, rastreabilidade e fontes |
