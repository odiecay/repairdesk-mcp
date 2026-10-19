import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, relative, isAbsolute, resolve } from 'node:path';
import { Blob } from 'node:buffer';
import { z } from 'zod';
import { toZod } from './schema.mjs';

export const spec = JSON.parse(readFileSync(new URL('./api-spec.json', import.meta.url), 'utf8'));
const names = {
  'GET /appointment': 'appointments_list', 'POST /appointment/create': 'appointments_create',
  'GET /appointment/inventory': 'appointments_inventory', 'POST /appointment/timeslots': 'appointments_slots',
  'GET /billable-categories/services': 'billable_services', 'GET /calllogs': 'call_logs',
  'POST /createbrand': 'brands_create', 'POST /createmodel': 'models_create',
  'POST /customer': 'customers_create_legacy', 'POST /customers': 'customers_create',
  'PUT /customers/{customer-Id}': 'customers_update',
  'GET /employees/payroll': 'payroll_shifts', 'GET /employees/payroll-report': 'payroll_report',
  'GET /inventory/additionalinfo': 'inventory_info', 'POST /inventory/addnewitem': 'inventory_create',
  'PUT /inventory/{id}': 'inventory_update', 'POST /inventory/addnewtradein': 'tradeins_create',
  'PUT /inventory/updatetradein/{id}': 'tradeins_update',
  'POST /inventory/converttradeintoinventory': 'tradeins_convert', 'GET /inventorytransfer': 'inventory_transfers',
  'POST /invoices': 'invoices_create', 'POST /invoices/{Invoice-Id}/payments': 'invoice_payment',
  'GET /parts': 'parts_list', 'GET /purchaseorderdetails': 'purchase_order_details',
  'GET /report/transactionlogs': 'transaction_report', 'POST /ticket/prepost-images': 'condition_images',
  'PUT /ticket/updateticket': 'ticket_update', 'POST /ticket/updateticketstatus': 'ticket_status_timer',
  'POST /tickets/{Ticket-Id}/converttoinvoice': 'ticket_to_invoice',
  'GET /v1/sms-inbox': 'sms_inbox', 'POST /v1/ticket/sendemail': 'ticket_email',
  'POST /v1/ticket/sendsms': 'ticket_sms', 'POST /v1/ticket/uploadattachments': 'attachments'
};
export const operations = spec.operations.filter(o => names[`${o.method} ${o.path}`]).map(o => ({...o, name: `repairdesk_${names[`${o.method} ${o.path}`]}`}));
const isRead = op => op.method === 'GET' || op.path === '/appointment/timeslots';
const allowed = new Set('gif jpeg jpg png xls xlsx xltx doc docx pdf pptx ppt txt heic heif'.split(' '));
const mime = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', txt: 'text/plain' };

export function operationShape(op) {
  const shape = {};
  for (const location of ['path','query']) {
    const fields = {}, required = [];
    for (const p of op.parameters || []) if (p.in === location) {
      fields[p.name] = {...p.schema, description: p.description || p.schema?.description};
      if (p.required) required.push(p.name);
    }
    if (Object.keys(fields).length) {
      const schema = toZod({type:'object', properties:fields, required, additionalProperties:false}, spec.components);
      shape[location] = required.length ? schema : schema.optional();
    }
  }
  const content = op.requestBody?.content || {};
  const multipart = content['multipart/form-data'];
  const bodySchema = structuredClone((multipart || content['application/json'])?.schema || {});
  if (multipart) {
    for (const [key, field] of Object.entries(bodySchema.properties || {})) {
      if (field.format === 'binary' || field.items?.format === 'binary') {
        delete bodySchema.properties[key];
        bodySchema.required = bodySchema.required?.filter(x => x !== key);
      }
    }
    shape.file_paths = z.array(z.string().min(1)).min(1).max(10).describe('Absolute paths on the MCP server host, not the connecting desktop. Allowed upload roots are configured server-side.');
  }
  if (op.requestBody) {
    const schema = toZod(bodySchema, spec.components);
    shape.body = op.requestBody.required ? schema : schema.optional();
  }
  if (!isRead(op)) shape.confirmed = z.boolean().optional().default(false).describe('Set true only when the user has authorized this exact action. Existing explicit authorization is sufficient; do not ask twice. Status updates may notify customers.');
  return shape;
}

