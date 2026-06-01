import { FavoriteGrid } from '@/components/travel/favorite-grid';
import { PrimaryTripCard } from '@/components/travel/primary-trip-card';
import { SearchShell } from '@/components/travel/search-shell';
import { TripList } from '@/components/travel/trip-list';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { SectionHeader } from '@/components/passenger/section-header';
import { StatusPill } from '@/components/passenger/status-pill';
import { TabBarSpacer } from '@/components/passenger/tab-bar-spacer';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { DepthBackground } from '@/components/home/DepthBackground';
import { ThemedText } from '@/components/themed-text';
import { passengerSpacing } from '@/constants/passenger-ui';
import { useFavorites } from '@/hooks/use-favorites';
import { useHomeAlerts } from '@/hooks/use-home-alerts';
import { useLiveFleetSnapshot } from '@/hooks/use-live-fleet-snapshot';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { FavoriteItem } from '@/lib/favorites';
import { computeEta, EtaModel } from '@/lib/home-eta';
import {
  computeJourneyContextPenalty,
  computeJourneyDisplayScore,
  computeJourneyProgressMetrics,
  filterIncoherentJourneysAfterWalking,
  findNearbyTransitStops,
  haversineMeters,
  PlannedJourney,
} from '@/lib/journey-planner';
import { findJourneys as findRaptorJourneys } from '@/lib/raptor';
import { applyEndpointWalkingNetworkValidationToJourneys } from '@/lib/raptor/walking-access-validation';
import { loadRecentDestinations, RecentDestinationEntry, rememberRecentDestination } from '@/lib/recent-destinations';
import { formatRouteDisplayName } from '@/lib/route-display';
import {
  buildNearbyStopPresentation,
  buildPrimaryJourneySummary,
  buildServiceStateSummary,
  buildTripOptionPresentation,
  NearbyStopPresentation,
  TripOptionPresentation,
} from '@/lib/trip-presentation';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
const MAPBOX_PUBLIC_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const IS_WEB_RUNTIME = process.env.EXPO_OS === 'web';
const DEFAULT_LOCATION = '9.8636,-83.9194';
const LOCAL_DIRECT_PREFERENCE_DISTANCE_METERS = 5000;
const LOCAL_DIRECT_PREFERENCE_SCORE_TOLERANCE = 9;
const LOCAL_DIRECT_PREFERENCE_ETA_TOLERANCE_MIN = 8;
const LOCAL_DIRECT_PREFERENCE_WALK_TOLERANCE_METERS = 220;
const LOCAL_DIRECT_PREFERENCE_FARE_TOLERANCE = 200;
const LOCAL_TRANSFER_PREFERENCE_DISTANCE_METERS = 12000;
const LOCAL_TRANSFER_PREFERENCE_ETA_TOLERANCE_MIN = 8;
const LOCAL_TRANSFER_PREFERENCE_WALK_TOLERANCE_METERS = 260;
const LOCAL_TRANSFER_PREFERENCE_FARE_SAVINGS = 150;
const INTERURBAN_ROUTE_HINTS = ['SAN JOSE', 'TURRIALBA', 'ALAJUELA', 'HEREDIA', 'LIMON', 'PUNTARENAS'];
const QUICK_DEPARTURES = [
  { id: 'cartago_taras', destination: 'Parada principal, Taras', etaLabel: 'Sale en 3 min', tripTimeLabel: '26 min', arrivalLabel: 'Llega 12:47', fareLabel: 'CRC 350', busLine: '300' },
  { id: 'cartago_paraiso', destination: 'Basilica de Los Angeles', etaLabel: 'Sale en 8 min', tripTimeLabel: '15 min', arrivalLabel: 'Llega 13:05', fareLabel: 'CRC 350', busLine: '304' },
  { id: 'lumaca_sanjose', destination: 'Terminal Lumaca', etaLabel: 'Sale en 12 min', tripTimeLabel: '40 min', arrivalLabel: 'Llega 13:32', fareLabel: 'CRC 950', busLine: 'Lumaca' },
] as const;

type SearchResult = {
  place_id: string;
  main_text: string;
  secondary_text: string;
  description: string;
  coordinates?: [number, number];
  provider?: 'google' | 'mapbox';
};
type SelectedPlace = { place_id: string; name: string; address: string; coordinates?: [number, number] };

function formatTarifaColones(monto?: number | null): string | null {
  if (monto === null || monto === undefined || Number.isNaN(Number(monto))) return null;
  return `CRC ${Math.round(Number(monto)).toLocaleString('es-CR')}`;
}

function estimateWalkMinutes(totalWalkMeters: number): number {
  return Math.max(1, Math.round(totalWalkMeters / 80));
}

function formatCompactWalkLabel(metros: number): string {
  if (metros < 100) return 'cerca';
  return `${Math.max(1, Math.round(metros / 80))} min`;
}

