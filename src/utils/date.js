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