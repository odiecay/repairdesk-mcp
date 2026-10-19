# API validation — 19 October 2026

Version 2.1.2 exposes 40 tools: seven convenience tools and 33 additions.
The endpoint inventory maps 58 documented non-OAuth operations. This is operation
coverage, not a claim that every field, business workflow or store configuration
has been tested. OAuth consent, renewal and revocation remain external.

## Automated checks

44 passing Node tests cover authentication, credential redaction, URL handling,
request schemas, required fields, write authorization, multipart file boundaries,
response identity, timers, positive payment validation, status-line ownership,
readback, notification observation, duplicate-status avoidance, and stdio tool
registration. New non-file operations are also exercised with synthetic requests.
Synthetic requests do not establish live functionality.
Inventory regression tests cover decimal/zero pricing, preservation of omitted
fields, matching identifiers, partial verification and missing readback. API
validation errors retain field details while redacting credentials.

## Live ticket checks

An operator-owned test ticket/contact was used with explicit authorization.

| Function | Evidence / result |
|---|---|
| Ticket lookup | Display number resolves to internal ID; detail readback works |
| Internal note | Created and read back; operator confirmed internal visibility and flag enabled |
| Assignment and ticket fields | Assignment saved/read back. Serial and multiline notes with apostrophe, ampersand and Unicode saved exactly and operator confirmed UI; originals restored and read back, monetary fields/status/assignment unchanged, no new notifications |
| Attachments | Normal one-page PDF saved to intended test ticket and operator confirmed readable in UI. TXT was accepted by API, but operator reports image-viewer behavior; successful TXT viewing is not established. |
| Condition images | Normal post-photo succeeded and appears in readback; tiny pre-photo returned error but was nevertheless saved |
| Timers | Retested through MCP: 3 → 63 seconds after adding one minute; start timer=1; stop timer=0 after three seconds; final GET confirms 66 seconds. Operator confirmed UI total/stopped state. Status and $99 total unchanged. |
| Dedicated status route | Status saved; automatic SMS contained literal macros |
| General ticket-update status route | Same failure: status saved, automatic SMS contains literal macros |
| Website comparison | Same ticket/status rendered name and device correctly; operator confirmed received text |
| Direct SMS | MCP read live customer/manufacturer/device/category/ticket/status fields, rendered placeholders and sent one message. Full rendered content matches communication record; operator confirmed receipt with real name/details. |
| Direct email | Live ticket fields rendered by MCP; API/history recorded email; operator confirmed one inbox delivery with correct name/device/category/ticket/status and formatting |

The condition-photo partial save means an error does not guarantee no mutation.
Do not retry ambiguous writes automatically. Attachment reference URLs returned
by the service are not assumed to be public download links. Attachments are
internal ticket files; the send-email schema has no attachment parameter.

## Read-only sweep through MCP

| New tool | Result |
|---|---|
| appointments_list | Returned data |
| appointments_inventory | Returned data |
| appointments_slots | Returned available slots for supplied date |
| call_logs | Returned structured response |
| payroll_shifts | Returned structured response, filtered to test operator |
| payroll_report | Returned structured response, filtered to test operator |
| inventory_info | Returned conditions/locations |
| inventory_transfers | API returned `success:false`, `No Result Found` for selected date range; populated response not verified |
| parts_list | Returned data |
| purchase_order_details | Returned data |
| transaction_report | Returned results and summary for supplied range |
| sms_inbox | Returned structured response filtered to test contact |
| billable_services | Not live-tested: requires a valid billable/labor category; repair categories are not assumed equivalent |

Successful reads above establish routing, authentication and response handling.
Empty collections do not establish populated-data correctness, and accounting
or payroll totals have not been reconciled against the web application.

## Not live-tested

Model creation, trade-in creation/update/conversion, invoice creation, ticket
conversion to invoice, and payment recording need dedicated test records and
planned cleanup. They are not all operations on a ticket; a test ticket alone
cannot isolate their effects. No claim of complete live coverage is made.
Legacy customer creation has only passed duplicate-rejection checks. Billable
service lookup needs a valid labor category, and populated report/payroll totals
still need comparison with the website. Specialised inventory limits are listed
below.

