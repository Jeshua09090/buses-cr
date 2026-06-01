import { DepthBackground } from '@/components/home/DepthBackground';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import {
  listMyStopReports,
  StopReportDirection,
  StopReportSummary,
  StopReportType,
  submitStopReport,
} from '@/lib/stop-reports';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const REPORT_TYPE_OPTIONS: { id: StopReportType; label: string; helper: string }[] = [
  { id: 'missing_stop', label: 'Falta parada', helper: 'No aparece una parada que si existe o te falta para poder planear bien el viaje.' },
  { id: 'stop_moved', label: 'Parada movida', helper: 'La parada existe, pero el pin actual esta corrido o en el lado equivocado.' },
  { id: 'stop_name_error', label: 'Nombre incorrecto', helper: 'El nombre actual no coincide con la realidad del barrio, calle o terminal.' },
  { id: 'stop_removed', label: 'Ya no existe', helper: 'La parada fue eliminada, ya no se usa o el bus dejo de recoger ahi.' },
  { id: 'route_change', label: 'Cambio de ruta', helper: 'El recorrido cambio, dobla distinto, ya no pasa por aqui o usa otras paradas.' },
  { id: 'other', label: 'Otro', helper: 'Cualquier observacion de campo que quieras dejar para revisar despues.' },
];
const DIRECTION_OPTIONS: { id: StopReportDirection; label: string }[] = [
  { id: 'sin_definir', label: 'Sin definir' },
  { id: 'ida', label: 'Ida' },
  { id: 'vuelta', label: 'Vuelta' },
  { id: 'ambos', label: 'Ambos' },
];
const DEFAULT_REPORT_COORDINATES: [number, number] = [-83.9189, 9.8648];
const MAPBOX_PUBLIC_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

if (MAPBOX_PUBLIC_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_PUBLIC_TOKEN);
}

type ReportScreenParams = {
  reportType?: string | string[];
  reportedStopName?: string | string[];
  suggestedRouteName?: string | string[];
  reportedRouteCode?: string | string[];
  reportedDirection?: string | string[];
  contextOriginName?: string | string[];
  contextDestinationName?: string | string[];
  contextRouteName?: string | string[];
  contextRouteCode?: string | string[];
};

function getParamValue(value?: string | string[]) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function isStopReportType(value: string): value is StopReportType {
  return REPORT_TYPE_OPTIONS.some((option) => option.id === value);
}

function isStopReportDirection(value: string): value is StopReportDirection {
  return DIRECTION_OPTIONS.some((option) => option.id === value);
}

function getReportTypeLabel(reportType: StopReportType) {
  return REPORT_TYPE_OPTIONS.find((option) => option.id === reportType)?.label ?? 'Reporte';
}

function getDirectionLabel(direction?: StopReportDirection | null) {
  if (direction === 'ida') return 'Ida';
  if (direction === 'vuelta') return 'Vuelta';
  if (direction === 'ambos') return 'Ambos';
  return 'Sin definir';
}

function getStatusTone(status: StopReportSummary['status']) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected') return 'warning' as const;
  return 'neutral' as const;
}

function getStatusLabel(status: StopReportSummary['status']) {
  if (status === 'approved') return 'Aprobado';
  if (status === 'rejected') return 'Rechazado';
  if (status === 'reviewed') return 'Revisado';
  return 'Pendiente';
}

