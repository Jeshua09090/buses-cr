import { DepthBackground } from '@/components/home/DepthBackground';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { getActualRouteStops } from '@/lib/journey-planner';
import { resolveRoute } from '@/lib/routes';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type PlannerDebugPayload = {
  origin?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number } | null;
  destinationName?: string | null;
  destinationAddress?: string | null;
  tripDistanceMeters?: number | null;
  score?: number | null;
  displayScore?: number | null;
  contextPenalty?: number | null;
  progressMetrics?: {
    straightLineDistanceMeters?: number | null;
    firstLegDestinationDistanceMeters?: number | null;
    finalStopDestinationDistanceMeters?: number | null;
    firstLegProgressMeters?: number | null;
    firstLegProgressRatio?: number | null;
    firstLegBacktrackMeters?: number | null;
    totalWalkRatio?: number | null;
    transferWalkRatio?: number | null;
    hasStopGeometry?: boolean | null;
  } | null;
  kind?: string | null;
  routeIds?: number[];
  routeCodes?: string[];
  legs?: {
    routeId?: number | null;
    routeName?: string | null;
    routeCode?: string | null;
    direction?: string | null;
    boardStopId?: number | null;
    boardStopName?: string | null;
    alightStopId?: number | null;
    alightStopName?: string | null;
    boardStopLat?: number | null;
    boardStopLng?: number | null;
    alightStopLat?: number | null;
    alightStopLng?: number | null;
  }[];
};

function encodePlannerDebugLegSegments(plannerDebug: PlannerDebugPayload | null) {
  if (!plannerDebug?.legs?.length) return '';

  return plannerDebug.legs
    .map((leg) => {
      const values = [
        leg.routeId,
        leg.boardStopId,
        leg.alightStopId,
        leg.boardStopLng,
        leg.boardStopLat,
        leg.alightStopLng,
        leg.alightStopLat,
      ].map(Number);

      return values.every(Number.isFinite) ? values.join(',') : null;
    })
    .filter((value): value is string => Boolean(value))
    .join(';');
}

