import { DepthBackground } from '@/components/home/DepthBackground';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { loadStoredHomeAlerts, StoredHomeAlert } from '@/lib/home-alerts-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TripAlertsScreen() {
  const router = useRouter();
  const ui = usePassengerUI();
  const [alerts, setAlerts] = useState<StoredHomeAlert[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadStoredHomeAlerts().then(setAlerts);
    }, []),
  );

  const activeAlerts = alerts.filter((alert) => alert.enabled);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: ui.backgroundColor }]}>
      <DepthBackground
        topColor={ui.gradientTop}
        midColor={ui.gradientMid}
        bottomColor={ui.gradientBottom}
        accentColor={ui.accentWarning}
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
          <StatusPill label={`${activeAlerts.length} activas`} tone="warning" />
        </View>

        <ScreenHero
          title="Alertas y recordatorios"
          subtitle="Estas alertas se activan desde Viajar para avisarte cuando una opcion se acerca a tu destino."
        />

        <GlassPanel variant="elevated">
          {activeAlerts.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.iconWrap, { backgroundColor: ui.statusWarning }]}>
                <Ionicons name="notifications-outline" size={18} color={ui.accentWarning} />
              </View>
              <ThemedText style={[styles.title, { color: ui.textPrimary }]}>Sin alertas activas</ThemedText>
              <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]}>
                Cuando actives un recordatorio en una ruta, aparecera aqui.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {activeAlerts.map((alert, index) => (
                <View
                  key={alert.id}
                  style={[styles.row, index < activeAlerts.length - 1 && { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
                  <View style={[styles.iconWrap, { backgroundColor: ui.statusWarning }]}>
                    <Ionicons name="notifications" size={16} color={ui.accentWarning} />
                  </View>
                  <View style={styles.copy}>
                    <ThemedText style={[styles.title, { color: ui.textPrimary }]}>{alert.routeName}</ThemedText>
                    <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]}>
                      Destino: {alert.destinationName} · Umbrales {alert.thresholds.join(' / ')} min
                    </ThemedText>
                  </View>
                </View>
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
  backButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 0 },
  row: { minHeight: 70, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 14 },
});
