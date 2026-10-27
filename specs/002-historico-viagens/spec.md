# Feature Specification: Histórico de Viagens

**Feature Branch**: `003-historico-viagens`  
**Created**: 2026-10-27  
**Status**: Approved for frontend implementation  
**Scope**: Frontend only

## Objective

Create the saved trips history panel in the existing frontend, following the visual
wireframe at `app/frontend/docs/wireframes/tela-historico-e-persistencia-de-viagens`
and the spatial wireframe in the same directory. Reuse the system's existing design
tokens and consume the API contracts that already exist.

This feature does not implement or modify backend code, endpoints, authentication,
authorization, storage, server contracts, or persistence behavior. Those are owned
by backend developers. If a field or capability is not provided by the existing API,
the frontend still presents the appropriate field or UI state and communicates the
missing information honestly.

## User Stories

### US1 — Consult saved trips (P1)

As a signed-in user, I can see my trips in a compact panel and quickly identify each
route, duration, temperature, and distance. If data has not arrived, its field stays
visible with a friendly placeholder such as “Aguardando dados” or “Ainda não
disponível”, making clear that the field exists but its value has not been received.

Acceptance:

1. The panel displays trips returned by the existing list contract, in its order.
2. Complete trip cards show route, duration, temperature, and distance.
3. Missing or invalid optional fields do not hide the card or its other fields; the
   placeholder must not imply a fabricated value or a valid zero.
4. A successful empty response shows a helpful empty state; loading, offline, and
   recoverable errors are distinct from empty.
5. Late responses from a previous frontend session do not repopulate its data.

### US2 — Show a newly planned trip honestly (P2)

The frontend displays the trip returned by the existing planning contract, even when
optional fields are absent, and prevents duplication when it also appears in the
history list. It indicates saving/confirmation only when supported by observable
responses. If confirmation is not available, it says “Ainda não foi possível
confirmar” or equivalent and never claims success without evidence.

Acceptance:

1. A valid planning response remains visible while history reconciliation is pending.
2. Matching IDs are merged without duplicate cards.
3. Missing confirmation is represented as unconfirmed, not as a backend failure or
   success claim.
4. Session changes cancel or ignore stale reconciliation results.

### US3 — Remove a trip reactively (P3)

The user can request deletion for a trip and see the local list update after a
successful response from the existing delete contract, without reloading the SPA.

Acceptance:

1. Only the selected card shows deletion progress; other cards remain usable.
2. A successful API response removes only the selected card locally.
3. An API/network failure preserves the card and restores the action with feedback.
4. Removing the final card shows the empty state.

## Functional Requirements

- **FR-001**: Render “Viagens Salvas” with the hierarchy and compact card structure
  shown by the visual wireframe, using existing design tokens.
- **FR-002**: Follow the spatial wireframe: desktop sidebar below telemetry; narrow
  screens use the established linear reading order without horizontal page scrolling.
- **FR-003**: Show route as the primary content and duration, temperature, and
  distance as secondary fields.
- **FR-004**: Keep fields visible when their values are missing, empty, invalid, or
  not yet provided. Use friendly temporary wording such as “Aguardando dados”; the
  exact phrase may follow product language. Do not invent or estimate values.
- **FR-005**: Distinguish loading, empty, ready, partial data, recoverable error,
  offline, planning/persistence pending, unconfirmed, and deletion states.
- **FR-006**: Consume the active identity and trips as supplied by existing session
  and history contracts. Clear old visible data on identity change. Do not implement
  authorization or identity selection in the frontend.
- **FR-007**: Display the planning response without discarding it because optional
  fields are missing; deduplicate by the trip ID when reconciling the list.
- **FR-008**: Do not claim that persistence completed unless an existing API response
  confirms it. Missing confirmation must have clear user-facing wording.
- **FR-009**: Delete through the existing API client and update only the selected
  card after a successful response; preserve it and provide feedback on failure.
- **FR-010**: Validate external JSON at the frontend boundary; reject unsafe items
  without an identifier while allowing optional fields to be absent.
- **FR-011**: Use accessible names, keyboard-operable controls, visible focus, and
  textual status feedback; meaning must not depend on color or icon alone.

## Out of Scope

All backend changes, including endpoint creation/modification, background tasks,
database or JSON persistence, storage, locks, authentication, authorization, server
validation, and server-side tests. Also out of scope: pagination, search, filters,
user-selected ordering, editing, bulk deletion, restore, retention policy, sharing,
GPX, Maps navigation, and modal deletion confirmation.

## Non-Functional Requirements

- **NFR-001**: History failures remain contained to the history component and do not
  prevent planning or erase a valid planning result.
- **NFR-002**: Session changes prevent old frontend requests from updating the current
  session's visible catalog.
- **NFR-003**: Essential content works at 360, 768, 1024, and 1280 px, at 200% zoom,
  in light and dark themes, without horizontal page scrolling.
- **NFR-004**: Controls support keyboard use, visible focus, and accessible labels;
  state changes are announced without excessive repetition.

## Success Criteria

- **SC-001**: All cards with absent optional fields retain their layout and show an
  understandable placeholder in 100% of frontend test cases.
- **SC-002**: Matching planning/list IDs produce one visible card in 100% of tested
  reconciliation cases.
- **SC-003**: Confirmed deletion removes only its selected card without full-page
  reload; failed deletion leaves the card available in 100% of tested cases.
- **SC-004**: No stale response from a previous identity appears after session change.
- **SC-005**: The panel follows the supplied wireframes and remains usable at target
  widths and zoom levels.

## Assumptions

- The visual and spatial references in `app/frontend/docs/wireframes/` are normative
  for presentation and placement; sample names and values in them are illustrative.
- Existing API contracts and behavior are fixed dependencies for this frontend task.
- Missing field wording is a user-friendly provisional value, not an API value or a
  claim that data will eventually arrive. “Indisponível” is only an example and is not
  required as literal UI copy.
- Test fixtures may represent partial API responses but must not be shown as real
  user trips outside tests.
- Any backend capability gap is documented as a limitation; it is not implemented
  by this frontend task.
