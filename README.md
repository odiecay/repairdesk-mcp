# RepairDesk MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that gives any
MCP-compatible AI assistant — Claude Code, Claude Desktop, or any other MCP client — direct,
read/write access to your [RepairDesk](https://www.repairdesk.co/) shop data. Point it at your
store's API key and start asking things like *"look up ticket T-15423"*, *"what's overdue on
invoice 8821"*, or *"assign the iPhone screen job to Dave"*.

Not an official RepairDesk product — an independent tool built by a RepairDesk shop for
RepairDesk shops.

## What you can actually do with this

Once it's wired into your AI harness, you can just talk to your RepairDesk data instead of
clicking through the web UI. Some real examples:

**Front counter / triage**
- *"Look up ticket T-15423"* — full ticket detail: customer, device, per-device status, notes.
- *"What's the status on Sarah Miller's phone?"* — searches tickets by customer name/keyword.
- *"Show me everything that's Pending or Waiting for Parts"* — filter tickets by status.
- *"What's assigned to Dave right now?"* — filter tickets by technician.
- *"Pull up John's contact details"* — customer lookup by name, phone, or email.

**Workflow / bench work**
- *"Add a diagnostic note to T-15423: replaced screen, battery tested OK"*
- *"Assign ticket T-15490 to Dave"*
- *"Mark T-15423 as Repaired"* — the server will ask you to confirm first, and flags that this
  status auto-fires a customer SMS/email in RepairDesk.
- *"Create a ticket for this customer: iPhone 13, screen replacement"* — again, confirmation
  required before it actually creates anything.

**Money / admin**
- *"Which invoices are still unpaid from last month?"*
- *"What's the outstanding balance on invoice 8821?"*
- *"Do we have an iPhone 13 battery in stock?"* — inventory search.
- *"List all our technicians"* / *"What payment methods do we have set up?"*
- *"What repair categories/device types do we have configured?"* — useful context when
  building a ticket or diagnosing what a device model even is in your system.

Because this runs through an actual AI assistant rather than a fixed dashboard, you can chain
these naturally — "find any overdue invoices for customers with a ticket still open" — and the
assistant works it out across tools instead of you cross-referencing two screens by hand.

## Tools

| Tool | What it does |
|---|---|
| `repairdesk_tickets` | Search tickets by status/date/keyword/tech, or get one ticket's full detail (including per-device status) |
| `repairdesk_tickets_write` | Create tickets, update status/device fields, add internal or diagnostic notes, assign a technician |
| `repairdesk_customers` | Look up customers by name, phone, email, or ID |
| `repairdesk_invoices` | Search invoices, get one invoice, or check its outstanding/due amount |
| `repairdesk_inventory` | Search parts stock by keyword |
| `repairdesk_employees` | List employees/technicians |
| `repairdesk_shop_info` | Reference lookups: devices, categories, statuses, colors, networks, tax classes, payment methods, referral sources, repair/service types, locations, problems (by device), trade-ins, purchase orders |

**Safety rail:** `repairdesk_tickets_write` requires `confirmed: true` before applying a status
change, and warns when the target status is one RepairDesk auto-notifies the customer on
(Repaired, Ready for Pickup, Completed, Waiting on Customer, Waiting For Quote, Cancelled).

**Handy detail:** ticket lookups/writes accept either RepairDesk's order ID format (`T-15423`)
or the internal numeric ticket ID — you never need to know which one you have, the server
resolves it for you.

## What this is *not*

This covers the read side of RepairDesk plus core ticket workflow writes. It does **not** cover
estimates, appointment creation, POS/sales transactions, inventory writes, payment recording,
ticket image/attachment upload, or webhooks. PRs welcome if you need one of those.

## Requirements

- Node.js 18+
- A RepairDesk account with API access (**Settings → API** in your RepairDesk admin, to get your key)

## Install

```bash
git clone <this-repo-url>
cd repairdesk-mcp
npm install
```

## Configure

The server reads its RepairDesk API key from an environment variable — set this in your MCP
client's config, not in a file you might commit.

**Claude Code:**

```bash
claude mcp add repairdesk \
  --env REPAIRDESK_API_KEY=your_key_here \
  -- node /path/to/repairdesk-mcp/server.mjs
```

**Claude Desktop** (`claude_desktop_config.json`) or any other MCP client's config:

```json
{
  "mcpServers": {
    "repairdesk": {
      "command": "node",
      "args": ["/path/to/repairdesk-mcp/server.mjs"],
      "env": {
        "REPAIRDESK_API_KEY": "your_key_here"
      }
    }
  }
}
```

See `.env.example` for all supported environment variables — most clients (Claude Code, Claude
Desktop) read these from the `env` block above, not from an actual `.env` file.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `REPAIRDESK_API_KEY` | Yes | — | Your RepairDesk API key |
| `REPAIRDESK_BASE_URL` | No | `https://api.repairdesk.co/api/web/v1` | Override the API base URL |
| `REPAIRDESK_USER_AGENT` | No | `RepairDesk-MCP/1.0` | User-Agent sent on every request — set this to your own shop/tool name if you like; it just can't be empty (see Notes) |
| `REPAIRDESK_MIN_INTERVAL_MS` | No | `500` | Minimum ms between outbound API calls |
| `REPAIRDESK_LOG_DIR` | No | `./logs` | Where `mcp_audit.log` is written |
| `REPAIRDESK_CONFIG` | No | `./config.json` | Path to a JSON config file, if you'd rather use one than env vars (see below) |

**Alternative: config file instead of env vars.** If your setup makes env vars awkward, create a
`config.json` (gitignored) next to `server.mjs`:

```json
{
  "repairdesk_api_key": "your_key_here",
  "repairdesk_base_url": "https://api.repairdesk.co/api/web/v1"
}
```

It's re-read on every API call, so you can rotate the key without restarting the server.
Environment variables take priority over this file when both are present.

## Notes

- **User-Agent:** RepairDesk's Cloudflare blocks requests with default Node/Python User-Agent
  strings, so this server always sends a custom one. It ships with a generic default but you're
  free to set your own via `REPAIRDESK_USER_AGENT` — just don't unset it entirely.
- **Rate limiting:** RepairDesk caps API keys at roughly 100–120 requests/minute. This server
  serialises all outbound calls with a minimum gap between them (default 500ms,
  `REPAIRDESK_MIN_INTERVAL_MS`) so bulk lookups don't trip your own key's limit.
- **Audit log:** every tool call is appended to `logs/mcp_audit.log` (API key stripped) for
  traceability. Point it elsewhere with `REPAIRDESK_LOG_DIR`.
- **Per-device status:** in RepairDesk, ticket status and assigned technician live on each
  *device* within a ticket, not the ticket itself. This server handles that correctly (reads all
  devices before writing so it doesn't clobber other devices' state); a naive raw API call
  often doesn't.

## Security

Your `REPAIRDESK_API_KEY` grants full read/write access to your shop's customer and financial
data. Keep it in your MCP client's env config, never in a committed file. `config.json` and
`.env` are gitignored here for exactly that reason — use them locally if you prefer a file over
env vars, but don't commit a filled-in copy.

## License

MIT — see [LICENSE](LICENSE).