## Questions for RepairDesk

1. Why do both API status routes leave notification macros unresolved while the
   web application resolves them for the same ticket and status?
2. Are undocumented context parameters required, or does API notification
   rendering need an upstream fix? Which macros are supported specifically by
   API-triggered SMS/email?
3. Is there a supported per-request notification-suppression/custom-body option
   for status changes? None is documented in the checked specification.
4. Can condition-photo writes report failure after saving, and is there an
   idempotency mechanism or authoritative result lookup for uncertain uploads?
5. Should empty inventory-transfer and appointment-search results be
   `success:false`, or empty successful collections? What is the supported discovery route for billable
   category IDs?
6. Why does inventory PUT clear omitted core fields, and why is `name` required
   although the update schema only requires `id`? Can the schema describe these
   replacement semantics and permit decimal `price`/`cost_price` values?
7. Why does the documented `minimum_price` update return success while the
   requested nonzero value remains zero in both API readback and the website?
8. How should clients clear inventory Long Description? Sending `notes:""`
   retained the existing value in the write response and operator's UI check.
9. Why did the test appointment reminder have blank greeting, appointment detail
   and store phone fields when customer name and store phone were present in the
   creation confirmation? The reminder template and exact cause remain unverified.

Live evidence and credentials are deliberately excluded from this repository.

## Interactive UI checks

The operator is checking endpoints one at a time. The normal PDF attachment
passed actual UI opening. A normal-sized pre-condition PNG also passed API readback and operator-confirmed
placement/opening in the pre-condition section. A two-image post-condition
upload also passed: both images returned by readback, operator confirmed both
open correctly, and a supplied screenshot shows both under Post Images. Earlier API success must not be
read as proof that every format previews correctly in RepairDesk.

## Rate-limit edge case

A live email-preview ticket read returned HTTP 429 before any email was sent.
Independent process queues were a coordination gap, now addressed by shared
file-backed pacing and cooldowns. Tests cover three independent processes,
cooldown persistence and a 429 without Retry-After. Other applications/hosts or
older MCP processes remain outside this coordination, so 429s remain possible.
The later email preview and one send succeeded; operator confirmed exactly one
email with correct fields. No uncertain email send was retried.

Direct-message edge cases were also exercised live: preview returned rendered
text without sending; an unknown placeholder and an unrelated repair-line ID
were rejected. Independent ticket readback showed no new communications.

## Customer creation and update

The operator explicitly supplied their own details and authorized a second
customer record. A partial `PUT /customers/{customer-Id}` changed the existing
record's email and preserved their real mobile. Independent detail readback
verified both and unchanged name, address and SMS consent fields.

`POST /customers` then created the second record using the released email and a
reserved fictional Australian mobile number. Independent detail readback
verified its ID, name, mobile, email, complete address and SMS opt-in. Customer
list readback also verified SMS opt-in enabled and email opt-in disabled on the
new record, and preserved both consent settings on the original record.
The operator confirmed both records display the correct contact details in the
website, including the new record's address and SMS opt-in.

Earlier attempts established these live edge cases:

- The new creation route rejected an email already held by the original record.
- Both `POST /customers` and legacy `POST /customer` rejected its existing mobile,
  including when a different, unused email was supplied. Legacy creation has
  only been tested for rejection; its successful creation path is unverified.
- Independent readback after these rejections found no new matching customer
  and no changes to the existing record's checked fields.
- Searching a local-format mobile returned no match even though the stored
  international-format number was present. A no-match keyword search alone
  therefore does not establish that a contact is unique. The server's duplicate
  checks remain authoritative; these observations do not establish every
  normalization or uniqueness rule.

No SMS was sent to the fictional number. Private contact details and live
customer IDs are excluded from this public report.

## Appointment creation

The operator selected a date/time and confirmed a 15-minute, zero-price test
appointment using their existing customer details and an existing device.
`POST /appointment/timeslots` returned the requested slot. `POST
/appointment/create` returned a new lead ID, display number, the existing
customer ID and an HTML confirmation containing the correct name/device/time.

