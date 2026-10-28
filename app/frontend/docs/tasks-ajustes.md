# Tarefas de correção do frontend

Origem: diagnóstico local `ajustes.md` (não versionado). Esta lista registra trabalho
exclusivo da SPA. Serviços, schemas, persistência e integrações do backend são
dependências externas, não tarefas deste plano. A ordem segue o plano do diagnóstico;
F11 já está incorporada à F05. Cada entrega deve atualizar testes, documentação e
rastreabilidade dos IDs afetados, e passar por `npm run check`, `npm test` e
`npm run build` antes da integração.

## 1. Integridade dos contratos

- [x] **F01 — Preservar e validar os campos das respostas da API.** Validar em runtime
  geometria, clima complementar, rotas, atrativos e visitas; manter viagens antigas
  legíveis; testar respostas completas, parciais e inválidas. Frontend: `services/api.ts`
  e parser associado. Rastreio: `RF-PLN-001`, `RF-MAP-001`, `RF-GUI-005`,
  `RF-HIS-001`; `CA-PLN-003`, `CA-MAP-001`, `CA-HIS-001`.

## 2. Confiabilidade das informações

- [ ] **F02 — Distinguir trajetos reais dos artificiais.** Consumir somente geometrias
  validadas como rotas confirmadas; na ausência delas, mostrar indisponibilidade e
  manter informações textuais confiáveis. Testar com e sem geometria. Depende de
  geometria rodoviária fornecida externamente. `RF-MAP-001`; `CA-MAP-001`.
- [ ] **F03 — Corrigir o perfil topográfico.** Remover métricas e gráfico fixos,
  representar séries válidas e estados de ausência, erro e carregamento. Testar
  pontos/distâncias e dados parciais. Depende de altimetria externa. `RF-MAP-004`;
  `CA-MAP-003`.
- [ ] **F04 — Remover clima fictício.** Exibir só temperatura, sensação e condição
  recebidas, com estados de ausência/falha. Testar payload parcial. `RF-GUI-005`;
  `CA-PLN-003`.
- [ ] **F12 — Remover atrativos genéricos não confirmados.** Preservar catálogo
  confiável e dados recebidos; mostrar estado vazio para destinos desconhecidos.
  Testar ambos os casos. `RF-GUI-004`; `CA-PLN-003`.

## 3. Validação e tratamento de falhas

- [ ] **F06 — Exibir erros HTTP 422 por campo.** Validar `detail`, associar `loc`
  aos controles e manter erro genérico para respostas desconhecidas. Testar
  acessibilidade e falhas. `RF-PLN-001`; `CA-PLN-001`.
- [ ] **F07 — Completar validação numérica.** Validar números finitos, limites e
  exigências condicionais de combustão/eletricidade, com mensagens acessíveis.
  Testar limites. `RF-PLN-002`; `CA-PLN-001`.
- [ ] **F08 — Tratar falhas ao salvar visitas.** Distinguir estado otimista de
  confirmação, avisar falhas e reconciliar após recuperação. Testar sucesso e falha;
  depende do endpoint externo. `RF-GUI-004`; `CA-PLN-003`.
- [ ] **F09 — Identificar streaming e contingência.** Mostrar estados distintos para
  SSE, reprodução local, conclusão, cancelamento e falha. Testar todos os fluxos;
  SSE real depende de serviço externo. `RF-GUI-002`; `CA-GUI-001`, `CA-GUI-002`.

## 4. Sincronização de viagens e rotas

- [ ] **F05 (inclui F11) — Compartilhar rota ativa.** Unificar seleção, mapa,
  métricas e GPX; exportar apenas a geometria válida da rota ativa. Testar troca de
  alternativas e indisponibilidade. `RF-MAP-002`, `RF-EXP-001`; `CA-MAP-001`,
  `CA-EXP-001`.
- [ ] **F10 — Sincronizar parâmetros da viagem histórica.** Restaurar parâmetros
  próprios da viagem ou indicar indisponibilidade, sem reutilizar dados de outra.
  Testar alternância e registros antigos. `RF-HIS-001`; `CA-HIS-001`.

## 5. Qualidade e acabamento

- [ ] **F13 — Corrigir rótulo da distância GPS.** Manter Haversine, indicar
  aproximação em linha reta e verificar quatro sugestões e entrada manual.
  `RF-PLN-007`; `CA-PLN-005`.
- [ ] **F14 — Adicionar ErrorBoundary.** Exibir recuperação acessível para erro de
  renderização; testar falha e retomada. `RNF-UX-001`; `CA-PLN-004`.
- [ ] **F15 — Auditar acessibilidade.** Verificar teclado, foco, abas, mensagens,
  contraste e movimento; corrigir somente defeitos reproduzidos. `RNF-UX-001`–`006`;
  `CA-PLN-004`.
- [ ] **F16 — Validar exportação GPX e feedback.** Verificar XML, escape e estados de
  sucesso/falha, reutilizando a rota ativa da F05. `RF-EXP-001`; `CA-EXP-001`.
- [ ] **F17 — Avaliar recursos estáticos.** Conferir referências do HTML, ícones e
  necessidade real de manifesto; adicionar apenas recursos aprovados. `RNF-UX-001`;
  `CA-OPS-003`.
- [ ] **F18 — Completar testes do frontend.** Consolidar cobertura de contratos
  parciais, validação, rotas, histórico, visitas, streaming e GPX; remover testes que
  legitimem dados simulados. A homologação geral continua externa. `CA-OPS-002`.
