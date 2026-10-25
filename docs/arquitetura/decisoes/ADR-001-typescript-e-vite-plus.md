# ADR-001 — TypeScript e Vite+ no frontend

- **Status:** aceita
- **Data:** 2026-10-24
- **Escopo:** `app/frontend`

## Contexto

A fonte canônica descreve React 19 com Vite e exemplifica arquivos JavaScript/JSX, como `App.jsx`, `api.js` e `MapaRota.jsx`. Ela exige os comportamentos, responsabilidades e tecnologias centrais da SPA, mas não declara JavaScript sem tipagem como restrição.

O projeto decidiu adotar TypeScript e Vite+ para aumentar segurança de contratos, coerência de tooling e velocidade de validação sem alterar o escopo funcional da atividade.

## Decisão

O frontend será implementado com:

- React 19;
- TypeScript em modo estrito;
- Vite+ como toolchain do projeto;
- arquivos de componentes em `.tsx`;
- hooks, services, tipos e configuração em `.ts`;
- Vitest integrado pelo comando `vp test`;
- análise estática, formatação e verificação de tipos por `vp check`;
- build da aplicação por `vp build`;
- servidor de desenvolvimento Vite por `vp dev`.

Vite+ executa o servidor e o build padrão do Vite por meio da CLI `vp`; portanto, esta decisão preserva o requisito de Vite da fonte. Referência técnica: [documentação oficial do Vite+](https://viteplus.dev/guide/).

## Mapeamento de equivalência

| Referência da fonte | Implementação adotada |
| --- | --- |
| `App.jsx` | `App.tsx` |
| `main.jsx` | `main.tsx` |
| `MapaRota.jsx` e demais componentes | `MapaRota.tsx` e demais componentes `.tsx` |
| `api.js` | `api.ts` |
| `geolocation.js` | `geolocation.ts` |
| `visitanteStorage.js` | `visitanteStorage.ts` |
| `schemas.js` | `schemas.ts` |
| `config.js` | `config.ts` |
| `vite.config.js` | `vite.config.ts` |
| `npm run dev` | script compatível que executa `vp dev` |
| `npm test` | script compatível que executa `vp test` |
| `npm run lint` | script compatível que executa `vp check` |
| build Vite | `npm run build`, executando `vp build` |

## Compatibilidade de comandos

O `package.json` deve expor ao menos:

```json
{
  "scripts": {
    "dev": "vp dev",
    "check": "vp check",
    "lint": "vp check",
    "test": "vp test",
    "build": "vp build"
  }
}
```

Os aliases preservam os comandos esperados na atividade e evitam exigir instalação global da CLI. A versão de `vite-plus` deve ser fixada nas dependências do projeto e atualizada deliberadamente.

## Consequências positivas

- erros de integração entre API e componentes podem ser detectados antes da execução;
- contratos de props, hooks, serviços, SSE e modelos ficam explícitos;
- Vite, Vitest, Oxlint/Oxfmt e checagem de tipos compartilham uma única entrada operacional;
- a apresentação mantém equivalência direta com os arquivos citados na atividade.

## Custos e riscos

- a equipe precisa conhecer TypeScript, tipos discriminados e tratamento de `unknown`;
- tipos não substituem validação em runtime de respostas externas;
- atualizações do Vite+ podem atualizar ferramentas internas em conjunto e exigem validação do projeto;
- exemplos JavaScript da fonte precisam ser traduzidos, não copiados literalmente.

## Regras de implementação

1. Não usar `any` para contornar contratos sem justificativa documentada.
2. Manter validação em runtime na fronteira HTTP, mesmo com tipos estáticos.
3. Modelar estados assíncronos como estados explícitos, evitando combinações booleanas impossíveis.
4. Executar `vp check`, `vp test` e `vp build` antes de integrar alterações do frontend.
5. Preservar os comportamentos e critérios de aceite da atividade independentemente da extensão dos arquivos.

