import { ThemedText } from '@/components/themed-text';
import { useFloatingTabBarClearance } from '@/hooks/use-floating-tab-bar-clearance';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { buildFleetBusPresentation, buildMapBannerState, buildSelectedBusSummary } from '@/lib/fleet-presentation';
import { getRouteTrajectory } from '@/lib/journey-planner';
import { getParadasPorRuta, Parada } from '@/lib/paradas';
import { getSnapshotRouteLegStopPath } from '@/lib/raptor/route-visualization';
import { buildLegTrajectoryPath } from '@/lib/raptor/visualization-path';
import { formatRouteDisplayName } from '@/lib/route-display';
import { resolveRoute } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import Mapbox from '@rnmapbox/maps';
import { RealtimeChannel } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_COORDINATES: [number, number] = [-83.9189, 9.8648];
const MAPBOX_PUBLIC_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
const BUS_STALE_AFTER_MS = 30_000;
const BUS_EXPIRE_AFTER_MS = 120_000;
const RELATIVE_CLOCK_TICK_MS = 5_000;
const MOTION_DEFAULT_DURATION_MS = 2_900;
const MOTION_MIN_DURATION_MS = 900;
const MOTION_MAX_DURATION_MS = 4_000;
const MOTION_JITTER_THRESHOLD_METERS = 4;
const MOTION_SNAP_THRESHOLD_METERS = 1_400;

if (MAPBOX_PUBLIC_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_PUBLIC_TOKEN);
}

type Bus = {
  id: string;
  latitude: number;
  longitude: number;
  route: string;
  routeId?: string | null;
  status: 'Activo' | 'En camino' | string;
  lastUpdate: number;
  placa?: string;
  speedKmh?: number;
  operador?: string;
};

type BusMotion = {
  from: [number, number];
  to: [number, number];
  startedAt: number;
  endsAt: number;
};

type ShapeSourcePressEvent = Parameters<
  NonNullable<React.ComponentProps<typeof Mapbox.ShapeSource>['onPress']>
>[0];

type JourneyLegMapSegment = {
  routeId: number | null;
  boardStopId: number | null;
  alightStopId: number | null;
  boardCoordinate: [number, number];
  alightCoordinate: [number, number];
  fallbackPath: [number, number][];
};

function formatLastSeen(secondsAgo: number): string {
  if (secondsAgo < 5) return 'Ahora';
  if (secondsAgo < 60) return `${secondsAgo}s`;
  return `${Math.floor(secondsAgo / 60)} min`;
}

function normalizeRouteKey(value?: string | null): string {
  return (value ?? '')
    .toLocaleLowerCase('es-CR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return Date.now();
}

function isBusFresh(lastUpdate: number, nowTimestamp: number): boolean {
  return nowTimestamp - lastUpdate <= BUS_STALE_AFTER_MS;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(from: [number, number], to: [number, number]): number {
  const [lngFrom, latFrom] = from;
  const [lngTo, latTo] = to;
  const deltaLat = toRadians(latTo - latFrom);
  const deltaLng = toRadians(lngTo - lngFrom);
  const latFromRad = toRadians(latFrom);
  const latToRad = toRadians(latTo);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(latFromRad) * Math.cos(latToRad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6_371_000 * c;
}

function estimateMotionDurationMs(
  from: [number, number],
  to: [number, number],
  packetIntervalMs: number,
): number {
  const distanceMeters = haversineMeters(from, to);
  if (!Number.isFinite(distanceMeters)) return 0;
  if (distanceMeters <= MOTION_JITTER_THRESHOLD_METERS) return 0;
  if (distanceMeters > MOTION_SNAP_THRESHOLD_METERS) return 0;

  const clampedPacketInterval = Math.max(
    MOTION_MIN_DURATION_MS,
    Math.min(MOTION_MAX_DURATION_MS, packetIntervalMs || MOTION_DEFAULT_DURATION_MS),
  );

  return Math.round(clampedPacketInterval * 0.94);
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) * (1 - value) * (1 - value);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function isTechnicalRouteCode(value?: string | null): boolean {
  const normalized = (value ?? '').toLocaleLowerCase('es-CR');
  return normalized.includes('preview-') || normalized.includes('legacy-');
}

function journeyRouteCodeLabel(value?: string | null): string | null {
  if (!value) return null;

  const usefulParts = value
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !isTechnicalRouteCode(part));

  if (usefulParts.length > 0) return usefulParts.join(' + ');
  return null;
}

function parseJourneyLegSegmentsParam(value?: string | null): JourneyLegMapSegment[] {
  if (!value) return [];

  return value
    .split(';')
    .map((segment): JourneyLegMapSegment | null => {
      const values = segment.split(',').map(Number);
      if (!values.every(Number.isFinite)) return null;

      if (values.length === 7) {
        const [routeId, boardStopId, alightStopId, boardLng, boardLat, alightLng, alightLat] = values;
        const boardCoordinate: [number, number] = [boardLng, boardLat];
        const alightCoordinate: [number, number] = [alightLng, alightLat];

        return {
          routeId,
          boardStopId,
          alightStopId,
          boardCoordinate,
          alightCoordinate,
          fallbackPath: [boardCoordinate, alightCoordinate],
        };
      }

      if (values.length === 4) {
        const [boardLng, boardLat, alightLng, alightLat] = values;
        const boardCoordinate: [number, number] = [boardLng, boardLat];
        const alightCoordinate: [number, number] = [alightLng, alightLat];

        return {
          routeId: null,
          boardStopId: null,
          alightStopId: null,
          boardCoordinate,
          alightCoordinate,
          fallbackPath: [boardCoordinate, alightCoordinate],
        };
      }

      return null;
    })
    .filter((segment): segment is JourneyLegMapSegment => segment !== null);
}

function getSegmentsBounds(segments: [number, number][][]) {
  const coordinates = segments.flat();
  if (coordinates.length === 0) return null;

  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];

  coordinates.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return {
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number],
    isSinglePoint: minLng === maxLng && minLat === maxLat,
    ne: [maxLng, maxLat] as [number, number],
    sw: [minLng, minLat] as [number, number],
  };
}

