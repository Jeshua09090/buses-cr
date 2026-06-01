import { DepthBackground } from '@/components/home/DepthBackground';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { useLiveFleetSnapshot } from '@/hooks/use-live-fleet-snapshot';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { buildServiceStateSummary } from '@/lib/trip-presentation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ServiceStatusScreen() {
  const router = useRouter();
  const ui = usePassengerUI();
  const { buses, freshBuses, staleBuses } = useLiveFleetSnapshot();

  const serviceState = buildServiceStateSummary({
    liveBuses: freshBuses.length,
    staleBuses: staleBuses.length,
    activeAlerts: 0,
    hasSelection: false,
    loadingRoutes: false,
  });
  const freshBusIds = useMemo(() => new Set(freshBuses.map((bus) => bus.id)), [freshBuses]);

  const routeGroups = useMemo(() => {
    const counts = new Map<string, { routeName: string; live: number; stale: number }>();

    buses.forEach((bus) => {
      const key = (bus.routeId || bus.route || 'ruta') as string;
      const current = counts.get(key) ?? { routeName: bus.route || 'Ruta disponible', live: 0, stale: 0 };
      if (freshBusIds.has(bus.id)) {
        current.live += 1;
      } else {
        current.stale += 1;
      }
      counts.set(key, current);
    });

    return [...counts.entries()]
      .map(([key, value]) => ({ id: key, ...value }))
      .sort((a, b) => b.live - a.live || a.routeName.localeCompare(b.routeName, 'es-CR'))
      .slice(0, 4);
  }, [buses, freshBusIds]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: ui.backgroundColor }]}>
      <DepthBackground
        topColor={ui.gradientTop}
        midColor={ui.gradientMid}
        bottomColor={ui.gradientBottom}
        accentColor={ui.accentSuccess}
        variant="content"
        showOrbs={false}
      />

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.84}
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: ui.glassSubtle, borderColor: ui.dividerSoft }]}>
            <Ionicons name="arrow-back" size={18} color={ui.textPrimary} />
          </TouchableOpacity>
          <StatusPill label={serviceState.liveLabel} tone={serviceState.tone} />
        </View>

        <ScreenHero
          title="Estado del servicio"
          subtitle="Lectura rapida de cobertura, unidades activas y senal reciente para moverte con mas contexto."
          topRow={
            <>
              <StatusPill label={serviceState.coverageLabel} tone={serviceState.tone} />
              <StatusPill label={`${staleBuses.length} sin senal`} tone={staleBuses.length > 0 ? 'warning' : 'neutral'} />
            </>
          }
        />

        <GlassPanel variant="hero">
          <View style={styles.heroRow}>
            <View style={styles.flexOne}>
              <ThemedText style={[styles.heroTitle, { color: ui.textPrimary }]}>{serviceState.title}</ThemedText>
              <ThemedText style={[styles.heroSubtitle, { color: ui.textSecondary }]}>{serviceState.detail}</ThemedText>
            </View>
            <View style={[styles.heroBadge, { backgroundColor: ui.statusLive, borderColor: `${ui.accentSuccess}22` }]}>
              <Ionicons name="pulse-outline" size={18} color={ui.accentSuccess} />
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: ui.surfaceInset, borderColor: ui.dividerSoft }]}>
              <ThemedText style={[styles.statLabel, { color: ui.textSecondary }]}>En vivo</ThemedText>
              <ThemedText style={[styles.statValue, { color: ui.accentSuccess }]}>{freshBuses.length}</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: ui.surfaceInset, borderColor: ui.dividerSoft }]}>
              <ThemedText style={[styles.statLabel, { color: ui.textSecondary }]}>Sin senal</ThemedText>
              <ThemedText style={[styles.statValue, { color: ui.accentWarning }]}>{staleBuses.length}</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: ui.surfaceInset, borderColor: ui.dividerSoft }]}>
              <ThemedText style={[styles.statLabel, { color: ui.textSecondary }]}>Total</ThemedText>
              <ThemedText style={[styles.statValue, { color: ui.textPrimary }]}>{buses.length}</ThemedText>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() => router.push('/(tabs)/explore')}
              style={[styles.primaryAction, { backgroundColor: ui.accentPrimary }]}>
              <Ionicons name="map-outline" size={15} color="#FFFFFF" />
              <ThemedText style={styles.primaryActionText}>Abrir mapa</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() => router.push('/settings')}
              style={[styles.secondaryAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
              <Ionicons name="settings-outline" size={15} color={ui.textPrimary} />
              <ThemedText style={[styles.secondaryActionText, { color: ui.textPrimary }]}>Permisos</ThemedText>
            </TouchableOpacity>
          </View>
        </GlassPanel>

        <GlassPanel variant="panel">
          <ThemedText style={[styles.sectionTitle, { color: ui.textPrimary }]}>Rutas con movimiento</ThemedText>
          {routeGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, { backgroundColor: ui.interactiveNeutral }]}>
                <Ionicons name="bus-outline" size={20} color={ui.textSecondary} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: ui.textPrimary }]}>Aun sin actividad reciente</ThemedText>
              <ThemedText style={[styles.emptyText, { color: ui.textSecondary }]}>
                Cuando lleguen unidades al canal en vivo, este panel te dira cuales rutas se estan moviendo.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.routeList}>
              {routeGroups.map((route, index) => (
                <TouchableOpacity
                  key={route.id}
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={() => router.push({ pathname: '/(tabs)/explore', params: { routeId: route.id, routeName: route.routeName } })}
                  style={[styles.routeRow, index < routeGroups.length - 1 && { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
                  <View style={[styles.routeIconWrap, { backgroundColor: ui.interactiveAccent }]}>
                    <Ionicons name="git-compare-outline" size={16} color={ui.accentPrimary} />
                  </View>
                  <View style={styles.flexOne}>
                    <ThemedText style={[styles.routeTitle, { color: ui.textPrimary }]} numberOfLines={1}>
                      {route.routeName}
                    </ThemedText>
                    <ThemedText style={[styles.routeSubtitle, { color: ui.textSecondary }]}>
                      {route.live} en vivo - {route.stale} sin senal reciente
                    </ThemedText>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={ui.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </GlassPanel>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexOne: { flex: 1 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800' },
  heroSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  heroBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  statLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  statValue: { fontSize: 20, lineHeight: 24, fontWeight: '800' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryAction: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexGrow: 1,
  },
  primaryActionText: { color: '#FFFFFF', fontSize: 13, lineHeight: 17, fontWeight: '800' },
  secondaryAction: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionText: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  sectionTitle: { fontSize: 16, lineHeight: 20, fontWeight: '800' },
  routeList: { gap: 0 },
  routeRow: {
    minHeight: 70,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  routeSubtitle: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 14 },
  emptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 12, lineHeight: 17, fontWeight: '500', textAlign: 'center' },
});
