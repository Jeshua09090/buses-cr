import { DepthBackground } from '@/components/home/DepthBackground';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const router = useRouter();
  const ui = usePassengerUI();
  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const location = await Location.getForegroundPermissionsAsync();
        const notifications = await Notifications.getPermissionsAsync();
        setLocationGranted(location.granted);
        setNotificationsGranted(notifications.granted);
      })();
    }, []),
  );

  const requestLocationPermission = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    setLocationGranted(permission.granted);
  }, []);

  const requestNotificationsPermission = useCallback(async () => {
    const permission = await Notifications.requestPermissionsAsync();
    setNotificationsGranted(permission.granted);
  }, []);

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
          <StatusPill label="Preferencias" tone="primary" />
        </View>

        <ScreenHero
          title="Configuracion"
          subtitle="Permisos y ajustes clave para que la app siga siendo ligera y confiable."
        />

        <GlassPanel variant="elevated">
          <View style={styles.list}>
            <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
              <View style={[styles.iconWrap, { backgroundColor: ui.statusPrimary }]}>
                <Ionicons name="locate-outline" size={16} color={ui.accentPrimary} />
              </View>
              <View style={styles.copy}>
                <ThemedText style={[styles.title, { color: ui.textPrimary }]}>Ubicacion</ThemedText>
                <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]}>
                  Necesaria para calcular origen y mostrar buses cerca.
                </ThemedText>
              </View>
              <StatusPill label={locationGranted ? 'Activa' : 'Pendiente'} tone={locationGranted ? 'success' : 'warning'} />
            </View>
            {!locationGranted ? (
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.84}
                onPress={requestLocationPermission}
                style={[styles.inlineButton, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
                <Ionicons name="locate-outline" size={15} color={ui.accentPrimary} />
                <ThemedText style={[styles.inlineButtonText, { color: ui.accentPrimary }]}>Activar ubicacion</ThemedText>
              </TouchableOpacity>
            ) : null}

            <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
              <View style={[styles.iconWrap, { backgroundColor: ui.statusWarning }]}>
                <Ionicons name="notifications-outline" size={16} color={ui.accentWarning} />
              </View>
              <View style={styles.copy}>
                <ThemedText style={[styles.title, { color: ui.textPrimary }]}>Alertas</ThemedText>
                <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]}>
                  Recomendadas para recordatorios de llegada y seguimiento.
                </ThemedText>
              </View>
              <StatusPill label={notificationsGranted ? 'Activa' : 'Pendiente'} tone={notificationsGranted ? 'success' : 'warning'} />
            </View>
            {!notificationsGranted ? (
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.84}
                onPress={requestNotificationsPermission}
                style={[styles.inlineButton, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
                <Ionicons name="notifications-outline" size={15} color={ui.accentWarning} />
                <ThemedText style={[styles.inlineButtonText, { color: ui.accentWarning }]}>Activar alertas</ThemedText>
              </TouchableOpacity>
            ) : null}

            <View style={styles.row}>
              <View style={[styles.iconWrap, { backgroundColor: ui.glassSubtle }]}>
                <Ionicons name="sparkles-outline" size={16} color={ui.textPrimary} />
              </View>
              <View style={styles.copy}>
                <ThemedText style={[styles.title, { color: ui.textPrimary }]}>Experiencia</ThemedText>
                <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]}>
                  Direccion visual premium, limpia por capas y enfocada en llegar facil.
                </ThemedText>
              </View>
            </View>
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
  list: { gap: 0 },
  row: { minHeight: 74, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  inlineButton: {
    minHeight: 40,
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineButtonText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
