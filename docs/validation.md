# API validation — 19 October 2026

Version 2.0.2 exposes 40 tools: seven convenience tools and 33 additions.
The endpoint inventory maps 58 documented non-OAuth operations. This is operation
coverage, not a claim that every field, business workflow or store configuration
has been tested. OAuth consent, renewal and revocation remain external.

## Automated checks

25 passing Node tests cover authentication, credential redaction, URL handling,
request schemas, required fields, write authorization, multipart file boundaries,
response identity, timers, positive payment validation, status-line ownership,
readback, notification observation, duplicate-status avoidance, and stdio tool
registration. New non-file operations are also exercised with synthetic requests.
Synthetic requests do not establish live functionality.

## Live ticket checks

An operator-owned test ticket/contact was used with explicit authorization.

| Function | Evidence / result |
|---|---|
| Ticket lookup | Display number resolves to internal ID; detail readback works |
| Internal note | Created successfully |
| Assignment and additional notes | Saved and independently read back |
| Attachments | TXT uploaded on test ticket; approved PDF uploaded on real job; returned IDs/ticket identity checked |
| Condition images | Normal post-photo succeeded and appears in readback; tiny pre-photo returned error but was nevertheless saved |
| Timers | Custom duration, start and stop saved; duration read back |
| Dedicated status route | Status saved; automatic SMS contained literal macros |
| General ticket-update status route | Same failure: status saved, automatic SMS contains literal macros |
| Website comparison | Same ticket/status rendered name and device correctly; operator confirmed received text |
| Direct SMS | API success, communication record, and recipient receipt observed |
| Direct email | API success and communication record; inbox delivery not independently confirmed |

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

Customer creation/update, brand/model creation, appointment creation, inventory
creation/update, trade-in creation/update/conversion, invoice creation, ticket
conversion to invoice, and payment recording need dedicated test records and
planned cleanup. They are not all operations on a ticket; a test ticket alone
cannot isolate their effects. No claim of complete live coverage is made.

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
5. Should an empty inventory-transfer result be `success:false`, or an empty
   successful collection? What is the supported discovery route for billable
   category IDs?

Live evidence and credentials are deliberately excluded from this repository.
