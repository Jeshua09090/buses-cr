import {
  FAVORITES_STORAGE_KEY,
  FavoriteItem,
  FavoriteIconName,
  normalizeFavoriteShape,
  seedFavorites,
  sortFavorites,
} from '@/lib/favorites';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

type FavoritePatch = Partial<Pick<FavoriteItem, 'title' | 'icon' | 'placeId' | 'name' | 'address' | 'coordinates'>>;

function withReindexedSortOrder(items: FavoriteItem[]): FavoriteItem[] {
  return items.map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(async (next: FavoriteItem[]) => {
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const loadFavorites = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) {
        const seeded = seedFavorites();
        setFavorites(seeded);
        await persist(seeded);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<FavoriteItem>[];
      const normalized = parsed
        .map((item, index) => normalizeFavoriteShape(item, index))
        .filter((item): item is FavoriteItem => item !== null);
      const sorted = withReindexedSortOrder(sortFavorites(normalized));

      if (sorted.length === 0) {
        const seeded = seedFavorites();
        setFavorites(seeded);
        await persist(seeded);
        return;
      }

      setFavorites(sorted);
      await persist(sorted);
    } catch {
      const seeded = seedFavorites();
      setFavorites(seeded);
      setError('No pudimos cargar favoritos guardados. Cargamos una version base.');
      await persist(seeded);
    } finally {
      setIsLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const updateFavorites = useCallback(
    async (updater: (current: FavoriteItem[]) => FavoriteItem[]) => {
      let nextFavorites: FavoriteItem[] = [];

      setFavorites((current) => {
        nextFavorites = withReindexedSortOrder(sortFavorites(updater(current)));
        return nextFavorites;
      });

      try {
        await persist(nextFavorites);
      } catch {
        setError('No pudimos guardar cambios en favoritos.');
      }
    },
    [persist],
  );

  const addFavorite = useCallback(
    async (value: {
      title: string;
      icon?: FavoriteIconName;
      placeId?: string | null;
      name?: string;
      address?: string;
      coordinates?: [number, number] | null;
    }) => {
      const timestamp = new Date().toISOString();
      await updateFavorites((current) => {
        const nextId = `fav_${timestamp.replace(/[^0-9]/g, '').slice(-10)}`;
        return [
          ...current,
          {
            id: nextId,
            title: value.title.trim() || 'Favorito',
            icon: value.icon ?? 'location-outline',
            placeId: value.placeId ?? null,
            name: value.name ?? value.title ?? 'Destino',
            address: value.address ?? '',
            coordinates: value.coordinates ?? null,
            updatedAt: timestamp,
            sortOrder: current.length,
          },
        ];
      });
    },
    [updateFavorites],
  );

  const updateFavorite = useCallback(
    async (favoriteId: string, patch: FavoritePatch) => {
      const timestamp = new Date().toISOString();
      await updateFavorites((current) =>
        current.map((favorite) =>
          favorite.id === favoriteId
            ? {
                ...favorite,
                ...patch,
                title: patch.title !== undefined ? patch.title.trim() || favorite.title : favorite.title,
                updatedAt: timestamp,
              }
            : favorite,
        ),
      );
    },
    [updateFavorites],
  );

  const removeFavorite = useCallback(
    async (favoriteId: string) => {
      await updateFavorites((current) => current.filter((favorite) => favorite.id !== favoriteId));
    },
    [updateFavorites],
  );

  const reorderFavorites = useCallback(
    async (favoriteId: string, direction: 'up' | 'down') => {
      await updateFavorites((current) => {
        const sorted = withReindexedSortOrder(sortFavorites(current));
        const index = sorted.findIndex((favorite) => favorite.id === favoriteId);
        if (index < 0) return sorted;

        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= sorted.length) return sorted;

        const next = [...sorted];
        const temp = next[index];
        next[index] = next[swapIndex];
        next[swapIndex] = temp;
        return withReindexedSortOrder(next);
      });
    },
    [updateFavorites],
  );

  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => favorite.id)), [favorites]);

  return {
    favorites,
    favoriteIds,
    isLoading,
    error,
    loadFavorites,
    addFavorite,
    updateFavorite,
    removeFavorite,
    reorderFavorites,
  };
}
