# Contributing

The server uses `lib/client.mjs` for API authentication, pacing, bounded timeouts
and response handling. Existing convenience tools live in `server.mjs`.
New documented operations are registered in `lib/operations.mjs`; their request
schemas are pinned in `lib/api-spec.json` and converted by `lib/schema.mjs`.

When refreshing the public specification, review changes before updating the
snapshot. Do not silently change monetary operations or customer notifications.
Keep endpoint mappings explicit and update `docs/endpoints.md` and tests.
Never add credentials, live tickets, customer data or audit logs to this repo.

Run `npm ci`, `npm test`, `node --check server.mjs`, and `npm pack --dry-run`.
Tests must not make live API calls. Use an authorized test ticket or sandbox for
integration checks. Preserve the no-automatic-retry rule for writes and verify
state before reporting success on field updates.