export default function PassengerModeScreen() {
  const router = useRouter();
  const [buses, setBuses] = useState<Record<string, Bus>>({});
  const [renderedCoordinates, setRenderedCoordinates] = useState<Record<string, [number, number]>>({});
  const [userCoordinate, setUserCoordinate] = useState<[number, number] | null>(null);
  const [contextTrajectory, setContextTrajectory] = useState<[number, number][][]>([]);
  const [journeyRouteSegments, setJourneyRouteSegments] = useState<[number, number][][] | null>(null);
  const [selectedTrajectory, setSelectedTrajectory] = useState<[number, number][][] | null>(null);
  const [loadingTrajectory, setLoadingTrajectory] = useState(false);
  const [routeStops, setRouteStops] = useState<Parada[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null);
  const [loadingRouteStops, setLoadingRouteStops] = useState(false);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [isFollowingSelectedBus, setIsFollowingSelectedBus] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const insets = useSafeAreaInsets();
  const tabBarClearance = useFloatingTabBarClearance(6);
  const ui = usePassengerUI();

  const {
    routeId: routeIdParam,
    routeIds: routeIdsParam,
    routeName: routeNameParam,
    routeCode: routeCodeParam,
    journeyKind: journeyKindParam,
    transferLabel: transferLabelParam,
    walkLabel: walkLabelParam,
    boardLabel: boardLabelParam,
    dropLabel: dropLabelParam,
    journeyLegSegments: journeyLegSegmentsParam,
    destinationName: destinationNameParam,
    selectedStopId: selectedStopIdParam,
    selectedStopLat: selectedStopLatParam,
    selectedStopLng: selectedStopLngParam,
    selectedStopName: selectedStopNameParam,
  } = useLocalSearchParams<{
    routeId?: string;
    routeIds?: string;
    routeName?: string;
    routeCode?: string;
    journeyKind?: string;
    transferLabel?: string;
    walkLabel?: string;
    boardLabel?: string;
    dropLabel?: string;
    journeyLegSegments?: string;
    destinationName?: string;
    selectedStopId?: string;
    selectedStopLat?: string;
    selectedStopLng?: string;
    selectedStopName?: string;
  }>();
  const paramSelectedStopId = useMemo(() => {
    const parsed = Number(selectedStopIdParam);
    return Number.isFinite(parsed) ? parsed : null;
  }, [selectedStopIdParam]);
  const paramSelectedStopCoordinate = useMemo<[number, number] | null>(() => {
    const lat = Number(selectedStopLatParam);
    const lng = Number(selectedStopLngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lng, lat];
  }, [selectedStopLatParam, selectedStopLngParam]);
  const contextRouteIds = useMemo(() => {
    const rawValues = [routeIdsParam, routeIdParam]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .flatMap((value) => value.split(','))
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    return Array.from(new Set(rawValues));
  }, [routeIdParam, routeIdsParam]);
  const primaryContextRouteId = contextRouteIds[0] ?? null;
  const hasRouteContext = Boolean(routeIdParam || routeNameParam || contextRouteIds.length > 0);
  const hasNumericRouteContext = primaryContextRouteId !== null;
  const hasJourneyContext = Boolean(
    boardLabelParam ||
      dropLabelParam ||
      transferLabelParam ||
      walkLabelParam ||
      journeyLegSegmentsParam ||
      destinationNameParam ||
      routeCodeParam,
  );

  const selectedRoute = useMemo(
    () => resolveRoute(routeIdParam, routeNameParam),
    [routeIdParam, routeNameParam],
  );

  const journeyLegSegments = useMemo(
    () => parseJourneyLegSegmentsParam(journeyLegSegmentsParam),
    [journeyLegSegmentsParam],
  );
  const journeyFallbackSegments = useMemo(
    () => journeyLegSegments.map((segment) => segment.fallbackPath),
    [journeyLegSegments],
  );
  const displayRouteSegments = useMemo(() => {
    if (hasJourneyContext && journeyLegSegments.length > 0) {
      if (journeyRouteSegments && journeyRouteSegments.length > 0) return journeyRouteSegments;
      if (journeyRouteSegments) return journeyFallbackSegments;
      return [];
    }

    if (contextTrajectory.length > 0) return contextTrajectory;
    if (!hasNumericRouteContext && selectedRoute.path.length >= 2) return [selectedRoute.path];
    return [];
  }, [
    contextTrajectory,
    hasJourneyContext,
    hasNumericRouteContext,
    journeyFallbackSegments,
    journeyLegSegments.length,
    journeyRouteSegments,
    selectedRoute.path,
  ]);
  const routeBounds = useMemo(() => getSegmentsBounds(displayRouteSegments), [displayRouteSegments]);
  const routeGeoJSON = useMemo(
    () => ({
      type: displayRouteSegments.length > 1 ? 'FeatureCollection' : 'Feature',
      properties: {},
      geometry:
        displayRouteSegments.length > 1
          ? undefined
          : {
              type: 'LineString',
              coordinates: displayRouteSegments[0] ?? [],
            },
      features:
        displayRouteSegments.length > 1
          ? displayRouteSegments.map((segment, index) => ({
              type: 'Feature',
              properties: { id: `segment-${index}` },
              geometry: {
                type: 'LineString',
                coordinates: segment,
              },
            }))
          : undefined,
    }),
    [displayRouteSegments],
  );
  const backgroundColor = ui.backgroundColor;
  const sheetBg = ui.surfaceRaised;
  const cardBg = ui.surfaceElevated;
  const textColor = ui.textPrimary;
  const textMuted = ui.textSecondary;
  const borderColor = ui.dividerSoft;
  const softSurface = ui.surfaceInset;
  const softPrimaryBg = ui.interactiveAccent;
  const softSuccessBg = ui.statusLive;
  const softWarningBg = ui.statusWarning;
  const primaryAccent = ui.accentPrimary;
  const successAccent = ui.accentSuccess;
  const warningAccent = ui.accentWarning;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const busesRef = useRef<Record<string, Bus>>({});
  const renderedCoordinatesRef = useRef<Record<string, [number, number]>>({});
  const motionRef = useRef<Record<string, BusMotion>>({});
  const bottomSheetRef = useRef<BottomSheet>(null);
  const sheetScrollRef = useRef<React.ComponentRef<typeof BottomSheetScrollView>>(null);
  const snapPoints = useMemo(() => ['18%', '44%', '84%'], []);

  const clearSelection = useCallback(() => {
    setSelectedTrajectory(null);
    setSelectedBusId(null);
    setIsFollowingSelectedBus(false);
    setSelectedStopId(null);
  }, []);

  const focusUserLocation = useCallback(() => {
    setSelectedTrajectory(null);
    setSelectedBusId(null);
    setIsFollowingSelectedBus(false);
  }, []);

  const resumeSelectedBusFollow = useCallback(() => {
    if (!selectedBusId) return;
    setIsFollowingSelectedBus(true);
  }, [selectedBusId]);

  const openRouteOnMap = useCallback(
    (routeId?: string | null, routeName?: string | null) => {
      router.push({
        pathname: '/trip-details',
        params: {
          routeId: routeId ? String(routeId) : '',
          routeName: routeName ?? '',
        },
      });
    },
    [router],
  );

  useEffect(() => {
    busesRef.current = buses;
  }, [buses]);

  useEffect(() => {
    renderedCoordinatesRef.current = renderedCoordinates;
  }, [renderedCoordinates]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({});
          setUserCoordinate([loc.coords.longitude, loc.coords.latitude]);
        }
      } catch {
        setUserCoordinate(null);
      }
    })();

    const channel = supabase
      .channel('route_tracking:ruta_1', {
        config: { broadcast: { self: true } },
      })
      .on('broadcast', { event: 'location_update' }, (payload) => {
        const { driver_id, lat, lng, speed, status, timestamp, route, placa, routeId, operador } =
          payload.payload;
        const latitude = Number(lat);
        const longitude = Number(lng);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        const targetCoordinate: [number, number] = [longitude, latitude];
        const existingRendered = renderedCoordinatesRef.current[driver_id];
        const previousBus = busesRef.current[driver_id];
        const packetTimestamp = toEpochMs(timestamp);
        const previousPacketTimestamp = previousBus?.lastUpdate ?? packetTimestamp - MOTION_DEFAULT_DURATION_MS;
        const packetIntervalMs = Math.max(250, packetTimestamp - previousPacketTimestamp);
        const startCoordinate: [number, number] =
          existingRendered ??
          (previousBus ? [previousBus.longitude, previousBus.latitude] : targetCoordinate);
        const motionDuration = estimateMotionDurationMs(startCoordinate, targetCoordinate, packetIntervalMs);
        const motionStartTime = Date.now();

        if (motionDuration === 0) {
          motionRef.current[driver_id] = {
            from: targetCoordinate,
            to: targetCoordinate,
            startedAt: motionStartTime,
            endsAt: motionStartTime,
          };

          setRenderedCoordinates((prevCoordinates) => {
            const currentCoordinate = prevCoordinates[driver_id];
            if (
              currentCoordinate &&
              Math.abs(currentCoordinate[0] - targetCoordinate[0]) < 0.0000001 &&
              Math.abs(currentCoordinate[1] - targetCoordinate[1]) < 0.0000001
            ) {
              return prevCoordinates;
            }

            return {
              ...prevCoordinates,
              [driver_id]: targetCoordinate,
            };
          });
        } else {
          motionRef.current[driver_id] = {
            from: startCoordinate,
            to: targetCoordinate,
            startedAt: motionStartTime,
            endsAt: motionStartTime + motionDuration,
          };

          if (!existingRendered) {
            setRenderedCoordinates((prevCoordinates) => ({
              ...prevCoordinates,
              [driver_id]: startCoordinate,
            }));
          }
        }

        setBuses((prevBuses) => ({
          ...prevBuses,
          [driver_id]: {
            id: driver_id,
            latitude,
            longitude,
            route: route || 'Desconocida',
            routeId: routeId ? String(routeId) : null,
            status: status || 'Activo',
            lastUpdate: packetTimestamp,
            placa: placa || 'CR-0000',
            speedKmh: Number.isFinite(Number(speed)) ? Number(speed) : undefined,
            operador: operador || '',
          },
        }));
      })
      .subscribe();

    channelRef.current = channel;

    const cleanupInterval = setInterval(() => {
      setBuses((prevBuses) => {
        const now = Date.now();
        const next = { ...prevBuses };
        let changed = false;

        for (const [id, bus] of Object.entries(next)) {
          if (now - bus.lastUpdate > BUS_EXPIRE_AFTER_MS) {
            delete next[id];
            changed = true;
          }
        }

        return changed ? next : prevBuses;
      });
    }, 15_000);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      clearInterval(cleanupInterval);
    };
  }, []);

  useEffect(() => {
    const motionTimer = setInterval(() => {
      const now = Date.now();
      const busesSnapshot = busesRef.current;
      const previousRendered = renderedCoordinatesRef.current;
      const nextRendered: Record<string, [number, number]> = {};
      let changed = false;

      for (const [busId, bus] of Object.entries(busesSnapshot)) {
        const motion = motionRef.current[busId];
        const fallbackCoordinate: [number, number] = [bus.longitude, bus.latitude];
        const previousCoordinate = previousRendered[busId];

        if (!motion) {
          const coordinate = previousCoordinate ?? fallbackCoordinate;
          nextRendered[busId] = coordinate;
          if (!previousCoordinate) {
            changed = true;
          }
          continue;
        }

        const duration = Math.max(1, motion.endsAt - motion.startedAt);
        const rawProgress = Math.min(1, Math.max(0, (now - motion.startedAt) / duration));
        const easedProgress = easeOutCubic(rawProgress);
        const lng = lerp(motion.from[0], motion.to[0], easedProgress);
        const lat = lerp(motion.from[1], motion.to[1], easedProgress);
        nextRendered[busId] = [lng, lat];

        if (
          !previousCoordinate ||
          Math.abs(previousCoordinate[0] - lng) > 0.0000001 ||
          Math.abs(previousCoordinate[1] - lat) > 0.0000001
        ) {
          changed = true;
        }
      }

      if (!changed && Object.keys(previousRendered).length !== Object.keys(nextRendered).length) {
        changed = true;
      }

      if (changed) {
        renderedCoordinatesRef.current = nextRendered;
        setRenderedCoordinates(nextRendered);
      }
    }, 33);

    return () => clearInterval(motionTimer);
  }, []);

  useEffect(() => {
    const activeIds = new Set(Object.keys(buses));
    motionRef.current = Object.fromEntries(
      Object.entries(motionRef.current).filter(([busId]) => activeIds.has(busId)),
    ) as Record<string, BusMotion>;

    setRenderedCoordinates((prevCoordinates) => {
      let changed = false;
      const nextCoordinates: Record<string, [number, number]> = {};

      for (const [busId, coordinate] of Object.entries(prevCoordinates)) {
        if (activeIds.has(busId)) {
          nextCoordinates[busId] = coordinate;
        } else {
          changed = true;
        }
      }

      if (!changed) return prevCoordinates;
      renderedCoordinatesRef.current = nextCoordinates;
      return nextCoordinates;
    });
  }, [buses]);

  useEffect(() => {
    const clockTick = setInterval(() => {
      setNowTimestamp(Date.now());
    }, RELATIVE_CLOCK_TICK_MS);

    return () => clearInterval(clockTick);
  }, []);

  useEffect(() => {
    if (!selectedBusId) return;
    if (!buses[selectedBusId]) {
      clearSelection();
    }
  }, [buses, clearSelection, selectedBusId]);

  useEffect(() => {
    let isCancelled = false;
    const selectedBusRouteId = selectedBusId ? Number(buses[selectedBusId]?.routeId) : NaN;
    const activeRouteId =
      Number.isFinite(selectedBusRouteId) && selectedBusRouteId > 0
        ? selectedBusRouteId
        : primaryContextRouteId;

    if (!activeRouteId) {
      setRouteStops([]);
      setSelectedStopId(null);
      setLoadingRouteStops(false);
      return () => {
        isCancelled = true;
      };
    }

    setLoadingRouteStops(true);

    getParadasPorRuta(activeRouteId)
      .then((stops) => {
        if (!isCancelled) {
          setRouteStops(stops);
          setSelectedStopId((current) =>
            current && !stops.some((stop) => stop.parada_id === current) ? null : current,
          );
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setRouteStops([]);
          setSelectedStopId(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingRouteStops(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [buses, primaryContextRouteId, selectedBusId]);

  useEffect(() => {
    if (paramSelectedStopId === null) return;
    if (!routeStops.some((stop) => stop.parada_id === paramSelectedStopId)) return;
    setSelectedStopId((current) => (current === paramSelectedStopId ? current : paramSelectedStopId));
  }, [paramSelectedStopId, routeStops]);

  useEffect(() => {
    let isCancelled = false;
    if (!hasRouteContext || contextRouteIds.length === 0) {
      setContextTrajectory([]);
      return () => {
        isCancelled = true;
      };
    }

    Promise.all(contextRouteIds.map((routeId) => getRouteTrajectory(routeId)))
      .then((segmentsByRoute) => {
        if (!isCancelled) {
          setContextTrajectory(segmentsByRoute.flat());
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setContextTrajectory([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [contextRouteIds, hasRouteContext]);

  useEffect(() => {
    let isCancelled = false;

    if (!hasJourneyContext || journeyLegSegments.length === 0) {
      setJourneyRouteSegments(null);
      return () => {
        isCancelled = true;
      };
    }

    setJourneyRouteSegments(null);

    Promise.all(
      journeyLegSegments.map(async (segment) => {
        const routeId = segment.routeId && segment.routeId > 0 ? segment.routeId : null;
        const trajectorySegments = routeId ? await getRouteTrajectory(routeId) : [];
        const trajectoryPath = buildLegTrajectoryPath({
          trajectorySegments,
          boardCoordinate: segment.boardCoordinate,
          alightCoordinate: segment.alightCoordinate,
        });

        if (trajectoryPath.length >= 2) return trajectoryPath;

        const stopPath = await getSnapshotRouteLegStopPath({
          routeId,
          boardStopId: segment.boardStopId,
          alightStopId: segment.alightStopId,
          boardCoordinate: segment.boardCoordinate,
          alightCoordinate: segment.alightCoordinate,
        });

        return stopPath.length >= 2 ? stopPath : segment.fallbackPath;
      }),
    )
      .then((segments) => {
        if (!isCancelled) {
          setJourneyRouteSegments(segments.filter((segment) => segment.length >= 2));
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setJourneyRouteSegments(journeyFallbackSegments);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [hasJourneyContext, journeyFallbackSegments, journeyLegSegments]);

  const loadTrajectory = useCallback(async (rutaId: number) => {
    setLoadingTrajectory(true);
    setSelectedTrajectory(null);
    const segments = await getRouteTrajectory(rutaId);
    if (segments.length > 0) {
      setSelectedTrajectory(segments);
    }
    setLoadingTrajectory(false);
  }, []);

  const handleBusPress = useCallback(
    (bus: Bus) => {
      setSelectedBusId(bus.id);
      setIsFollowingSelectedBus(true);
      bottomSheetRef.current?.snapToIndex(1);
      sheetScrollRef.current?.scrollTo?.({ y: 0, animated: true });

      const routeIdAsNumber = Number(bus.routeId);
      if (Number.isFinite(routeIdAsNumber)) {
        loadTrajectory(routeIdAsNumber);
      } else {
        setSelectedTrajectory(null);
      }
    },
    [loadTrajectory],
  );

  const handleMapCameraChanged = useCallback(
    (state: { gestures?: { isGestureActive?: boolean } }) => {
      if (!selectedBusId || !isFollowingSelectedBus) return;
      if (state.gestures?.isGestureActive) {
        setIsFollowingSelectedBus(false);
      }
    },
    [isFollowingSelectedBus, selectedBusId],
  );

  const scopedBuses = useMemo(() => {
    const items = Object.values(buses);
    if (!hasRouteContext) return items;

    const routeIdCandidates = new Set(
      [
        routeIdParam,
        selectedRoute.id,
        ...contextRouteIds.map((value) => String(value)),
      ]
        .map((value) => normalizeRouteKey(value))
        .filter(Boolean),
    );
    const routeNameCandidates = new Set(
      [routeNameParam, selectedRoute.name].map((value) => normalizeRouteKey(value)).filter(Boolean),
    );

    return items.filter((bus) => {
      const normalizedBusRouteId = normalizeRouteKey(bus.routeId);
      const normalizedBusRouteName = normalizeRouteKey(bus.route);

      if (normalizedBusRouteId && routeIdCandidates.has(normalizedBusRouteId)) return true;
      if (normalizedBusRouteName && routeNameCandidates.has(normalizedBusRouteName)) return true;
      return false;
    });
  }, [buses, contextRouteIds, hasRouteContext, routeIdParam, routeNameParam, selectedRoute.id, selectedRoute.name]);

  const activeBusesList = useMemo(() => {
    return [...scopedBuses].sort((a, b) => {
      if (selectedBusId && a.id === selectedBusId) return -1;
      if (selectedBusId && b.id === selectedBusId) return 1;
      return b.lastUpdate - a.lastUpdate;
    });
  }, [scopedBuses, selectedBusId]);

  const mapBusesList = useMemo(() => {
    return [...scopedBuses].sort((a, b) => {
      if (selectedBusId && a.id === selectedBusId) return 1;
      if (selectedBusId && b.id === selectedBusId) return -1;
      return b.lastUpdate - a.lastUpdate;
    });
  }, [scopedBuses, selectedBusId]);

  const selectedBus = selectedBusId ? buses[selectedBusId] ?? null : null;
  const selectedBusCoordinate = selectedBus
    ? renderedCoordinates[selectedBus.id] ?? [selectedBus.longitude, selectedBus.latitude]
    : null;
  const shouldFollowSelectedBus = Boolean(selectedBus && isFollowingSelectedBus);
  const liveBusesCount = useMemo(
    () => scopedBuses.filter((bus) => isBusFresh(bus.lastUpdate, nowTimestamp)).length,
    [scopedBuses, nowTimestamp],
  );
  const staleBusesCount = scopedBuses.length - liveBusesCount;
  const selectedBusSecondsAgo = selectedBus
    ? Math.max(0, Math.floor((nowTimestamp - selectedBus.lastUpdate) / 1000))
    : 0;
  const selectedBusIsFresh = selectedBus ? isBusFresh(selectedBus.lastUpdate, nowTimestamp) : false;
  const showContextRouteLine = hasRouteContext && !selectedTrajectory && displayRouteSegments.length > 0;
  const selectedStop = useMemo(
    () => routeStops.find((stop) => stop.parada_id === selectedStopId) ?? null,
    [routeStops, selectedStopId],
  );
  const selectedStopCoordinate = selectedStop
    ? ([selectedStop.lng, selectedStop.lat] as [number, number])
    : paramSelectedStopCoordinate;
  const routeStopsGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: routeStops
        .filter((stop) => stop.parada_id !== selectedStopId)
        .map((stop) => ({
          type: 'Feature',
          properties: {
            stopId: stop.parada_id,
            stopName: stop.nombre ?? 'Parada de buses',
          },
          geometry: {
            type: 'Point',
            coordinates: [stop.lng, stop.lat],
          },
        })),
    }),
    [routeStops, selectedStopId],
  );
  const handleRouteStopPress = useCallback(
    (event: ShapeSourcePressEvent) => {
      const properties = event.features?.[0]?.properties as { stopId?: unknown } | null | undefined;
      const stopId = Number(properties?.stopId);
      if (Number.isFinite(stopId)) {
        setSelectedStopId(stopId);
      }
    },
    [],
  );
  const routeBoundsForCamera = !selectedBus && !selectedStopCoordinate && routeBounds && !routeBounds.isSinglePoint
    ? { ne: routeBounds.ne, sw: routeBounds.sw }
    : undefined;
  const cameraCenterCoordinate: [number, number] | undefined = routeBoundsForCamera
    ? undefined
    : selectedBus
    ? shouldFollowSelectedBus
      ? selectedBusCoordinate ?? [selectedBus.longitude, selectedBus.latitude]
      : undefined
    : selectedStopCoordinate ?? routeBounds?.center ?? userCoordinate ?? DEFAULT_COORDINATES;
  const cameraPadding = selectedBus
    ? {
        paddingTop: insets.top + 188,
        paddingBottom: Math.max(tabBarClearance + 242, 344),
        paddingLeft: 44,
        paddingRight: 44,
      }
    : {
        paddingTop: insets.top + 150,
        paddingBottom: Math.max(tabBarClearance + 186, 292),
        paddingLeft: 38,
        paddingRight: 38,
      };
  const displayRouteCodeParam = journeyRouteCodeLabel(routeCodeParam);
  const loadingJourneyRoute = hasJourneyContext && journeyLegSegments.length > 0 && !journeyRouteSegments;
  const topPillLabel = selectedBus
    ? selectedBus.placa?.toUpperCase() ?? 'Unidad en foco'
    : hasRouteContext
      ? displayRouteCodeParam
        ? displayRouteCodeParam
        : routeNameParam
          ? formatRouteDisplayName(routeNameParam)
          : hasNumericRouteContext && primaryContextRouteId
            ? `Ruta ${primaryContextRouteId}`
            : formatRouteDisplayName(selectedRoute.name)
      : 'Mapa general';
  const bannerTitle = selectedBus
    ? selectedBus.route
    : hasRouteContext
      ? routeNameParam || selectedRoute.name
      : 'Mapa en tiempo real';
  const bannerText = loadingTrajectory
    ? 'Cargando recorrido del bus seleccionado...'
    : loadingJourneyRoute
      ? 'Cargando recorrido del viaje...'
    : loadingRouteStops
      ? 'Cargando paradas de la ruta seleccionada...'
      : selectedBus
        ? !shouldFollowSelectedBus
          ? 'Seguimiento pausado. Toca localizar para retomar.'
          : selectedBusIsFresh
            ? `Siguiendo unidad en vivo - ${formatLastSeen(selectedBusSecondsAgo)}`
            : `Ultima actualizacion - ${formatLastSeen(selectedBusSecondsAgo)}`
        : hasJourneyContext
          ? `${journeyKindParam === 'transfer' ? 'Viaje con transbordo' : 'Viaje directo'}${walkLabelParam ? ` | ${walkLabelParam}` : ''}`
          : hasRouteContext
            ? staleBusesCount > 0
              ? `${liveBusesCount} en vivo, ${staleBusesCount} sin reporte reciente.`
              : 'Mostrando unidades disponibles para esta ruta.'
            : 'Toca un bus para ver su recorrido y seguirlo en el mapa.';
  const bannerState = buildMapBannerState({
    pillLabel: topPillLabel,
    title: formatRouteDisplayName(bannerTitle),
    subtitle: bannerText,
    liveCount: liveBusesCount,
  });
  const selectedBusSummary = selectedBus
    ? buildSelectedBusSummary({
        routeName: formatRouteDisplayName(selectedBus.route),
        plateLabel: selectedBus.placa?.toUpperCase() ?? 'Unidad',
        isFollowing: shouldFollowSelectedBus,
        isFresh: selectedBusIsFresh,
        timeLabel: formatLastSeen(selectedBusSecondsAgo),
      })
    : null;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {MAPBOX_PUBLIC_TOKEN ? (
        <Mapbox.MapView
          style={StyleSheet.absoluteFillObject}
          styleURL={Mapbox.StyleURL.Dark}
          onCameraChanged={handleMapCameraChanged}
          compassEnabled={false}
          logoEnabled={false}
          scaleBarEnabled={false}
          attributionEnabled={false}>
          <Mapbox.Camera
            zoomLevel={routeBoundsForCamera ? undefined : 13.5}
            centerCoordinate={cameraCenterCoordinate}
            bounds={routeBoundsForCamera}
            animationDuration={shouldFollowSelectedBus ? 0 : 900}
            animationMode={shouldFollowSelectedBus ? 'moveTo' : 'flyTo'}
            padding={cameraPadding}
            pitch={18}
          />
          <Mapbox.UserLocation visible showsUserHeadingIndicator />

          {showContextRouteLine ? (
            <Mapbox.ShapeSource id="routeSource" shape={routeGeoJSON as never}>
              <Mapbox.LineLayer
                id="routeLineGlow"
                style={{
                  lineColor: successAccent,
                  lineWidth: 12,
                  lineOpacity: 0.14,
                  lineBlur: 0.75,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
              <Mapbox.LineLayer
                id="routeLineCasing"
                style={{
                  lineColor: 'rgba(7, 14, 29, 0.72)',
                  lineWidth: 6.8,
                  lineOpacity: 0.46,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
              <Mapbox.LineLayer
                id="routeLine"
                style={{
                  lineColor: successAccent,
                  lineWidth: 4.4,
                  lineOpacity: 0.82,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}

          {routeStops.length > 0 && !selectedTrajectory
            ? (
              <>
                <Mapbox.ShapeSource
                  id="routeStopsSource"
                  shape={routeStopsGeoJSON as never}
                  onPress={handleRouteStopPress}
                  hitbox={{ width: 18, height: 18 }}>
                  <Mapbox.CircleLayer
                    id="routeStopsHalo"
                    style={{
                      circleColor: 'rgba(45, 212, 191, 0.18)',
                      circleRadius: 8,
                      circleOpacity: 0.9,
                    }}
                  />
                  <Mapbox.CircleLayer
                    id="routeStopsCircle"
                    style={{
                      circleColor: successAccent,
                      circleRadius: 4.8,
                      circleOpacity: 0.98,
                      circleStrokeColor: '#ECFDF5',
                      circleStrokeWidth: 2,
                    }}
                  />
                </Mapbox.ShapeSource>

                {selectedStop ? (
                  <Mapbox.PointAnnotation
                    key={`selected-stop-${selectedStop.parada_id}`}
                    id={`selected-stop-${selectedStop.parada_id}`}
                    coordinate={[selectedStop.lng, selectedStop.lat]}
                    onDeselected={() => setSelectedStopId(null)}>
                    <View style={styles.stopMarkerWrap}>
                      <View style={styles.stopCallout}>
                        <ThemedText style={styles.stopCalloutText} numberOfLines={2}>
                          {selectedStop.nombre ?? selectedStopNameParam ?? 'Parada de buses'}
                        </ThemedText>
                      </View>

                      <View style={styles.stopMarkerHalo} />
                      <View
                        style={[
                          styles.stopMarker,
                          styles.stopMarkerSelected,
                          { backgroundColor: successAccent },
                        ]}
                      />
                    </View>
                  </Mapbox.PointAnnotation>
                ) : null}
              </>
            )
            : null}

          {selectedTrajectory ? (
            <Mapbox.ShapeSource
              id="selectedTrajectory"
              shape={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'MultiLineString',
                  coordinates: selectedTrajectory,
                },
              } as never}>
              <Mapbox.LineLayer
                id="selectedTrajectoryGlow"
                style={{
                  lineColor: successAccent,
                  lineWidth: 13,
                  lineOpacity: 0.16,
                  lineBlur: 0.9,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
              <Mapbox.LineLayer
                id="selectedTrajectoryCasing"
                style={{
                  lineColor: 'rgba(7, 14, 29, 0.84)',
                  lineWidth: 8.5,
                  lineOpacity: 0.72,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
              <Mapbox.LineLayer
                id="selectedTrajectoryLine"
                style={{
                  lineColor: successAccent,
                  lineWidth: 5.8,
                  lineOpacity: 0.97,
                  lineJoin: 'round',
                  lineCap: 'round',
                }}
              />
            </Mapbox.ShapeSource>
          ) : null}

          {mapBusesList.map((bus) => {
            const isSelected = selectedBusId === bus.id;
            const isStale = !isBusFresh(bus.lastUpdate, nowTimestamp);
            const markerCoordinate = renderedCoordinates[bus.id] ?? [bus.longitude, bus.latitude];
            const markerColor =
              isStale
                ? '#334155'
                : bus.status === 'en_ruta_simulada'
                ? primaryAccent
                : isSelected
                  ? successAccent
                  : '#0F172A';

            return (
              <Mapbox.PointAnnotation
                key={bus.id}
                id={`bus-${bus.id}`}
                coordinate={markerCoordinate}
                onSelected={() => handleBusPress(bus)}>
                <View style={styles.markerWrap}>
                  {isSelected ? (
                    <View style={styles.markerLabel}>
                      <ThemedText style={styles.markerLabelText} numberOfLines={1}>
                        {bus.placa ?? 'En foco'}
                      </ThemedText>
                    </View>
                  ) : null}

                  {isSelected ? <View style={styles.mapMarkerHalo} /> : null}

                  <View
                    style={[
                      styles.mapMarker,
                      isSelected && styles.mapMarkerSelected,
                      isStale && styles.mapMarkerStale,
                      {
                        backgroundColor: isSelected ? 'rgba(7, 14, 29, 0.94)' : markerColor,
                        borderColor: isSelected ? '#ECFDF5' : '#FFFFFF',
                      },
                    ]}>
                    {isSelected ? (
                      <View style={[styles.mapMarkerCore, { backgroundColor: markerColor }]}>
                        <Ionicons name="bus" size={15} color="#F8FAFC" />
                      </View>
                    ) : (
                      <Ionicons name="bus-outline" size={14} color="#FFFFFF" />
                    )}
                  </View>
                </View>
              </Mapbox.PointAnnotation>
            );
          })}
        </Mapbox.MapView>
      ) : (
        <View style={styles.errorContainer}>
          <ThemedText style={[styles.errorTitle, { color: textColor }]}>Mapa no disponible</ThemedText>
          <ThemedText style={[styles.errorText, { color: textMuted }]}>
            Configura `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` para activar esta pantalla.
          </ThemedText>
        </View>
      )}

      <View style={styles.mapAtmosphere} pointerEvents="none">
        <LinearGradient
          colors={[ui.mapScrimTop, 'rgba(10, 13, 18, 0.34)', 'transparent']}
          locations={[0, 0.46, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.mapAtmosphereTop}
        />
        <LinearGradient
          colors={['rgba(6, 9, 14, 0.00)', ui.mapScrimBottom]}
          locations={[0, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.mapAtmosphereBottom}
        />
      </View>

      <View style={[styles.topOverlay, { top: insets.top + 8 }]}>
        <View style={[styles.bannerBlur, { backgroundColor: ui.surfaceHero, borderColor: ui.outlineSoft, boxShadow: ui.shadowCard }]}>
          <View style={styles.bannerRow}>
            <View style={[styles.bannerPill, { backgroundColor: softPrimaryBg, borderColor: `${primaryAccent}1F` }]}>
              <Ionicons name="map-outline" size={14} color={primaryAccent} />
              <ThemedText style={[styles.bannerPillText, { color: primaryAccent }]} numberOfLines={1}>
                {bannerState.pillLabel}
              </ThemedText>
            </View>

              <View style={[styles.bannerPill, { backgroundColor: softSurface, borderColor }]}>
                <View style={[styles.bannerDot, { backgroundColor: successAccent }]} />
                <ThemedText style={[styles.bannerPillText, { color: textMuted }]}>
                  {liveBusesCount}
                </ThemedText>
              </View>
          </View>

          <View style={styles.bannerCopy}>
            <ThemedText style={[styles.bannerTitle, { color: textColor }]} numberOfLines={1}>
              {bannerState.title}
            </ThemedText>
            {bannerText ? (
              <ThemedText style={[styles.bannerText, { color: textMuted }]} numberOfLines={1}>
                {bannerText}
              </ThemedText>
            ) : null}
          </View>
        </View>
      </View>

      <View style={[styles.controlRail, { top: insets.top + 96 }]}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={selectedBus ? resumeSelectedBusFollow : focusUserLocation}
          style={[
            styles.controlButton,
            {
              backgroundColor: selectedBus && !shouldFollowSelectedBus ? softPrimaryBg : softSurface,
              borderColor,
            },
          ]}>
          <Ionicons
            name={selectedBus ? (shouldFollowSelectedBus ? 'navigate' : 'navigate-outline') : 'locate-outline'}
            size={18}
            color={selectedBus ? primaryAccent : textColor}
          />
        </TouchableOpacity>

        {selectedTrajectory || selectedBus ? (
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.82}
            onPress={clearSelection}
            style={[styles.controlButton, { backgroundColor: softSuccessBg, borderColor }]}>
            <Ionicons name="close" size={17} color={successAccent} />
          </TouchableOpacity>
        ) : null}
      </View>

      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        detached
        snapPoints={snapPoints}
        topInset={insets.top + 86}
        bottomInset={tabBarClearance}
        style={styles.sheetContainer}
        backgroundStyle={[styles.sheetBackground, { backgroundColor: sheetBg, borderColor: ui.outlineSoft }]}
        handleIndicatorStyle={[styles.sheetIndicator, { backgroundColor: textMuted }]}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetHeaderCopy}>
            <ThemedText style={[styles.sheetTitle, { color: textColor }]}>Flota en vivo</ThemedText>
            <ThemedText style={[styles.sheetSubtitle, { color: textMuted }]}>
              {selectedBus
                ? !shouldFollowSelectedBus
                  ? 'Explorando mapa, seguimiento en pausa'
                  : selectedBusIsFresh
                    ? 'Siguiendo unidad seleccionada'
                    : 'Unidad seleccionada sin reporte reciente'
                : hasRouteContext
                  ? loadingRouteStops
                    ? 'Cargando paradas y unidades de esta ruta'
                    : routeStops.length > 0
                      ? `${routeStops.length} paradas cargadas para esta ruta`
                      : 'Unidades disponibles para esta ruta'
                  : 'Unidades activas cerca de ti'}
            </ThemedText>
          </View>

          <View style={[styles.liveBadge, { backgroundColor: softSuccessBg, borderColor: `${successAccent}20` }]}>
            <View style={[styles.liveDot, { backgroundColor: successAccent }]} />
            <ThemedText style={[styles.liveText, { color: successAccent }]}>
              {liveBusesCount}
            </ThemedText>
          </View>
        </View>

        <BottomSheetScrollView
          ref={sheetScrollRef}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.sheetScrollContent, { paddingBottom: tabBarClearance + 24 }]}
          showsVerticalScrollIndicator={false}>
          {selectedBus && selectedBusSummary ? (
            <View style={[styles.selectedBusCard, { backgroundColor: cardBg, borderColor: ui.outlineSoft }]}>
              <View style={styles.selectedBusHeader}>
                <View style={styles.selectedBusCopy}>
                  <ThemedText style={[styles.selectedBusTitle, { color: textColor }]}>
                    {selectedBusSummary.title}
                  </ThemedText>
                  <ThemedText style={[styles.selectedBusSubtitle, { color: textMuted }]}>
                    {selectedBusSummary.subtitle}
                  </ThemedText>
                </View>

                <View
                  style={[
                    styles.selectedBusBadge,
                    {
                      backgroundColor:
                        selectedBusSummary.statusTone === 'warning'
                          ? softWarningBg
                          : selectedBusSummary.statusTone === 'success'
                            ? softSuccessBg
                            : softSurface,
                    },
                  ]}>
                  <ThemedText
                    style={[
                      styles.selectedBusBadgeText,
                      {
                        color:
                          selectedBusSummary.statusTone === 'warning'
                            ? warningAccent
                            : selectedBusSummary.statusTone === 'success'
                              ? successAccent
                              : textMuted,
                      },
                    ]}>
                    {selectedBusSummary.actionLabel}
                  </ThemedText>
                </View>
              </View>

              <ThemedText style={[styles.selectedBusDetail, { color: textMuted }]}>
                {selectedBusSummary.detail}
              </ThemedText>

              <View style={styles.selectedBusActions}>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={resumeSelectedBusFollow}
                  style={[styles.selectedBusAction, { backgroundColor: softPrimaryBg, borderColor: `${primaryAccent}1F` }]}>
                  <Ionicons name="navigate-outline" size={15} color={primaryAccent} />
                  <ThemedText style={[styles.selectedBusActionText, { color: primaryAccent }]}>
                    Seguir
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={() => openRouteOnMap(selectedBus.routeId ?? '', selectedBus.route)}
                  style={[styles.selectedBusAction, { backgroundColor: softSurface, borderColor }]}>
                  <Ionicons name="map-outline" size={15} color={textColor} />
                  <ThemedText style={[styles.selectedBusActionText, { color: textColor }]}>
                    Ver ruta
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={clearSelection}
                  style={[styles.selectedBusAction, { backgroundColor: ui.interactiveNeutral, borderColor }]} >
                  <Ionicons name="close-outline" size={15} color={textMuted} />
                  <ThemedText style={[styles.selectedBusActionText, { color: textMuted }]}>
                    Cerrar
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {!selectedBus && hasJourneyContext ? (
            <View style={[styles.journeyCard, { backgroundColor: cardBg, borderColor: ui.outlineSoft }]}>
              <View style={styles.journeyHeader}>
                <View style={styles.journeyCopy}>
                  <ThemedText style={[styles.journeyTitle, { color: textColor }]}>
                    {journeyKindParam === 'transfer' ? 'Viaje con transbordo' : 'Viaje directo'}
                  </ThemedText>
                  <ThemedText style={[styles.journeySubtitle, { color: textMuted }]}>
                    {destinationNameParam
                      ? `Plan activo para ${destinationNameParam}`
                      : 'Resumen rapido del itinerario activo'}
                  </ThemedText>
                </View>

                {displayRouteCodeParam ? (
                  <View style={[styles.journeyBadge, { backgroundColor: softPrimaryBg, borderColor: `${primaryAccent}1F` }]}>
                    <ThemedText style={[styles.journeyBadgeText, { color: primaryAccent }]}>
                      {displayRouteCodeParam}
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              <View style={styles.journeySteps}>
                {walkLabelParam ? (
                  <ThemedText style={[styles.journeyStepText, { color: textMuted }]}>
                    {walkLabelParam}
                  </ThemedText>
                ) : null}
                {boardLabelParam ? (
                  <ThemedText style={[styles.journeyStepText, { color: textColor }]}>
                    {boardLabelParam}
                  </ThemedText>
                ) : null}
                {transferLabelParam ? (
                  <ThemedText style={[styles.journeyStepText, { color: warningAccent }]}>
                    {transferLabelParam}
                  </ThemedText>
                ) : null}
                {dropLabelParam ? (
                  <ThemedText style={[styles.journeyStepText, { color: textColor }]}>
                    {dropLabelParam}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          ) : null}

          {activeBusesList.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: softSurface }]}>
                <Ionicons name="bus-outline" size={22} color={textMuted} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: textColor }]}>
                Buscando unidades activas
              </ThemedText>
              <ThemedText style={[styles.emptyText, { color: textMuted }]}>
                En cuanto lleguen actualizaciones en vivo, aparecerán aquí.
              </ThemedText>
            </View>
          ) : (
            <View style={[styles.groupedSurface, { backgroundColor: cardBg, borderColor: ui.outlineSoft }]}>
              {activeBusesList.map((bus, index) => {
                const secondsAgo = Math.max(0, Math.floor((nowTimestamp - bus.lastUpdate) / 1000));
                const presentation = buildFleetBusPresentation({
                  id: bus.id,
                  placa: bus.placa,
                  routeName: formatRouteDisplayName(bus.route),
                  operator: bus.operador,
                  isSelected: selectedBusId === bus.id,
                  isStale: !isBusFresh(bus.lastUpdate, nowTimestamp),
                  isSimulated: bus.status === 'en_ruta_simulada',
                  timeLabel: formatLastSeen(secondsAgo),
                });
                const isSelected = presentation.isSelected;
                const isLast = index === activeBusesList.length - 1;
                const timeTone = presentation.timeTone === 'warning' ? warningAccent : successAccent;

                return (
                  <TouchableOpacity
                    key={bus.id}
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={() => handleBusPress(bus)}
                    style={[
                      styles.busRow,
                      !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor },
                      isSelected && { backgroundColor: softSurface },
                    ]}>
                    <View
                      style={[
                        styles.busIconContainer,
                        { backgroundColor: isSelected ? softPrimaryBg : softSurface },
                      ]}>
                      <Ionicons name="bus-outline" size={18} color={isSelected ? primaryAccent : textMuted} />
                    </View>

                    <View style={styles.busInfo}>
                      <View style={styles.busBadgeRow}>
                        {presentation.badges.map((badge) => (
                          <View
                            key={badge.id}
                            style={[
                              styles.busBadge,
                              {
                                backgroundColor:
                                  badge.tone === 'warning'
                                    ? softWarningBg
                                    : badge.tone === 'success'
                                      ? softSuccessBg
                                      : softPrimaryBg,
                              },
                            ]}>
                            <ThemedText
                              style={[
                                styles.busBadgeText,
                                {
                                  color:
                                    badge.tone === 'warning'
                                      ? warningAccent
                                      : badge.tone === 'success'
                                        ? successAccent
                                        : primaryAccent,
                                },
                              ]}>
                              {badge.label}
                            </ThemedText>
                          </View>
                        ))}
                      </View>

                      <ThemedText style={[styles.busRouteText, { color: textColor }]} numberOfLines={1}>
                        {presentation.routeName}
                      </ThemedText>
                      <ThemedText style={[styles.busMetaText, { color: textMuted }]} numberOfLines={1}>
                        {presentation.operatorLabel}
                      </ThemedText>
                    </View>

                    <View style={styles.busMeta}>
                      <ThemedText style={[styles.timeText, { color: timeTone }]}>
                        {presentation.timeLabel}
                      </ThemedText>
                      {loadingTrajectory && isSelected ? (
                        <ThemedText style={[styles.loadingText, { color: successAccent }]}>
                          Ruta...
                        </ThemedText>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 8,
  },
  errorTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'center',
  },
  topOverlay: {
    position: 'absolute',
    left: 16,
    right: 90,
    zIndex: 12,
  },
  bannerBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 12,
    gap: 8,
    borderWidth: 1,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  bannerPill: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  bannerPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  bannerDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  bannerCopy: {
    gap: 2,
  },
  bannerTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  bannerText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  controlRail: {
    position: 'absolute',
    right: 16,
    zIndex: 12,
    gap: 10,
  },
  controlButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 12px 24px rgba(2, 6, 23, 0.20)',
  },
  mapMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 12px 24px rgba(2, 6, 23, 0.28)',
  },
  mapMarkerSelected: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
  },
  mapMarkerStale: {
    opacity: 0.78,
  },
  mapMarkerCore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 8px 18px rgba(45, 212, 191, 0.20)',
  },
  markerWrap: {
    alignItems: 'center',
    gap: 6,
  },
  stopMarkerWrap: {
    alignItems: 'center',
    gap: 6,
  },
  stopCallout: {
    maxWidth: 156,
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(7, 14, 29, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
  },
  stopCalloutText: {
    color: '#F8FAFC',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  stopMarkerHalo: {
    position: 'absolute',
    bottom: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 212, 191, 0.18)',
  },
  stopMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ECFDF5',
    boxShadow: '0px 8px 16px rgba(16, 185, 129, 0.28)',
  },
  stopMarkerSelected: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
  },
  markerLabel: {
    maxWidth: 132,
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: 'rgba(7, 14, 29, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
  },
  markerLabelText: {
    color: '#F8FAFC',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  mapMarkerHalo: {
    position: 'absolute',
    bottom: -7,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(45, 212, 191, 0.18)',
  },
  mapAtmosphere: {
    ...StyleSheet.absoluteFillObject,
  },
  mapAtmosphereTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 214,
  },
  mapAtmosphereBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 300,
  },
  sheetContainer: {
    marginHorizontal: 10,
  },
  sheetBackground: {
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0px 18px 36px rgba(2, 6, 12, 0.26)',
  },
  sheetIndicator: {
    width: 36,
    height: 4,
    borderRadius: 999,
    opacity: 0.5,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 12,
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  liveBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  liveText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sheetScrollContent: {
    paddingHorizontal: 14,
    gap: 12,
  },
  journeyCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    gap: 12,
  },
  journeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  journeyCopy: {
    flex: 1,
    gap: 2,
  },
  journeyTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  journeySubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  journeyBadge: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  journeySteps: {
    gap: 6,
  },
  journeyStepText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  selectedBusCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    gap: 12,
  },
  selectedBusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectedBusCopy: {
    flex: 1,
    gap: 2,
  },
  selectedBusTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  selectedBusSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  selectedBusDetail: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  selectedBusBadge: {
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBusBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  selectedBusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedBusAction: {
    minHeight: 38,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  selectedBusActionText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 34,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 250,
  },
  groupedSurface: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(159, 176, 202, 0.10)',
    boxShadow: '0px 16px 30px rgba(2, 6, 23, 0.10)',
  },
  busRow: {
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  busIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busInfo: {
    flex: 1,
    gap: 2,
  },
  busBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  busBadge: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  busBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  busRouteText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  busMetaText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  busMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  timeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  loadingText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
});
