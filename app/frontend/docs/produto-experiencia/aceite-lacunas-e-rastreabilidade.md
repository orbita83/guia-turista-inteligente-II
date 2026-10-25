# Aceite, lacunas e rastreabilidade

[← Índice de produto e experiência](../01-produto-e-experiencia.md)

## Critérios de aceite do frontend

Um frontend funcionalmente concluído deve demonstrar, no mínimo:

- [ ] login Google válido, recusa de token inválido e sessão visitante de 2 h;
- [ ] alternância Google → visitante sem destruir a identidade preservada e
      restauração por `Voltar para [Nome]`;
- [ ] limpeza/sincronização de dados ao trocar de identidade;
- [ ] formulário completo, validação acessível e campos condicionais para
      combustão/EV;
- [ ] quatro sugestões por GPS e fallback manual quando GPS falhar/for negado;
- [ ] bloqueio de nova submissão durante requisição ativa e tratamento de 409;
- [ ] tratamento de 422 por campo quando o contrato permitir o mapeamento;
- [ ] mapa Leaflet com origem, destino, rota e paradas, mais alternativa textual;
- [ ] troca de rota atualizando todas as métricas dependentes;
- [ ] custos, rateio, emissões, autonomia e altimetria apresentados;
- [ ] clima com os quatro dados exigidos;
- [ ] guia SSE progressivo, sem perda de chunks, com término e erro controlados;
- [ ] atrativos/gastronomia e marcação de visita persistida;
- [ ] histórico isolado, estado vazio e exclusão sem reload;
- [ ] Maps, WhatsApp e GPX com feedback de sucesso/falha;
- [ ] telemetria distinguindo servidor e cliente e expondo correlação/provedores;
- [ ] estado online/offline, tema persistido e barreira de erro;
- [ ] teclado, foco, contraste, nomes/estados acessíveis e redução de movimento;
- [ ] comportamento responsivo nos tamanhos definidos pela futura matriz;
- [ ] testes automatizados dos fluxos e evidências visuais/manuais pertinentes.

## Lacunas e decisões pendentes

Estas decisões bloqueiam uma definição completamente fechada da experiência:

1. Semântica do limiar de `400 km` das sugestões.
2. Fonte e extensão do catálogo/autocomplete de cidades.
3. Contratos exatos de veículo, rota, custos e eventos SSE.
4. Limites, unidades, arredondamento e valores padrão dos campos numéricos.
5. Se “romântico/econômico” é um perfil ou dois.
6. Resposta mínima aceitável quando clima, elevação, IA, rota ou paradas falham.
7. Comportamento exato após expiração da sessão visitante.
8. Modelo de confiança do `X-User-Id` e armazenamento permitido para identidade.
9. Política de privacidade, consentimento, retenção e exclusão total de dados.
10. Política e limite do histórico.
11. Origem de preços, pedágios, emissões e penalização altimétrica.
12. Fluxo definitivo do WhatsApp e dos despachos em background.
13. Matriz de navegadores, dispositivos, leitores de tela e breakpoints.
14. Design visual final: marca, paleta, tipografia, iconografia e densidade.
15. Confirmação (ou undo) para exclusão de viagem.
16. Metas de desempenho têm cenário de demonstração, mas não percentil,
    hardware, carga ou rede definidos; não são SLOs de produção.

## Rastreabilidade

| Tema | IDs globais principais | Fonte global |
| --- | --- | --- |
| Sessão e identidade | RF-AUT-001–006; RN-AUT-001–005; RNF-AUT-001–004 | `docs/produto/*`, `docs/experiencia/sessoes-e-acessibilidade.md` |
| Planejamento e GPS | RF-PLN-001–007; RN-PLN-001–007 | `docs/produto/*`, `docs/experiencia/telas-e-componentes.md` |
| Mapa e relevo | RF-MAP-001–005; RN-MAP-001–003 | mesmos documentos e seção 3.3 da atividade |
| Custos e autonomia | RF-CST-001–005; RN-CST-001–005 | mesmos documentos e seção 3.3 da atividade |
| Guia e atrações | RF-GUI-001–006; RN-GUI-001–007 | mesmos documentos e seções 3.5/4.2 da atividade |
| Histórico e ações | RF-HIS-001–003; RF-EXP-001–004; RN-HIS/EXP | mesmos documentos e seções 3.4/4.5 da atividade |
| Telemetria | RF-TEL-001–005; RNF-TEL-001–005 | requisitos e seção 3.2 da atividade |
| Acessibilidade/UX | RNF-UX-001–006 | requisitos não funcionais e docs de experiência |

Fontes relativas ao repositório:

- [`docs/modulo-guia-turista-inteligente.md`](../../../../docs/modulo-guia-turista-inteligente.md)
- [`docs/produto/visao-e-escopo.md`](../../../../docs/produto/visao-e-escopo.md)
- [`docs/produto/requisitos-funcionais.md`](../../../../docs/produto/requisitos-funcionais.md)
- [`docs/produto/requisitos-nao-funcionais.md`](../../../../docs/produto/requisitos-nao-funcionais.md)
- [`docs/produto/regras-de-negocio.md`](../../../../docs/produto/regras-de-negocio.md)
- [`docs/produto/casos-de-uso.md`](../../../../docs/produto/casos-de-uso.md)
- [`docs/experiencia/telas-e-componentes.md`](../../../../docs/experiencia/telas-e-componentes.md)
- [`docs/experiencia/sessoes-e-acessibilidade.md`](../../../../docs/experiencia/sessoes-e-acessibilidade.md)

Referência legada consultada: `templates/index.html`, `static/css/style.css` e
`static/js/app.js`. Ela foi usada somente para identificar comportamento
existente e divergências; não substitui os requisitos da SPA.