async function fetchMapboxSearchResults(query: string, userLocation: string): Promise<SearchResult[]> {
  if (!MAPBOX_PUBLIC_TOKEN) return [];

  const searchParams = new URLSearchParams({
    q: query,
    access_token: MAPBOX_PUBLIC_TOKEN,
    country: 'cr',
    language: 'es',
    limit: '6',
    types: 'poi,address,street,place,locality,neighborhood',
    auto_complete: 'true',
  });

  const [lat, lng] = userLocation.split(',').map(Number);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    searchParams.set('proximity', `${lng},${lat}`);
  }

  const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${searchParams.toString()}`);
  const json = await response.json();
  const features = Array.isArray(json?.features) ? json.features : [];

  return features
    .map((feature: any) => {
      const coordinates = Array.isArray(feature?.geometry?.coordinates)
        ? [Number(feature.geometry.coordinates[0]), Number(feature.geometry.coordinates[1])]
        : null;
      if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
        return null;
      }

      const mainText =
        feature?.properties?.name_preferred ??
        feature?.properties?.name ??
        feature?.text ??
        feature?.place_name?.split(',')[0] ??
        query;
      const secondaryText =
        feature?.properties?.place_formatted ??
        feature?.properties?.full_address ??
        feature?.properties?.address ??
        feature?.place_name ??
        '';
      const placeId =
        feature?.properties?.mapbox_id ??
        feature?.id ??
        `${mainText}-${coordinates[0].toFixed(5)}-${coordinates[1].toFixed(5)}`;

      return {
        place_id: String(placeId),
        main_text: String(mainText),
        secondary_text: String(secondaryText),
        description: String(secondaryText || mainText),
        coordinates: coordinates as [number, number],
        provider: 'mapbox' as const,
      };
    })
    .filter((value: SearchResult | null): value is SearchResult => Boolean(value));
}

function buildJourneyPresentationGroupKey(journey: PlannedJourney): string {
  const routeChain =
    journey.routeIds.length > 0
      ? journey.routeIds.join('>')
      : journey.legs.map((leg) => leg.routeId ?? leg.routeCode ?? 'sin-ruta').join('>');

  return [journey.kind, routeChain].join(':');
}

function mapSearchStatus(params: { selectedPlace: SelectedPlace | null; loadingRoutes: boolean; routesCount: number; usingFallbackLocation: boolean }) {
  if (params.selectedPlace) {
    if (params.loadingRoutes) return 'Comparando rutas';
    if (params.routesCount > 0) return `${params.routesCount} opciones listas`;
    return 'Sin rutas cercanas';
  }
  return params.usingFallbackLocation ? 'Precision estandar' : 'Ubicacion actual';
}

function normalizeRouteHint(value?: string | null) {
  return (value ?? '').toLocaleUpperCase('es-CR');
}

function encodeJourneyLegSegments(journey: PlannedJourney | null) {
  if (!journey) return '';

  return journey.legs
    .map((leg) => {
      const values = [
        leg.routeId,
        leg.boardStopId,
        leg.alightStopId,
        leg.boardStop?.lng,
        leg.boardStop?.lat,
        leg.alightStop?.lng,
        leg.alightStop?.lat,
      ].map(Number);

      return values.every(Number.isFinite) ? values.join(',') : null;
    })
    .filter((value): value is string => Boolean(value))
    .join(';');
}

function isReasonableDirectAlternative(params: {
  bestJourney: PlannedJourney;
  directJourney: PlannedJourney;
  bestScore: number;
  directScore: number;
  bestEtaMinutes: number | null;
  directEtaMinutes: number | null;
  tripDistanceMeters: number | null;
}) {
  const {
    bestEtaMinutes,
    bestJourney,
    bestScore,
    directEtaMinutes,
    directJourney,
    directScore,
    tripDistanceMeters,
  } = params;

  if (bestJourney.kind !== 'transfer' || directJourney.kind !== 'direct') {
    return false;
  }

  if (directScore > bestScore + LOCAL_DIRECT_PREFERENCE_SCORE_TOLERANCE) {
    return false;
  }

  if (
    typeof bestEtaMinutes === 'number' &&
    typeof directEtaMinutes === 'number' &&
    directEtaMinutes > bestEtaMinutes + LOCAL_DIRECT_PREFERENCE_ETA_TOLERANCE_MIN
  ) {
    return false;
  }

  if (
    directJourney.totalWalkMeters >
    bestJourney.totalWalkMeters + LOCAL_DIRECT_PREFERENCE_WALK_TOLERANCE_METERS
  ) {
    return false;
  }

  if (
    typeof bestJourney.totalFare === 'number' &&
    typeof directJourney.totalFare === 'number' &&
    directJourney.totalFare > bestJourney.totalFare + LOCAL_DIRECT_PREFERENCE_FARE_TOLERANCE
  ) {
    return false;
  }

  const directRouteText = normalizeRouteHint(
    directJourney.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );
  const bestRouteText = normalizeRouteHint(
    bestJourney.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );

  if (
    typeof tripDistanceMeters === 'number' &&
    tripDistanceMeters <= 9_000 &&
    directRouteText.includes('SAN JOSE') &&
    !bestRouteText.includes('SAN JOSE')
  ) {
    return false;
  }

  return true;
}

function isReasonableLocalTransferAlternative(params: {
  bestJourney: PlannedJourney;
  transferJourney: PlannedJourney;
  bestEtaMinutes: number | null;
  transferEtaMinutes: number | null;
  tripDistanceMeters: number | null;
}) {
  const { bestEtaMinutes, bestJourney, transferEtaMinutes, transferJourney, tripDistanceMeters } = params;

  if (bestJourney.kind !== 'direct' || transferJourney.kind !== 'transfer') {
    return false;
  }

  if (
    typeof tripDistanceMeters !== 'number' ||
    tripDistanceMeters > LOCAL_TRANSFER_PREFERENCE_DISTANCE_METERS
  ) {
    return false;
  }

  const bestRouteText = normalizeRouteHint(
    bestJourney.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );
  const transferRouteText = normalizeRouteHint(
    transferJourney.legs.map((leg) => leg.routeName ?? leg.routeCode ?? '').join(' '),
  );

  const bestLooksInterurban =
    INTERURBAN_ROUTE_HINTS.some((hint) => bestRouteText.includes(hint)) ||
    bestRouteText.includes('SAN JOSE-') ||
    bestRouteText.includes('SAN JOSE ');
  const transferLooksLocal = !INTERURBAN_ROUTE_HINTS.some((hint) => transferRouteText.includes(hint));

  if (!bestLooksInterurban || !transferLooksLocal) {
    return false;
  }

  if (
    typeof bestEtaMinutes === 'number' &&
    typeof transferEtaMinutes === 'number' &&
    transferEtaMinutes > bestEtaMinutes + LOCAL_TRANSFER_PREFERENCE_ETA_TOLERANCE_MIN
  ) {
    return false;
  }

  if (
    transferJourney.totalWalkMeters >
    bestJourney.totalWalkMeters + LOCAL_TRANSFER_PREFERENCE_WALK_TOLERANCE_METERS
  ) {
    return false;
  }

  const bestFare = typeof bestJourney.totalFare === 'number' ? bestJourney.totalFare : null;
  const transferFare = typeof transferJourney.totalFare === 'number' ? transferJourney.totalFare : null;
  const hasMeaningfulFareSavings =
    bestFare !== null &&
    transferFare !== null &&
    transferFare <= bestFare - LOCAL_TRANSFER_PREFERENCE_FARE_SAVINGS;

  const transferHasMuchBetterDrop =
    transferJourney.destinationWalkMeters + 80 < bestJourney.destinationWalkMeters;

  return hasMeaningfulFareSavings || transferHasMuchBetterDrop;
}

export default function TravelScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ favoriteId?: string | string[] }>();
  const ui = usePassengerUI();
  const { favorites, addFavorite, loadFavorites } = useFavorites();
  const { snapshot: liveFleetSnapshot, freshBuses, staleBuses } = useLiveFleetSnapshot();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [journeyPlans, setJourneyPlans] = useState<PlannedJourney[]>([]);
  const [nearbyStops, setNearbyStops] = useState<NearbyStopPresentation[]>([]);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestinationEntry[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [showAllAlternatives, setShowAllAlternatives] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const favoriteLongPressRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          setLocationPermissionGranted(true);
          const loc = await Location.getCurrentPositionAsync({});
          setUserLocation(`${loc.coords.latitude},${loc.coords.longitude}`);
        } else {
          setLocationPermissionGranted(false);
        }
      } catch {
        setLocationPermissionGranted(false);
      }
    })();
  }, []);

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  useFocusEffect(useCallback(() => {
    loadFavorites();
    loadRecentDestinations().then(setRecentDestinations);
  }, [loadFavorites]));

  useEffect(() => {
    let isCancelled = false;

    if (!locationPermissionGranted || userLocation === DEFAULT_LOCATION) {
      setNearbyStops([]);
      return () => {
        isCancelled = true;
      };
    }

    const [latitude, longitude] = userLocation.split(',').map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setNearbyStops([]);
      return () => {
        isCancelled = true;
      };
    }

    findNearbyTransitStops([longitude, latitude], 4)
      .then((stops) => {
        if (!isCancelled) {
          setNearbyStops(
            stops.map((stop) =>
              buildNearbyStopPresentation({
                id: stop.id,
                stopName: stop.stopName,
                routeId: String(stop.routeId),
                routeName: stop.routeName,
                routeCode: stop.routeCode,
                distanceMeters: stop.distanceMeters,
              }),
            ),
          );
        }
      })
      .catch(() => {
        if (!isCancelled) setNearbyStops([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [locationPermissionGranted, userLocation]);

  const loadRoutesForDestination = useCallback(async (destination: SelectedPlace) => {
    setSelectedPlace(destination);
    rememberRecentDestination({
      placeId: destination.place_id,
      name: destination.name,
      address: destination.address,
      coordinates: destination.coordinates ?? null,
    })
      .then(setRecentDestinations)
      .catch(() => {});
    setShowAllAlternatives(false);
    setJourneyPlans([]);
    setLoadingRoutes(true);
    const [fallbackLat, fallbackLng] = DEFAULT_LOCATION.split(',').map(Number);
    const [userLat, userLng] = userLocation.split(',').map(Number);
    const [destinationLng, destinationLat] = destination.coordinates ?? [fallbackLng, fallbackLat];
    const originLat = Number.isFinite(userLat) ? userLat : fallbackLat;
    const originLng = Number.isFinite(userLng) ? userLng : fallbackLng;

    if (__DEV__) {
      console.warn('Planner request coordinates', {
        destinationName: destination.name,
        userLocation,
        originLat,
        originLng,
        destinationLat,
        destinationLng,
        usingFallbackOrigin: !Number.isFinite(userLat) || !Number.isFinite(userLng),
        usingFallbackDestination: !destination.coordinates,
      });
    }

    try {
      const planningResult = await findRaptorJourneys({
        origin: { lng: originLng, lat: originLat },
        destination: { lng: destinationLng, lat: destinationLat },
      });
      const walkValidatedPlans = await applyEndpointWalkingNetworkValidationToJourneys({
        journeys: planningResult.journeys,
        origin: [originLng, originLat],
        destination: [destinationLng, destinationLat],
      });
      const plans = filterIncoherentJourneysAfterWalking({
        journeys: walkValidatedPlans,
        origin: [originLng, originLat],
        destination: [destinationLng, destinationLat],
      });
      setJourneyPlans(plans);
    } catch (error) {
      console.error('Error planeando viajes hacia destino:', error);
      setJourneyPlans([]);
    } finally {
      setLoadingRoutes(false);
      setIsSearching(false);
    }
  }, [userLocation]);

  const clearSearch = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setSelectedPlace(null);
    setJourneyPlans([]);
    setLoadingRoutes(false);
    setShowAllAlternatives(false);
    Keyboard.dismiss();
  }, []);

  const resetSelectedTrip = useCallback(() => {
    setSelectedPlace(null);
    setJourneyPlans([]);
    setLoadingRoutes(false);
    setShowAllAlternatives(false);
  }, []);

  const searchPlaces = useCallback((text: string) => {
    setSearchQuery(text);
    if (selectedPlace && text !== selectedPlace.name) resetSelectedTrip();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (text.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        if (IS_WEB_RUNTIME) {
          const results = await fetchMapboxSearchResults(text, userLocation);
          setSearchResults(results);
        } else {
          const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_PLACES_KEY}&components=country:cr&language=es&radius=50000&location=${userLocation}`;
          const response = await fetch(url);
          const json = await response.json();
          if (json.predictions) {
            setSearchResults(json.predictions.map((prediction: any) => ({
              place_id: prediction.place_id,
              main_text: prediction.structured_formatting?.main_text || prediction.description,
              secondary_text: prediction.structured_formatting?.secondary_text || '',
              description: prediction.description,
              provider: 'google' as const,
            })));
          } else {
            setSearchResults([]);
          }
        }
      } catch {
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 300);
  }, [resetSelectedTrip, selectedPlace, userLocation]);

  const resolvePlaceDetails = useCallback(async (
    placeId: string,
  ): Promise<{ placeId: string; name: string; address: string; coordinates: [number, number] } | null> => {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry&key=${GOOGLE_PLACES_KEY}`;
      const response = await fetch(url);
      const json = await response.json();
      const location = json.result?.geometry?.location;
      if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;

      return {
        placeId,
        name: json.result?.name ?? 'Destino',
        address: json.result?.formatted_address ?? '',
        coordinates: [location.lng, location.lat],
      };
    } catch {
      return null;
    }
  }, []);

  const selectPlace = useCallback(async (result: SearchResult) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchQuery(result.main_text);
    setSearchResults([]);
    Keyboard.dismiss();

    try {
      if (result.coordinates) {
        await loadRoutesForDestination({
          place_id: result.place_id,
          name: result.main_text,
          address: result.secondary_text || result.description,
          coordinates: result.coordinates,
        });
        return;
      }

      const details = await resolvePlaceDetails(result.place_id);
      if (!details) {
        setJourneyPlans([]);
        return;
      }

      await loadRoutesForDestination({
        place_id: details.placeId,
        name: result.main_text || details.name,
        address: result.secondary_text || details.address,
        coordinates: details.coordinates,
      });
    } catch {
      setJourneyPlans([]);
    } finally {
      setIsSearching(false);
    }
  }, [loadRoutesForDestination, resolvePlaceDetails]);

  const runFavoriteTrip = useCallback(async (favorite: FavoriteItem) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchResults([]);
    setIsSearching(false);
    setSearchQuery(favorite.title);
    Keyboard.dismiss();

    try {
      if (favorite.coordinates) {
        await loadRoutesForDestination({
          place_id: favorite.placeId ?? favorite.id,
          name: favorite.name,
          address: favorite.address,
          coordinates: favorite.coordinates,
        });
        return;
      }

      let resolved:
        | { placeId: string; name: string; address: string; coordinates: [number, number] }
        | null = null;

      if (favorite.placeId) {
        resolved = await resolvePlaceDetails(favorite.placeId);
      }

      if (!resolved) {
        const textQuery = `${favorite.name} ${favorite.address}`.trim();
        if (IS_WEB_RUNTIME) {
          const results = await fetchMapboxSearchResults(textQuery, userLocation);
          const candidate = results[0];
          if (candidate?.coordinates) {
            resolved = {
              placeId: candidate.place_id,
              name: candidate.main_text ?? favorite.name,
              address: candidate.secondary_text ?? favorite.address,
              coordinates: candidate.coordinates,
            };
          }
        } else {
          const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(textQuery)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry&components=country:cr&language=es&key=${GOOGLE_PLACES_KEY}`;
          const response = await fetch(url);
          const json = await response.json();
          const candidate = json.candidates?.[0];
          if (candidate?.geometry?.location) {
            resolved = {
              placeId: candidate.place_id,
              name: candidate.name ?? favorite.name,
              address: candidate.formatted_address ?? favorite.address,
              coordinates: [candidate.geometry.location.lng, candidate.geometry.location.lat],
            };
          }
        }
      }

      if (resolved) {
        await loadRoutesForDestination({
          place_id: resolved.placeId,
          name: resolved.name,
          address: resolved.address,
          coordinates: resolved.coordinates,
        });
        return;
      }
    } catch {
      // Fall back to regular search.
    }

    searchPlaces(`${favorite.name} ${favorite.address}`.trim());
  }, [loadRoutesForDestination, resolvePlaceDetails, searchPlaces, userLocation]);

  const runRecentTrip = useCallback(async (recent: RecentDestinationEntry) => {
    setSearchQuery(recent.name);
    setSearchResults([]);
    setIsSearching(false);
    Keyboard.dismiss();

    if (recent.coordinates) {
      await loadRoutesForDestination({
        place_id: recent.placeId ?? recent.id,
        name: recent.name,
        address: recent.address,
        coordinates: recent.coordinates,
      });
      return;
    }

    if (recent.placeId) {
      const details = await resolvePlaceDetails(recent.placeId);
      if (details) {
        await loadRoutesForDestination({
          place_id: details.placeId,
          name: recent.name || details.name,
          address: recent.address || details.address,
          coordinates: details.coordinates,
        });
        return;
      }
    }

    if (IS_WEB_RUNTIME) {
      const results = await fetchMapboxSearchResults(`${recent.name} ${recent.address}`.trim(), userLocation);
      const candidate = results[0];
      if (candidate?.coordinates) {
        await loadRoutesForDestination({
          place_id: candidate.place_id,
          name: candidate.main_text || recent.name,
          address: candidate.secondary_text || recent.address,
          coordinates: candidate.coordinates,
        });
        return;
      }
    }

    searchPlaces(`${recent.name} ${recent.address}`.trim());
  }, [loadRoutesForDestination, resolvePlaceDetails, searchPlaces, userLocation]);

  useEffect(() => {
    const favoriteId = Array.isArray(params.favoriteId) ? params.favoriteId[0] : params.favoriteId;
    if (!favoriteId || favorites.length === 0) return;

    const favorite = favorites.find((item) => item.id === favoriteId);
    if (!favorite) return;

    runFavoriteTrip(favorite).catch(() => {});
    router.setParams({ favoriteId: undefined });
  }, [favorites, params.favoriteId, router, runFavoriteTrip]);

  const journeyById = useMemo(() => {
    return new Map(journeyPlans.map((journey) => [journey.id, journey] as const));
  }, [journeyPlans]);

  const openRouteOnMap = useCallback((
    routeIdOrTrip?: string | number | TripOptionPresentation | null,
    routeName?: string | null,
  ) => {
    const tripOption =
      routeIdOrTrip && typeof routeIdOrTrip === 'object' ? routeIdOrTrip : null;
    const journey = tripOption ? journeyById.get(tripOption.id) ?? null : null;
    const fallbackRouteId =
      tripOption?.routeId ??
      (typeof routeIdOrTrip === 'string' || typeof routeIdOrTrip === 'number'
        ? routeIdOrTrip
        : '');

    router.push({
      pathname: '/(tabs)/explore',
      params: {
        routeId: fallbackRouteId ? String(fallbackRouteId) : '',
        routeIds: journey?.routeIds.join(',') ?? '',
        routeName: tripOption?.routeName ?? routeName ?? '',
        routeCode: tripOption?.routeCode ?? '',
        journeyKind: journey?.kind ?? '',
        transferLabel: tripOption?.transferLabel ?? '',
        walkLabel: tripOption?.totalWalkLabel ?? '',
        boardLabel: tripOption?.walkToBoardLabel ?? '',
        dropLabel: tripOption?.walkToDropLabel ?? '',
        journeyLegSegments: encodeJourneyLegSegments(journey),
        destinationName: selectedPlace?.name ?? '',
      },
    });
  }, [journeyById, router, selectedPlace?.name]);

  const openFavoriteEditor = useCallback((favorite: FavoriteItem) => {
    router.push({ pathname: '/favorite-editor', params: { favoriteId: favorite.id } });
  }, [router]);

  const openPlannerLab = useCallback(() => {
    const destinationParam = selectedPlace?.coordinates
      ? `${selectedPlace.coordinates[1]},${selectedPlace.coordinates[0]}`
      : searchQuery.trim();

    router.push({
      pathname: '/planner-lab',
      params: {
        origin: userLocation,
        destination: destinationParam,
      },
    });
  }, [router, searchQuery, selectedPlace?.coordinates, userLocation]);

  const tripDistanceMeters = useMemo(() => {
    if (!selectedPlace?.coordinates) return null;

    const [userLat, userLng] = userLocation.split(',').map(Number);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return null;

    const [destinationLng, destinationLat] = selectedPlace.coordinates;
    return haversineMeters([userLng, userLat], [destinationLng, destinationLat]);
  }, [selectedPlace?.coordinates, userLocation]);

  const originCoordinate = useMemo<[number, number] | null>(() => {
    const [userLat, userLng] = userLocation.split(',').map(Number);
    if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) return null;
    return [userLng, userLat];
  }, [userLocation]);

  const destinationCoordinate = selectedPlace?.coordinates ?? null;

  const openTripDetails = useCallback((tripOption: TripOptionPresentation) => {
    const journey = journeyById.get(tripOption.id) ?? null;
    const [originLat, originLng] = userLocation.split(',').map(Number);
    const progressMetrics =
      journey && originCoordinate && destinationCoordinate
        ? computeJourneyProgressMetrics({
            journey,
            origin: originCoordinate,
            destination: destinationCoordinate,
          })
        : null;
    const displayScore =
      journey
        ? computeJourneyDisplayScore({
            journey,
            etaWaitMinutes:
              computeEta(
                {
                  ruta_id: journey.legs[0].routeId,
                  nombre_ruta: journey.legs[0].routeName,
                  codigo_ctp: journey.legs[0].routeCode,
                  dist_origen: journey.originWalkMeters,
                },
                liveFleetSnapshot,
              ).waitMinutes ?? 0,
            origin: originCoordinate,
            destination: destinationCoordinate,
            destinationName: selectedPlace?.name,
          })
        : null;
    const plannerDebug =
      journey && selectedPlace
        ? JSON.stringify({
            origin: Number.isFinite(originLat) && Number.isFinite(originLng)
              ? { lat: originLat, lng: originLng }
              : null,
            destination: selectedPlace.coordinates
              ? { lat: selectedPlace.coordinates[1], lng: selectedPlace.coordinates[0] }
              : null,
            destinationName: selectedPlace.name,
            destinationAddress: selectedPlace.address,
            tripDistanceMeters,
            score: journey.score,
            displayScore,
            contextPenalty: computeJourneyContextPenalty({
              journey,
              origin: originCoordinate,
              destination: destinationCoordinate,
              destinationName: selectedPlace.name,
            }),
            progressMetrics,
            kind: journey.kind,
            routeIds: journey.routeIds,
            routeCodes: journey.routeCodes,
            legs: journey.legs.map((leg) => ({
              routeId: leg.routeId,
              routeName: leg.routeName,
              routeCode: leg.routeCode,
              direction: leg.direction,
              boardStopId: leg.boardStopId,
              boardStopName: leg.boardStopName,
              alightStopId: leg.alightStopId,
              alightStopName: leg.alightStopName,
              boardStopLat: leg.boardStop?.lat ?? null,
              boardStopLng: leg.boardStop?.lng ?? null,
              alightStopLat: leg.alightStop?.lat ?? null,
              alightStopLng: leg.alightStop?.lng ?? null,
            })),
          })
        : '';

    router.push({
      pathname: '/trip-details',
      params: {
        routeId: String(tripOption.routeId),
        routeIds: journey?.routeIds.join(',') ?? String(tripOption.routeId),
        routeName: tripOption.routeName,
        routeCode: tripOption.routeCode ?? '',
        fareLabel: tripOption.fareLabel,
        etaLabel: tripOption.etaLabel,
        confidenceLabel: tripOption.confidenceLabel,
        walkLabel: tripOption.totalWalkLabel,
        boardLabel: tripOption.walkToBoardLabel,
        dropLabel: tripOption.walkToDropLabel,
        operatorLabel: tripOption.operatorLabel,
        destinationName: selectedPlace?.name ?? '',
        journeyKind: journey?.kind ?? (tripOption.transferCount > 0 ? 'transfer' : 'direct'),
        transferLabel: tripOption.transferLabel ?? '',
        journeyLegSegments: encodeJourneyLegSegments(journey),
        plannerDebug,
      },
    });
  }, [
    destinationCoordinate,
    journeyById,
    liveFleetSnapshot,
    originCoordinate,
    router,
    selectedPlace,
    tripDistanceMeters,
    userLocation,
  ]);

  const selectedPlaceFavoriteId = useMemo(() => {
    if (!selectedPlace) return null;
    return (
      favorites.find((favorite) => {
        if (selectedPlace.place_id && favorite.placeId && favorite.placeId === selectedPlace.place_id) return true;
        if (!selectedPlace.coordinates || !favorite.coordinates) return false;
        const [selectedLng, selectedLat] = selectedPlace.coordinates;
        const [favoriteLng, favoriteLat] = favorite.coordinates;
        return Math.abs(selectedLng - favoriteLng) < 0.0001 && Math.abs(selectedLat - favoriteLat) < 0.0001;
      })?.id ?? null
    );
  }, [favorites, selectedPlace]);

  const etaByJourney = useMemo(() => {
    const byJourney = new Map<string, EtaModel>();
    const now = Date.now();

    journeyPlans.forEach((journey) => {
      const firstLeg = journey.legs[0];
      byJourney.set(
        journey.id,
        computeEta(
          {
            ruta_id: firstLeg.routeId,
            nombre_ruta: firstLeg.routeName,
            codigo_ctp: firstLeg.routeCode,
            dist_origen: journey.originWalkMeters,
          },
          liveFleetSnapshot,
          now,
        ),
      );
    });

    return byJourney;
  }, [journeyPlans, liveFleetSnapshot]);

  const displayScoreByJourneyId = useMemo(() => {
    return new Map(
      journeyPlans.map((journey) => [
        journey.id,
        computeJourneyDisplayScore({
          journey,
          etaWaitMinutes: etaByJourney.get(journey.id)?.waitMinutes ?? 0,
          origin: originCoordinate,
          destination: destinationCoordinate,
          destinationName: selectedPlace?.name,
        }),
      ] as const),
    );
  }, [destinationCoordinate, etaByJourney, journeyPlans, originCoordinate, selectedPlace?.name]);

  const bestJourney = useMemo(() => {
    if (journeyPlans.length === 0) return null;

    const ranked = [...journeyPlans].sort((a, b) => {
      const aScore = displayScoreByJourneyId.get(a.id) ?? a.score;
      const bScore = displayScoreByJourneyId.get(b.id) ?? b.score;
      return aScore - bScore;
    });

    const scoredBest = ranked.reduce<PlannedJourney | null>((best, journey) => {
      const score = displayScoreByJourneyId.get(journey.id) ?? journey.score;

      if (!best) return journey;

      const bestScore = displayScoreByJourneyId.get(best.id) ?? best.score;
      return score < bestScore ? journey : best;
    }, null);

    if (!scoredBest) {
      return scoredBest;
    }

    const bestScore = displayScoreByJourneyId.get(scoredBest.id) ?? scoredBest.score;
    const bestEtaMinutes = etaByJourney.get(scoredBest.id)?.etaMinutes ?? null;

    if (
      scoredBest.kind === 'transfer' &&
      tripDistanceMeters &&
      tripDistanceMeters <= LOCAL_DIRECT_PREFERENCE_DISTANCE_METERS
    ) {
      const directAlternative = ranked.find((journey) => {
        if (journey.kind !== 'direct') return false;

        const directScore = displayScoreByJourneyId.get(journey.id) ?? journey.score;
        const directEtaMinutes = etaByJourney.get(journey.id)?.etaMinutes ?? null;

        return isReasonableDirectAlternative({
          bestJourney: scoredBest,
          directJourney: journey,
          bestScore,
          directScore,
          bestEtaMinutes,
          directEtaMinutes,
          tripDistanceMeters,
        });
      });

      if (__DEV__ && directAlternative) {
        console.warn('Prefiriendo directo razonable sobre transbordo corto', {
          tripDistanceMeters,
          transferRoute: scoredBest.routeName,
          directRoute: directAlternative.routeName,
          transferScore: bestScore,
          directScore: displayScoreByJourneyId.get(directAlternative.id) ?? directAlternative.score,
        });
      }

      return directAlternative ?? scoredBest;
    }

    if (scoredBest.kind === 'direct') {
      const transferAlternative = ranked.find((journey) => {
        if (journey.kind !== 'transfer') return false;

        const transferEtaMinutes = etaByJourney.get(journey.id)?.etaMinutes ?? null;
        return isReasonableLocalTransferAlternative({
          bestJourney: scoredBest,
          transferJourney: journey,
          bestEtaMinutes,
          transferEtaMinutes,
          tripDistanceMeters,
        });
      });

      if (__DEV__ && transferAlternative) {
        console.warn('Prefiriendo transbordo local razonable sobre directo interurbano', {
          tripDistanceMeters,
          directRoute: scoredBest.routeName,
          transferRoute: transferAlternative.routeName,
          directFare: scoredBest.totalFare,
          transferFare: transferAlternative.totalFare,
          directEtaMinutes: bestEtaMinutes,
          transferEtaMinutes: etaByJourney.get(transferAlternative.id)?.etaMinutes ?? null,
        });
      }

      return transferAlternative ?? scoredBest;
    }

    return scoredBest;
  }, [displayScoreByJourneyId, etaByJourney, journeyPlans, tripDistanceMeters]);

  const routeEtas = useMemo(
    () =>
      journeyPlans.map((journey) => {
        const firstLeg = journey.legs[0];
        return {
          routeId: firstLeg.routeId,
          routeName: formatRouteDisplayName(firstLeg.routeName),
          eta:
            etaByJourney.get(journey.id) ??
            computeEta(
              {
                ruta_id: firstLeg.routeId,
                nombre_ruta: firstLeg.routeName,
                codigo_ctp: firstLeg.routeCode,
                dist_origen: journey.originWalkMeters,
              },
              liveFleetSnapshot,
            ),
        };
      }),
    [etaByJourney, journeyPlans, liveFleetSnapshot],
  );

  const { activeAlertsCount, banner, isRouteAlertEnabled, toggleRouteAlert, dismissBanner } = useHomeAlerts({
    routeEtas,
    destinationName: selectedPlace?.name ?? null,
  });

  const tripOptions = useMemo(
    () => {
      const candidates = journeyPlans.map((journey) => {
        const trip = buildTripOptionPresentation({
          journey,
          eta:
            etaByJourney.get(journey.id) ??
            computeEta(
              {
                ruta_id: journey.legs[0].routeId,
                nombre_ruta: journey.legs[0].routeName,
                codigo_ctp: journey.legs[0].routeCode,
                dist_origen: journey.originWalkMeters,
              },
              liveFleetSnapshot,
            ),
          formatFare: formatTarifaColones,
          formatWalkLabel: formatCompactWalkLabel,
          estimateWalkMinutes,
          formatRouteDisplayName,
          isBest: bestJourney?.id === journey.id,
        });

        return { journey, trip };
      });

      const bestByGroup = new Map<string, (typeof candidates)[number]>();

      candidates.forEach((candidate) => {
        const groupKey = buildJourneyPresentationGroupKey(candidate.journey);
        const existing = bestByGroup.get(groupKey);

        if (!existing) {
          bestByGroup.set(groupKey, candidate);
          return;
        }

        const candidateDisplayScore =
          displayScoreByJourneyId.get(candidate.journey.id) ?? candidate.journey.score;
        const existingDisplayScore =
          displayScoreByJourneyId.get(existing.journey.id) ?? existing.journey.score;
        const candidateRank = [
          Number(candidate.trip.isBest),
          -candidate.trip.transferCount,
          -candidateDisplayScore,
          -candidate.journey.totalWalkMeters,
        ];
        const existingRank = [
          Number(existing.trip.isBest),
          -existing.trip.transferCount,
          -existingDisplayScore,
          -existing.journey.totalWalkMeters,
        ];

        for (let index = 0; index < candidateRank.length; index += 1) {
          if (candidateRank[index] === existingRank[index]) continue;
          if (candidateRank[index] > existingRank[index]) {
            bestByGroup.set(groupKey, candidate);
          }
          break;
        }
      });

      return [...bestByGroup.values()]
        .map(({ trip }) => trip)
        .sort((a, b) => Number(b.isBest) - Number(a.isBest) || a.transferCount - b.transferCount || a.etaMinutes - b.etaMinutes);
    },
    [bestJourney?.id, displayScoreByJourneyId, etaByJourney, journeyPlans, liveFleetSnapshot],
  );

  const primaryTrip = tripOptions.find((item) => item.isBest) ?? tripOptions[0] ?? null;
  const alternativeTrips = primaryTrip ? tripOptions.filter((item) => item.id !== primaryTrip.id) : tripOptions;
  const primaryJourney = primaryTrip && selectedPlace ? buildPrimaryJourneySummary(primaryTrip, selectedPlace.name) : null;
  const quickDepartureTrips = useMemo<TripOptionPresentation[]>(
    () =>
      QUICK_DEPARTURES.map((route) => ({
        id: route.id,
        routeId: 0,
        routeName: route.destination,
        routeCode: route.busLine,
        fareLabel: route.fareLabel,
        operatorLabel: 'Servicio frecuente',
        etaLabel: route.etaLabel,
        etaMinutes: 0,
        confidenceLabel: route.tripTimeLabel,
        walkToBoardLabel: route.tripTimeLabel,
        walkToDropLabel: route.arrivalLabel,
        totalWalkLabel: route.arrivalLabel,
        detailSummary: route.destination,
        isBest: false,
        transferLabel: null,
        transferCount: 0,
        metaPills: [],
      })),
    [],
  );
  const serviceState = buildServiceStateSummary({
    liveBuses: freshBuses.length,
    staleBuses: staleBuses.length,
    activeAlerts: activeAlertsCount,
    hasSelection: Boolean(selectedPlace),
    loadingRoutes,
  });
  const searchStatusText = mapSearchStatus({
    selectedPlace,
    loadingRoutes,
    routesCount: tripOptions.length,
    usingFallbackLocation: userLocation === DEFAULT_LOCATION,
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: ui.backgroundColor }]}>
      <DepthBackground
        topColor={ui.gradientTop}
        midColor={ui.gradientMid}
        bottomColor={ui.gradientBottom}
        accentColor={ui.accentPrimary}
        variant="content"
        showOrbs={false}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(260)} style={styles.contentBlock}>
          <ScreenHero
            title="A donde vas hoy?"
            subtitle={selectedPlace ? `Planea mejor tu llegada a ${selectedPlace.name} sin cargar la pantalla.` : 'Busca un destino, usa tus lugares guardados o salta al mapa en vivo.'}
            topRow={
              <>
                <StatusPill label="Cartago, CR" icon="navigate-circle-outline" tone="accent" />
                <StatusPill label={searchStatusText} tone={selectedPlace ? 'live' : 'neutral'} />
              </>
            }>
            <SearchShell
              query={searchQuery}
              onChangeText={searchPlaces}
              onClear={clearSearch}
              isSearching={isSearching}
              textColor={ui.textPrimary}
              textMuted={ui.textSecondary}
            />
          </ScreenHero>

          {searchResults.length > 0 ? (
            <GlassPanel variant="panel">
              <View style={styles.searchResultsList}>
                {searchResults.map((result, index) => (
                  <TouchableOpacity
                    key={result.place_id}
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={() => selectPlace(result)}
                    style={[styles.searchResultRow, index < searchResults.length - 1 && { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
                    <View style={[styles.rowIconWrap, { backgroundColor: ui.interactiveNeutral }]}>
                      <Ionicons name="location-outline" size={16} color={ui.textSecondary} />
                    </View>
                    <View style={styles.flexOne}>
                      <ThemedText style={[styles.rowTitle, { color: ui.textPrimary }]} numberOfLines={1}>{result.main_text}</ThemedText>
                      <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary }]} numberOfLines={1}>{result.secondary_text || result.description}</ThemedText>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={ui.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </GlassPanel>
          ) : null}

          <GlassPanel variant="panel">
            <View style={styles.serviceCard}>
              <View style={styles.serviceHeader}>
                <View style={styles.flexOne}>
                  <ThemedText style={[styles.serviceEyebrow, { color: ui.textSecondary }]}>Servicio ahora</ThemedText>
                  <ThemedText style={[styles.serviceTitle, { color: ui.textPrimary }]}>{serviceState.title}</ThemedText>
                  <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary }]}>{serviceState.detail}</ThemedText>
                </View>
                <StatusPill label={serviceState.liveLabel} tone={serviceState.tone} />
              </View>

              <View style={styles.serviceMetaRow}>
                <StatusPill label={serviceState.coverageLabel} tone={serviceState.tone} />
                <StatusPill label={activeAlertsCount > 0 ? `${activeAlertsCount} alertas` : 'Sin alertas'} tone={activeAlertsCount > 0 ? 'warning' : 'neutral'} />
              </View>

              <View style={styles.serviceActionRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={() => router.push(serviceState.actionLabel === 'Ver alertas' ? '/trip-alerts' : '/service-status')}
                  style={[styles.inlineCardAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
                  <Ionicons name="pulse-outline" size={15} color={ui.accentPrimary} />
                  <ThemedText style={[styles.inlineActionText, { color: ui.accentPrimary }]}>{serviceState.actionLabel}</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={openPlannerLab}
                  style={[styles.inlineCardAction, { backgroundColor: ui.interactiveAccent, borderColor: `${ui.accentPrimary}1F` }]}>
                  <Ionicons name="flask-outline" size={15} color={ui.accentPrimary} />
                  <ThemedText style={[styles.inlineActionText, { color: ui.accentPrimary }]}>Planner Lab</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        {banner ? (
          <Animated.View entering={FadeInDown.duration(220)}>
            <GlassPanel variant="hero">
              <View style={styles.alertBanner}>
                <View style={[styles.rowIconWrap, { backgroundColor: ui.statusWarning }]}>
                  <Ionicons name="notifications-outline" size={16} color={ui.accentWarning} />
                </View>
                <View style={styles.flexOne}>
                  <ThemedText style={[styles.rowTitle, { color: ui.textPrimary }]}>Recordatorio de viaje</ThemedText>
                  <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary }]}>
                    {banner.routeName} esta a {banner.etaMinutes} min hacia {banner.destinationName}.
                  </ThemedText>
                </View>
                <Pressable accessibilityRole="button" onPress={dismissBanner}>
                  <ThemedText style={[styles.inlineActionText, { color: ui.accentWarning }]}>Cerrar</ThemedText>
                </Pressable>
              </View>
            </GlassPanel>
          </Animated.View>
        ) : null}

        {selectedPlace ? (
          <View style={styles.screenSection}>
            <SectionHeader title="Tu viaje" subtitle={selectedPlace.address || 'Destino seleccionado'} actionLabel="Cambiar" onPressAction={clearSearch} />

            {loadingRoutes ? (
              <View style={styles.skeletonGroup}>
                {[0, 1].map((item) => (
                  <Animated.View key={`trip-skeleton-${item}`} entering={FadeInDown.duration(220).delay(item * 70)}>
                    <GlassPanel variant="elevated">
                      <View style={[styles.skeletonLine, { backgroundColor: ui.statusPrimary, width: '58%' }]} />
                      <View style={[styles.skeletonLine, { backgroundColor: ui.interactiveNeutral, width: '82%' }]} />
                      <View style={styles.skeletonRow}>
                        <View style={[styles.skeletonPill, { backgroundColor: ui.statusLive }]} />
                        <View style={[styles.skeletonPill, { backgroundColor: ui.statusPrimary }]} />
                        <View style={[styles.skeletonPill, { backgroundColor: ui.interactiveNeutral }]} />
                      </View>
                    </GlassPanel>
                  </Animated.View>
                ))}
              </View>
            ) : null}

            {!loadingRoutes && primaryTrip && primaryJourney ? (
              <Animated.View entering={FadeInDown.duration(240)}>
                <PrimaryTripCard
                  trip={primaryTrip}
                  summary={primaryJourney}
                  isSaved={Boolean(selectedPlaceFavoriteId)}
                  onPressDetails={() => openTripDetails(primaryTrip)}
                  onPressMap={() => openRouteOnMap(primaryTrip)}
                  onPressFavorite={() => {
                    if (selectedPlaceFavoriteId) {
                      const existing = favorites.find((favorite) => favorite.id === selectedPlaceFavoriteId);
                      if (existing) openFavoriteEditor(existing);
                      return;
                    }

                    addFavorite({
                      title: selectedPlace.name,
                      icon: 'location-outline',
                      placeId: selectedPlace.place_id,
                      name: selectedPlace.name,
                      address: selectedPlace.address,
                      coordinates: selectedPlace.coordinates ?? null,
                    });
                  }}
                />
              </Animated.View>
            ) : null}

            {!loadingRoutes && alternativeTrips.length > 0 ? (
              <View style={styles.screenSection}>
                <SectionHeader
                  title="Alternativas"
                  subtitle="Opciones adicionales para el mismo destino"
                  actionLabel={showAllAlternatives ? 'Ocultar' : `Ver ${alternativeTrips.length}`}
                  onPressAction={() => setShowAllAlternatives((value) => !value)}
                />

                {showAllAlternatives ? (
                  <TripList
                    trips={alternativeTrips}
                    onPressTrip={openTripDetails}
                    onToggleAlert={(trip) => toggleRouteAlert({ routeId: trip.routeId, routeName: trip.routeName })}
                    isAlertEnabled={(trip) => isRouteAlertEnabled(trip.routeId)}
                  />
                ) : null}
              </View>
            ) : null}

            {!loadingRoutes && tripOptions.length === 0 ? (
              <GlassPanel variant="panel">
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: ui.statusWarning }]}>
                    <Ionicons name="search-outline" size={20} color={ui.accentWarning} />
                  </View>
                  <ThemedText style={[styles.emptyTitle, { color: ui.textPrimary }]}>No encontramos una ruta cercana</ThemedText>
                  <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary, textAlign: 'center' }]}>
                    Prueba con otro destino o vuelve mas tarde cuando haya mas cobertura en vivo.
                  </ThemedText>
                  <TouchableOpacity accessibilityRole="button" activeOpacity={0.84} onPress={clearSearch} style={[styles.emptyButton, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
                    <Ionicons name="search-outline" size={15} color={ui.accentPrimary} />
                    <ThemedText style={[styles.inlineActionText, { color: ui.accentPrimary }]}>Buscar otro destino</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" activeOpacity={0.84} onPress={openPlannerLab} style={[styles.emptyButton, { backgroundColor: ui.interactiveAccent, borderColor: `${ui.accentPrimary}1F` }]}>
                    <Ionicons name="flask-outline" size={15} color={ui.accentPrimary} />
                    <ThemedText style={[styles.inlineActionText, { color: ui.accentPrimary }]}>Probar en Planner Lab</ThemedText>
                  </TouchableOpacity>
                </View>
              </GlassPanel>
            ) : null}
          </View>
        ) : (
          <View style={styles.screenSection}>
            <SectionHeader
              title="Paradas cercanas"
              subtitle={locationPermissionGranted ? 'Paradas utiles para subir rapido' : 'Activa ubicacion para ver lo mas cercano'}
              actionLabel={locationPermissionGranted ? 'Mapa' : 'Permisos'}
              onPressAction={() => router.push(locationPermissionGranted ? '/(tabs)/explore' : '/settings')}
            />
            <GlassPanel variant="panel">
              {!locationPermissionGranted ? (
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: ui.interactiveNeutral }]}>
                    <Ionicons name="locate-outline" size={20} color={ui.accentPrimary} />
                  </View>
                  <ThemedText style={[styles.emptyTitle, { color: ui.textPrimary }]}>Activa tu ubicacion</ThemedText>
                  <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary, textAlign: 'center' }]}>
                    Asi podremos mostrarte paradas cercanas y opciones mas utiles para salir rapido.
                  </ThemedText>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={() => router.push('/settings')}
                    style={[styles.emptyButton, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
                    <Ionicons name="settings-outline" size={15} color={ui.accentPrimary} />
                    <ThemedText style={[styles.inlineActionText, { color: ui.accentPrimary }]}>Ir a permisos</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : nearbyStops.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: ui.interactiveNeutral }]}>
                    <Ionicons name="bus-outline" size={20} color={ui.textSecondary} />
                  </View>
                  <ThemedText style={[styles.emptyTitle, { color: ui.textPrimary }]}>Aun sin paradas cercanas</ThemedText>
                  <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary, textAlign: 'center' }]}>
                    Prueba de nuevo en unos segundos o abre el mapa para explorar la zona.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.listGroup}>
                  {nearbyStops.map((stop, index) => (
                    <TouchableOpacity
                      key={stop.id}
                      accessibilityRole="button"
                      activeOpacity={0.84}
                      onPress={() => openRouteOnMap(stop.routeId, stop.routeName)}
                      style={[styles.infoRow, index < nearbyStops.length - 1 && { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
                      <View style={[styles.rowIconWrap, { backgroundColor: ui.interactiveAccent }]}>
                        <Ionicons name="bus-outline" size={16} color={ui.accentPrimary} />
                      </View>
                      <View style={styles.flexOne}>
                        <View style={styles.infoRowTop}>
                          <ThemedText style={[styles.rowTitle, { color: ui.textPrimary }]} numberOfLines={1}>{stop.stopName}</ThemedText>
                          <StatusPill label={stop.routeCode} tone="accent" />
                        </View>
                        <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary }]} numberOfLines={1}>
                          {stop.routeName} - {stop.distanceLabel}
                        </ThemedText>
                      </View>
                      <Ionicons name="arrow-forward" size={16} color={ui.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </GlassPanel>

            {recentDestinations.length > 0 ? (
              <>
                <SectionHeader title="Recientes" subtitle="Vuelve a destinos usados hace poco" />
                <GlassPanel variant="panel">
                  <View style={styles.listGroup}>
                    {recentDestinations.slice(0, 3).map((recent, index) => (
                      <TouchableOpacity
                        key={recent.id}
                        accessibilityRole="button"
                        activeOpacity={0.84}
                        onPress={() => runRecentTrip(recent)}
                        style={[styles.infoRow, index < Math.min(recentDestinations.length, 3) - 1 && { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
                        <View style={[styles.rowIconWrap, { backgroundColor: ui.interactiveNeutral }]}>
                          <Ionicons name="time-outline" size={16} color={ui.textSecondary} />
                        </View>
                        <View style={styles.flexOne}>
                          <ThemedText style={[styles.rowTitle, { color: ui.textPrimary }]} numberOfLines={1}>{recent.name}</ThemedText>
                          <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary }]} numberOfLines={1}>
                            {recent.address || 'Destino reciente'}
                          </ThemedText>
                        </View>
                        <Ionicons name="arrow-forward" size={16} color={ui.textSecondary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </GlassPanel>
              </>
            ) : null}

            <SectionHeader title="Tus lugares" subtitle="Atajos para salir mas rapido" actionLabel="Gestionar" onPressAction={() => router.push('/saved-places')} />
            <FavoriteGrid
              favorites={favorites}
              onPressFavorite={(favorite) => {
                if (favoriteLongPressRef.current) {
                  favoriteLongPressRef.current = false;
                  return;
                }
                runFavoriteTrip(favorite);
              }}
              onLongPressFavorite={(favorite) => {
                favoriteLongPressRef.current = true;
                openFavoriteEditor(favorite);
              }}
              onPressManage={() => router.push('/saved-places')}
            />

            <SectionHeader
              title="Salidas proximas"
              subtitle="Opciones rapidas para moverte ahora"
              actionLabel={activeAlertsCount > 0 ? `${activeAlertsCount} alertas` : 'Alertas'}
              onPressAction={() => router.push('/trip-alerts')}
            />

            <TripList
              trips={quickDepartureTrips}
              onPressTrip={(trip) => openRouteOnMap(trip.id, trip.routeName)}
            />
          </View>
        )}

        <TabBarSpacer />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: passengerSpacing.lg,
    paddingTop: passengerSpacing.sm,
    gap: passengerSpacing.lg,
  },
  contentBlock: {
    gap: passengerSpacing.md,
  },
  flexOne: { flex: 1 },
  searchResultsList: { gap: 0 },
  searchResultRow: {
    minHeight: 62,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.sm,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  serviceCard: {
    gap: passengerSpacing.sm,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: passengerSpacing.sm,
  },
  serviceEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  serviceTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  serviceMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
  },
  serviceActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.sm,
  },
  inlineCardAction: {
    minHeight: 40,
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  screenSection: {
    gap: passengerSpacing.md,
  },
  skeletonGroup: {
    gap: passengerSpacing.sm,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 999,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: passengerSpacing.xs,
  },
  skeletonPill: {
    flex: 1,
    height: 30,
    borderRadius: 999,
  },
  listGroup: {
    gap: 0,
  },
  infoRow: {
    minHeight: 68,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.sm,
  },
  infoRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    gap: passengerSpacing.sm,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyButton: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
