# RepairDesk endpoint coverage

Source: [official OpenAPI specification](https://api-docs.repairdesk.co/rd-unresolved-swagger.json), checked 2026-10-19.

33 additional tools supplement the seven existing convenience tools.

| Tool | Documented operation | Effect |
|---|---|---|
| `repairdesk_appointments_list` | `GET /appointment` | Read only |
| `repairdesk_appointments_create` | `POST /appointment/create` | User-authorized write |
| `repairdesk_appointments_inventory` | `GET /appointment/inventory` | Read only |
| `repairdesk_appointments_slots` | `POST /appointment/timeslots` | Read only |
| `repairdesk_billable_services` | `GET /billable-categories/services` | Read only |
| `repairdesk_call_logs` | `GET /calllogs` | Read only |
| `repairdesk_brands_create` | `POST /createbrand` | User-authorized write |
| `repairdesk_models_create` | `POST /createmodel` | User-authorized write |
| `repairdesk_customers_create_legacy` | `POST /customer` | User-authorized write |
| `repairdesk_customers_create` | `POST /customers` | User-authorized write |
| `repairdesk_customers_update` | `PUT /customers/{customer-Id}` | User-authorized write |
| `repairdesk_payroll_shifts` | `GET /employees/payroll` | Read only |
| `repairdesk_payroll_report` | `GET /employees/payroll-report` | Read only |
| `repairdesk_inventory_info` | `GET /inventory/additionalinfo` | Read only |
| `repairdesk_inventory_create` | `POST /inventory/addnewitem` | User-authorized write |
| `repairdesk_tradeins_create` | `POST /inventory/addnewtradein` | User-authorized write |
| `repairdesk_tradeins_update` | `PUT /inventory/updatetradein/{id}` | User-authorized write |
| `repairdesk_tradeins_convert` | `POST /inventory/converttradeintoinventory` | User-authorized write |
| `repairdesk_inventory_update` | `PUT /inventory/{id}` | User-authorized write |
| `repairdesk_inventory_transfers` | `GET /inventorytransfer` | Read only |
| `repairdesk_invoices_create` | `POST /invoices` | User-authorized write |
| `repairdesk_invoice_payment` | `POST /invoices/{Invoice-Id}/payments` | User-authorized write |
| `repairdesk_parts_list` | `GET /parts` | Read only |
| `repairdesk_purchase_order_details` | `GET /purchaseorderdetails` | Read only |
| `repairdesk_transaction_report` | `GET /report/transactionlogs` | Read only |
| `repairdesk_condition_images` | `POST /ticket/prepost-images` | User-authorized write |
| `repairdesk_ticket_update` | `PUT /ticket/updateticket` | User-authorized write |
| `repairdesk_ticket_status_timer` | `POST /ticket/updateticketstatus` | User-authorized write |
| `repairdesk_ticket_to_invoice` | `POST /tickets/{Ticket-Id}/converttoinvoice` | User-authorized write |
| `repairdesk_sms_inbox` | `GET /v1/sms-inbox` | Read only |
| `repairdesk_ticket_email` | `POST /v1/ticket/sendemail` | User-authorized write |
| `repairdesk_ticket_sms` | `POST /v1/ticket/sendsms` | User-authorized write |
| `repairdesk_attachments` | `POST /v1/ticket/uploadattachments` | User-authorized write |

The original tools cover ticket list/read/create/note; customer list/read; invoice list/read/due; inventory list; employees; and shop reference GET routes. Updates now use the documented ticket update/status routes. OAuth credential lifecycle operations are deliberately managed outside MCP; an externally managed Bearer token is supported.

Uploads and messages normalize the spec's duplicated /v1 prefix against the configured base URL.

## Status writes and validation

The default API mode performs status writes and verifies them by readback.
New communication records are separately checked for unresolved placeholders;
status success is not notification success. An optional administrator `web`
mode can block these writes. See [validation results](validation.md) for live
test coverage and confirmed API discrepancies.
