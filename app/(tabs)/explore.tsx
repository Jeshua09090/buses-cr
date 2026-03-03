import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
    DETAILED_ROUTE,
    resolveRoute
} from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Mapbox from '@rnmapbox/maps';
import { RealtimeChannel } from '@supabase/supabase-js';
import { BlurView } from 'expo-blur';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// Coordenadas de Cartago, Costa Rica (Punto por defecto)
const DEFAULT_COORDINATES: [number, number] = [-83.9189, 9.8648];
const MAPBOX_PUBLIC_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

if (MAPBOX_PUBLIC_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_PUBLIC_TOKEN);
}

type Bus = {
  id: string;
  latitude: number;
  longitude: number;
  route: string;
  routeId?: string;
  status: 'Activo' | 'En camino' | string;
  lastUpdate: number;
  placa?: string;
  speedKmh?: number;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(from: [number, number], to: [number, number]): number {
  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;

  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export default function PassengerModeScreen() {
  const { clearRole } = useAuth();
  const [buses, setBuses] = useState<Record<string, Bus>>({});
  const [isSimulating, setIsSimulating] = useState(false);
  const [userCoordinate, setUserCoordinate] = useState<[number, number] | null>(null);
  const insets = useSafeAreaInsets();
  
  const router = useRouter();
  const { routeId: routeIdParam, routeName: routeNameParam } = useLocalSearchParams<{
    routeId?: string;
    routeName?: string;
  }>();

  const selectedRoute = useMemo(
    () => resolveRoute(routeIdParam, routeNameParam),
    [routeIdParam, routeNameParam]
  );
  
  const routeGeoJSON = useMemo(() => {
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: selectedRoute.path,
      },
    };
  }, [selectedRoute]);

  // Theme colors for dark mode UI
  const sheetBg = useThemeColor({ light: '#ffffff', dark: '#1e293b' }, 'background');
  const cardBg = useThemeColor({ light: '#f1f5f9', dark: '#334155' }, 'background');
  const textColor = useThemeColor({ light: '#0f172a', dark: '#f8fafc' }, 'text');
  const textMuted = useThemeColor({ light: '#64748b', dark: '#94a3b8' }, 'text');
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const simulationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentStepRef = useRef(0);
  
  // Bottom Sheet
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['15%', '40%', '80%'], []);

  useEffect(() => {
    (async () => {
      let { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        await Location.requestBackgroundPermissionsAsync();
      }
    })();

    const routeId = 'ruta_1';
    
    const channel = supabase.channel(`route_tracking:${routeId}`, {
      config: { broadcast: { self: true } }
    })
      .on(
        'broadcast',
        { event: 'location_update' },
        (payload) => {
          const { driver_id, lat, lng, status, timestamp, route, placa } = payload.payload;
          
          setBuses((prevBuses) => ({
            ...prevBuses,
            [driver_id]: {
              id: driver_id,
              latitude: lat,
              longitude: lng,
              route: route || 'Cartago - Taras',
              status: status || 'Activo',
              lastUpdate: timestamp || Date.now(),
              placa: placa || 'CB-0000'
            }
          }));
        }
      )
      .subscribe();
      
    channelRef.current = channel;

    const cleanupInterval = setInterval(() => {
      setBuses((prev) => {
        const now = Date.now();
        const next = { ...prev };
        let changed = false;
        
        for (const [id, bus] of Object.entries(next)) {
          if (now - bus.lastUpdate > 30000) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10000);

    return () => {
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      clearInterval(cleanupInterval);
    };
  }, []);

  const toggleSimulation = () => {
    if (isSimulating) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      setIsSimulating(false);
    } else {
      setIsSimulating(true);
      currentStepRef.current = 0;
      
      simulationIntervalRef.current = setInterval(() => {
        if (currentStepRef.current >= DETAILED_ROUTE.length) {
          currentStepRef.current = 0;
        }
  
        const point = DETAILED_ROUTE[currentStepRef.current];
        const [lng, lat] = point;
  
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'location_update',
            payload: {
              driver_id: 'auto_test_driver',
              lat: lat,
              lng: lng,
              heading: 0,
              speed: 40,
              timestamp: Date.now(),
              status: 'en_ruta_simulada',
              route: 'Cartago - Taras'
            },
          }).catch(err => console.error("Error broadcasting simulation:", err));
        }
        currentStepRef.current += 1;
      }, 1500);
    }
  };

  const handleLogout = async () => {
    if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    await clearRole();
  };

  const handleBusPress = useCallback((bus: Bus) => {
    // Optionally zoom to bus or open bottom sheet details
    bottomSheetRef.current?.snapToIndex(1);
  }, []);

  const activeBusesList = Object.values(buses).sort((a, b) => b.lastUpdate - a.lastUpdate);
  
  const centerCoordinate = activeBusesList.length > 0 
    ? [activeBusesList[0].longitude, activeBusesList[0].latitude]
    : DEFAULT_COORDINATES;

  return (
    <View style={styles.container}>
      {/* Full-Screen Map */}
      {MAPBOX_PUBLIC_TOKEN ? (
        <Mapbox.MapView style={StyleSheet.absoluteFillObject} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} logoEnabled={false} scaleBarEnabled={false}>
          <Mapbox.Camera 
            zoomLevel={13.5} 
            centerCoordinate={centerCoordinate}
            animationDuration={2000} 
            pitch={45} // Angled view for premium feel
          />
          <Mapbox.UserLocation visible showsUserHeadingIndicator />

          <Mapbox.ShapeSource id="routeSource" shape={routeGeoJSON as any}>
            <Mapbox.LineLayer
              id="routeLine"
              style={{
                lineColor: '#3b82f6',
                lineWidth: 5,
                lineOpacity: 0.5,
                lineJoin: 'round',
                lineCap: 'round',
              }}
            />
          </Mapbox.ShapeSource>

          {activeBusesList.map((bus) => (
            <Mapbox.PointAnnotation
              key={bus.id}
              id={`bus-${bus.id}`}
              coordinate={[bus.longitude, bus.latitude]}
              onSelected={() => handleBusPress(bus)}>
              <View
                style={[
                  styles.mapMarker,
                  { backgroundColor: bus.status === 'en_ruta_simulada' ? '#3b82f6' : '#10b981' },
                ]}
              >
                <Ionicons name="bus" size={14} color="white" />
              </View>
            </Mapbox.PointAnnotation>
          ))}
        </Mapbox.MapView>
      ) : (
        <View style={styles.errorContainer}>
          <ThemedText>Mapbox no configurado</ThemedText>
        </View>
      )}

      {/* Floating Header / Search Bar */}
      <View style={[styles.headerContainer, { top: insets.top + 10 }]}>
        <BlurView intensity={40} tint="dark" style={styles.headerBlur}>
          <TouchableOpacity style={styles.menuButton} onPress={handleLogout}>
            <Ionicons name="menu" size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.searchBarFake}>
            <ThemedText style={styles.searchText}>¿Hacia dónde vas?</ThemedText>
          </View>

          <TouchableOpacity 
            style={[styles.simButton, { backgroundColor: isSimulating ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)' }]} 
            onPress={toggleSimulation}
          >
            <Ionicons name={isSimulating ? "stop" : "play"} size={20} color="#fff" />
          </TouchableOpacity>
        </BlurView>
      </View>

      {/* Crosshair target for center map feeling */}
      <View style={styles.mapCenterDot} pointerEvents="none">
         <View style={styles.mapCenterDotInner} />
      </View>

      {/* Bottom Sheet for Bus List */}
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: sheetBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted, width: 40 }}
      >
        <View style={styles.sheetHeader}>
          <ThemedText style={[styles.sheetTitle, { color: textColor }]}>
            Buses cerca de ti
          </ThemedText>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.liveText}>{activeBusesList.length} en vivo</ThemedText>
          </View>
        </View>

        <BottomSheetScrollView contentContainerStyle={styles.scrollContent}>
          {activeBusesList.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="bus-outline" size={48} color={textMuted} style={{opacity: 0.5}} />
              <ThemedText style={[styles.emptyText, { color: textMuted }]}>
                Buscando buses en tu zona...
              </ThemedText>
            </View>
          ) : (
            activeBusesList.map((bus) => {
              const secondsAgo = Math.floor((Date.now() - bus.lastUpdate) / 1000);
              return (
                <TouchableOpacity 
                  key={bus.id} 
                  style={[styles.busCard, { backgroundColor: cardBg }]}
                  activeOpacity={0.7}
                >
                  <View style={styles.busIconContainer}>
                    <Ionicons name="bus" size={24} color="#10b981" />
                  </View>
                  
                  <View style={styles.busInfo}>
                    <ThemedText style={[styles.busRouteText, { color: textColor }]} numberOfLines={1}>
                      {bus.route}
                    </ThemedText>
                    <ThemedText style={[styles.busPlacaText, { color: textMuted }]}>
                      Unidad: {bus.placa || 'Desconocida'}
                    </ThemedText>
                  </View>
                  
                  <View style={styles.busMeta}>
                    <ThemedText style={[styles.timeText, { color: secondsAgo > 15 ? '#f59e0b' : '#10b981' }]}>
                      {secondsAgo < 5 ? 'Ahora' : `Hace ${secondsAgo}s`}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 10,
    borderRadius: 16,
    overflow: 'hidden',
  },
  headerBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
  },
  menuButton: {
    marginRight: 12,
    padding: 4,
  },
  searchBarFake: {
    flex: 1,
    justifyContent: 'center',
  },
  searchText: {
    fontSize: 16,
    color: '#f8fafc',
    opacity: 0.8,
    fontWeight: '500',
  },
  simButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  mapMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  mapCenterDot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 4,
    height: 4,
    marginLeft: -2,
    marginTop: -2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  mapCenterDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 8,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  liveText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  busCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  busIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  busInfo: {
    flex: 1,
  },
  busRouteText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  busPlacaText: {
    fontSize: 13,
  },
  busMeta: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
  },
});
