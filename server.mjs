#!/usr/bin/env node
import { assertStatusWriteAllowed } from './lib/status-policy.mjs';
/**
 * RepairDesk MCP Server
 *
 * Gives any MCP-compatible AI harness (Claude Code, Claude Desktop, etc.)
 * direct access to the RepairDesk API: tickets, customers, invoices,
 * inventory, employees, and shop reference data.
 *
 * Auto-resolves T-XXXXX order IDs to internal ticket IDs.
 *
 * Tools:
 *   repairdesk_tickets        - Search/get tickets
 *   repairdesk_tickets_write  - Create/update tickets, add notes, assign techs
 *   repairdesk_customers      - Search/get customers
 *   repairdesk_invoices       - Search/get invoices, check due amounts
 *   repairdesk_inventory      - Search inventory/parts stock
 *   repairdesk_employees      - List employees/technicians
 *   repairdesk_shop_info      - Lookup reference data (devices, statuses, etc.)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, appendFileSync, mkdirSync } from "fs";
import { dirname, join, delimiter } from "path";
import { createClient, loadConfig } from "./lib/client.mjs";
import { updateTicket } from "./lib/ticket-write.mjs";
import { registerOperations } from "./lib/operations.mjs";
import { fileURLToPath } from "url";

// ============================================================
// Configuration
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
// Primary: environment variables (set these in your MCP client's config).
// Fallback: a local config.json next to this file, for setups that prefer
// a file over env vars. Never commit a filled-in config.json.
const CONFIG_PATH = process.env.REPAIRDESK_CONFIG || join(__dirname, "config.json");

const getConfig = () => loadConfig(CONFIG_PATH);

// ============================================================
// Audit Log — every MCP call logged to a local file (API key stripped)
// ============================================================

const LOG_DIR = process.env.REPAIRDESK_LOG_DIR || join(__dirname, "logs");
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
const AUDIT_LOG = join(LOG_DIR, "mcp_audit.log");

function auditLog(tool, action, params) {
  const ts = new Date().toISOString();
  const sanitized = { ...params };
  delete sanitized.api_key;
  const line = JSON.stringify({ ts, tool, action, params: sanitized }) + "\n";
  try { appendFileSync(AUDIT_LOG, line); } catch {}
}

// Notification rules are store-configured; any status change may notify.

const statusMode = process.env.REPAIRDESK_STATUS_MODE || 'api';
const request = createClient({ getConfig,
  statusMode,
  interval: Number(process.env.REPAIRDESK_MIN_INTERVAL_MS || 1250),
  timeout: Number(process.env.REPAIRDESK_TIMEOUT_MS || 60000),
  userAgent: process.env.REPAIRDESK_USER_AGENT || "RepairDesk-MCP/2.0"
});

const apiGet = (endpoint, params) => request("GET", endpoint, { params });
const apiPost = (endpoint, body) => request("POST", endpoint, { body });
const apiPut = (endpoint, body) => request("PUT", endpoint, { body });

// ============================================================
// Helper
// ============================================================

function txt(text) {
  return { content: [{ type: "text", text }] };
}

/**
 * Resolve a T-XXXXX order ID to the internal numeric ticket ID.
 * Uses keyword search to find the ticket fast, then confirms order_id match.
 */
async function resolveTicketId(ticketId) {
  if (/^\d+$/.test(ticketId)) return ticketId;
  const orderId = ticketId.startsWith("T-") ? ticketId : `T-${ticketId}`;
  const orderNum = orderId.replace("T-", "");
  const data = await apiGet("/tickets", { keyword: orderNum, pagesize: 50 });
  const tickets = data?.ticketData || (Array.isArray(data) ? data : []);
  for (const t of tickets) {
    if (t.summary?.order_id === orderId) return String(t.summary.id);
  }
  const data2 = await apiGet("/tickets", { keyword: orderId, pagesize: 50 });
  const tickets2 = data2?.ticketData || (Array.isArray(data2) ? data2 : []);
  for (const t of tickets2) {
    if (t.summary?.order_id === orderId) return String(t.summary.id);
  }
  throw new Error(`Ticket ${orderId} not found — could not resolve to internal ID`);
}

// ============================================================
// MCP Server Setup
// ============================================================

const server = new McpServer({
  name: "repairdesk",
  version: "2.1.0",
  description: "RepairDesk API — tickets, customers, invoices, inventory, employees"
});

// ============================================================
// TOOL: repairdesk_tickets
// ============================================================

