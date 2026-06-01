export const DEFAULT_RAPTOR_LAB_DEPARTURE_ISO = '2026-05-07T09:00:00-06:00';

function firstQueryValue(value?: string | string[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function resolveRaptorLabDepartureDate(
  value?: string | string[] | null,
  now: Date = new Date(),
) {
  const rawValue = firstQueryValue(value)?.trim();
  if (!rawValue) return new Date(DEFAULT_RAPTOR_LAB_DEPARTURE_ISO);
  if (rawValue.toLowerCase() === 'now') return new Date(now);

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return new Date(DEFAULT_RAPTOR_LAB_DEPARTURE_ISO);

  return parsed;
}

export function formatRaptorLabDepartureDebug(date: Date) {
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
