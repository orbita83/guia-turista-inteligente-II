# Quickstart: Histórico e Persistência de Viagens

## Pré-requisitos

1. Node 22.23.4 e npm 11.18.0.
2. Dependências instaladas com `npm install` na raiz.
3. `.env` local configurado a partir de `.env.example`, sem segredos versionados.

## Executar

```powershell
npm run dev
```

Abra a SPA em `http://localhost:5173` e mantenha a API em
`http://localhost:8001`.

## Cenário 1 — Histórico completo e parcial

1. Entre com uma identidade de teste.
2. Confirme que “Viagens Salvas” aparece na coluna direita, abaixo da telemetria
   quando ela estiver visível; em tela estreita, confirme o empilhamento.
3. Carregue uma viagem completa e outra sem clima/distância/duração.
4. Verifique rota, tempo, temperatura e distância no card completo.
5. Verifique que campos ausentes continuam visíveis com texto como “Aguardando dados”, deixando claro que a informação ainda não chegou.

## Cenário 2 — Estado da viagem retornada e confirmação disponível

1. Simule no teste frontend uma resposta de planejamento antes de a listagem refletir a viagem.
2. Confirme que o resultado aparece e não desaparece durante a reconciliação.
3. Após a listagem conter o mesmo `id`, confirme que o estado pendente some e não há
   duplicidade.
4. Simule ausência de confirmação e verifique uma mensagem clara como “Ainda não foi possível confirmar”, sem falso
   sucesso.

## Cenário 3 — Exclusão reativa

1. Com duas viagens, acione “Excluir” na primeira.
2. Verifique “Excluindo...” somente nela.
3. Em `204`, confirme remoção sem reload e preservação da segunda.
4. Em erro de API ou falha de rede, confirme que o item permanece e o feedback é
   anunciado.

## Cenário 4 — Troca de sessão no frontend

1. Mocke no teste de UI sessões A e B com catálogos diferentes.
2. Troque de A para B durante uma listagem e confirme que a resposta antiga não
   reaparece na interface.
3. Não use este cenário para testar autorização server-side; isso pertence à equipe
   de backend.

## Validação automatizada

```powershell
npm run check
npm test
npm run build
```

## Validação visual e acessível

- 360, 768, 1024 e 1280 px; zoom de 200%; temas claro e escuro.
- Navegação apenas por teclado, foco visível e anúncios de carregamento/exclusão.
- Sem rolagem horizontal e sem significado comunicado apenas por cor ou ícone.
- Captura do desktop com painel lateral e do mobile empilhado para evidência do PR.

