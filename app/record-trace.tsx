import { DepthBackground } from '@/components/home/DepthBackground';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import {
  appendPointToLocalRouteTrace,
  createLocalRouteTrace,
  deleteLocalRouteTrace,
  finishLocalRouteTrace,
  loadLocalRouteTraces,
  LocalRouteTrace,
  pauseLocalRouteTrace,
  resumeLocalRouteTrace,
  RouteTraceDirection,
  searchRoutesForTrace,
  syncPendingRouteTraces,
  TraceRouteSearchResult,
} from '@/lib/route-traces';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DIRECTION_OPTIONS: { id: RouteTraceDirection; label: string }[] = [
  { id: 'sin_definir', label: 'Sin definir' },
  { id: 'ida', label: 'Ida' },
  { id: 'vuelta', label: 'Vuelta' },
  { id: 'ambos', label: 'Ambos' },
];

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('es-CR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatDuration(startedAt: string, endedAt?: string | null) {
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '0 min';
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  return `${minutes} min`;
}

function getTraceTone(status: LocalRouteTrace['status']) {
  if (status === 'synced') return 'success' as const;
  if (status === 'sync_error') return 'warning' as const;
  if (status === 'recording') return 'accent' as const;
  if (status === 'paused') return 'warning' as const;
  return 'neutral' as const;
}

function getTraceStatusLabel(status: LocalRouteTrace['status']) {
  if (status === 'recording') return 'Grabando';
  if (status === 'paused') return 'Pausada';
  if (status === 'pending_sync') return 'Pendiente';
  if (status === 'syncing') return 'Subiendo';
  if (status === 'synced') return 'Sincronizada';
  return 'Con error';
}