server.tool(
  "repairdesk_tickets",
  "Search and look up repair tickets. List tickets filtered by status, date, keyword, or tech. Get full details by ticket ID.",
  {
    action: z.enum(["list", "get"]).describe('"list" to search, "get" for specific ticket'),
    ticket_id: z.string().optional().describe("Ticket ID (for action=get)"),
    keyword: z.string().optional().describe("Search keyword (customer name, device, etc.)"),
    status: z.string().optional().describe("Filter by status (Pending, In Progress, Repaired, etc.)"),
    assigned_to: z.string().optional().describe("Filter by assigned employee ID"),
    from_date: z.string().optional().describe("Start date as Unix timestamp"),
    to_date: z.string().optional().describe("End date as Unix timestamp"),
    page: z.number().optional().default(1),
    pagesize: z.number().optional().default(20),
  },
  async ({ action, ticket_id, keyword, status, assigned_to, from_date, to_date, page, pagesize }) => {
    auditLog("repairdesk_tickets", action, { ticket_id, keyword, status, assigned_to, page, pagesize });
    if (action === "get") {
      if (!ticket_id) throw new Error("ticket_id required for action=get");
      ticket_id = await resolveTicketId(ticket_id);
      const data = await apiGet(`/tickets/${ticket_id}`);
      return txt(`Ticket details:\n${JSON.stringify(data, null, 2)}`);
    }
    const data = await apiGet("/tickets", { keyword, status, assigned_to, from_date, to_date, page, pagesize });
    if (Array.isArray(data)) {
      const summary = data.slice(0, 25).map(t =>
        `  #${t.id ?? "?"} — ${t.status ?? "?"} — ${t.customer_name ?? "?"}`
      ).join("\n");
      let text = `${data.length} ticket(s):\n${summary}`;
      if (data.length > 25) text += `\n  ... and ${data.length - 25} more`;
      return txt(text);
    }
    return txt(JSON.stringify(data, null, 2));
  }
);

// ============================================================
// TOOL: repairdesk_tickets_write
// ============================================================

server.tool(
  "repairdesk_tickets_write",
  "Create/update tickets, add notes, assign techs. Status writes stay in the MCP. Readback distinguishes saved status from automatic notification problems; do not retry a saved change or send a duplicate correction. Status changes may trigger store-configured customer SMS/email, including In Progress. Set confirmed=true only for user-authorized changes; prior explicit authorization is sufficient.",
  {
    action: z.enum(["create", "update", "add_note", "assign"]),
    ticket_id: z.string().optional().describe("Ticket ID (for update/add_note/assign)"),
    ticket_line_id: z.string().optional().describe("Ticket line ID; required when a ticket has multiple devices/services"),
    customer_id: z.string().optional().describe("Customer ID (for create)"),
    device_id: z.string().optional().describe("Device type ID (for create)"),
    service_id: z.string().optional().describe("Service/repair item ID"),
    service_name: z.string().optional().describe("Service name"),
    device_name: z.string().optional().describe("Device name/model"),
    serial_number: z.string().optional(),
    security_code: z.string().optional().describe("Device PIN/password"),
    additional_notes: z.string().optional().describe("Internal notes"),
    status: z.string().optional().describe("Ticket status — MAY TRIGGER NOTIFICATION"),
    note: z.string().optional().describe("Note text (for add_note)"),
    note_type: z.enum(["internal", "diagnostic"]).optional().default("internal"),
    is_flag: z.union([z.literal(0),z.literal(1)]).optional().default(0).describe("Flag the new note; defaults to 0. Does not edit an existing note."),
    technician_id: z.string().optional().describe("Employee ID (for assign)"),
    confirmed: z.boolean().optional().default(false).describe("Must be true for status changes"),
  },
  async (params) => {
    const { action, confirmed } = params;
    auditLog("repairdesk_tickets_write", action, { ticket_id: params.ticket_id, status: params.status, confirmed, note_type: params.note_type });

    if (["update", "assign"].includes(action) && params.status !== undefined) {
      assertStatusWriteAllowed(statusMode, "POST", "/ticket/updateticketstatus", {status:params.status});
    }

    if (params.ticket_id && action !== "create") {
      params.ticket_id = await resolveTicketId(params.ticket_id);
    }

    if (action === "add_note") {
      if (!params.ticket_id) throw new Error("ticket_id required");
      if (!params.note) throw new Error("note required");
      const typeNum = params.note_type === "diagnostic" ? 1 : 0;
      const result = await apiPost("/ticket/addnote", {
        id: parseInt(params.ticket_id, 10),
        note: params.note,
        type: typeNum,
        is_flag: params.is_flag
      });
      return txt(`Note added to ticket ${params.ticket_id}:\n"${params.note.slice(0, 200)}..."\n\n${JSON.stringify(result, null, 2)}`);
    }

    if (action === "assign" || action === "update") {
      return txt(JSON.stringify(await updateTicket(params, {get:apiGet,post:apiPost,put:apiPut}), null, 2));
    }

    if (action === "create") {
      if (!params.customer_id) throw new Error("customer_id required");
      if (!params.device_id) throw new Error("device_id required");
      if (!confirmed) {
        return txt(`CONFIRMATION REQUIRED — Create ticket:\n- Customer: ${params.customer_id}\n- Device: ${params.device_id}\n- Service: ${params.service_name || params.service_id || "N/A"}\nCall again with confirmed=true`);
      }
      const device = { device: params.device_id };
      if (params.service_id) device.repairProdItems = [{id:params.service_id, ...(params.service_name ? {name:params.service_name} : {})}];
      if (params.service_name) device.name = params.service_name;
      if (params.serial_number) device.serial = params.serial_number;
      if (params.security_code) device.security_code = params.security_code;
      if (params.additional_notes) device.additional_notes = params.additional_notes;
      if (params.technician_id) device.assigned_to = Number(params.technician_id);
      const result = await apiPost("/tickets", { summary: {customer_id: params.customer_id}, devices: [device] });
      return txt(`Ticket created!\n${JSON.stringify(result, null, 2)}`);
    }
  }
);