Independent `GET /appointment` readback verified one new record, the original
customer ID, device, unique test serial, start/end times and zero total. Customer
detail readback confirmed the checked contact/address/consent fields unchanged.
The operator confirmed the appointment's identity, description, time and zero
price in the website. The operator later received an appointment reminder SMS
with blank values for the greeting, appointment detail and store phone number,
confirmed by the operator's screenshot. Customer name and store phone were
present in the creation confirmation response. The exact macros/cause are unknown;
the booking used a free-text issue rather than a predefined repair-service ID.
That might explain the appointment-detail blank but does not explain the missing
name and store phone. The SMS inbox endpoint
returned no matching outbound messages. Reminder template inspection is pending;
the rendered HTML response did not establish correct notification content.

An empty keyword search returned `success:false` / `No Result Found` before
creation. The test accounted for this explicit empty-result response; the MCP
still reports the upstream rejection rather than silently translating all API
errors to empty collections. No failed or uncertain appointment write was
retried.

## Inventory creation and update

A clearly labelled non-serialized test item was created with zero stock/cost/
price, an existing category, manufacturer and device, a unique SKU, short and
long descriptions, condition and physical location. Independent inventory
search verified the readable fields; the operator confirmed the item appeared.

Live testing exposed and addressed three MCP issues:

- The published schema types `price` and `cost_price` as integers. MCP validation
  initially rejected cents before sending. Narrow input-schema overrides now
  accept decimals; the upstream schema snapshot remains intact. A full update
  saved a 19.95 tax-inclusive retail price and 7.50 cost; readback and the operator
  confirmed both, with stock still zero. The raw `price` response is 18.14 plus
  1.81 tax; preserving the stored retail price avoids applying tax twice.
- A price-only PUT without `name` failed with `Data validation failed` and
  `data:[{name:["Name cannot be blank."]}]`. The MCP now exposes validation
  details. Independent readback showed no changes from these rejected attempts.
- A name-plus-description/location PUT saved those fields but cleared omitted
  SKU, price, stock and tax fields on the test item. The item was restored from
  its captured state. Inventory updates now look up the exact ID through the
  documented keyword search, merge requested changes into existing readable
  fields, then perform one PUT and independent readback. Conflicting path/body
  IDs are rejected; unmatched targets or missing preservation data stop before
  writing. Readback differences are returned explicitly, without retrying.

The revised MCP successfully changed description/location while preserving
retail price, cost, zero stock, SKU, tax, manufacturer/device and condition.
The operator confirmed these fields and the retained long description in the
website. GET omits long description (`notes`), so submitting that field is
marked separately as unverified until checked in the UI.

The documented `minimum_price:"10.00"` was submitted in both full and preserved
updates. The upstream response returned success, but GET remained at 0.00 and
the operator confirmed zero in the website. The MCP now reports this mismatch;
it does not claim the minimum price was saved. This upstream behavior remains
unresolved. Serialized inventory, nonzero stock movements, alternate valuation
methods, warranty changes and multi-store inventory have not been live-tested.

Explicit zero retail/cost prices saved correctly, and `description:""` cleared
the short description. The operator confirmed both. In the same update,
`notes:""` retained the previous Long Description in the write response and the
website. This clearing behavior is unresolved. The MCP flags a contradicting
write-response value while keeping independent notes verification separate.

The installed 2.1.2 server then restored the test item's retail price, cost and
short description through the same preservation/readback flow. Stock remained
zero and the checked SKU, tax, device, category, condition and location remained
intact. The existing Long Description was retained in the write response.

## Brand creation

`POST /createbrand` created a clearly labelled test brand with a supplied repair
category ID. Independent appointment-inventory reference readback returned one
matching brand. The operator confirmed it appeared in the website after being
asked to check that category. Model creation has not yet been live-tested; brand
creation does not establish that the model endpoint works.

## Installation check

A fresh MCP connection to the shared shop installation reports version 2.1.2 and
40 registered tools. The installed server was also used for the final inventory
restoration above. Existing long-running clients need to reconnect to discover
the expanded tool list; replacing server files does not reload their processes.
These checks establish this installation, not compatibility with every MCP client.
