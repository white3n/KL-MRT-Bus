import { useCallback, useState } from 'react';

const FAVORITE_STATIONS_KEY = 'kl_transit_fav_stations_v1';

function readInitialFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITE_STATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useFavoriteStations() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(readInitialFavorites);

  const toggleFavorite = useCallback((stopId: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(stopId)
        ? prev.filter((id) => id !== stopId)
        : [stopId, ...prev].slice(0, 12);
      try {
        window.localStorage.setItem(FAVORITE_STATIONS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const isFavorite = useCallback((stopId: string) => favoriteIds.includes(stopId), [favoriteIds]);

  return { favoriteIds, toggleFavorite, isFavorite };
}
