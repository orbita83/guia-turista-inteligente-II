# Tasks: Histórico de Viagens — Frontend

**Input**: `spec.md`, `plan.md`, `data-model.md`, `contracts/`, and `quickstart.md`.

**Scope rule**: every implementation task is frontend-only. Do not modify backend
source, server contracts, authentication, persistence, or backend tests. Missing data
must remain visible with friendly provisional copy such as “Aguardando dados”.

## Foundation

- [x] T001 Inspect frontend docs, wireframes, design tokens, current API client, and existing workspace changes.
- [x] T002 Add runtime parsing for complete, partial, and invalid history payloads in `app/frontend/src/services/api.test.ts`.
- [x] T003 Add session replacement and provisional-trip deduplication coverage in `app/frontend/src/hooks/useApp.test.tsx`.
- [x] T004 Normalize missing optional values to a friendly placeholder in `app/frontend/src/services/api.ts` and domain types.
- [x] T005 Guard frontend state against stale responses after session changes in `app/frontend/src/hooks/useApp.ts`.

## US1 — View saved trips

- [x] T006 Replace legacy history tests with compact-card, partial-data, empty, loading, error, and accessibility cases in `HistoricoViagens.test.tsx`.
- [x] T007 Verify desktop sidebar and narrow-screen reading order in `App.test.tsx`.
- [x] T008 Build compact trip cards and user-facing states in `HistoricoViagens.tsx`.
- [x] T009 Integrate the history panel in `App.tsx` using the supplied spatial wireframe.
- [x] T010 Apply existing tokens and responsive layout in frontend styles.

## US2 — Show planning result without false confirmation

- [x] T011 Cover pending, confirmed, unavailable-to-confirm, and deduplicated frontend states in hook/component tests.
- [x] T012 Keep the planning response visible and reconcile against the existing list contract in `useApp.ts`.
- [x] T013 Present pending and unconfirmed states accessibly in the frontend.

## US3 — Delete reactively

- [x] T014 Cover per-card progress, confirmed local removal, repeated-click protection, API failure preservation, and empty state in frontend tests.
- [x] T015 Update the frontend catalog after successful API deletion without reloading the SPA.
- [x] T016 Preserve the selected trip and announce actionable feedback when deletion fails.

## Documentation and verification

- [x] T017 Update frontend feature docs and global acceptance/traceability without claiming backend implementation.
- [x] T018 Validate scenarios in `quickstart.md` and review responsive layout evidence.
- [x] T019 Run frontend check, tests, and production build; resolve in-scope failures.
- [x] T020 Audit feature artifacts and git diff; confirm no backend source or tests were changed.

## Verification evidence

- `npm run check --workspace @guia/frontend`: passed.
- `npm test --workspace @guia/frontend`: 52 tests passed.
- `npm run build --workspace @guia/frontend`: passed.
- No backend paths are included in the feature implementation diff.