export default function RecordTraceScreen() {
  const router = useRouter();
  const ui = usePassengerUI();
  const { session } = useAuth();
  const [routeQuery, setRouteQuery] = useState('');
  const [manualRouteName, setManualRouteName] = useState('');
  const [manualRouteCode, setManualRouteCode] = useState('');
  const [direction, setDirection] = useState<RouteTraceDirection>('sin_definir');
  const [notes, setNotes] = useState('');
  const [routeResults, setRouteResults] = useState<TraceRouteSearchResult[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<TraceRouteSearchResult | null>(null);
  const [localTraces, setLocalTraces] = useState<LocalRouteTrace[]>([]);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [gpsLabel, setGpsLabel] = useState('Listo para grabar');
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const activeTrace = useMemo(
    () => localTraces.find((trace) => trace.localId === activeTraceId) ?? null,
    [activeTraceId, localTraces],
  );

  const refreshLocalTraces = useCallback(async () => {
    const traces = await loadLocalRouteTraces();
    setLocalTraces(traces);
    const liveTrace = traces.find((trace) => trace.status === 'recording' || trace.status === 'paused') ?? null;
    setActiveTraceId((current) => current ?? liveTrace?.localId ?? null);
  }, []);

  const syncNow = useCallback(async () => {
    if (!session?.user.id) {
      Alert.alert('Necesitas sesion', 'La captura se puede guardar offline, pero para subirla ocupas iniciar sesion.');
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncPendingRouteTraces(session.user.id);
      await refreshLocalTraces();
      if (!result.uploaded && !result.failed) {
        Alert.alert('Sin cambios', 'No hay trazas pendientes por subir.');
      } else {
        Alert.alert('Sincronizacion completa', `Subidas: ${result.uploaded} | Fallidas: ${result.failed}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos sincronizar las trazas.';
      Alert.alert('Error al sincronizar', message);
    } finally {
      setIsSyncing(false);
    }
  }, [refreshLocalTraces, session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      refreshLocalTraces().catch(() => {});
      if (session?.user.id) {
        syncPendingRouteTraces(session.user.id)
          .then(() => refreshLocalTraces())
          .catch(() => {});
      }
    }, [refreshLocalTraces, session?.user.id]),
  );

  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, []);

  const upsertTraceInState = useCallback((trace: LocalRouteTrace | null) => {
    if (!trace) return;
    setLocalTraces((current) => {
      const filtered = current.filter((item) => item.localId !== trace.localId);
      return [trace, ...filtered].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    });
  }, []);

  const startWatcher = useCallback(async (traceId: string) => {
    watchRef.current?.remove();
    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 3000,
        distanceInterval: 8,
      },
      async (location) => {
        const point = await appendPointToLocalRouteTrace(traceId, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          capturedAt: new Date(location.timestamp).toISOString(),
          accuracyM: location.coords.accuracy ?? null,
          speedMps: location.coords.speed ?? null,
          headingDeg: location.coords.heading ?? null,
          altitudeM: location.coords.altitude ?? null,
        });
        upsertTraceInState(point);
        if (point) {
          setGpsLabel(`Grabando ${point.points.length} puntos | ultima precision ${Math.round(location.coords.accuracy ?? 0)} m`);
        }
      },
    );
  }, [upsertTraceInState]);

  const ensureLocationPermission = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso requerido', 'Activa la ubicacion para poder grabar el trayecto del bus.');
      return false;
    }
    return true;
  }, []);

  const runRouteSearch = useCallback(async () => {
    if (!routeQuery.trim()) {
      setRouteResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchRoutesForTrace(routeQuery);
      setRouteResults(results);
      if (!results.length) {
        Alert.alert('Sin coincidencias', 'No encontramos rutas con ese texto. Puedes seguir con nombre manual si quieres.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos buscar rutas.';
      Alert.alert('Busqueda no disponible', message);
    } finally {
      setIsSearching(false);
    }
  }, [routeQuery]);

  const startRecording = useCallback(async () => {
    const routeName = selectedRoute?.nombreRuta?.trim() || manualRouteName.trim();
    const routeCode = selectedRoute?.codigoCtp?.trim() || manualRouteCode.trim() || null;
    const routeId = selectedRoute?.id ?? null;

    if (!routeName) {
      Alert.alert('Falta la ruta', 'Busca una ruta existente o escribe al menos el nombre del bus que vas a grabar.');
      return;
    }

    if (!(await ensureLocationPermission())) return;

    setIsStarting(true);
    try {
      const trace = await createLocalRouteTrace({
        routeId,
        routeName,
        routeCode,
        direction,
        notes,
      });
      upsertTraceInState(trace);
      setActiveTraceId(trace.localId);
      await startWatcher(trace.localId);
      setGpsLabel('GPS activo. Empezamos a capturar el trayecto.');
      Alert.alert('Trayecto iniciado', 'Puedes bloquear la pantalla un rato, pero para este MVP te recomiendo dejar esta vista abierta mientras grabas.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos iniciar la grabacion.';
      Alert.alert('No pudimos iniciar', message);
    } finally {
      setIsStarting(false);
    }
  }, [direction, ensureLocationPermission, manualRouteCode, manualRouteName, notes, selectedRoute, startWatcher, upsertTraceInState]);

  const pauseRecording = useCallback(async () => {
    if (!activeTraceId) return;
    watchRef.current?.remove();
    watchRef.current = null;
    const trace = await pauseLocalRouteTrace(activeTraceId);
    upsertTraceInState(trace);
    setGpsLabel('Grabacion pausada.');
  }, [activeTraceId, upsertTraceInState]);

  const resumeRecording = useCallback(async () => {
    if (!activeTraceId) return;
    if (!(await ensureLocationPermission())) return;
    const trace = await resumeLocalRouteTrace(activeTraceId);
    upsertTraceInState(trace);
    await startWatcher(activeTraceId);
    setGpsLabel('Retomamos la captura del trayecto.');
  }, [activeTraceId, ensureLocationPermission, startWatcher, upsertTraceInState]);

  const stopRecording = useCallback(async () => {
    if (!activeTraceId) return;
    watchRef.current?.remove();
    watchRef.current = null;
    const trace = await finishLocalRouteTrace(activeTraceId, notes);
    upsertTraceInState(trace);
    setActiveTraceId(null);
    setGpsLabel(trace?.lastError ?? 'Trayecto guardado localmente.');
    await refreshLocalTraces();
    if (session?.user.id) {
      await syncNow();
    }
  }, [activeTraceId, notes, refreshLocalTraces, session?.user.id, syncNow, upsertTraceInState]);

  const removeTrace = useCallback(async (trace: LocalRouteTrace) => {
    Alert.alert('Eliminar traza', `Se eliminara la captura local de ${trace.routeName}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalRouteTrace(trace.localId);
          if (trace.localId === activeTraceId) {
            watchRef.current?.remove();
            watchRef.current = null;
            setActiveTraceId(null);
          }
          await refreshLocalTraces();
        },
      },
    ]);
  }, [activeTraceId, refreshLocalTraces]);

  return (
    <View style={[styles.container, { backgroundColor: ui.backgroundColor }]}>
      <DepthBackground
        topColor={ui.gradientTop}
        midColor={ui.gradientMid}
        bottomColor={ui.gradientBottom}
        accentColor={ui.accentPrimary}
        variant="content"
        showOrbs={false}
      />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <ScreenHero
            title="Grabar trayecto"
            subtitle="Captura recorridos reales del bus, guardalos offline y subelos cuando vuelvas a tener internet."
            topRow={
              <>
                <StatusPill label={session?.user ? 'Sesion lista' : 'Sin sesion'} tone={session?.user ? 'accent' : 'warning'} />
                <StatusPill label={`${localTraces.length} trazas locales`} tone="neutral" />
              </>
            }
          />

          <GlassPanel variant="hero">
            <View style={styles.heroRow}>
              <View style={styles.heroCopy}>
                <ThemedText style={[styles.heroTitle, { color: ui.textPrimary }]}>Grabador de campo</ThemedText>
                <ThemedText style={[styles.heroSubtitle, { color: ui.textSecondary }]}>{gpsLabel}</ThemedText>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.84}
                onPress={() => router.back()}
                style={[styles.iconButton, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
                <Ionicons name="arrow-back" size={18} color={ui.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.heroPills}>
              <StatusPill label={activeTrace ? `${activeTrace.points.length} puntos` : 'Listo'} tone={activeTrace ? 'accent' : 'neutral'} />
              <StatusPill label={activeTrace ? getTraceStatusLabel(activeTrace.status) : 'Sin captura'} tone={activeTrace ? getTraceTone(activeTrace.status) : 'neutral'} />
              <StatusPill label={session?.user ? 'Sync posible' : 'Sync luego'} tone={session?.user ? 'success' : 'warning'} />
            </View>
          </GlassPanel>

          <GlassPanel variant="panel">
            <View style={styles.cardHeader}>
              <ThemedText style={[styles.cardTitle, { color: ui.textPrimary }]}>1. Elige el bus</ThemedText>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.84}
                onPress={runRouteSearch}
                style={[styles.inlineButton, { backgroundColor: ui.interactiveAccent, borderColor: ui.dividerSoft }]}
                disabled={isSearching || !routeQuery.trim()}>
                {isSearching ? <ActivityIndicator size="small" color={ui.accentPrimary} /> : <Ionicons name="search-outline" size={16} color={ui.accentPrimary} />}
                <ThemedText style={[styles.inlineButtonText, { color: ui.accentPrimary }]}>Buscar ruta</ThemedText>
              </TouchableOpacity>
            </View>

            <TextInput
              value={routeQuery}
              onChangeText={setRouteQuery}
              placeholder="Ej: TARAS, 300, TEJAR"
              placeholderTextColor={ui.textSecondary}
              style={[styles.input, { color: ui.textPrimary, borderColor: ui.dividerSoft, backgroundColor: ui.surfaceElevated }]}
            />

            {selectedRoute ? (
              <View style={[styles.selectedRouteCard, { backgroundColor: ui.interactiveAccent, borderColor: ui.dividerSoft }]}>
                <View style={styles.routeRowTop}>
                  <View style={styles.routeCopy}>
                    <ThemedText style={[styles.routeName, { color: ui.textPrimary }]}>{selectedRoute.nombreRuta}</ThemedText>
                    <ThemedText style={[styles.routeMeta, { color: ui.textSecondary }]}>
                      {[selectedRoute.codigoCtp, selectedRoute.operador].filter(Boolean).join(' | ') || 'Ruta seleccionada'}
                    </ThemedText>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedRoute(null)}>
                    <Ionicons name="close-circle" size={20} color={ui.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <TextInput
              value={manualRouteName}
              onChangeText={setManualRouteName}
              placeholder="Nombre manual de la ruta si no aparece en busqueda"
              placeholderTextColor={ui.textSecondary}
              style={[styles.input, { color: ui.textPrimary, borderColor: ui.dividerSoft, backgroundColor: ui.surfaceElevated }]}
            />
            <TextInput
              value={manualRouteCode}
              onChangeText={setManualRouteCode}
              placeholder="Codigo corto (opcional)"
              placeholderTextColor={ui.textSecondary}
              style={[styles.input, { color: ui.textPrimary, borderColor: ui.dividerSoft, backgroundColor: ui.surfaceElevated }]}
            />

            {routeResults.length ? (
              <View style={styles.resultsList}>
                {routeResults.map((result) => (
                  <TouchableOpacity
                    key={result.id}
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={() => setSelectedRoute(result)}
                    style={[styles.resultRow, { borderColor: ui.dividerSoft, backgroundColor: ui.surfaceElevated }]}>
                    <View style={styles.routeCopy}>
                      <ThemedText style={[styles.routeName, { color: ui.textPrimary }]}>{result.nombreRuta}</ThemedText>
                      <ThemedText style={[styles.routeMeta, { color: ui.textSecondary }]}>
                        {[result.codigoCtp, result.operador].filter(Boolean).join(' | ') || 'Ruta disponible'}
                      </ThemedText>
                    </View>
                    <Ionicons name="arrow-forward-circle-outline" size={18} color={ui.accentPrimary} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.directionRow}>
              {DIRECTION_OPTIONS.map((option) => {
                const active = direction === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={() => setDirection(option.id)}
                    style={[
                      styles.directionChip,
                      {
                        backgroundColor: active ? ui.interactiveAccent : ui.interactiveNeutral,
                        borderColor: active ? `${ui.accentPrimary}55` : ui.dividerSoft,
                      },
                    ]}>
                    <ThemedText style={[styles.directionChipText, { color: active ? ui.accentPrimary : ui.textSecondary }]}>
                      {option.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Notas del trayecto: desvio temporal, terminal usada, sentido real, etc."
              placeholderTextColor={ui.textSecondary}
              style={[styles.textarea, { color: ui.textPrimary, borderColor: ui.dividerSoft, backgroundColor: ui.surfaceElevated }]}
            />
          </GlassPanel>

          <GlassPanel variant="panel">
            <View style={styles.cardHeader}>
              <ThemedText style={[styles.cardTitle, { color: ui.textPrimary }]}>2. Captura y sincroniza</ThemedText>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.84}
                onPress={syncNow}
                disabled={isSyncing}
                style={[styles.inlineButton, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
                {isSyncing ? <ActivityIndicator size="small" color={ui.textPrimary} /> : <Ionicons name="cloud-upload-outline" size={16} color={ui.textPrimary} />}
                <ThemedText style={[styles.inlineButtonText, { color: ui.textPrimary }]}>Sincronizar</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.captureActions}>
              {!activeTrace ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={startRecording}
                  disabled={isStarting}
                  style={[styles.primaryButton, { backgroundColor: ui.accentPrimary }]}>
                  {isStarting ? <ActivityIndicator size="small" color="#04101b" /> : <Ionicons name="radio-outline" size={18} color="#04101b" />}
                  <ThemedText style={styles.primaryButtonText}>Iniciar grabacion</ThemedText>
                </TouchableOpacity>
              ) : activeTrace.status === 'paused' ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={resumeRecording}
                    style={[styles.primaryButton, { backgroundColor: ui.accentPrimary, flex: 1 }]}>
                    <Ionicons name="play-outline" size={18} color="#04101b" />
                    <ThemedText style={styles.primaryButtonText}>Reanudar</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={stopRecording}
                    style={[styles.secondaryButton, { borderColor: ui.dividerSoft, backgroundColor: ui.interactiveNeutral, flex: 1 }]}>
                    <Ionicons name="stop-outline" size={18} color={ui.textPrimary} />
                    <ThemedText style={[styles.secondaryButtonText, { color: ui.textPrimary }]}>Detener</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={pauseRecording}
                    style={[styles.secondaryButton, { borderColor: ui.dividerSoft, backgroundColor: ui.interactiveNeutral, flex: 1 }]}>
                    <Ionicons name="pause-outline" size={18} color={ui.textPrimary} />
                    <ThemedText style={[styles.secondaryButtonText, { color: ui.textPrimary }]}>Pausar</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={stopRecording}
                    style={[styles.primaryButton, { backgroundColor: ui.accentPrimary, flex: 1 }]}>
                    <Ionicons name="square-outline" size={18} color="#04101b" />
                    <ThemedText style={styles.primaryButtonText}>Guardar trayecto</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </GlassPanel>

          <GlassPanel variant="panel">
            <View style={styles.cardHeader}>
              <ThemedText style={[styles.cardTitle, { color: ui.textPrimary }]}>3. Trazas locales</ThemedText>
              <StatusPill label={`${localTraces.length} guardadas`} tone="neutral" />
            </View>

            <View style={styles.traceList}>
              {localTraces.length ? (
                localTraces.map((trace) => (
                  <View key={trace.localId} style={[styles.traceCard, { backgroundColor: ui.surfaceElevated, borderColor: ui.dividerSoft }]}>
                    <View style={styles.traceTop}>
                      <View style={styles.routeCopy}>
                        <ThemedText style={[styles.routeName, { color: ui.textPrimary }]}>{trace.routeName}</ThemedText>
                        <ThemedText style={[styles.routeMeta, { color: ui.textSecondary }]}>
                          {[trace.routeCode, trace.direction !== 'sin_definir' ? trace.direction : null, formatDate(trace.createdAt)].filter(Boolean).join(' | ')}
                        </ThemedText>
                      </View>
                      <StatusPill label={getTraceStatusLabel(trace.status)} tone={getTraceTone(trace.status)} />
                    </View>

                    <View style={styles.traceMetaRow}>
                      <StatusPill label={`${trace.points.length} puntos`} tone="neutral" />
                      <StatusPill label={formatDuration(trace.startedAt, trace.endedAt)} tone="neutral" />
                      {trace.uploadedSessionId ? <StatusPill label={`Remote #${trace.uploadedSessionId}`} tone="success" /> : null}
                    </View>

                    {trace.lastError ? (
                      <ThemedText style={[styles.errorText, { color: ui.accentDanger }]}>{trace.lastError}</ThemedText>
                    ) : null}

                    <View style={styles.traceActions}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        activeOpacity={0.84}
                        onPress={() => removeTrace(trace)}
                        style={[styles.smallButton, { backgroundColor: 'transparent', borderColor: `${ui.accentDanger}33` }]}>
                        <Ionicons name="trash-outline" size={15} color={ui.accentDanger} />
                        <ThemedText style={[styles.smallButtonText, { color: ui.accentDanger }]}>Eliminar</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <View style={[styles.emptyState, { borderColor: ui.dividerSoft, backgroundColor: ui.surfaceElevated }]}>
                  <ThemedText style={[styles.emptyTitle, { color: ui.textPrimary }]}>Aun no hay trazas</ThemedText>
                  <ThemedText style={[styles.emptyText, { color: ui.textSecondary }]}>Busca una ruta, inicia la grabacion y el trayecto quedara guardado aunque no tengas internet.</ThemedText>
                </View>
              )}
            </View>
          </GlassPanel>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 120, gap: 20 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroCopy: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.4 },
  heroSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 16, lineHeight: 20, fontWeight: '800' },
  inlineButton: {
    minHeight: 38,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineButtonText: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    lineHeight: 20,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 96,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 19,
  },
  selectedRouteCard: { borderWidth: 1, borderRadius: 18, padding: 14 },
  routeRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeCopy: { flex: 1, gap: 2 },
  routeName: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  routeMeta: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  resultsList: { gap: 10 },
  resultRow: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  directionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  directionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  directionChipText: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  captureActions: { gap: 12 },
  actionRow: { flexDirection: 'row', gap: 10 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: { color: '#04101b', fontSize: 15, lineHeight: 18, fontWeight: '800' },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: { fontSize: 15, lineHeight: 18, fontWeight: '800' },
  traceList: { gap: 12 },
  traceCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  traceTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  traceMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  errorText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  traceActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  smallButton: {
    minHeight: 38,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smallButtonText: { fontSize: 12, lineHeight: 15, fontWeight: '700' },
  emptyState: { borderWidth: 1, borderRadius: 22, padding: 20, gap: 8 },
  emptyTitle: { fontSize: 16, lineHeight: 20, fontWeight: '800' },
  emptyText: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
});
