export function serverNow() {
  // Single source of truth for "the current time" — always the server clock.
  return new Date();
}

export function isPastDeadline(deadline, now = serverNow()) {
  if (!deadline) return false;
  return now.getTime() > new Date(deadline).getTime();
}

export function deadlineRemainingMs(deadline, now = serverNow()) {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now.getTime();
  return ms > 0 ? ms : 0;
}

/**
 * CellFin token request expects `order.creationTime` as
 * `dd/mm/yyyy hh:mm AM/PM` (e.g. "11/11/2020 04:29 PM").
 */
export function formatCellfinTime(date = serverNow()) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hh = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12;
  if (hh === 0) hh = 12;
  return `${dd}/${mm}/${yyyy} ${String(hh).padStart(2, '0')}:${minutes} ${ampm}`;
}