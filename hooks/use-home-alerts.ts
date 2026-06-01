import { EtaModel } from '@/lib/home-eta';
import { HOME_ALERTS_STORAGE_KEY } from '@/lib/home-alerts-storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ALERT_EVALUATION_MS = 30_000;
const ALERT_THRESHOLDS = [5, 2] as const;

export type HomeAlert = {
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

export type HomeAlertBanner = {
  routeId: number;
  routeName: string;
  destinationName: string;
  thresholdMinutes: number;
  etaMinutes: number;
  triggeredAt: number;
};

export type RouteEtaState = {
  routeId: number;
  routeName: string;
  eta: EtaModel;
};

type UseHomeAlertsParams = {
  routeEtas: RouteEtaState[];
  destinationName: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeAlert(value: Partial<HomeAlert>): HomeAlert | null {
  if (!Number.isFinite(Number(value.routeId)) || !value.routeName) return null;

  return {
    id: value.id ? String(value.id) : `home_alert_${Math.random().toString(36).slice(2, 10)}`,
    routeId: Number(value.routeId),
    routeName: String(value.routeName),
    destinationName: value.destinationName ? String(value.destinationName) : 'tu destino',
    enabled: value.enabled !== false,
    thresholds:
      Array.isArray(value.thresholds) && value.thresholds.length > 0
        ? value.thresholds.map((threshold) => Number(threshold)).filter((threshold) => Number.isFinite(threshold))
        : [...ALERT_THRESHOLDS],
    triggeredThresholds: Array.isArray(value.triggeredThresholds)
      ? value.triggeredThresholds
          .map((threshold) => Number(threshold))
          .filter((threshold) => Number.isFinite(threshold))
      : [],
    lastTriggeredAt: value.lastTriggeredAt ? String(value.lastTriggeredAt) : null,
    updatedAt: value.updatedAt ? String(value.updatedAt) : nowIso(),
  };
}

export function useHomeAlerts({ routeEtas, destinationName }: UseHomeAlertsParams) {
  const [alerts, setAlerts] = useState<HomeAlert[]>([]);
  const [banner, setBanner] = useState<HomeAlertBanner | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const previousEtaRef = useRef<Map<number, number>>(new Map());

  const persistAlerts = useCallback(async (next: HomeAlert[]) => {
    await AsyncStorage.setItem(HOME_ALERTS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HOME_ALERTS_STORAGE_KEY);
        if (!raw) {
          setAlerts([]);
          setIsLoaded(true);
          return;
        }

        const parsed = JSON.parse(raw) as Partial<HomeAlert>[];
        const normalized = parsed
          .map((item) => normalizeAlert(item))
          .filter((item): item is HomeAlert => item !== null);
        setAlerts(normalized);
      } catch {
        setAlerts([]);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    persistAlerts(alerts).catch(() => {});
  }, [alerts, isLoaded, persistAlerts]);

  const routeEtaMap = useMemo(() => {
    const map = new Map<number, RouteEtaState>();
    routeEtas.forEach((routeEta) => map.set(routeEta.routeId, routeEta));
    return map;
  }, [routeEtas]);

  const evaluateAlerts = useCallback(() => {
    if (alerts.length === 0) return;
    const now = Date.now();
    let triggeredBanner: HomeAlertBanner | null = null;
    let hasChanges = false;

    const nextAlerts = alerts.map((alert) => {
      if (!alert.enabled) return alert;

      const routeEta = routeEtaMap.get(alert.routeId);
      if (!routeEta) return alert;

      const etaMinutes = routeEta.eta.etaMinutes;
      const previousEta = previousEtaRef.current.get(alert.routeId);
      previousEtaRef.current.set(alert.routeId, etaMinutes);

      let nextTriggered = [...alert.triggeredThresholds];

      const pendingThreshold = [...alert.thresholds]
        .sort((a, b) => b - a)
        .find((threshold) => {
          const alreadyTriggered = nextTriggered.includes(threshold);
          if (alreadyTriggered) return false;
          if (etaMinutes > threshold) return false;
          if (previousEta === undefined) return true;
          return previousEta > threshold;
        });

      if (pendingThreshold !== undefined) {
        nextTriggered = [...nextTriggered, pendingThreshold];
        hasChanges = true;

        if (!triggeredBanner) {
          triggeredBanner = {
            routeId: alert.routeId,
            routeName: alert.routeName,
            destinationName: alert.destinationName,
            thresholdMinutes: pendingThreshold,
            etaMinutes,
            triggeredAt: now,
          };
        }

        return {
          ...alert,
          triggeredThresholds: nextTriggered,
          lastTriggeredAt: nowIso(),
          updatedAt: nowIso(),
        };
      }

      // If ETA gets far again, reset thresholds for a future cycle.
      if (etaMinutes > Math.max(...alert.thresholds) + 4 && alert.triggeredThresholds.length > 0) {
        hasChanges = true;
        return {
          ...alert,
          triggeredThresholds: [],
          updatedAt: nowIso(),
        };
      }

      return alert;
    });

    if (hasChanges) {
      setAlerts(nextAlerts);
    }

    if (triggeredBanner) {
      setBanner(triggeredBanner);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [alerts, routeEtaMap]);

  useEffect(() => {
    evaluateAlerts();
    const interval = setInterval(() => {
      evaluateAlerts();
    }, ALERT_EVALUATION_MS);

    return () => clearInterval(interval);
  }, [evaluateAlerts]);

  const isRouteAlertEnabled = useCallback(
    (routeId: number) => alerts.some((alert) => alert.routeId === routeId && alert.enabled),
    [alerts],
  );

  const toggleRouteAlert = useCallback(
    (route: { routeId: number; routeName: string }) => {
      setAlerts((current) => {
        const existing = current.find((item) => item.routeId === route.routeId);

        if (!existing) {
          return [
            ...current,
            {
              id: `home_alert_${route.routeId}`,
              routeId: route.routeId,
              routeName: route.routeName,
              destinationName: destinationName ?? 'tu destino',
              enabled: true,
              thresholds: [...ALERT_THRESHOLDS],
              triggeredThresholds: [],
              lastTriggeredAt: null,
              updatedAt: nowIso(),
            },
          ];
        }

        return current.map((item) =>
          item.routeId === route.routeId
            ? {
                ...item,
                enabled: !item.enabled,
                destinationName: destinationName ?? item.destinationName,
                triggeredThresholds: item.enabled ? [] : item.triggeredThresholds,
                updatedAt: nowIso(),
              }
            : item,
        );
      });
    },
    [destinationName],
  );

  const dismissBanner = useCallback(() => {
    setBanner(null);
  }, []);

  return {
    alerts,
    activeAlertsCount: alerts.filter((alert) => alert.enabled).length,
    banner,
    isRouteAlertEnabled,
    toggleRouteAlert,
    dismissBanner,
  };
}
