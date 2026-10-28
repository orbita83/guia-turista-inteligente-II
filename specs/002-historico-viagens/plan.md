# Implementation Plan: Histórico de Viagens — Frontend

**Branch**: `003-historico-viagens` | **Spec**: [spec.md](./spec.md)

## Scope

Implement the history panel and its API integration exclusively in `app/frontend/`.
The existing API is a read-only dependency for this feature. Do not change server
code, endpoints, authentication, storage, or server contracts. If a value is absent,
keep its field visible with friendly copy such as “Aguardando dados”; never fabricate
values or claim unconfirmed persistence.

## Technical Context

- TypeScript strict mode, React 19, Vite+, existing design tokens and API client.
- Transport and runtime validation stay in `src/services/api.ts`; state orchestration
  stays in the existing hook; presentation stays in history components.
- Tests use Vitest and Testing Library. No new dependency or visual framework.
- Verify frontend check, test, and build commands after implementation.

## Design Direction

Follow both supplied wireframes. At desktop widths, place the history below telemetry
in the sidebar. At narrow widths, use the established stacked reading order. Cards
prioritize origin and destination, with duration, temperature, distance, and deletion
action. Reuse existing typography, spacing, color, surface, focus, and theme tokens.
Use clear accessible copy for pending/unconfirmed states and missing values.

## Frontend Structure

```text
app/frontend/src/
  components/HistoricoViagens.tsx
  components/HistoricoViagens.test.tsx
  hooks/useApp.ts
  hooks/useApp.test.tsx
  services/api.ts
  services/api.test.ts
  styles/trips.css
  styles/tokens-base.css
  styles/responsive.css
```

Only files under `app/frontend/` may be changed for implementation. Feature specs and
documentation may be updated to preserve scope and traceability. Backend files and
backend tests are explicitly excluded.

## Verification

Test complete/partial/malformed API data, session replacement, reconciliation and
deduplication, deletion success/failure, accessibility states, and responsive DOM
order. Run `npm run check --workspace @guia/frontend`,
`npm test --workspace @guia/frontend`, and
`npm run build --workspace @guia/frontend`.