function formatRelativeDate(value: string) {
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

function buildRecentReportReference(report: StopReportSummary) {
  const pieces = [report.reportedStopName, report.suggestedRouteName, report.reportedRouteCode]
    .map((value) => value?.trim())
    .filter(Boolean);

  if (report.reportedDirection && report.reportedDirection !== 'sin_definir') {
    pieces.push(getDirectionLabel(report.reportedDirection));
  }

  return pieces[0] ? pieces.join(' | ') : 'Reporte sin referencia';
}

export default function ReportStopScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<ReportScreenParams>();
  const ui = usePassengerUI();
  const { session } = useAuth();
  const initialReportTypeParam = getParamValue(params.reportType);
  const initialDirectionParam = getParamValue(params.reportedDirection);
  const [reportType, setReportType] = useState<StopReportType>(
    isStopReportType(initialReportTypeParam) ? initialReportTypeParam : 'missing_stop',
  );
  const [reportedStopName, setReportedStopName] = useState(getParamValue(params.reportedStopName));
  const [suggestedRouteName, setSuggestedRouteName] = useState(
    getParamValue(params.suggestedRouteName || params.contextRouteName),
  );
  const [reportedRouteCode, setReportedRouteCode] = useState(
    getParamValue(params.reportedRouteCode || params.contextRouteCode),
  );
  const [reportedDirection, setReportedDirection] = useState<StopReportDirection>(
    isStopReportDirection(initialDirectionParam) ? initialDirectionParam : 'sin_definir',
  );
  const [contextOriginName, setContextOriginName] = useState(getParamValue(params.contextOriginName));
  const [contextDestinationName, setContextDestinationName] = useState(getParamValue(params.contextDestinationName));
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_REPORT_COORDINATES);
  const [recentReports, setRecentReports] = useState<StopReportSummary[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  const selectedType = useMemo(
    () => REPORT_TYPE_OPTIONS.find((option) => option.id === reportType) ?? REPORT_TYPE_OPTIONS[0],
    [reportType],
  );
  const isRouteChangeReport = reportType === 'route_change';
  const routeReferenceLabel = isRouteChangeReport ? 'Ruta o ramal afectado' : 'Ruta relacionada';
  const routeReferencePlaceholder = isRouteChangeReport ? 'Ruta o ramal afectado' : 'Ruta relacionada (opcional)';
  const stopReferenceLabel = isRouteChangeReport ? 'Punto o parada de referencia' : 'Parada o referencia';
  const stopReferencePlaceholder = isRouteChangeReport
    ? 'Parada, esquina o punto donde notaste el cambio'
    : 'Nombre de la parada o referencia';
  const routeCodePlaceholder = 'Codigo de ruta (opcional)';
  const descriptionPlaceholder = isRouteChangeReport
    ? 'Describe el cambio: por donde pasa ahora, donde dejo de pasar, si cambio solo un sentido o si usa otras paradas.'
    : 'Describe lo que viste: falta parada, se movio, ya no recoge, el nombre esta mal, etc.';
  const mapHelperText = isRouteChangeReport
    ? 'Mueve el mapa y deja el pin en el punto donde cambia el recorrido, la parada afectada o una esquina clara de referencia.'
    : 'Mueve el mapa hasta dejar el pin justo sobre la parada o el punto del cambio.';

  const refreshLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Ubicacion no disponible', 'Activa la ubicacion para guardar el punto exacto del reporte.');
        setCoordinates(null);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const nextCoordinates = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      };
      setCoordinates(nextCoordinates);
      setMapCenter([nextCoordinates.lng, nextCoordinates.lat]);
    } catch {
      Alert.alert('No pudimos leer tu ubicacion', 'Prueba otra vez en unos segundos.');
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  const handleMapCameraChanged = useCallback((state: Mapbox.MapState) => {
    const center = state.properties?.center;
    if (!center) return;
    if (!state.gestures?.isGestureActive) return;

    const [lng, lat] = center;
    if (typeof lng !== 'number' || typeof lat !== 'number') return;

    setMapCenter([lng, lat]);
    setCoordinates({ lat, lng });
  }, []);

  const coordinateLabel = useMemo(() => {
    if (!coordinates) {
      return 'Mueve el mapa y deja el pin sobre el punto exacto, o usa tu ubicacion actual.';
    }

    return `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`;
  }, [coordinates]);

  const loadRecentReports = useCallback(async () => {
    if (!session?.user.id) {
      setRecentReports([]);
      return;
    }

    setIsLoadingReports(true);
    try {
      setRecentReports(await listMyStopReports(session.user.id, 5));
    } catch {
      setRecentReports([]);
    } finally {
      setIsLoadingReports(false);
    }
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      refreshLocation().catch(() => {});
      loadRecentReports().catch(() => {});
    }, [loadRecentReports, refreshLocation]),
  );

  const signInForReports = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Falta informacion', 'Escribe tu correo y tu contrasena para guardar reportes.');
      return;
    }

    setIsSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert('No pudimos iniciar sesion', error.message);
        return;
      }

      Alert.alert('Sesion lista', 'Ya puedes enviar reportes desde el telefono.');
    } finally {
      setIsSigningIn(false);
    }
  }, [email, password]);

  const submitReport = useCallback(async () => {
    if (!session?.user.id) {
      Alert.alert('Necesitas sesion', 'Inicia sesion para guardar tus reportes en Supabase.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Falta detalle', 'Describe que viste en campo para que luego lo podamos revisar.');
      return;
    }

    if (isRouteChangeReport && !suggestedRouteName.trim() && !reportedRouteCode.trim()) {
      Alert.alert('Falta la ruta', 'En un cambio de ruta conviene guardar al menos el nombre o el codigo del bus afectado.');
      return;
    }

    if (
      !isRouteChangeReport &&
      !reportedStopName.trim() &&
      (coordinates?.lat == null || coordinates?.lng == null)
    ) {
      Alert.alert('Falta referencia', 'Escribe la parada o deja el pin en el mapa para ubicar el reporte.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitStopReport({
        userId: session.user.id,
        reportType,
        description,
        reportedStopName,
        suggestedRouteName,
        reportedRouteCode,
        reportedDirection,
        latitude: coordinates?.lat ?? null,
        longitude: coordinates?.lng ?? null,
        contextOriginName,
        contextDestinationName,
        contextRouteName: suggestedRouteName,
        contextRouteCode: reportedRouteCode,
      });

      setDescription('');
      setReportedStopName('');
      await loadRecentReports();
      Alert.alert('Reporte enviado', 'Quedo guardado para revision posterior.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos guardar el reporte.';
      Alert.alert('Error al guardar', message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    contextDestinationName,
    contextOriginName,
    coordinates?.lat,
    coordinates?.lng,
    description,
    isRouteChangeReport,
    loadRecentReports,
    reportType,
    reportedDirection,
    reportedRouteCode,
    reportedStopName,
    session?.user.id,
    suggestedRouteName,
  ]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: ui.backgroundColor }]}>
      <DepthBackground
        topColor={ui.gradientTop}
        midColor={ui.gradientMid}
        bottomColor={ui.gradientBottom}
        accentColor={ui.accentPrimary}
      />

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.84}
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: ui.glassSubtle }]}>
            <Ionicons name="arrow-back" size={18} color={ui.textPrimary} />
          </TouchableOpacity>
          <StatusPill label={session ? 'Sesion activa' : 'Falta sesion'} tone={session ? 'success' : 'warning'} />
        </View>

        <ScreenHero
          title="Reportar parada o ruta"
          subtitle="Usa esta pantalla en campo para mapear paradas faltantes, mover pins o dejar cambios de recorrido cuando el bus ya no pasa igual."
          topRow={
            <>
              <StatusPill label={selectedType.label} tone="accent" />
              <StatusPill
                label={coordinates ? 'Ubicacion lista' : 'Sin ubicacion'}
                tone={coordinates ? 'success' : 'warning'}
              />
            </>
          }
        />

        {!session ? (
          <GlassPanel variant="panel">
            <View style={styles.formGroup}>
              <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>Inicia sesion para reportar</ThemedText>
              <ThemedText style={[styles.helperText, { color: ui.textSecondary }]}>
                Usa tu cuenta de Supabase para que los reportes queden asociados a ti.
              </ThemedText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="tu-correo@dominio.com"
                placeholderTextColor={ui.textSecondary}
                style={[styles.input, { color: ui.textPrimary, backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Contrasena"
                placeholderTextColor={ui.textSecondary}
                style={[styles.input, { color: ui.textPrimary, backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}
              />
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.84}
                onPress={signInForReports}
                disabled={isSigningIn}
                style={[styles.primaryButton, { backgroundColor: ui.accentPrimary, opacity: isSigningIn ? 0.7 : 1 }]}>
                <ThemedText style={styles.primaryButtonText}>
                  {isSigningIn ? 'Iniciando...' : 'Iniciar sesion'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </GlassPanel>
        ) : null}

        <GlassPanel variant="hero">
          <View style={styles.formGroup}>
            <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>Nuevo reporte</ThemedText>
            <ThemedText style={[styles.helperText, { color: ui.textSecondary }]}>
              {selectedType.helper}
            </ThemedText>

            <View style={styles.typeGrid}>
              {REPORT_TYPE_OPTIONS.map((option) => {
                const selected = option.id === reportType;
                return (
                  <TouchableOpacity
                    key={option.id}
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={() => setReportType(option.id)}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: selected ? ui.interactiveAccent : ui.glassSubtle,
                        borderColor: selected ? `${ui.accentPrimary}40` : ui.dividerSoft,
                      },
                    ]}>
                    <ThemedText style={[styles.typeChipText, { color: selected ? ui.accentPrimary : ui.textPrimary }]}>
                      {option.label}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.formSection}>
              <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>Sentido</ThemedText>
              <View style={styles.typeGrid}>
                {DIRECTION_OPTIONS.map((option) => {
                  const selected = option.id === reportedDirection;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      accessibilityRole="button"
                      activeOpacity={0.84}
                      onPress={() => setReportedDirection(option.id)}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: selected ? ui.interactiveAccent : ui.glassSubtle,
                          borderColor: selected ? `${ui.accentPrimary}40` : ui.dividerSoft,
                        },
                      ]}>
                      <ThemedText style={[styles.typeChipText, { color: selected ? ui.accentPrimary : ui.textPrimary }]}>
                        {option.label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.formSection}>
              <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>{stopReferenceLabel}</ThemedText>
              <TextInput
                value={reportedStopName}
                onChangeText={setReportedStopName}
                placeholder={stopReferencePlaceholder}
                placeholderTextColor={ui.textSecondary}
                style={[styles.input, { color: ui.textPrimary, backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}
              />
            </View>

            <View style={styles.doubleInputRow}>
              <View style={styles.doubleInputCell}>
                <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>{routeReferenceLabel}</ThemedText>
                <TextInput
                  value={suggestedRouteName}
                  onChangeText={setSuggestedRouteName}
                  placeholder={routeReferencePlaceholder}
                  placeholderTextColor={ui.textSecondary}
                  style={[styles.input, { color: ui.textPrimary, backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}
                />
              </View>
              <View style={styles.doubleInputCell}>
                <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>Codigo</ThemedText>
                <TextInput
                  value={reportedRouteCode}
                  onChangeText={setReportedRouteCode}
                  autoCapitalize="characters"
                  placeholder={routeCodePlaceholder}
                  placeholderTextColor={ui.textSecondary}
                  style={[styles.input, { color: ui.textPrimary, backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}
                />
              </View>
            </View>

            {isRouteChangeReport ? (
              <View style={styles.doubleInputRow}>
                <View style={styles.doubleInputCell}>
                  <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>Origen de referencia</ThemedText>
                  <TextInput
                    value={contextOriginName}
                    onChangeText={setContextOriginName}
                    placeholder="Ej: Taras, Cartago centro"
                    placeholderTextColor={ui.textSecondary}
                    style={[styles.input, { color: ui.textPrimary, backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}
                  />
                </View>
                <View style={styles.doubleInputCell}>
                  <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>Destino de referencia</ThemedText>
                  <TextInput
                    value={contextDestinationName}
                    onChangeText={setContextDestinationName}
                    placeholder="Ej: Tejar, San Rafael"
                    placeholderTextColor={ui.textSecondary}
                    style={[styles.input, { color: ui.textPrimary, backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.formSection}>
              <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>Que viste</ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
                placeholder={descriptionPlaceholder}
                placeholderTextColor={ui.textSecondary}
                style={[
                  styles.textarea,
                  { color: ui.textPrimary, backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft },
                ]}
              />
            </View>

            <View style={styles.mapSection}>
              <View style={styles.mapSectionHeader}>
                <View style={styles.flexOne}>
                  <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>Pin del reporte</ThemedText>
                  <ThemedText style={[styles.helperText, { color: ui.textSecondary }]}>
                    {mapHelperText}
                  </ThemedText>
                </View>
                <StatusPill label="Pin centrado" tone="neutral" />
              </View>

              {MAPBOX_PUBLIC_TOKEN ? (
                <View style={[styles.mapCard, { backgroundColor: ui.surfaceInset, borderColor: ui.dividerSoft }]}>
                  <Mapbox.MapView
                    style={styles.map}
                    styleURL={Mapbox.StyleURL.Dark}
                    compassEnabled={false}
                    logoEnabled={false}
                    attributionEnabled={false}
                    scaleBarEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    onCameraChanged={handleMapCameraChanged}>
                    <Mapbox.Camera
                      centerCoordinate={mapCenter}
                      zoomLevel={15.2}
                      animationMode="flyTo"
                      animationDuration={coordinates ? 450 : 900}
                    />
                    <Mapbox.UserLocation visible />
                  </Mapbox.MapView>

                  <View pointerEvents="none" style={styles.mapPinOverlay}>
                    <View style={[styles.mapPinShadow, { backgroundColor: `${ui.accentPrimary}22` }]} />
                    <View style={[styles.mapPin, { backgroundColor: ui.accentPrimary }]}>
                      <Ionicons name="location" size={18} color="#FFFFFF" />
                    </View>
                    <View style={[styles.mapPinStem, { backgroundColor: `${ui.accentPrimary}78` }]} />
                    <View style={[styles.mapPinTarget, { borderColor: `${ui.accentPrimary}66` }]} />
                  </View>
                </View>
              ) : (
                <View style={[styles.mapUnavailable, { backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}>
                  <Ionicons name="map-outline" size={18} color={ui.textSecondary} />
                  <ThemedText style={[styles.helperText, { color: ui.textSecondary }]}>
                    Falta configurar el token publico de Mapbox para mostrar el mapa en esta pantalla.
                  </ThemedText>
                </View>
              )}
            </View>

            <View style={styles.locationRow}>
              <View style={styles.flexOne}>
                <ThemedText style={[styles.helperLabel, { color: ui.textSecondary }]}>Ubicacion del reporte</ThemedText>
                <ThemedText style={[styles.helperText, { color: ui.textPrimary }]}>
                  {coordinateLabel}
                </ThemedText>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.84}
                onPress={refreshLocation}
                disabled={isLoadingLocation}
                style={[styles.inlineButton, { backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}>
                <Ionicons name="locate-outline" size={15} color={ui.accentPrimary} />
                <ThemedText style={[styles.inlineButtonText, { color: ui.accentPrimary }]}>
                  {isLoadingLocation ? 'Leyendo...' : 'Mi ubicacion'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={submitReport}
              disabled={isSubmitting || !session}
              style={[styles.primaryButton, { backgroundColor: ui.accentPrimary, opacity: isSubmitting || !session ? 0.7 : 1 }]}>
              <ThemedText style={styles.primaryButtonText}>
                {isSubmitting ? 'Enviando...' : 'Guardar reporte'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </GlassPanel>

        <GlassPanel variant="panel">
          <View style={styles.formGroup}>
            <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>Tus ultimos reportes</ThemedText>
            {isLoadingReports ? (
              <ThemedText style={[styles.helperText, { color: ui.textSecondary }]}>Cargando historial...</ThemedText>
            ) : recentReports.length === 0 ? (
              <ThemedText style={[styles.helperText, { color: ui.textSecondary }]}>
                Aun no hay reportes guardados con esta sesion.
              </ThemedText>
            ) : (
              <View style={styles.historyList}>
                {recentReports.map((report, index) => (
                  <View
                    key={report.id}
                    style={[
                      styles.historyRow,
                      { borderBottomColor: ui.dividerSoft },
                      index < recentReports.length - 1 ? styles.historyRowBorder : null,
                    ]}>
                    <View style={styles.flexOne}>
                      <ThemedText style={[styles.historyTitle, { color: ui.textPrimary }]}>
                        {getReportTypeLabel(report.reportType)}
                      </ThemedText>
                      <ThemedText style={[styles.helperText, { color: ui.textSecondary }]}>
                        {buildRecentReportReference(report)} | {formatRelativeDate(report.createdAt)}
                      </ThemedText>
                    </View>
                    <StatusPill label={getStatusLabel(report.status)} tone={getStatusTone(report.status)} />
                  </View>
                ))}
              </View>
            )}
          </View>
        </GlassPanel>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formGroup: { gap: 12 },
  formSection: { gap: 8 },
  sectionTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800' },
  helperLabel: { fontSize: 11, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  helperText: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    minHeight: 38,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
  doubleInputRow: { flexDirection: 'row', gap: 10 },
  doubleInputCell: { flex: 1, gap: 8 },
  textarea: {
    minHeight: 120,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  mapSection: { gap: 10 },
  mapSectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mapCard: {
    height: 280,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  map: { flex: 1 },
  mapPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinShadow: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    bottom: '50%',
    marginBottom: -10,
  },
  mapPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -18 }],
  },
  mapPinStem: {
    width: 2,
    height: 18,
    borderRadius: 999,
    marginTop: -20,
  },
  mapPinTarget: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    marginTop: -2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  mapUnavailable: {
    minHeight: 110,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flexOne: { flex: 1 },
  inlineButton: {
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineButtonText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  primaryButton: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  historyList: { gap: 0 },
  historyRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  historyRowBorder: { borderBottomWidth: 1 },
  historyTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
});
