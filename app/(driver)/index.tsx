import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { LOCATION_TASK_NAME } from '@/lib/location-task';
import { DETAILED_ROUTE } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { RealtimeChannel } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type HasStartedLocationUpdatesAsync = (taskName: string) => Promise<boolean>;
type StopLocationUpdatesAsync = (taskName: string) => Promise<void>;
type RequestBackgroundPermissionsAsync = () => Promise<Location.LocationPermissionResponse>;
type StartLocationUpdatesAsync = (
  taskName: string,
  options: Location.LocationTaskOptions,
) => Promise<void>;

export default function DriverHomeScreen() {
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSubscription, setLocationSubscription] = useState<Location.LocationSubscription | null>(null);
  const { clearRole, session } = useAuth();
  const softPanelColor = useThemeColor({ light: '#f1f5f9', dark: '#1e293b' }, 'background');

  const channelRef = useRef<RealtimeChannel | null>(null);
  const simulationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentStepRef = useRef(0);
  const isWebRuntime = process.env.EXPO_OS === 'web';

  const stopTracking = useCallback(async () => {
    if (locationSubscription) {
      locationSubscription.remove();
      setLocationSubscription(null);
    }

    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    if (!isWebRuntime) {
      const hasStartedLocationUpdatesAsync = (Location as Record<string, unknown>)
        .hasStartedLocationUpdatesAsync as HasStartedLocationUpdatesAsync | undefined;
      const stopLocationUpdatesAsync = (Location as Record<string, unknown>)
        .stopLocationUpdatesAsync as StopLocationUpdatesAsync | undefined;

      if (
        typeof hasStartedLocationUpdatesAsync === 'function' &&
        typeof stopLocationUpdatesAsync === 'function'
      ) {
        const hasStarted = await hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (hasStarted) {
          await stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        }
      }
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsSimulating(false);
  }, [isWebRuntime, locationSubscription]);

  useEffect(() => {
    return () => {
      void stopTracking();
    };
  }, [stopTracking]);

  const startSimulation = async () => {
    if (isTransmitting) {
      await stopTracking();
      setIsTransmitting(false);
      return;
    }

    setLocationError(null);
    setIsTransmitting(true);
    setIsSimulating(true);
    Alert.alert('Simulación iniciada', 'Transmitiendo ruta de Cartago a Taras...');

    const routeId = 'ruta_1';
    const driverId = session?.user?.id || 'simulated_driver_taras';
    const channel = supabase.channel(`route_tracking:${routeId}`, {
      config: { broadcast: { self: true } },
    });

    channel.subscribe();
    channelRef.current = channel;

    currentStepRef.current = 0;

    // Send a point every 1.5 seconds to simulate movement.
    simulationIntervalRef.current = setInterval(() => {
      if (currentStepRef.current >= DETAILED_ROUTE.length) {
        currentStepRef.current = 0;
      }

      const point = DETAILED_ROUTE[currentStepRef.current];
      const [lng, lat] = point;

      console.log(`[Simulación] GPS update: Lat ${lat}, Lng ${lng}`);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'location_update',
          payload: {
            driver_id: driverId,
            lat,
            lng,
            heading: 0,
            speed: 40,
            timestamp: Date.now(),
            status: 'en_ruta_simulada',
          },
        }).catch(err => console.error('Error broadcasting simulation:', err));
      }

      currentStepRef.current += 1;
    }, 1500);
  };

  const toggleTransmission = async () => {
    if (isTransmitting) {
      await stopTracking();
      setIsTransmitting(false);
      Alert.alert('Transmisión detenida', 'La transmisión de tu ubicación se detuvo.');
    } else {
      setLocationError(null);

      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== 'granted') {
        Alert.alert(
          'Permiso de Notificaciones',
          'Las notificaciones están bloqueadas. Esto puede impedir que la app siga transmitiendo cuando la minimizas.',
        );
      }

      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        setLocationError('Permiso de ubicación denegado. No se puede transmitir.');
        Alert.alert('Error', 'Se requiere acceso a la ubicación para transmitir.');
        return;
      }

      let bgStatus: Location.PermissionStatus | null = null;
      const requestBackgroundPermissionsAsync = (Location as Record<string, unknown>)
        .requestBackgroundPermissionsAsync as RequestBackgroundPermissionsAsync | undefined;
      if (!isWebRuntime && typeof requestBackgroundPermissionsAsync === 'function') {
        const backgroundPermission = await requestBackgroundPermissionsAsync();
        bgStatus = backgroundPermission.status;
      }
      if (!isWebRuntime && bgStatus !== 'granted') {
        Alert.alert(
          'Advertencia',
          'La app no tiene permisos para transmitir en segundo plano. Si minimizas la app, el GPS se detendrá.',
        );
      }

      setIsTransmitting(true);
      Alert.alert('Transmisión iniciada', 'Conectando con el GPS y transmitiendo...');

      const routeId = 'ruta_1';
      const driverId = session?.user?.id || 'anonymous_driver';
      const channel = supabase.channel(`route_tracking:${routeId}`, {
        config: {
          broadcast: { self: true },
        },
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Driver connected to broadcast channel: route_tracking:${routeId}`);
        }
      });
      channelRef.current = channel;

      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (location) => {
            const { latitude, longitude, heading, speed } = location.coords;
            console.log(`GPS update: Lat ${latitude}, Lng ${longitude}`);

            if (channelRef.current) {
              channelRef.current.send({
                type: 'broadcast',
                event: 'location_update',
                payload: {
                  driver_id: driverId,
                  lat: latitude,
                  lng: longitude,
                  heading: heading || 0,
                  speed: speed || 0,
                  timestamp: Date.now(),
                  status: 'en_ruta',
                },
              }).catch(err => console.error('Error broadcasting location:', err));
            }
          },
        );
        setLocationSubscription(sub);

        const startLocationUpdatesAsync = (Location as Record<string, unknown>)
          .startLocationUpdatesAsync as StartLocationUpdatesAsync | undefined;
        if (!isWebRuntime && bgStatus === 'granted' && typeof startLocationUpdatesAsync === 'function') {
          await startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 50,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'Buses CR',
              notificationBody: 'Transmitiendo tu ubicación GPS a los pasajeros',
              notificationColor: '#10b981',
            },
          });
        }
      } catch (error) {
        console.error('Error starting location watch:', error);
        setIsTransmitting(false);
        setLocationError('Hubo un problema al iniciar el GPS.');
        await stopTracking();
      }
    }
  };

  const handleLogout = async () => {
    await stopTracking();
    await clearRole();
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText type="title" style={styles.title}>Modo Chofer</ThemedText>
          {isSimulating && (
            <View style={styles.simBadge}>
              <ThemedText style={styles.simText}>MODO SIMULACIÓN</ThemedText>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#FF5252" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.subtitle}>
          {isTransmitting
            ? 'Transmitiendo ubicación a los pasajeros'
            : 'Inicia la transmisión para compartir ubicación'}
        </ThemedText>

        {locationError ? (
          <View style={[styles.errorContainer, { backgroundColor: softPanelColor }]}>
            <Ionicons name="warning-outline" size={18} color="#FFB347" />
            <ThemedText style={styles.errorText}>{locationError}</ThemedText>
          </View>
        ) : null}

        <View style={[styles.statusContainer, { backgroundColor: softPanelColor }]}>
          <View style={[
            styles.statusIndicator,
            { backgroundColor: isTransmitting ? '#4CAF50' : '#FF5252' },
          ]} />
          <ThemedText style={styles.statusText}>
            {isTransmitting ? 'Activo' : 'Inactivo'}
          </ThemedText>
        </View>

        {!isSimulating && (
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: isTransmitting ? '#FF5252' : '#4CAF50' },
            ]}
            onPress={toggleTransmission}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {isTransmitting ? 'Detener GPS Real' : 'Iniciar GPS Real'}
            </Text>
          </TouchableOpacity>
        )}

        {!isTransmitting && !isSimulating && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#3b82f6', marginTop: 10 }]}
            onPress={startSimulation}
            activeOpacity={0.8}
          >
            <Ionicons name="play-circle-outline" size={20} color="white" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Simular Ruta a Taras</Text>
          </TouchableOpacity>
        )}

        {isSimulating && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#FF5252', marginTop: 10 }]}
            onPress={startSimulation}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Detener simulación</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.infoContainer, { backgroundColor: softPanelColor, marginTop: 20 }]}>
          <ThemedText style={styles.infoText}>
            Usa el modo simulación para ver cómo se mueve el bus en el mapa de pasajeros sin tener que desplazarte físicamente.
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  simBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  simText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    opacity: 0.8,
    lineHeight: 24,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    width: '100%',
    maxWidth: 320,
    paddingVertical: 18,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoContainer: {
    padding: 20,
    borderRadius: 12,
    maxWidth: 320,
  },
  infoText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.7,
  },
  errorContainer: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 20,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
