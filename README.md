# RepairDesk MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that gives any
MCP-compatible AI assistant — Claude Code, Claude Desktop, or any other MCP client — direct,
read/write access to your [RepairDesk](https://www.repairdesk.co/) shop data. Point it at your
store's API key and start asking things like *"look up ticket T-15423"*, *"what's overdue on
invoice 8821"*, or *"assign the iPhone screen job to Dave"*.

Not an official RepairDesk product — an independent tool built by a RepairDesk shop for
RepairDesk shops.

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

See `.env.example` for all supported environment variables (base URL override, rate-limit
interval, audit log location).

## Notes

- **Rate limiting:** RepairDesk caps API keys at roughly 100–120 requests/minute. This server
  serialises all outbound calls with a minimum gap between them (default 500ms,
  `REPAIRDESK_MIN_INTERVAL_MS`) so bulk lookups don't trip your own key's limit.
- **Audit log:** every tool call is appended to `logs/mcp_audit.log` (API key stripped) for
  traceability. Point it elsewhere with `REPAIRDESK_LOG_DIR`.
- **T-XXXXX IDs:** ticket lookups/writes accept either RepairDesk's order ID format (`T-15423`)
  or the internal numeric ticket ID — the server resolves one from the other automatically.
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
