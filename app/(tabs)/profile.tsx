import { DepthBackground } from '@/components/home/DepthBackground';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { SectionHeader } from '@/components/passenger/section-header';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { useFavorites } from '@/hooks/use-favorites';
import { loadStoredHomeAlerts } from '@/lib/home-alerts-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

const PROFILE_ITEMS = [
  {
    id: 'report-stop',
    title: 'Reportar parada o ruta',
    subtitle: 'Marca paradas faltantes, movidas o cambios de recorrido desde el telefono',
    icon: 'pin-outline' as const,
    route: '/report-stop' as const,
  },
  {
    id: 'record-trace',
    title: 'Grabar trayectos',
    subtitle: 'Captura recorridos reales del bus, incluso si vas sin internet',
    icon: 'pulse-outline' as const,
    route: '/record-trace' as const,
  },
  {
    id: 'saved-places',
    title: 'Lugares guardados',
    subtitle: 'Casa, trabajo y destinos frecuentes listos para reutilizar',
    icon: 'bookmark-outline' as const,
    route: '/saved-places' as const,
  },
  {
    id: 'trip-alerts',
    title: 'Alertas y recordatorios',
    subtitle: 'Sigue tus avisos de llegada y revisa lo que sigue activo',
    icon: 'notifications-outline' as const,
    route: '/trip-alerts' as const,
  },
  {
    id: 'settings',
    title: 'Configuracion y permisos',
    subtitle: 'Ubicacion, alertas y acceso a funciones clave de viaje',
    icon: 'settings-outline' as const,
    route: '/settings' as const,
  },
];

export default function ProfileScreen() {
  const router = useRouter();
  const ui = usePassengerUI();
  const { clearRole } = useAuth();
  const { favorites, loadFavorites } = useFavorites();
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
      loadStoredHomeAlerts().then((alerts) => setActiveAlertsCount(alerts.filter((alert) => alert.enabled).length));
    }, [loadFavorites]),
  );

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

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <ScreenHero
          title="Perfil"
          subtitle="Tu identidad de viaje y accesos listos para moverte sin friccion."
          topRow={
            <>
              <StatusPill label="Tu cuenta" icon="person-circle-outline" tone="accent" />
              <StatusPill label="Cartago base" tone="neutral" />
            </>
          }
        />

        <GlassPanel variant="hero">
          <View style={styles.identityRow}>
            <View style={[styles.avatar, { backgroundColor: ui.surfaceElevated, borderColor: ui.outlineSoft }]}>
              <Ionicons name="person-outline" size={28} color={ui.accentPrimary} />
            </View>
            <View style={styles.identityCopy}>
              <ThemedText style={[styles.name, { color: ui.textPrimary }]}>Pasajero</ThemedText>
              <ThemedText style={[styles.meta, { color: ui.textSecondary }]}>
                Cartago, CR - modo pasajero enfocado en llegar facil
              </ThemedText>
            </View>
          </View>

          <View style={styles.identityPills}>
            <StatusPill label={`${favorites.length} lugares`} tone="accent" />
            <StatusPill label={`${activeAlertsCount} alertas`} tone={activeAlertsCount > 0 ? 'warning' : 'neutral'} />
          </View>

          <View style={styles.quickActions}>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() => router.push('/saved-places')}
              style={[styles.quickAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
              <Ionicons name="bookmark-outline" size={16} color={ui.textPrimary} />
              <ThemedText style={[styles.quickActionText, { color: ui.textPrimary }]}>Tus lugares</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() => router.push('/report-stop')}
              style={[styles.quickAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
              <Ionicons name="pin-outline" size={16} color={ui.textPrimary} />
              <ThemedText style={[styles.quickActionText, { color: ui.textPrimary }]}>Reportar</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() => router.push('/record-trace')}
              style={[styles.quickAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
              <Ionicons name="pulse-outline" size={16} color={ui.textPrimary} />
              <ThemedText style={[styles.quickActionText, { color: ui.textPrimary }]}>Trayectos</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() => router.push('/trip-alerts')}
              style={[styles.quickAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
              <Ionicons name="notifications-outline" size={16} color={ui.textPrimary} />
              <ThemedText style={[styles.quickActionText, { color: ui.textPrimary }]}>Tus alertas</ThemedText>
            </TouchableOpacity>
          </View>
        </GlassPanel>

        <View style={styles.sectionBlock}>
          <SectionHeader title="Centro de control" subtitle="Acciones de viaje y permisos sin llenar la pantalla" />

          <GlassPanel variant="panel">
            <View style={styles.list}>
              {PROFILE_ITEMS.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  accessibilityRole="button"
                  activeOpacity={0.84}
                  onPress={() => router.push(item.route)}
                  style={[styles.row, index < PROFILE_ITEMS.length - 1 && { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
                  <View style={[styles.rowIcon, { backgroundColor: ui.interactiveAccent }]}>
                    <Ionicons name={item.icon} size={18} color={ui.accentPrimary} />
                  </View>
                  <View style={styles.rowCopy}>
                    <ThemedText style={[styles.rowTitle, { color: ui.textPrimary }]}>{item.title}</ThemedText>
                    <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary }]}>{item.subtitle}</ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={ui.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          </GlassPanel>
        </View>

        <GlassPanel variant="panel">
          <View style={styles.sessionBlock}>
            <View style={styles.rowCopy}>
              <ThemedText style={[styles.rowTitle, { color: ui.textPrimary }]}>Sesion local activa</ThemedText>
              <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary }]}>
                Puedes cerrar sesion y volver a elegir tu modo de uso.
              </ThemedText>
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={clearRole}
              style={[styles.logoutButton, { backgroundColor: 'transparent', borderColor: `${ui.accentDanger}28` }]}>
              <Ionicons name="log-out-outline" size={16} color={ui.accentDanger} />
              <ThemedText style={[styles.logoutText, { color: ui.accentDanger }]}>Cerrar sesion</ThemedText>
            </TouchableOpacity>
          </View>
        </GlassPanel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 110, gap: 22 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, gap: 2 },
  name: { fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5 },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  identityPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickAction: {
    minHeight: 42,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexGrow: 1,
  },
  quickActionText: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  sectionBlock: { gap: 10 },
  list: { gap: 0 },
  row: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, lineHeight: 19, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  sessionBlock: { gap: 14 },
  logoutButton: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  logoutText: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
});
