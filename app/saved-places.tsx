import { DepthBackground } from '@/components/home/DepthBackground';
import { GlassPanel } from '@/components/passenger/glass-panel';
import { ScreenHero } from '@/components/passenger/screen-hero';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { useFavorites } from '@/hooks/use-favorites';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SavedPlacesScreen() {
  const router = useRouter();
  const ui = usePassengerUI();
  const { favorites, loadFavorites } = useFavorites();

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites]),
  );

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
          <StatusPill label={`${favorites.length} guardados`} tone="primary" />
        </View>

        <ScreenHero
          title="Tus lugares"
          subtitle="Edita tus accesos rapidos y vuelve a llevarlos a Viajar cuando quieras."
        />

        <GlassPanel variant="elevated">
          <View style={styles.list}>
            {favorites.map((favorite, index) => (
              <View
                key={favorite.id}
                style={[styles.row, index < favorites.length - 1 && { borderBottomWidth: 1, borderBottomColor: ui.dividerSoft }]}>
                <View style={[styles.iconWrap, { backgroundColor: ui.statusPrimary }]}>
                  <Ionicons name={favorite.icon} size={16} color={ui.accentPrimary} />
                </View>
                <View style={styles.copy}>
                  <ThemedText style={[styles.title, { color: ui.textPrimary }]}>{favorite.title}</ThemedText>
                  <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]} numberOfLines={2}>
                    {favorite.address || favorite.name}
                  </ThemedText>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={() => router.replace({ pathname: '/(tabs)', params: { favoriteId: favorite.id } })}
                    style={[styles.actionButton, { backgroundColor: ui.statusPrimary }]}>
                    <ThemedText style={[styles.actionText, { color: ui.accentPrimary }]}>Usar</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    activeOpacity={0.84}
                    onPress={() => router.push({ pathname: '/favorite-editor', params: { favoriteId: favorite.id } })}
                    style={[styles.actionButton, { backgroundColor: ui.glassSubtle }]}>
                    <ThemedText style={[styles.actionText, { color: ui.textPrimary }]}>Editar</ThemedText>
                  </TouchableOpacity>
                </View>
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
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 0 },
  row: {
    minHeight: 76,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  actions: { gap: 8 },
  actionButton: {
    minWidth: 68,
    minHeight: 34,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 12, lineHeight: 15, fontWeight: '700' },
});
