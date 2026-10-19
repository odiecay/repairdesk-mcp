// The web UI and public API have demonstrated different notification rendering.
// Keep this policy at the transport boundary so alternate tools cannot bypass it.
export const statusPolicyMessage = 'Ticket status changes must be completed in the RepairDesk website: API-triggered notifications can send unresolved customer/device placeholders. No API write was sent. Open the ticket, select the intended repair line and change its status there, then read the ticket back to verify. Do not send an extra SMS or claim the status was changed. confirmed=true does not override this server policy.';

export function validateStatusMode(mode) {
  if (!['web', 'api'].includes(mode)) throw new Error('REPAIRDESK_STATUS_MODE must be web or api.');
  return mode;
}

export function assertStatusWriteAllowed(mode, method, endpoint, body) {
  if (mode === 'api' || !['POST', 'PUT', 'PATCH'].includes(method)) return;
  const path = endpoint.replace(/^\/v1\//, '/').replace(/\/$/, '');
  const isUpdate = ['/ticket/updateticketstatus', '/ticket/updateticket'].includes(path) || /^\/tickets\/[^/]+$/.test(path);
  const hasStatus = value => value && typeof value === 'object' &&
    (Object.hasOwn(value, 'status') || Object.values(value).some(hasStatus));
  if (isUpdate && hasStatus(body)) throw new Error(statusPolicyMessage);
}
