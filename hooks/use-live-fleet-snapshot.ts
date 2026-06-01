import { supabase } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';

const FRESH_WINDOW_MS = 30_000;
const EXPIRE_WINDOW_MS = 120_000;

export type LiveFleetBus = {
  id: string;
  latitude: number;
  longitude: number;
  route: string;
  routeId?: string | null;
  status: string;
  lastUpdate: number;
  placa?: string;
  speedKmh?: number;
  operador?: string;
};

function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return Date.now();
}

export function useLiveFleetSnapshot() {
  const [busMap, setBusMap] = useState<Record<string, LiveFleetBus>>({});
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('route_tracking:ruta_1', {
        config: { broadcast: { self: true } },
      })
      .on('broadcast', { event: 'location_update' }, (payload) => {
        const { driver_id, lat, lng, speed, status, timestamp, route, routeId, placa, operador } =
          payload.payload;

        const latitude = Number(lat);
        const longitude = Number(lng);
        if (!driver_id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        setBusMap((prevMap) => ({
          ...prevMap,
          [String(driver_id)]: {
            id: String(driver_id),
            latitude,
            longitude,
            route: route || 'Desconocida',
            routeId: routeId ? String(routeId) : null,
            status: status || 'Activo',
            lastUpdate: toEpochMs(timestamp),
            placa: placa || 'CR-0000',
            speedKmh: Number.isFinite(Number(speed)) ? Number(speed) : undefined,
            operador: operador || '',
          },
        }));
      })
      .subscribe();

    channelRef.current = channel;

    const cleanup = setInterval(() => {
      setBusMap((prevMap) => {
        const now = Date.now();
        const nextMap = { ...prevMap };
        let changed = false;

        for (const [busId, bus] of Object.entries(nextMap)) {
          if (now - bus.lastUpdate > EXPIRE_WINDOW_MS) {
            delete nextMap[busId];
            changed = true;
          }
        }

        return changed ? nextMap : prevMap;
      });
    }, 15_000);

    return () => {
      clearInterval(cleanup);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 5_000);

    return () => clearInterval(tick);
  }, []);

  const buses = useMemo(() => Object.values(busMap).sort((a, b) => b.lastUpdate - a.lastUpdate), [busMap]);
  const freshBuses = useMemo(
    () => buses.filter((bus) => nowTimestamp - bus.lastUpdate <= FRESH_WINDOW_MS),
    [buses, nowTimestamp],
  );
  const staleBuses = useMemo(
    () => buses.filter((bus) => nowTimestamp - bus.lastUpdate > FRESH_WINDOW_MS),
    [buses, nowTimestamp],
  );

  const snapshot = useMemo(
    () => ({
      buses: buses.map((bus) => ({
        id: bus.id,
        route: bus.route,
        routeId: bus.routeId ?? null,
        lastUpdate: bus.lastUpdate,
      })),
      freshWindowMs: FRESH_WINDOW_MS,
    }),
    [buses],
  );

  return {
    buses,
    freshBuses,
    staleBuses,
    freshWindowMs: FRESH_WINDOW_MS,
    snapshot,
  };
}
