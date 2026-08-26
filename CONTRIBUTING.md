# Contributing

Issues and PRs welcome — this is a small, focused tool and easy to extend.

## Adding a new tool / endpoint

Each tool is a self-contained `server.tool(...)` block in `server.mjs`. To add one:

1. Add it near the similar existing tools (e.g. a new read-only lookup goes near
   `repairdesk_shop_info`).
2. Reuse `apiGet` / `apiPost` / `apiPut` — they already handle auth, rate limiting, retries, and
   error messages.
3. If it's a write action with real-world consequences (notifies a customer, charges a payment,
   etc.), follow the `confirmed: true` pattern used in `repairdesk_tickets_write` rather than
   letting it fire immediately.
4. Update the tools table in `README.md`.

## Testing changes

There's no test suite yet (contributions welcome here too). Before opening a PR:

```bash
node --check server.mjs   # catches syntax errors
```

Then manually verify against a real RepairDesk sandbox/test account — set `REPAIRDESK_API_KEY`
and run a few tool calls through your MCP client. Never test against a production shop's data
for a change you're not sure about.

## Reporting bugs

Include the error message and which tool/action triggered it. Redact your API key if it appears
anywhere in logs or output before pasting.
