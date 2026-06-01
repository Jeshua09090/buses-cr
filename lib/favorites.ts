export const FAVORITES_STORAGE_KEY = '@busescr/favorites:v1';

export const FAVORITE_ICON_OPTIONS = [
  'home-outline',
  'briefcase-outline',
  'school-outline',
  'star-outline',
  'location-outline',
] as const;

export type FavoriteIconName = (typeof FAVORITE_ICON_OPTIONS)[number];

export type FavoriteItem = {
  id: string;
  title: string;
  icon: FavoriteIconName;
  placeId: string | null;
  name: string;
  address: string;
  coordinates: [number, number] | null;
  updatedAt: string;
  sortOrder: number;
};

const nowIso = () => new Date().toISOString();

function createFavorite(params: {
  id: string;
  title: string;
  icon: FavoriteIconName;
  name: string;
  address: string;
  sortOrder: number;
  placeId?: string | null;
  coordinates?: [number, number] | null;
}): FavoriteItem {
  return {
    id: params.id,
    title: params.title,
    icon: params.icon,
    placeId: params.placeId ?? null,
    name: params.name,
    address: params.address,
    coordinates: params.coordinates ?? null,
    updatedAt: nowIso(),
    sortOrder: params.sortOrder,
  };
}

export const DEFAULT_FAVORITES: FavoriteItem[] = [
  createFavorite({
    id: 'fav_home',
    title: 'Casa',
    icon: 'home-outline',
    name: 'Casa',
    address: 'Llanos de Santa Lucia, Paraiso, Cartago',
    sortOrder: 0,
  }),
  createFavorite({
    id: 'fav_work',
    title: 'Trabajo',
    icon: 'briefcase-outline',
    name: 'Trabajo',
    address: 'Parque Industrial Zeta, Cartago',
    sortOrder: 1,
  }),
  createFavorite({
    id: 'fav_u',
    title: 'UCR / TEC',
    icon: 'school-outline',
    name: 'UCR / TEC',
    address: 'Campus Tecnologico Local, Cartago',
    sortOrder: 2,
  }),
];

export function sortFavorites(favorites: FavoriteItem[]): FavoriteItem[] {
  return [...favorites].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
}

export function normalizeFavoriteShape(value: Partial<FavoriteItem>, index: number): FavoriteItem | null {
  if (!value.id || !value.title) return null;
  const icon: FavoriteIconName = FAVORITE_ICON_OPTIONS.includes(value.icon as FavoriteIconName)
    ? (value.icon as FavoriteIconName)
    : 'location-outline';

  return {
    id: String(value.id),
    title: String(value.title),
    icon,
    placeId: value.placeId ? String(value.placeId) : null,
    name: value.name ? String(value.name) : String(value.title),
    address: value.address ? String(value.address) : '',
    coordinates:
      Array.isArray(value.coordinates) &&
      value.coordinates.length === 2 &&
      Number.isFinite(Number(value.coordinates[0])) &&
      Number.isFinite(Number(value.coordinates[1]))
        ? [Number(value.coordinates[0]), Number(value.coordinates[1])]
        : null,
    updatedAt: value.updatedAt ? String(value.updatedAt) : nowIso(),
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index,
  };
}

export function seedFavorites(): FavoriteItem[] {
  return DEFAULT_FAVORITES.map((favorite, index) => ({
    ...favorite,
    sortOrder: index,
    updatedAt: nowIso(),
  }));
}
