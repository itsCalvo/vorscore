const EAT_TIMEZONE = 'Africa/Nairobi';

/** Converts a UTC kickoff ISO string to HH:mm EAT. */
export function formatKickoff(date: string): string {
  if (!date) return '—';

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '—';

  const time = parsed.toLocaleTimeString('en-GB', {
    timeZone: EAT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${time} EAT`;
}