// ============================================================
// TOOL: repairdesk_customers
// ============================================================

server.tool(
  "repairdesk_customers",
  "Look up customers by name, phone, email, or ID.",
  {
    action: z.enum(["list", "get"]),
    customer_id: z.string().optional(),
    keyword: z.string().optional().describe("Search by name, phone, or email"),
    page: z.number().optional().default(1),
    pagesize: z.number().optional().default(20),
  },
  async ({ action, customer_id, keyword, page, pagesize }) => {
    auditLog("repairdesk_customers", action, { customer_id, keyword, page, pagesize });
    if (action === "get") {
      if (!customer_id) throw new Error("customer_id required");
      return txt(`Customer:\n${JSON.stringify(await apiGet(`/customers/${customer_id}`), null, 2)}`);
    }
    const data = await apiGet("/customers", { keyword, page, pagesize });
    if (Array.isArray(data)) {
      const summary = data.slice(0, 25).map(c =>
        `  ${c.full_name ?? c.name ?? "?"}${c.mobile ? ` — ${c.mobile}` : ""}${c.email ? ` — ${c.email}` : ""}`
      ).join("\n");
      return txt(`${data.length} customer(s):\n${summary}`);
    }
    return txt(JSON.stringify(data, null, 2));
  }
);

// ============================================================
// TOOL: repairdesk_invoices
// ============================================================

server.tool(
  "repairdesk_invoices",
  "Search invoices, get details, or check due/outstanding amounts.",
  {
    action: z.enum(["list", "get", "due_amount"]),
    invoice_id: z.string().optional(),
    keyword: z.string().optional(),
    status: z.string().optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
    page: z.number().optional().default(1),
    pagesize: z.number().optional().default(20),
  },
  async ({ action, invoice_id, keyword, status, from_date, to_date, page, pagesize }) => {
    auditLog("repairdesk_invoices", action, { invoice_id, keyword, status, page, pagesize });
    if (action === "get") {
      if (!invoice_id) throw new Error("invoice_id required");
      return txt(`Invoice:\n${JSON.stringify(await apiGet(`/invoices/${invoice_id}`), null, 2)}`);
    }
    if (action === "due_amount") {
      if (!invoice_id) throw new Error("invoice_id required");
      return txt(`Due amount:\n${JSON.stringify(await apiGet(`/invoices/${invoice_id}/dueamount`), null, 2)}`);
    }
    const data = await apiGet("/invoices", { keyword, status, from_date, to_date, page, pagesize });
    if (Array.isArray(data)) {
      const summary = data.slice(0, 25).map(i =>
        `  #${i.id ?? "?"} — $${i.total ?? "?"} — ${i.status ?? "?"}${i.customer_name ? ` — ${i.customer_name}` : ""}`
      ).join("\n");
      return txt(`${data.length} invoice(s):\n${summary}`);
    }
    return txt(JSON.stringify(data, null, 2));
  }
);

// ============================================================
// TOOL: repairdesk_inventory
// ============================================================

