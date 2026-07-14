// dd/mm/yy + HH:MM:SS, split so callers can stack them vertically.
export function formatDateParts(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return { date: `${dd}/${mm}/${yy}`, time };
}
