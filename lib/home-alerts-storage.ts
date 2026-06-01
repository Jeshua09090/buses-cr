import AsyncStorage from '@react-native-async-storage/async-storage';

export const HOME_ALERTS_STORAGE_KEY = '@busescr/home-alerts:v1';

export type StoredHomeAlert = {
  id: string;
  routeId: number;
  routeName: string;
  destinationName: string;
  enabled: boolean;
  thresholds: number[];
  triggeredThresholds: number[];
  lastTriggeredAt: string | null;
  updatedAt: string;
};

export async function loadStoredHomeAlerts(): Promise<StoredHomeAlert[]> {
  try {
    const raw = await AsyncStorage.getItem(HOME_ALERTS_STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as StoredHomeAlert[]).filter(Boolean);
  } catch {
    return [];
  }
}