server.tool(
  "repairdesk_inventory",
  "Search inventory/parts stock.",
  {
    keyword: z.string().optional(),
    page: z.number().optional().default(1),
    pagesize: z.number().optional().default(20),
  },
  async ({ keyword, page, pagesize }) => {
    auditLog("repairdesk_inventory", "search", { keyword, page, pagesize });
    const data = await apiGet("/inventory", { keyword, page, pagesize });
    if (Array.isArray(data)) {
      const summary = data.slice(0, 25).map(i =>
        `  ${i.name ?? "?"} — Qty: ${i.quantity ?? "?"} — $${i.price ?? "?"}`
      ).join("\n");
      return txt(`${data.length} item(s):\n${summary}`);
    }
    return txt(JSON.stringify(data, null, 2));
  }
);

// ============================================================
// TOOL: repairdesk_employees
// ============================================================

server.tool(
  "repairdesk_employees",
  "List employees/technicians.",
  {
    page: z.number().optional().default(1),
    pagesize: z.number().optional().default(50),
  },
  async ({ page, pagesize }) => {
    auditLog("repairdesk_employees", "list", { page, pagesize });
    const data = await apiGet("/employees", { page, pagesize });
    if (Array.isArray(data)) {
      const summary = data.map(e =>
        `  ID:${e.id} — ${e.full_name ?? e.name ?? "?"} — ${e.role ?? "?"}${e.email ? ` — ${e.email}` : ""}`
      ).join("\n");
      return txt(`${data.length} employee(s):\n${summary}`);
    }
    return txt(JSON.stringify(data, null, 2));
  }
);

// ============================================================
// TOOL: repairdesk_shop_info
// ============================================================

server.tool(
  "repairdesk_shop_info",
  "Look up reference data: devices, categories, statuses, colors, networks, tax classes, payment methods, referral sources, repair types, service types, locations, problems (by device), trade-ins, purchase orders.",
  {
    lookup: z.enum([
      "devices", "categories", "statuses", "colors", "networks",
      "tax_classes", "payment_methods", "referral_sources", "repair_types",
      "service_types", "locations", "problems", "tradeins", "purchase_orders"
    ]),
    device_id: z.string().optional().describe("Required when lookup=problems"),
    brand: z.string().optional().describe("Filter devices by brand"),
    device_name: z.string().optional().describe("Filter devices by name"),
    keyword: z.string().optional(),
    page: z.number().optional().default(1),
    pagesize: z.number().optional().default(20),
  },
  async ({ lookup, device_id, brand, device_name, keyword, page, pagesize }) => {
    auditLog("repairdesk_shop_info", lookup, { device_id, brand, device_name, keyword, page, pagesize });
    const endpoints = {
      devices: () => apiGet("/devices", { brand, device_name }),
      categories: () => apiGet("/repaircategories"),
      statuses: () => apiGet("/statuses"),
      colors: () => apiGet("/appointment/colors"),
      networks: () => apiGet("/networks"),
      tax_classes: () => apiGet("/taxclasses"),
      payment_methods: () => apiGet("/paymentmethods"),
      referral_sources: () => apiGet("/referredby"),
      repair_types: () => apiGet("/appointment/repairtypes"),
      service_types: () => apiGet("/appointment/servicetypes"),
      locations: () => apiGet("/appointment/locations"),
      tradeins: () => apiGet("/tradeins", { keyword }),
      purchase_orders: () => apiGet("/purchaseorders", { page, pagesize }),
      problems: () => {
        if (!device_id) throw new Error("device_id required for problems lookup");
        return apiGet(`/problems/${device_id}`);
      },
    };
    const data = await endpoints[lookup]();
    const label = lookup.replace(/_/g, " ");
    if (Array.isArray(data)) {
      const summary = data.slice(0, 30).map(item => {
        const name = item.name ?? item.label ?? item.fullname ?? item.title ?? JSON.stringify(item);
        const id = item.id ? ` (ID: ${item.id})` : "";
        return `  ${name}${id}`;
      }).join("\n");
      let text = `${data.length} ${label} result(s):\n${summary}`;
      if (data.length > 30) text += `\n  ... and ${data.length - 30} more`;
      return txt(text);
    }
    return txt(`${label}:\n${JSON.stringify(data, null, 2)}`);
  }
);

// ============================================================
// Start Server
// ============================================================

async function main() {
  registerOperations(server, { request, auditLog, statusMode,
  uploadRoots: (process.env.REPAIRDESK_UPLOAD_ROOTS || '').split(delimiter).filter(Boolean)
});

const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("RepairDesk MCP Server v1.0.0 running");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
