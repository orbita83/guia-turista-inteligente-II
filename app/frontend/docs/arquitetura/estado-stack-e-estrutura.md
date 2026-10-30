# Estado, stack e estrutura

## Estado observado em 25/10/2026

- **Implementado:** workspace `@guia/frontend` com React 19, TypeScript estrito,
  Vite+, Vitest e Testing Library.
- **Implementado:** interface existente migrada para componentes, hooks, serviços,
  tipos e estilos modulares. O escopo preserva login Google/visitante, planejamento,
  histórico, exclusão, Maps, loading, accordion e notificações.
- **Implementado:** cliente JSON integrado à API FastAPI por cookie de sessão; o
  botão de exportação mostra metadados compatíveis e só os dados da identidade ativa.
- **Validado:** `npm run check --workspace @guia/frontend`, `npm test --workspace
  @guia/frontend` e `npm run build --workspace @guia/frontend`.
- **Aposentado:** SSR Flask, template, CSS e JavaScript de apresentação, além dos
  módulos síncronos de serviço da raiz. O runtime do produto é a SPA React e a API
  FastAPI.
- Recursos que aparecem apenas como alvos futuros nos documentos globais (mapa
  dedicado, SSE, custos, GPX e telemetria) permanecem fora desta migração.

Os documentos globais de arquitetura mantêm módulos como SSE e mapa como referência
futura. O escopo implementado está limitado aos fluxos que existiam no monólito.

## Topologia confirmada

```text
Pessoa viajante
      |
      v
SPA React 19 + TypeScript (Vite+, :5173)
      |  JSON / cookie de sessão
      v
API FastAPI/ASGI (:8001)
      |-- Open-Meteo (geocodificação e clima)
      |-- OSRM (rota)
      |-- Gemini (guia)
      `-- armazenamento de viagens por usuário

No navegador: Google Identity e links para Google Maps
```

**Confirmado:** navegador e backend são aplicações independentes e implantáveis
separadamente, mantidas no mesmo monorepo por npm workspaces e Turborepo. O navegador
não deve chamar provedores de clima, rota, elevação ou IA diretamente. Regras
persistentes, credenciais e decisões de negócio pertencem ao backend.

## Stack e toolchain

| Área | Escolha confirmada/implementada | Observação |
| --- | --- | --- |
| UI | React `^19.3.1`, React DOM `^19.3.1` | Dependências atuais do workspace |
| Linguagem | TypeScript `^7.0.2`, modo `strict` | `allowJs: false`, `noEmit: true` |
| Build/dev | Vite+ `1.4.0`, Vite via override | Versão de Vite+ fixada na raiz |
| Integração React | `@vitejs/plugin-react` | Configurado no workspace |
| Mapa | Leaflet `^1.9.4` | Renderização no navegador |
| Testes | Vitest/Vite+ Test, jsdom, Testing Library | Setup com `jest-dom/vitest` |
| Monorepo | npm `11.18.0`, Turbo `2.11.10` | Node `22.23.4` conforme `.node-version` |
| HTTP | Fetch API e `ReadableStream` | REST e leitura manual de SSE por `POST` |

Scripts obrigatórios do workspace:

| Script | Execução | Gate esperado |
| --- | --- | --- |
| `npm run dev` | `vp dev` | inicia em `http://localhost:5173` |
| `npm run check` | `vp check` | formato, lint e tipos |
| `npm run lint` | `vp check` | alias compatível |
| `npm test` | `vp test` | suíte Vitest |
| `npm run build` | `vp build` | gera `dist/` |

Na raiz, os mesmos nomes são orquestrados por `turbo run`. A tarefa `build` declara
`dist/**` e `build/**` como artefatos; `test` declara `coverage/**`; `dev` é persistente
e não usa cache. O `turbo.json` possui tarefa `clean`, mas o frontend não expõe script
`clean`; decidir se ela é aplicável e, se for, adicioná-la explicitamente.

## Estrutura de implementação

Estrutura-alvo confirmada, adaptada pela ADR-001 para `.ts`/`.tsx`:

```text
app/frontend/
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── manifest.webmanifest
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── RoteiroForm.tsx
│   │   ├── MapaRota.tsx
│   │   ├── RoteiroResult.tsx
│   │   ├── TelemetriaCard.tsx
│   │   ├── HistoricoViagens.tsx
│   │   ├── BotoesControleViagem.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Toast.tsx
│   │   └── Footer.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTheme.ts
│   │   ├── useToasts.ts
│   │   ├── useNetworkStatus.ts
│   │   ├── useSessionTimer.ts
│   │   └── useViagem.ts
│   ├── services/
│   │   ├── api.ts
│   │   ├── geolocation.ts
│   │   └── visitanteStorage.ts
│   ├── types/schemas.ts
│   ├── App.tsx
│   ├── config.ts
│   ├── index.css
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

## Responsabilidades e limites

- `App.tsx` e `useViagem` mantêm a fonte única de estado enquanto não houver
  evidência para uma biblioteca externa de estado.
- Componentes apresentam dados e eventos; não acessam provedores externos.
- Hooks coordenam autenticação, viagem, rede, tema e temporizadores.
- `services/api.ts` é a única fronteira REST/SSE, acrescenta identidade, captura
  telemetria e normaliza respostas.
- `types/schemas.ts` contém tipos estáticos e validação em runtime. TypeScript sozinho
  não valida JSON recebido.
- `services/geolocation.ts` encapsula GPS e Haversine; negar GPS não pode impedir o
  preenchimento manual.
- `services/visitanteStorage.ts` preserva o estado temporário e a identidade Google
  restaurável sem misturar históricos.
- `MapaRota` é a fonte visual de geometria, rota selecionada, paradas, custos e
  altimetria; trocar a alternativa deve atualizar o conjunto atomicamente.
- Não usar `any` para contornar contratos sem justificativa documentada.
- Modelar operações assíncronas com estados discriminados, evitando combinações de
  booleanos impossíveis.
