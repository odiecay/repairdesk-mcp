// Ticket activity records are evidence of server processing, not handset delivery.
export function inspectNotifications(before, after) {
  if (!Array.isArray(before?.communication_history) || !Array.isArray(after?.communication_history)) {
    return {state:'unverified',delivery_verified:false,message:'Communication history unavailable. Do not claim customer delivery or resend automatically.'};
  }
  const oldIds=new Set(before.communication_history.map(x=>String(x.id)));
  const added=after.communication_history.filter(x=>x.id!=null&&!oldIds.has(String(x.id)));
  const malformed=added.filter(x=>/\{[A-Za-z][A-Za-z0-9_ ]*\}/.test(`${x.subject||''} ${x.message||''}`));
  return {
    state:malformed.length?'malformed_template':added.length?'recorded':'none_observed',
    delivery_verified:false,
    message_ids:added.map(x=>x.id),
    malformed_message_ids:malformed.map(x=>x.id),
    message:malformed.length
      ? 'The ticket change was saved, but RepairDesk recorded an automatic message containing unresolved template placeholders. Do not retry the status change or send a duplicate correction automatically. Notification rendering remains an upstream issue.'
      : added.length
        ? 'New communications were recorded. This does not verify delivery; email content may not be exposed in history.'
        : 'No new communications were visible at readback. This does not prove notifications were suppressed or will not arrive later.'
  };
}
