import { GlassPanel } from '@/components/passenger/glass-panel';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { passengerSpacing } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { PrimaryJourneySummary, TripOptionPresentation } from '@/lib/trip-presentation';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type PrimaryTripCardProps = {
  trip: TripOptionPresentation;
  summary: PrimaryJourneySummary;
  isSaved: boolean;
  onPressDetails: () => void;
  onPressMap: () => void;
  onPressFavorite: () => void;
};

export function PrimaryTripCard({
  trip,
  summary,
  isSaved,
  onPressDetails,
  onPressMap,
  onPressFavorite,
}: PrimaryTripCardProps) {
  const ui = usePassengerUI();

  return (
    <GlassPanel variant="hero">
      <View style={styles.header}>
        <View style={styles.flexOne}>
          <ThemedText style={[styles.kicker, { color: ui.textSecondary }]}>{summary.title}</ThemedText>
          <ThemedText style={[styles.title, { color: ui.textPrimary }]}>{trip.routeName}</ThemedText>
          <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]}>{summary.subtitle}</ThemedText>
        </View>
      </View>

      <View style={styles.pillRow}>
        <StatusPill label={summary.etaLabel} icon="time-outline" tone="live" />
        <StatusPill label={summary.walkLabel} icon="walk-outline" tone="neutral" />
        <StatusPill label={summary.fareLabel} icon="cash-outline" tone="accent" />
      </View>

      <View style={styles.metaGrid}>
        <View style={[styles.metaCell, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
          <ThemedText style={[styles.metaLabel, { color: ui.textSecondary }]}>{trip.transferCount > 0 ? 'Primer bus' : 'Subida'}</ThemedText>
          <ThemedText style={[styles.metaValue, { color: ui.textPrimary }]}>{trip.walkToBoardLabel}</ThemedText>
        </View>
        <View style={[styles.metaCell, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
          <ThemedText style={[styles.metaLabel, { color: ui.textSecondary }]}>{trip.transferCount > 0 ? 'Segundo tramo' : 'Bajada'}</ThemedText>
          <ThemedText style={[styles.metaValue, { color: ui.textPrimary }]}>{trip.walkToDropLabel}</ThemedText>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.86}
          onPress={onPressDetails}
          style={[styles.primaryAction, { backgroundColor: ui.accentPrimary }]}>
          <Ionicons name="sparkles-outline" size={15} color="#FFFFFF" />
          <ThemedText style={styles.primaryActionText}>Ver detalle</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.84}
          onPress={onPressMap}
          style={[styles.secondaryAction, { backgroundColor: ui.interactiveAccent, borderColor: `${ui.accentPrimary}1F` }]}>
          <Ionicons name="map-outline" size={15} color={ui.accentPrimary} />
          <ThemedText style={[styles.secondaryActionText, { color: ui.accentPrimary }]}>Ver en mapa</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.84}
          onPress={onPressFavorite}
          style={[styles.secondaryAction, { backgroundColor: ui.interactiveNeutral, borderColor: ui.dividerSoft }]}>
          <Ionicons
            name={isSaved ? 'checkmark-circle-outline' : 'star-outline'}
            size={15}
            color={ui.textPrimary}
          />
          <ThemedText style={[styles.secondaryActionText, { color: ui.textPrimary }]}>
            {isSaved ? 'Editar favorito' : 'Guardar'}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: passengerSpacing.sm,
  },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: passengerSpacing.xs,
  },
  metaCell: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: passengerSpacing.sm,
    gap: 2,
  },
  metaLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
  },
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
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
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
  secondaryActionText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
});
