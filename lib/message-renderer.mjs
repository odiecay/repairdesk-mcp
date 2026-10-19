const tokenPattern = /\{[A-Za-z][A-Za-z0-9_ ]*\}/g;
const deviceKeys = new Set(['manufacturer_name','Device_Name','Device Name','device_name','repair_category','Status','status']);
const supported = new Set(['customer_first_name','customer_last_name','customer_name','customer name','Ticket_Id','ticket_id',...deviceKeys]);
const escapeHtml = value => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function messageTokens(text) { return [...String(text || '').matchAll(tokenPattern)].map(m=>m[0].slice(1,-1)); }
export function renderTicketMessage(text, ticket, {lineId, html=false}={}) {
  const tokens=messageTokens(text);
  for(const key of tokens)if(!supported.has(key))throw new Error(`Unknown message placeholder {${key}}. No message sent.`);
  const lines=ticket.devices || [];
  const needsLine=tokens.some(k=>deviceKeys.has(k));
  const line=lineId!==undefined?lines.find(d=>String(d.id)===String(lineId)):lines.length===1?lines[0]:undefined;
  if(lineId!==undefined&&!line)throw new Error('ticket_line_id does not belong to this ticket. No message sent.');
  if(needsLine&&!line)throw new Error('Specify ticket_line_id for device/status placeholders on a ticket with multiple repair lines. No message sent.');
  const c=ticket.summary?.customer || {};
  const values={customer_first_name:c.first_name,customer_last_name:c.last_name,customer_name:c.fullName ?? [c.first_name,c.last_name].filter(Boolean).join(' '),
    manufacturer_name:line?.manufacturer_name,Device_Name:line?.device_name ?? line?.device?.name,repair_category:line?.PostPreCategoryName,
    Ticket_Id:ticket.summary?.order_id,Status:line?.status?.name ?? line?.status};
  values['customer name']=values.customer_name;
  values['Device Name']=values.Device_Name;values.device_name=values.Device_Name;values.ticket_id=values.Ticket_Id;values.status=values.Status;
  const rendered=String(text).replace(tokenPattern,token=>{
    const value=values[token.slice(1,-1)];
    if(value===undefined||value===null||String(value).trim()==='')throw new Error(`Ticket has no value for ${token}. No message sent.`);
    return html?escapeHtml(String(value)):String(value);
  });
  if(messageTokens(rendered).length)throw new Error('Rendered message still contains placeholders. No message sent.');
  return rendered;
}
