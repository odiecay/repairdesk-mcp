# RepairDesk MCP Server

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server that gives any
MCP-compatible AI assistant — Claude Code, Claude Desktop, Codex CLI, OpenCode, Cursor,
Windsurf, or any other MCP client — direct, read/write access to your
[RepairDesk](https://www.repairdesk.co/) shop data. Point it at your store's API key and start
asking things like *"look up ticket T-15423"*, *"what's overdue on invoice 8821"*, or *"assign
the iPhone screen job to Dave"*.

Not an official RepairDesk product — an independent tool built by a RepairDesk shop for
RepairDesk shops. No warranty, use at your own risk (see [License](#license)) — but it's in
daily use running a real repair shop's ticket queue, not a proof of concept.

## Contents

- [What you can actually do with this](#what-you-can-actually-do-with-this)
- [Tools reference](#tools-reference)
- [What this is not](#what-this-is-not)
- [Quick start](#quick-start)
- [Manual setup](#manual-setup)
- [All configuration options](#all-configuration-options)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Security](#security)

## What you can actually do with this

Once it's wired into your AI assistant, you can just talk to your RepairDesk data instead of
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
these naturally — *"find any overdue invoices for customers with a ticket still open"* — and the
assistant works it out across tools instead of you cross-referencing two screens by hand.

## Tools reference

Version 2 exposes **40 tools**: the original seven convenience tools plus 33
operations from RepairDesk’s published API. See [the complete endpoint map](docs/endpoints.md)
for each tool, HTTP route, and authorization requirement.

| Area | Capabilities |
|---|---|
| Tickets | Search/read/create, notes, documented line updates, status changes, technician assignment with read-back verification |
| Files | Internal ticket attachments, pre/post condition images; single or multiple server-local files |
| Repair time | Start/stop repair timers and add manual time to a specific ticket line |
| Messages | Ticket email and SMS, SMS inbox; sends require explicit user authorization |
| Customers | Search/read/create/update |
| Inventory | Search/create/update, reference information, trade-in create/update/conversion, transfers |
| Invoices | Read/create, due amount, record a received payment, convert ticket to invoice |
| Purchasing | Purchase orders and item-level details; no purchase-order creation endpoint is documented |
| Appointments | List/create, available slots and booking reference data |
| Reports | Payment transactions by payment date, payroll shifts/monthly reports, Phone Pro call logs |
| Reference data | Parts, services by category, brands/models, employees and existing shop reference lookups |

New tools expose the published request schemas: `path` contains URL identifiers,
`query` contains filters, and `body` contains JSON/form fields. IDs in these tools
are RepairDesk's internal numeric IDs, **not** the number printed after `T-`.
Use `repairdesk_tickets` with `ticket_id: "T-12345"` to resolve a displayed ticket
number, then use `summary.id` and the appropriate `devices[].id`.

Writes require `confirmed: true` after the user authorizes the concrete action.
An explicit request to do that action already supplies authorization; clients
should not ask the same question twice. Existing note addition remains ungated.
Statuses can trigger automatic customer notifications. Creating invoices or
recording payments is never a side effect of uploading a quote. The payment tool
records a received payment; it is not a card-payment gateway.

### Upload example

Set `REPAIRDESK_UPLOAD_ROOTS` to the directories whose files the server may upload.
Use the platform path separator (`:` on Linux/macOS, `;` on Windows). Paths are on
the machine **running the MCP server**, not necessarily the operator's desktop.
Symlinks are resolved before checking allowed roots. Uploads are disabled when
no roots are configured.

```json
{
  "body": {"ticket_id": 12345, "ticket_inv_id": 67890, "notes": "Approved quote"},
  "file_paths": ["/srv/quotes/Customer - T-12345/Quote.pdf"],
  "confirmed": true
}
```

Call `repairdesk_attachments` with that payload. RepairDesk permits up to 10 files,
15 MB each, and excludes HTML. These attachments are **internal**: staff open them
in RepairDesk; upload does not send them to the customer or publish to the portal.
RepairDesk may save a condition image and still return an error. Inspect the
ticket’s pre/post image list before retrying to avoid duplicates.
For `repairdesk_condition_images`, use `body.ticket_inv_id`, `body.condition`
(`pre` or `post`) and `file_paths` for JPG/PNG/GIF images.

### Repair timer example

```json
{
  "body": {"id": 12345, "ticketInvId": 67890, "timerAction": "custom", "minutes": 15},
  "confirmed": true
}
```

Call `repairdesk_ticket_status_timer`. Use `start` or `stop` instead of `custom`
for a live timer. Status and timer target **one line**, never all ticket lines
implicitly. The existing `repairdesk_tickets_write` accepts `ticket_line_id`
and requires it when multiple lines exist; it now reads changes back before
reporting them as verified. Use `repairdesk_ticket_update` for the full documented
payload, including line prices/parts and pre/post condition fields. The API can
create lines when unknown line IDs are supplied: inspect IDs before submitting.

## Scope and compatibility

The checked-in request definitions come from the official OpenAPI specification,
reviewed 19 October 2026. All 58 documented business operations have a tool route;
this is endpoint coverage, not a claim that every parameter has been live-tested.
The original seven tools retain their focused inputs; the new tools use the
published request schemas. There are no documented public estimate or webhook
management operations in this snapshot.

Authentication supports an API key **or an externally managed OAuth access token**.
Set `REPAIRDESK_ACCESS_TOKEN` to use Bearer authentication; it takes precedence over
the API key. This server does not run the OAuth consent flow, store refresh tokens,
or expose token exchange/revocation as model tools. Manage token renewal outside
the conversation. Restart clients to discover new tools after upgrading.

Three paths in the published spec repeat `/v1` despite a base URL ending in `/v1`.
The client normalizes these so uploads and messages use one `/v1` segment.
GET requests retry a rate limit once. **Writes never retry automatically**: after
a timeout or ambiguous result inspect the target record before trying again.

The GitHub source is version 2.0.0. This change does not publish an npm release;
`server.json` retains the previous 1.0.0 npm package reference until a separate
registry release is prepared. Install this source checkout to use the new tools.

## Quick start

You don't need to be a developer to run this — just comfortable typing a handful of commands
into a terminal. Total time: about 5 minutes.

### 1. Install Node.js (if you don't have it)

Download and install from [nodejs.org](https://nodejs.org/) — get the "LTS" version. This
installs both `node` and `npm`. To check it worked, open a terminal and run:

```bash
node --version
```

You should see something like `v22.x.x` (Node 18 or higher is supported).

### 2. Get the code

**If you have Git:**
```bash
git clone https://github.com/odiecay/repairdesk-mcp.git
cd repairdesk-mcp
```

**If you don't:** click the green **Code** button on the GitHub repo page → **Download ZIP** →
unzip it somewhere → open a terminal in that folder.

### 3. Get your RepairDesk API key

In your RepairDesk admin: **Settings → API**. Copy the key shown there — the setup script asks
for it in the next step. Treat it like a password: it grants full read/write access to your
shop's data (see [Security](#security)).

### 4. Run the setup script

```bash
node setup.mjs
```

This is the fastest path and handles everything: it runs `npm install` for you if needed, asks
for your API key, asks which AI assistant you're using (Claude Code, Claude Desktop, Codex CLI,
or OpenCode), and writes the config for you automatically — backing up any existing config file
first. If you're on something else, it prints the config block to paste in yourself.

If you'd rather do it by hand — or your client isn't one of the four above — see
[Manual setup](#manual-setup) below instead. Either way, run `npm install` yourself first if you
skip the script.

### 5. Try it

Ask your assistant something like *"Using RepairDesk, list my 5 most recent tickets"*. If it
comes back with real ticket data, you're done.

## Manual setup

Skip this if `node setup.mjs` already worked for you. Otherwise, run `npm install` in this
folder first, then wire up your client by hand:

<details>
<summary><strong>Claude Code</strong></summary>

Run this from anywhere, replacing the path with the full path to where you unzipped/cloned the
folder, and the key with your real one:

```bash
claude mcp add repairdesk \
  --env REPAIRDESK_API_KEY=your_key_here \
  --env REPAIRDESK_USER_AGENT=YourShopName-MCP/1.0 \
  -- node /full/path/to/repairdesk-mcp/server.mjs
```
</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Open (or create) the config file for your OS:

- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Add this (merge it with anything already in `mcpServers` if the file isn't empty):

```json
{
  "mcpServers": {
    "repairdesk": {
      "command": "node",
      "args": ["/full/path/to/repairdesk-mcp/server.mjs"],
      "env": {
        "REPAIRDESK_API_KEY": "your_key_here",
        "REPAIRDESK_USER_AGENT": "YourShopName-MCP/1.0"
      }
    }
  }
}
```

Save the file, then **fully quit and reopen** Claude Desktop (not just close the window).
</details>

<details>
<summary><strong>Codex CLI (OpenAI)</strong></summary>

Edit (or create) `~/.codex/config.toml` and add:

```toml
[mcp_servers.repairdesk]
command = "node"
args = ["/full/path/to/repairdesk-mcp/server.mjs"]

[mcp_servers.repairdesk.env]
REPAIRDESK_API_KEY = "your_key_here"
REPAIRDESK_USER_AGENT = "YourShopName-MCP/1.0"
```

Start a new Codex session and run `/mcp` to confirm it connected. (Codex also has an interactive
`codex mcp add` command if you prefer that over editing the file — check `codex mcp add --help`
for the exact flags on your installed version.)
</details>

<details>
<summary><strong>OpenCode</strong></summary>

Open (or create) the config file for your OS:

- **Mac/Linux:** `~/.config/opencode/opencode.json`
- **Windows:** `%APPDATA%\opencode\opencode.json`

Add this (merge it with anything already in `mcp` if the file isn't empty):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "repairdesk": {
      "type": "local",
      "command": ["node", "/full/path/to/repairdesk-mcp/server.mjs"],
      "enabled": true,
      "environment": {
        "REPAIRDESK_API_KEY": "your_key_here",
        "REPAIRDESK_USER_AGENT": "YourShopName-MCP/1.0"
      }
    }
  }
}
```

Restart OpenCode to pick it up.
</details>

<details>
<summary><strong>Any other MCP client (Cursor, Windsurf, etc.)</strong></summary>

The `command`/`args`/`env` shape used above (Claude Code/Desktop) is the de facto standard —
most MCP clients follow it, just in a different settings file. Check your client's docs for
where that file lives; the block itself should work as-is.
</details>

Use the **full, absolute path** to `server.mjs` (e.g. `/Users/you/repairdesk-mcp/server.mjs` or
`C:\Users\you\repairdesk-mcp\server.mjs`) — a relative path will fail because your AI client
doesn't run from inside this folder.

## All configuration options

Everything below goes in the `env`/`environment` block your client's config uses (`setup.mjs`
handles this for you) — not a `.env` file, since most MCP clients don't read one automatically.
`.env.example` in this repo lists the same variables for reference.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `REPAIRDESK_API_KEY` | Yes | — | Your RepairDesk API key |
| `REPAIRDESK_BASE_URL` | No | `https://api.repairdesk.co/api/web/v1` | Override the API base URL |
| `REPAIRDESK_USER_AGENT` | No | `RepairDesk-MCP/1.0` | User-Agent sent on every request. Set this to your own shop/tool name if you like — it just can't be empty (see [Troubleshooting](#troubleshooting)) |
| `REPAIRDESK_MIN_INTERVAL_MS` | No | `1250` | Minimum ms between outbound API calls — see rate limiting below |
| `REPAIRDESK_LOG_DIR` | No | `./logs` | Where `mcp_audit.log` is written |
| `REPAIRDESK_ACCESS_TOKEN` | No | — | Externally managed OAuth Bearer token; takes precedence over API key |
| `REPAIRDESK_UPLOAD_ROOTS` | No | Empty | Allowed server-side upload directories; empty disables uploads |
| `REPAIRDESK_TIMEOUT_MS` | No | `60000` | Request and response-body timeout |
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

### Rate limiting

RepairDesk's [API help page](https://help.repairdesk.co/portal/en/kb/articles/api)
states 50 requests per minute. This server defaults to 1250ms between requests
(about 48/minute). Each process has its own queue; other clients sharing the same
key still contribute to the total. Increase the interval if necessary.

GET requests retry a 429 once, with a bounded wait. Writes never automatically
retry, including uploads, messages and payment recording. Inspect records after
an uncertain result before repeating a write.

## Troubleshooting

**"RepairDesk API returned 401 Unauthorized" / "Unauthorized" in the response**
Your API key is wrong, was revoked, or wasn't picked up. Double-check the key in **Settings →
API** in RepairDesk, and that it's spelled correctly in your MCP client's config (not a stray
space, not still `YOUR_REPAIRDESK_API_KEY_HERE`). Fully restart your AI client after any config
change — most don't reload MCP config live.

**Requests fail immediately / look like they're being blocked, not authenticated**
RepairDesk's Cloudflare blocks requests with an empty or default-looking User-Agent. Don't set
`REPAIRDESK_USER_AGENT` to an empty string.

**"RepairDesk API rate limit hit twice in a row (429)"**
You're making requests faster than your key's limit even after the built-in retry. Raise
`REPAIRDESK_MIN_INTERVAL_MS` (try `2000`) in your config.

**"Ticket T-XXXXX not found — could not resolve to internal ID"**
Check the order ID is correct and exists in this RepairDesk store. If you have the internal
numeric ID instead, that works too — pass it directly.

**"RepairDesk API request timed out after 15000ms"**
Usually a network/firewall issue reaching `api.repairdesk.co`, or `REPAIRDESK_BASE_URL` is
wrong. Check you can reach that host from wherever this server is running.

**Your AI assistant doesn't see the tool at all**
- Confirm the path in `args` is absolute, not relative, and actually points at `server.mjs`.
- Confirm you ran `npm install` in that folder (missing `node_modules` = the server can't start).
- Fully quit and restart your AI client — don't just close the chat window.
- Run `node /full/path/to/server.mjs` directly in a terminal — if it errors, you'll see the
  actual problem instead of a generic "tool not available" from your client.

**`node setup.mjs` says it couldn't find `claude`/`codex` on your PATH**
That's fine — it falls back to printing the config block for you to paste in by hand (see
[Manual setup](#manual-setup)). This just means that CLI isn't installed or isn't on your PATH;
it doesn't mean the MCP server itself is broken.

**Still stuck?** Open an issue on this repo with the error message (redact your API key first if
it appears anywhere in the output).

## FAQ

**Is this an official RepairDesk tool?**
No. It's independently built and maintained, using RepairDesk's public API. Use it at your own
discretion.

**Does this cost anything to run?**
No — it's just making the same API calls your RepairDesk plan already allows. There's no
additional fee from this project. (Your AI assistant subscription, e.g. Claude, is separate and
unrelated to this server.)

**Can I use this with something other than Claude?**
Yes — MCP is an open standard. `setup.mjs` configures Claude Code, Claude Desktop, Codex CLI, and
OpenCode directly; anything else that speaks MCP over stdio (Cursor, Windsurf, etc.) can use this
server too, via the manual config in [Manual setup](#manual-setup).

**Can I run this for multiple RepairDesk stores?**
Yes — register it multiple times under different names (e.g. `repairdesk-store1`,
`repairdesk-store2`) in your MCP client, each with its own `REPAIRDESK_API_KEY`.

**Can these tools email/text customers?**
Yes: explicit ticket email/SMS tools are available, and status changes can trigger
RepairDesk's own notifications. The tool requires `confirmed: true` for those
writes. Only set it for the user-authorized ticket, recipient and action.

## Testing

Run `npm ci` then `npm test`. Tests cover MCP stdio discovery, request schemas,
file boundaries, multipart construction, status/field read-back, authentication,
rate limits, secret redaction and uncertain write outcomes. They use synthetic
fixtures and mocked HTTP responses, not a live shop.

Live verification should use an explicitly designated test ticket/customer with
contact details controlled by the operator. Keep payment, invoice and inventory
writes in a sandbox unless the operator specifically authorizes real records.

## Security

Your `REPAIRDESK_API_KEY` grants full read/write access to your shop's customer and financial
data. Keep it in your MCP client's env config, never in a committed file. `config.json` and
`.env` are gitignored here for exactly that reason — use them locally if you prefer a file over
env vars, but don't commit a filled-in copy. Found a security issue? Please open an issue (or a
private report if your host supports it) rather than a public PR with exploit details.

## License

MIT — see [LICENSE](LICENSE). Provided as-is, no warranty — you're responsible for how you use
it against your own RepairDesk account.

### Message personalization and status changes

Status changes are performed through the MCP using the documented API. The
server defaults to `REPAIRDESK_STATUS_MODE=api`; a website login is not required.
User-authorized status writes read the ticket before and after, validate the
selected repair line, verify the saved status, and inspect newly recorded
communications. Existing-ticket status updates return a separate `notifications`
result: `malformed_template`, `recorded`, `none_observed`, or `unverified`.
A saved status is not proof of correct notification rendering or delivery.

A controlled test found that both documented status-write routes saved the
status but sent automatic SMS containing literal customer/device placeholders.
The equivalent website change on the same ticket rendered them correctly. The
upstream cause is unresolved; all documented status parameters were supplied.
Do not claim this integration fixes RepairDesk's automatic notification renderer.

The convenience ticket tool and dedicated status tool skip an already-applied
status to avoid duplicate notifications. A combined timer request still performs
the timer action without reapplying that status. General ticket updates may also
contain other edits and are not skipped; prefer the dedicated tool for status
changes. Never retry an uncertain write or send a second corrective message
automatically. Communication history may be truncated, omit email bodies, or
arrive later; absence at readback does not prove no notification was sent.

`REPAIRDESK_STATUS_MODE=web` is an optional administrator policy to block status
writes, not the standard workflow. `confirmed=true` cannot override it. Existing
MCP clients must reconnect to load a new server version. Ticket creation remains
available and can trigger its own configured notifications; its rendering has
not been verified by the existing-ticket comparison.

Direct SMS/email tools can accept plain text or supported placeholders. The MCP
fetches the ticket and substitutes actual values before sending through the
normal RepairDesk messaging API. This works with any compatible MCP client;
there is no dependency on a particular assistant, shop, or customer name.

| Placeholder | Ticket field |
|---|---|
| `{customer_first_name}`, `{customer_last_name}` | Linked customer's first/last name |
| `{customer_name}`, `{customer name}` | Linked customer's full name |
| `{manufacturer_name}` | Selected repair line's manufacturer |
| `{Device_Name}`, `{Device Name}`, `{device_name}` | Selected repair line's device name |
| `{repair_category}` | Selected repair line's repair category |
| `{Ticket_Id}`, `{ticket_id}` | Display ticket number |
| `{Status}`, `{status}` | Selected repair line's current status |

Use `preview=true` to inspect the rendered message without sending. For a ticket
with multiple repair lines, supply top-level `ticket_line_id` when using device,
category or status placeholders. Unknown tokens, unavailable values and invalid
line selections stop the send. Record values inserted into HTML email bodies
are escaped. Sending still requires `confirmed=true`; previewing does not.

These are MCP-supported substitutions, not a claim about RepairDesk's native
macro set. The public API does not document template management or per-request
suppression of automatic status notifications. Our rendering runs on direct
messages and cannot intercept RepairDesk's separate automatic status messages.

See [validation results](docs/validation.md) for what was tested live versus
what was only checked with synthetic requests.