function makeForm(op, args, roots) {
  if (!roots.length) throw new Error('Uploads require REPAIRDESK_UPLOAD_ROOTS (path-delimiter separated server directories).');
  const rootPaths = roots.map(p => realpathSync(p));
  const form = new FormData();
  for (const [key,value] of Object.entries(args.body || {})) {
    if (['file','files','files[]','images','image'].includes(key)) throw new Error('Use file_paths for uploads.');
    form.append(key, String(value));
  }
  for (const path of args.file_paths) {
    if (!isAbsolute(path)) throw new Error('Upload paths must be absolute.');
    const actual = realpathSync(path);
    if (!rootPaths.some(root => {const rel = relative(root, actual);return rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(rel);})) throw new Error('Upload file is outside REPAIRDESK_UPLOAD_ROOTS.');
    const ext = extname(actual).slice(1).toLowerCase();
    const image = op.path === '/ticket/prepost-images';
    if (!(image ? ['jpg','jpeg','png','gif'].includes(ext) : allowed.has(ext))) throw new Error(`Unsupported upload extension: ${ext}`);
    const stat = statSync(actual);
    if (!stat.isFile() || stat.size > 15 * 1024 * 1024 || stat.size === 0) throw new Error('Upload must be a non-empty regular file no larger than 15 MB.');
    const bytes = readFileSync(actual);
    // Validate actual bytes too, in case the file changed between stat and read.
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('Upload size changed or exceeds 15 MB.');
    form.append(image ? 'images[]' : args.file_paths.length === 1 ? 'file' : 'files[]', new Blob([bytes], {type:mime[ext] || 'application/octet-stream'}), basename(actual));
  }
  return form;
}

export async function executeOperation(op, input, { request, auditLog = () => {}, uploadRoots = [] }) {
  const args = z.object(operationShape(op)).strict().parse(input);
  if (!isRead(op) && !args.confirmed) return { confirmation_required: true, operation: op.name, message: 'User authorization is required before this write. No request was sent.' };
  if (op.path === '/ticket/updateticketstatus') {
    const b = args.body;
    if (!b.status && !b.timerAction) throw new Error('Provide status or timerAction.');
    if (b.timerAction === 'custom' && !['days','hours','minutes','seconds'].some(k => b[k] > 0)) throw new Error('Custom time must be greater than zero.');
    for (const k of ['days','hours','minutes','seconds']) if (b[k] < 0) throw new Error('Timer values cannot be negative.');
  }
  if (op.name === 'repairdesk_invoice_payment' && !(args.body.amount > 0)) throw new Error('Payment amount must be positive.');
  if (['repairdesk_ticket_sms', 'repairdesk_ticket_email'].includes(op.name)) {
    const fields = op.name === 'repairdesk_ticket_sms' ? ['content'] : ['subject', 'body'];
    for (const field of fields) {
      if (/\{[A-Za-z][A-Za-z0-9_ ]*\}/.test(args.body[field] || '')) {
        throw new Error(`Unresolved placeholder in ${field}. Read the ticket and supply fully rendered message text before sending; these endpoints are not template renderers. No message was sent.`);
      }
    }
  }
  let endpoint = op.path;
  for (const [key,value] of Object.entries(args.path || {})) endpoint = endpoint.replace(`{${key}}`, encodeURIComponent(String(value)));
  if (/\{/.test(endpoint)) throw new Error('Missing path parameter.');
  // Log identifiers, never message content, customer bodies, credentials or uploaded bytes.
  auditLog(op.name, op.method, {endpoint, ticket_id:args.body?.ticket_id || args.body?.ticketId || args.body?.summary?.id, files:args.file_paths?.map(p => basename(p))});
  const options = {params:args.query};
  if (op.requestBody?.content?.['multipart/form-data']) options.form = makeForm(op,args,uploadRoots);
  else if (args.body !== undefined) options.body = args.body;
  const result = await request(op.method,endpoint,options);
  if (op.name === 'repairdesk_attachments') {
    const attachments = result?.attachments;
    if (!Array.isArray(attachments) || attachments.length !== args.file_paths.length ||
        attachments.some(a => !a.id || Number(a.ticket_id) !== args.body.ticket_id ||
          (args.body.ticket_inv_id !== undefined && Number(a.ticket_inv) !== args.body.ticket_inv_id))) {
      throw new Error('Upload response did not confirm every file on the intended ticket/line. Inspect attachments before retrying.');
    }
  }
  return result;
}

export function registerOperations(server, deps) {
  for (const op of operations) {
    const description = `${op.summary}. ${op.description}\n${isRead(op) ? 'Read-only operation.' : 'Requires user authorization (confirmed=true). Do not automatically retry an uncertain write.'}`;
    server.tool(op.name, description, operationShape(op), async args => ({ content:[{type:'text',text:JSON.stringify(await executeOperation(op,args,deps),null,2)}] }));
  }
}
