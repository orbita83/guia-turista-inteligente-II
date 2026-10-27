# Research Notes: Frontend History

## Scope decision

The user explicitly limited this task to frontend development. Backend developers own
all API implementation, authentication, authorization, persistence, storage, and
server-side validation. This feature must not create or modify any of those.

## Partial data presentation

Runtime validation is needed because TypeScript types do not validate JSON. Keep a
trip card when its identifier is valid even if optional fields are absent. Present
each absent field with friendly provisional copy such as “Aguardando dados” or
“Ainda não disponível”; this means the field exists but its value has not arrived.
Do not use a fake trip as real history, infer a numeric value, or state that saving
completed without confirmation from the existing API.

## Session and reconciliation

Clear visible history when the active session changes and ignore results from stale
requests. Merge planning and list responses by trip ID to avoid duplicate cards. If
the current API does not expose a persistence confirmation, retain an honest
unconfirmed state in the UI.

## Deletion

Call the existing API client. Remove the selected item only after a successful
response; on failure preserve it and re-enable its action. Keep progress scoped to
the selected card and do not reload the SPA.

## Visual implementation

The supplied visual and spatial wireframes are authoritative for appearance and
placement. Existing frontend tokens are authoritative for colors, typography,
spacing, focus, and themes. No new visual dependency is needed.
