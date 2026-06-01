import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_DESTINATIONS_STORAGE_KEY = '@busescr/recent-destinations:v1';
const MAX_RECENT_DESTINATIONS = 5;

export type RecentDestinationEntry = {
  id: string;
  placeId: string | null;
  name: string;
  address: string;
  coordinates: [number, number] | null;
  usedAt: string;
};

function normalizeKey(entry: Pick<RecentDestinationEntry, 'placeId' | 'name'>) {
  if (entry.placeId?.trim()) return `place:${entry.placeId.trim()}`;
  return `name:${entry.name.trim().toLocaleLowerCase('es-CR')}`;
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function sanitizeEntry(value: unknown): RecentDestinationEntry | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<RecentDestinationEntry>;
  if (!candidate.name || !candidate.usedAt) return null;

  return {
    id: candidate.id ? String(candidate.id) : normalizeKey({ placeId: candidate.placeId ?? null, name: candidate.name }),
    placeId: candidate.placeId ? String(candidate.placeId) : null,
    name: String(candidate.name),
    address: candidate.address ? String(candidate.address) : '',
    coordinates: isCoordinatePair(candidate.coordinates) ? candidate.coordinates : null,
    usedAt: String(candidate.usedAt),
  };
}

export async function loadRecentDestinations(): Promise<RecentDestinationEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_DESTINATIONS_STORAGE_KEY);
    if (!raw) return [];

    return (JSON.parse(raw) as unknown[])
      .map(sanitizeEntry)
      .filter((entry): entry is RecentDestinationEntry => Boolean(entry))
      .sort((a, b) => Date.parse(b.usedAt) - Date.parse(a.usedAt));
  } catch {
    return [];
  }
}

export async function rememberRecentDestination(params: {
  placeId?: string | null;
  name: string;
  address?: string;
  coordinates?: [number, number] | null;
}) {
  const nextEntry: RecentDestinationEntry = {
    id: normalizeKey({ placeId: params.placeId ?? null, name: params.name }),
    placeId: params.placeId ?? null,
    name: params.name,
    address: params.address ?? '',
    coordinates: params.coordinates ?? null,
    usedAt: new Date().toISOString(),
  };

  const current = await loadRecentDestinations();
  const deduped = current.filter((entry) => normalizeKey(entry) !== nextEntry.id);
  const next = [nextEntry, ...deduped].slice(0, MAX_RECENT_DESTINATIONS);
  await AsyncStorage.setItem(RECENT_DESTINATIONS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function clearRecentDestinations() {
  await AsyncStorage.removeItem(RECENT_DESTINATIONS_STORAGE_KEY);
}