export default function TripDetailsScreen() {
  const router = useRouter();
  const ui = usePassengerUI();
  const params = useLocalSearchParams<{
    routeId?: string;
    routeIds?: string;
    routeName?: string;
    routeCode?: string;
    fareLabel?: string;
    etaLabel?: string;
    confidenceLabel?: string;
    walkLabel?: string;
    boardLabel?: string;
    dropLabel?: string;
    operatorLabel?: string;
    destinationName?: string;
    journeyKind?: string;
    transferLabel?: string;
    journeyLegSegments?: string;
    plannerDebug?: string;
  }>();

  const resolvedRoute = resolveRoute(params.routeId, params.routeName);
  const routeIdAsNumber = useMemo(() => {
    const parsed = Number(params.routeId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [params.routeId]);
  const plannerDebug = useMemo<PlannerDebugPayload | null>(() => {
    if (!params.plannerDebug) return null;

    try {
      return JSON.parse(params.plannerDebug) as PlannerDebugPayload;
    } catch {
      return null;
    }
  }, [params.plannerDebug]);
  const [actualStops, setActualStops] = useState<{ id: string; name: string }[]>([]);
  const highlightedLeg = useMemo(() => {
    if (!plannerDebug?.legs?.length) return null;
    return plannerDebug.legs[plannerDebug.legs.length - 1] ?? null;
  }, [plannerDebug]);
  const journeyLegSegmentsParam = params.journeyLegSegments || encodePlannerDebugLegSegments(plannerDebug);
  const hasTransfer = params.journeyKind === 'transfer' || Boolean(params.transferLabel);
  const routeSectionTitle = hasTransfer ? 'Paradas del primer tramo' : 'Paradas clave';
  const supportNote = hasTransfer
    ? params.transferLabel
      ? params.confidenceLabel
        ? `${params.transferLabel} | ${params.confidenceLabel}`
        : params.transferLabel
      : params.confidenceLabel || params.operatorLabel || 'Sigue el mapa para completar el cambio de bus.'
    : params.confidenceLabel || params.operatorLabel || 'Usa el mapa para seguir las unidades activas en esta ruta.';

  useEffect(() => {
    let isCancelled = false;

    if (!routeIdAsNumber) {
      setActualStops([]);
      return () => {
        isCancelled = true;
      };
    }

    getActualRouteStops(routeIdAsNumber)
      .then((stops) => {
        if (!isCancelled) {
          setActualStops(
            stops.map((stop) => ({
              id: String(stop.parada_id),
              name: stop.nombre ?? 'Parada',
            })),
          );
        }
      })
      .catch(() => {
        if (!isCancelled) setActualStops([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [routeIdAsNumber]);

  const detailStops = actualStops.length > 0 ? actualStops : resolvedRoute.stops.map((stop) => ({
    id: stop.id,
    name: stop.name,
  }));

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
          <StatusPill label="Detalle" tone="accent" />
        </View>

        <ScreenHero
          title={params.routeName || resolvedRoute.name}
          subtitle={params.destinationName
            ? hasTransfer
              ? `Viaje con transbordo para llegar a ${params.destinationName}.`
              : `Mejor lectura para llegar a ${params.destinationName}.`
            : hasTransfer
              ? 'Resumen del trayecto, el cambio de bus y acceso rapido al mapa.'
              : 'Resumen del trayecto, sus paradas y acceso rapido al mapa.'}
        />

        <GlassPanel variant="raised">
          <View style={styles.pillRow}
          >
            {params.etaLabel ? <StatusPill label={params.etaLabel} icon="time-outline" tone="live" /> : null}
            {params.walkLabel ? <StatusPill label={params.walkLabel} icon="walk-outline" tone="accent" /> : null}
            {params.fareLabel ? <StatusPill label={params.fareLabel} icon="cash-outline" tone="neutral" /> : null}
            <StatusPill
              label={hasTransfer ? '1 transbordo' : 'Directo'}
              icon={hasTransfer ? 'swap-horizontal-outline' : 'flag-outline'}
              tone={hasTransfer ? 'warning' : 'accent'}
            />
          </View>

          <View style={styles.metaGrid}>
            <View style={[styles.metaCell, { backgroundColor: ui.glassSubtle }]}>
              <ThemedText style={[styles.metaLabel, { color: ui.textSecondary }]}>Subida</ThemedText>
              <ThemedText style={[styles.metaValue, { color: ui.textPrimary }]}>{params.boardLabel || 'Consulta el origen en mapa'}</ThemedText>
            </View>
            <View style={[styles.metaCell, { backgroundColor: ui.glassSubtle }]}>
              <ThemedText style={[styles.metaLabel, { color: ui.textSecondary }]}>Bajada</ThemedText>
              <ThemedText style={[styles.metaValue, { color: ui.textPrimary }]}>{params.dropLabel || 'Consulta el destino en mapa'}</ThemedText>
            </View>
          </View>

          <ThemedText style={[styles.note, { color: ui.textSecondary }]}>
            {supportNote}
          </ThemedText>

          <View style={styles.actionRow}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/explore',
                  params: {
                    routeId: params.routeId ?? '',
                    routeIds: params.routeIds ?? '',
                    routeName: params.routeName ?? resolvedRoute.name,
                    routeCode: params.routeCode ?? '',
                    journeyKind: params.journeyKind ?? '',
                    transferLabel: params.transferLabel ?? '',
                    walkLabel: params.walkLabel ?? '',
                    boardLabel: params.boardLabel ?? '',
                    dropLabel: params.dropLabel ?? '',
                    journeyLegSegments: journeyLegSegmentsParam,
                    destinationName: params.destinationName ?? '',
                    selectedStopId:
                      highlightedLeg?.alightStopId != null ? String(highlightedLeg.alightStopId) : '',
                    selectedStopLat:
                      typeof highlightedLeg?.alightStopLat === 'number'
                        ? String(highlightedLeg.alightStopLat)
                        : '',
                    selectedStopLng:
                      typeof highlightedLeg?.alightStopLng === 'number'
                        ? String(highlightedLeg.alightStopLng)
                        : '',
                    selectedStopName: highlightedLeg?.alightStopName ?? params.dropLabel ?? '',
                  },
                })
              }
              style={[styles.mapButton, styles.primaryAction, { backgroundColor: ui.accentPrimary }]}>
              <Ionicons name="map-outline" size={16} color="#FFFFFF" />
              <ThemedText style={styles.mapButtonText}>Abrir en mapa</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() =>
                router.push({
                  pathname: '/report-stop',
                  params: {
                    reportType: 'route_change',
                    suggestedRouteName: params.routeName ?? resolvedRoute.name,
                    reportedRouteCode: params.routeCode ?? '',
                    reportedDirection: plannerDebug?.legs?.[0]?.direction ?? 'sin_definir',
                    reportedStopName: params.boardLabel ?? '',
                    contextOriginName: params.boardLabel ?? '',
                    contextDestinationName: params.destinationName ?? '',
                    contextRouteName: params.routeName ?? resolvedRoute.name,
                    contextRouteCode: params.routeCode ?? '',
                  },
                })
              }
              style={[
                styles.mapButton,
                styles.secondaryAction,
                { backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft },
              ]}>
              <Ionicons name="flag-outline" size={16} color={ui.textPrimary} />
              <ThemedText style={[styles.secondaryActionText, { color: ui.textPrimary }]}>Reportar cambio</ThemedText>
            </TouchableOpacity>
          </View>
        </GlassPanel>

        {__DEV__ && plannerDebug ? (
          <GlassPanel variant="panel">
            <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>Debug del planner</ThemedText>
            <View style={styles.debugList}>
              <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                Destino resuelto: {plannerDebug.destinationName || params.destinationName || 'Sin destino'}
              </ThemedText>
              {plannerDebug.destinationAddress ? (
                <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                  Direccion: {plannerDebug.destinationAddress}
                </ThemedText>
              ) : null}
              {plannerDebug.origin ? (
                <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                  Origen: {plannerDebug.origin.lat.toFixed(5)}, {plannerDebug.origin.lng.toFixed(5)}
                </ThemedText>
              ) : null}
              {plannerDebug.destination ? (
                <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                  Punto destino: {plannerDebug.destination.lat.toFixed(5)}, {plannerDebug.destination.lng.toFixed(5)}
                </ThemedText>
              ) : null}
              {typeof plannerDebug.tripDistanceMeters === 'number' ? (
                <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                  Distancia en linea recta: {Math.round(plannerDebug.tripDistanceMeters)} m
                </ThemedText>
              ) : null}
              {typeof plannerDebug.score === 'number' ? (
                <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                  Score planner: {plannerDebug.score.toFixed(2)}
                </ThemedText>
              ) : null}
              {typeof plannerDebug.displayScore === 'number' ? (
                <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                  Score final UI: {plannerDebug.displayScore.toFixed(2)}
                </ThemedText>
              ) : null}
              {typeof plannerDebug.contextPenalty === 'number' ? (
                <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                  Castigo contextual: {plannerDebug.contextPenalty.toFixed(2)}
                </ThemedText>
              ) : null}
              {plannerDebug.progressMetrics ? (
                <View style={[styles.debugLeg, { borderColor: ui.dividerSoft, backgroundColor: ui.glassSubtle }]}>
                  <ThemedText style={[styles.debugLegTitle, { color: ui.textPrimary }]}>
                    Senales de progreso
                  </ThemedText>
                  <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                    Distancia base: {Math.round(plannerDebug.progressMetrics.straightLineDistanceMeters ?? 0)} m
                  </ThemedText>
                  {typeof plannerDebug.progressMetrics.firstLegDestinationDistanceMeters === 'number' ? (
                    <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                      Distancia al destino tras tramo 1: {Math.round(plannerDebug.progressMetrics.firstLegDestinationDistanceMeters)} m
                    </ThemedText>
                  ) : null}
                  {typeof plannerDebug.progressMetrics.firstLegProgressMeters === 'number' ? (
                    <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                      Progreso del tramo 1: {Math.round(plannerDebug.progressMetrics.firstLegProgressMeters)} m
                    </ThemedText>
                  ) : null}
                  {typeof plannerDebug.progressMetrics.firstLegProgressRatio === 'number' ? (
                    <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                      Ratio progreso tramo 1: {(plannerDebug.progressMetrics.firstLegProgressRatio * 100).toFixed(1)}%
                    </ThemedText>
                  ) : null}
                  {typeof plannerDebug.progressMetrics.firstLegBacktrackMeters === 'number' ? (
                    <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                      Backtracking tramo 1: {Math.round(plannerDebug.progressMetrics.firstLegBacktrackMeters)} m
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}
              {plannerDebug.legs?.map((leg, index) => (
                <View
                  key={`planner-leg-${index + 1}-${leg.routeId ?? 'na'}`}
                  style={[styles.debugLeg, { borderColor: ui.dividerSoft, backgroundColor: ui.glassSubtle }]}>
                  <ThemedText style={[styles.debugLegTitle, { color: ui.textPrimary }]}>
                    Tramo {index + 1}: {leg.routeName || leg.routeCode || 'Ruta disponible'}
                  </ThemedText>
                  <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                    Ruta ID: {leg.routeId ?? 'n/a'} | Sentido: {leg.direction ?? 'n/a'}
                  </ThemedText>
                  <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                    Subida: {leg.boardStopName || 'n/a'} ({leg.boardStopId ?? 'n/a'})
                  </ThemedText>
                  <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                    Bajada: {leg.alightStopName || 'n/a'} ({leg.alightStopId ?? 'n/a'})
                  </ThemedText>
                  {typeof leg.alightStopLat === 'number' && typeof leg.alightStopLng === 'number' ? (
                    <ThemedText style={[styles.debugLine, { color: ui.textSecondary }]}>
                      Punto bajada: {leg.alightStopLat.toFixed(5)}, {leg.alightStopLng.toFixed(5)}
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </View>
          </GlassPanel>
        ) : null}

        <GlassPanel variant="elevated">
          <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>{routeSectionTitle}</ThemedText>
          <View style={styles.stopList}>
            {detailStops.map((stop, index) => (
              <View key={stop.id} style={[styles.stopRow, index < detailStops.length - 1 && { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
                <View style={[styles.stopDot, { backgroundColor: ui.accentPrimary }]} />
                <ThemedText style={[styles.stopText, { color: ui.textPrimary }]}>{stop.name}</ThemedText>
              </View>
            ))}
          </View>
        </GlassPanel>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaGrid: { flexDirection: 'row', gap: 8 },
  metaCell: { flex: 1, borderRadius: 18, padding: 12, gap: 2 },
  metaLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  metaValue: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  actionRow: { flexDirection: 'row', gap: 10 },
  mapButton: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryAction: { flex: 1.15 },
  secondaryAction: { flex: 0.9, borderWidth: 1 },
  mapButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
  secondaryActionText: { fontSize: 13, lineHeight: 17, fontWeight: '800' },
  sectionTitle: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  debugList: { gap: 10 },
  debugLeg: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  debugLegTitle: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  debugLine: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  stopList: { gap: 0 },
  stopRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopDot: { width: 10, height: 10, borderRadius: 5 },
  stopText: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
});
