# RepairDesk MCP Server

Use your AI assistant to work in RepairDesk: find a ticket, add your bench notes,
upload a quote, log repair time or update a customer's details by asking in plain
English. This connects an MCP-compatible assistant to your store through the
[RepairDesk API](https://api-docs.repairdesk.co/).

Built by a RepairDesk shop for other RepairDesk shops, with Codey and Warden
(our shop's AI assistant) working through real test records together. It works
with Claude Code, Claude Desktop, Codex CLI, OpenCode and other compatible MCP
clients. You do not need Warden or our shop setup to use it.

**Current source version: 2.1.2 — 40 tools, up from the original 7.** Install from
this GitHub repository for the new features. The npm package reference remains
at 1.0.0; this update has not been published to npm.

This is an independent project, not an official RepairDesk product. It makes
real changes in the store connected to your API credentials.

## Contents

- [What you can ask it to do](#what-you-can-ask-it-to-do)
- [What's new](#whats-new)
- [What we've tested and what still needs work](#what-weve-tested-and-what-still-needs-work)
- [Quick start](#quick-start)
- [Updating an existing installation](#updating-an-existing-installation)
- [Manual setup](#manual-setup)
- [Tools reference](#tools-reference)
- [Messages and status changes](#messages-and-status-changes)
- [Inventory updates](#inventory-updates)
- [Scope and compatibility](#scope-and-compatibility)
- [All configuration options](#all-configuration-options)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Testing](#testing)
- [Security](#security)
- [License](#license)

## What you can ask it to do

Start with the kind of thing you'd ask someone at the next bench. For example:

- *"Look up T-12345 and tell me what's been done so far."*
- *"Add an internal note: tested with our spare CPU, boots normally. Customer's CPU still won't POST."*
- *"Upload this quote PDF to T-12345."* Attachments stay internal to the ticket;
  uploading one does not email it to the customer.
- *"Add these photos to the pre-condition section."*
- *"Start the repair timer on this ticket."* Later: *"Stop the timer."*
- *"Add 15 minutes of repair time to T-12345."*
- *"Preview a text to the customer with their name, device and ticket number."*
  Then, after checking it: *"Send that message."*
- *"Create a customer with these contact details and SMS consent."*
- *"Book this customer in tomorrow at 1 pm for 15 minutes at $0."* The assistant
  uses your booking details; RepairDesk may send its configured reminders.
- *"Change this test item's selling price to $19.95 and cost to $7.50, keeping
  its stock and SKU as they are."*
- *"Show me unpaid invoices from last month."*

The assistant can look up the customer, ticket and device IDs itself. Be specific
about which record to change, especially when a ticket has more than one device.
Your clear instruction to make a change is authorization; it should not need to
ask you the same question again. Status changes can trigger RepairDesk's automatic
SMS/email, so check the [known notification issue below](#what-weve-tested-and-what-still-needs-work).

## What's new

The original version had seven tools for tickets, customer/invoice lookups,
inventory search, employees and shop reference data. This update adds **33 tools**:

| Area | Added in this update |
|---|---|
| Bench work | Ticket attachments, pre/post-condition photos, repair timers/manual time and the documented ticket-update/status routes |
| Customer messages | Direct ticket SMS and email, message preview and supported name/device substitutions, SMS inbox |
| Customers and bookings | Customer creation/update, appointment creation/listing, available slots and booking reference data |
| Stock and devices | Inventory creation/update, conditions/locations, transfer lookup, brand/model creation and trade-in creation/update/conversion |
| Money and reporting | Invoice creation, recording received payments, ticket-to-invoice conversion, transaction reports, payroll and call logs |
| Parts and purchasing | Parts/service lookups and purchase-order item details |

The tools also handle decimal prices, preserve supported existing inventory
fields during updates, read back supported changes and coordinate API rate limits
across server processes. Writes are never automatically retried after a failure
or timeout. The [endpoint map](docs/endpoints.md) lists every added tool and route.

## What we've tested and what still needs work

We've worked through the main workflows in a live shop using designated test
records, checking API results against the website and messages actually received.
That includes PDF attachments, pre/post photos, timers, flagged notes, ticket
field edits, personalised direct SMS/email, customer creation/update, appointments,
basic inventory creation/pricing/updates and brand creation. There are also
**44 passing automated tests** using synthetic data.

There are still limits to be aware of:

- **Automatic status SMS:** both API status routes saved the status but sent
  literal placeholders in our test. The same change through the website filled
  them correctly. Direct MCP SMS/email now substitutes supported fields before
  sending; this does not fix RepairDesk's separate automatic messages.
- **Appointment reminders:** our test booking saved correctly, but its reminder
  had blank name, appointment detail and shop phone fields. The exact cause is
  unconfirmed.
- **Inventory:** setting a nonzero Minimum Price and clearing Long Description
  were ignored in our tests. The MCP reports mismatches or unverified fields
  instead of treating API acceptance as proof that every change saved.
- **Still awaiting live tests:** model creation, trade-in writes, invoice/payment
  writes and specialised inventory cases such as serialized items, nonzero stock
  changes and multiple stores. Those tools are available; they are not all
  verified end to end.

See the [validation record](docs/validation.md) for the evidence and remaining
checks. Having a tool for an endpoint does not mean every workflow has passed a
live test.

## Quick start

You need a RepairDesk API credential, Node.js and an AI client that supports local
MCP servers. The setup script handles the basic connection. Uploads need one
extra folder setting, explained below.

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
for it in the next step. Treat it like a password: this integration can read and
change shop records using the access that credential allows (see [Security](#security)).

### 4. Run the setup script

```bash
node setup.mjs
```

The script installs dependencies if needed, asks for your API key and assistant,
and configures Claude Code, Claude Desktop, Codex CLI or OpenCode. If automatic
configuration is unavailable or an entry needs manual attention, it prints the
configuration to use. Other MCP clients can use that configuration too.

Keep your API key private when running setup or sharing screenshots. You do not
need to give this project or the assistant your RepairDesk website login.

If you'd rather do it by hand — or your client isn't one of the four above — see
[Manual setup](#manual-setup) below instead. Either way, run `npm install` yourself first if you
skip the script.

### 5. Try it

Restart or reconnect your AI client after setup, then ask: *"Using RepairDesk,
list my 5 most recent tickets."* A fresh connection to this version exposes 40
tools. Start with a read so you can check that it is connected to the right store.

### 6. Enable attachments and photos, if you want them

Add `REPAIRDESK_UPLOAD_ROOTS` to the RepairDesk entry's `env` / `environment`
settings, then reconnect. This is an extra setting; the setup script does not
ask for upload folders. Use a folder on the machine running the MCP server:

| Server platform | Example setting value |
|---|---|
| Windows | `C:\RepairDesk Files;D:\Job Photos` |
| Linux/macOS | `/srv/quotes:/srv/job-photos` |

In a JSON configuration, escape Windows backslashes, for example:
`"REPAIRDESK_UPLOAD_ROOTS": "C:\\RepairDesk Files;D:\\Job Photos"`.
Choose folders containing the files you want to attach. Uploads remain disabled
until this is set. See the [upload example](#upload-example) for file limits and
how ticket attachments differ from condition photos.

## Updating an existing installation

If you installed with Git, run these commands in your existing checkout:

```bash
git pull --ff-only
npm ci
```

If Git reports local changes or a diverged branch, keep those changes and resolve
that first. Do not overwrite a customised installation. If you installed from a
ZIP, download a fresh copy, install its dependencies with `npm ci`, and point your
MCP entry at the new `server.mjs`; retain your existing credential settings.

Then **restart or reconnect the MCP client**. Replacing files does not update an
already-running server process. Check that the connection reports **2.1.2** and
**40 tools**; seeing only seven means you are still using the old server or entry.
You do not need to run setup again if your existing entry already points at the
updated checkout. Add the upload-folder setting above if it is not configured.

This release is in GitHub source. Updating the old npm package alone will not
install these changes.

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

## Messages and status changes

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

## Inventory updates

`repairdesk_inventory_update` accepts changed fields in `body`, plus the matching
item ID in `path.id` and `body.id`. Before writing it looks up the exact item ID
and fills in existing readable values: the upstream PUT clears omitted core
fields and requires the product name even for price changes. Decimal prices and
costs are supported despite the published schema declaring them as integers.
Prices are sent with the preserved tax-inclusive setting and stored retail price.

Inspect `mismatches`, `unverified_fields` and `write_performed` in the result.
Successful API acceptance does not prove every field saved. Live testing found
`minimum_price` ignored; GET does not expose Long Description (`notes`). A
contradicting write response is flagged, while independent verification of notes
still requires the website. Do not automatically retry a completed or uncertain
write. Full coverage of serialized, warranty, valuation and multi-store behavior
has not been established by the basic test item.

See [validation results](docs/validation.md) for what was tested live versus
what was only checked with synthetic requests.

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
GET requests retry once only for short, explicit Retry-After intervals. **Writes never retry automatically**: after
a timeout or ambiguous result inspect the target record before trying again.

The GitHub source is version 2.1.2. This change does not publish an npm release;
`server.json` retains the previous 1.0.0 npm package reference until a separate
registry release is prepared. Install this source checkout to use the new tools.

## All configuration options

Add optional settings to the `env`/`environment` block your client's config uses.
The setup script configures the basic connection, not every option below. Most
MCP clients do not read a `.env` file automatically; `.env.example` lists values
for reference.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `REPAIRDESK_API_KEY` | Key or access token | — | Your RepairDesk API key |
| `REPAIRDESK_BASE_URL` | No | `https://api.repairdesk.co/api/web/v1` | Override the API base URL |
| `REPAIRDESK_USER_AGENT` | No | `RepairDesk-MCP/<version>` | User-Agent sent on every request. Set this to your own shop/tool name if you like — it just can't be empty (see [Troubleshooting](#troubleshooting)) |
| `REPAIRDESK_MIN_INTERVAL_MS` | No | `1250` | Minimum ms between outbound API calls — see rate limiting below |
| `REPAIRDESK_LOG_DIR` | No | `logs` beside `server.mjs` | Where `mcp_audit.log` is written; an explicit relative path is relative to the process working directory |
| `REPAIRDESK_ACCESS_TOKEN` | No | — | Externally managed OAuth Bearer token; takes precedence over API key |
| `REPAIRDESK_UPLOAD_ROOTS` | No | Empty | Allowed server-side upload directories; empty disables uploads |
| `REPAIRDESK_TIMEOUT_MS` | No | `60000` | Request and response-body timeout |
| `REPAIRDESK_CONFIG` | No | `config.json` beside `server.mjs` | Credential JSON file used when neither credential environment variable is set |
| `REPAIRDESK_STATUS_MODE` | No | `api` | Use API status writes; optional administrator policy `web` blocks status writes |
| `REPAIRDESK_STATE_DIR` | No | `~/.cache/repairdesk-mcp` | Shared request pacing/cooldown state for server processes |

**Alternative: config file instead of env vars.** If your setup makes env vars awkward, create a
`config.json` (gitignored) next to `server.mjs`:

```json
{
  "repairdesk_api_key": "your_key_here",
  "repairdesk_base_url": "https://api.repairdesk.co/api/web/v1"
}
```

It's re-read on every API call, so you can rotate the key without restarting the server.
If either credential environment variable is set, the file is not loaded. In
that case set a custom base URL with `REPAIRDESK_BASE_URL` too.

### Rate limiting

RepairDesk's [API help page](https://help.repairdesk.co/portal/en/kb/articles/api)
states 50 requests per minute. This server defaults to 1250ms between requests
(about 48/minute). Updated MCP processes sharing the same credential and state
directory coordinate their request starts using a file lock. The default state
directory is `~/.cache/repairdesk-mcp`; set `REPAIRDESK_STATE_DIR` to share it across
installations. It stores timestamps under a hashed credential identifier, not
credentials or customer data. Older processes, other apps and other machines
can still consume the account's request allowance.

A 429 establishes a shared cooldown. Missing Retry-After defaults to 60 seconds.
GETs retry once only when the explicit cooldown is at most 30 seconds; longer
cooldowns return an actionable retry-later error. Writes never automatically
retry, including uploads, messages and payments. Shared pacing waits are bounded
so a tool does not hang indefinitely. Inspect records after an uncertain result
before repeating a write.

## Troubleshooting

**"RepairDesk API returned 401 Unauthorized" / "Unauthorized" in the response**
Your API key is wrong, was revoked, or wasn't picked up. Double-check the key in **Settings →
API** in RepairDesk, and that it's spelled correctly in your MCP client's config (not a stray
space, not still `YOUR_REPAIRDESK_API_KEY_HERE`). Fully restart your AI client after any config
change — most don't reload MCP config live.

**Requests fail immediately / look like they're being blocked, not authenticated**
RepairDesk's Cloudflare blocks requests with an empty or default-looking User-Agent. Don't set
`REPAIRDESK_USER_AGENT` to an empty string.

**HTTP 429 or shared request cooldown**
Wait for the reported cooldown. Reconnect older MCP processes to enable shared
pacing, and check for other integrations using the same account. If needed,
raise `REPAIRDESK_MIN_INTERVAL_MS` (for example, `2000`). Do not repeatedly retry
sends, payments or uploads. An API error may require inspecting the target first.

**"Ticket T-XXXXX not found — could not resolve to internal ID"**
Check the order ID is correct and exists in this RepairDesk store. If you have the internal
numeric ID instead, that works too — pass it directly.

**"request failed or timed out"**
Check connectivity to `api.repairdesk.co` from the machine running the server and
check `REPAIRDESK_BASE_URL`. The default request timeout is 60 seconds. A timeout
after a write does not establish whether RepairDesk saved it; inspect the record
before trying again.

**Your AI assistant doesn't see the tools, or still shows only seven**

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
There is no fee from this project. Your RepairDesk plan, messaging/provider
charges and AI assistant costs still apply according to your own services.

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

Your API credentials allow access to shop records, including customer and
financial data. Keep them in your private client configuration or a protected
credential file. `config.json` and `.env` are gitignored; do not commit filled-in
copies, audit logs or real customer evidence. The assistant/client you choose
receives the data returned by the tools.

For bug reports, use redacted errors and synthetic examples. Report security
issues privately where the repository host supports it; do not include secrets
or customer data in a public issue or pull request.

## License

MIT — see [LICENSE](LICENSE). Provided as-is, no warranty — you're responsible for how you use
it against your own RepairDesk account.
