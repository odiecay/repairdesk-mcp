import { inspectNotifications } from './notification-result.mjs';
export async function updateTicket(params, {get, post, put}) {
  if (!params.ticket_id) throw new Error('ticket_id required');
  if (!params.confirmed) return {confirmation_required:true,message:'Authorize this ticket change before setting confirmed=true.'};
  const ticket = await get(`/tickets/${params.ticket_id}`);
  const lines = ticket.devices || [];
  const selected = params.ticket_line_id ? lines.find(d => String(d.id) === String(params.ticket_line_id)) : lines.length === 1 ? lines[0] : undefined;
  if (!selected) throw new Error('Specify ticket_line_id belonging to this ticket; multiple lines are never updated implicitly.');
  if (params.device_name) throw new Error('device_name is ambiguous: use repairdesk_ticket_update with the documented device ID/name fields.');
  if (params.action === 'assign' && !params.technician_id) throw new Error('technician_id required');
  const hasFields = ['serial_number','security_code','additional_notes','technician_id','service_name'].some(k => params[k] !== undefined);
  if (!params.status && !hasFields) throw new Error('No ticket changes supplied.');
  if (params.status && hasFields) throw new Error('Submit status and field edits separately so each change can be verified.');
  if (params.status && (selected.status?.name ?? selected.status) === params.status) {
    return {verified:true,changed:false,ticket_id:params.ticket_id,ticket_line_id:String(selected.id),status:params.status,notifications:{state:'not_triggered',message:'Already at requested status; no write or notification was triggered by this call.'}};
  }
  if (params.status) {
    await post('/ticket/updateticketstatus',{id:Number(params.ticket_id),ticketInvId:Number(selected.id),status:params.status});
  } else {
    const deviceId = selected.device?.id ?? selected.device;
    const line = {id:Number(selected.id),device:Number(deviceId),name:params.service_name ?? selected.name ?? selected.repairProdItems?.map(p => p.name).join(', ')};
    if (!line.name || !Number.isFinite(line.device)) throw new Error('Ticket response lacks required device/name fields; no update sent.');
    // Preserve existing commercial fields when updating a line, never recalculate the ticket.
    for (const key of ['price','gst','line_discount','tax_inclusive','quantity','due_on']) if (selected[key] !== undefined) line[key] = selected[key];
    for (const [source,target] of Object.entries({serial_number:'serial',security_code:'security_code',additional_notes:'additional_notes',technician_id:'assigned_to'})) {
      if (params[source] !== undefined) line[target] = source === 'technician_id' ? Number(params[source]) : params[source];
    }
    await put('/ticket/updateticket',{summary:{id:Number(params.ticket_id)},devices:[line]});
  }
  const refreshed = await get(`/tickets/${params.ticket_id}`);
  const actual = refreshed.devices?.find(d => String(d.id) === String(selected.id));
  if (!actual) throw new Error('Write returned success but the target line could not be read back. Inspect before retrying.');
  const expected = {status:params.status,assigned_to:params.technician_id,serial:params.serial_number,security_code:params.security_code,additional_notes:params.additional_notes,name:params.service_name};
  for (const [key,value] of Object.entries(expected)) if (value !== undefined) {
    const found = key === 'status' ? actual.status?.name ?? actual.status : key === 'assigned_to' ? actual.assigned_to?.id ?? actual.assigned_to : actual[key];
    if (String(found) !== String(value)) throw new Error(`Ticket ${key} did not match after read-back. API may have ignored the field; inspect before retrying.`);
  }
  return {verified:true,ticket_id:params.ticket_id,ticket_line_id:String(selected.id),changes:expected,...(params.status ? {notifications:inspectNotifications(ticket,refreshed)} : {})};
}
