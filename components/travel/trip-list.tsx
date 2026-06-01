import { GlassPanel } from '@/components/passenger/glass-panel';
import { StatusPill } from '@/components/passenger/status-pill';
import { ThemedText } from '@/components/themed-text';
import { passengerSpacing } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { TripOptionPresentation } from '@/lib/trip-presentation';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

type TripListProps = {
  trips: TripOptionPresentation[];
  onPressTrip: (trip: TripOptionPresentation) => void;
  onToggleAlert?: (trip: TripOptionPresentation) => void;
  isAlertEnabled?: (trip: TripOptionPresentation) => boolean;
};

export function TripList({ trips, onPressTrip, onToggleAlert, isAlertEnabled }: TripListProps) {
  const ui = usePassengerUI();

  return (
    <GlassPanel variant="panel">
      <View style={styles.listGroup}>
        {trips.map((trip, index) => {
          const alertEnabled = isAlertEnabled?.(trip) ?? false;

          return (
            <TouchableOpacity
              key={trip.id}
              accessibilityRole="button"
              activeOpacity={0.84}
              onPress={() => onPressTrip(trip)}
              style={[
                styles.tripRow,
                index < trips.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: ui.dividerSoft,
                },
              ]}>
              <View style={styles.flexOne}>
                <View style={styles.tripTop}>
                  <StatusPill label={trip.etaLabel} icon="time-outline" tone="live" />
                </View>
                <ThemedText style={[styles.rowTitle, { color: ui.textPrimary }]}>{trip.routeName}</ThemedText>
                <ThemedText style={[styles.rowSubtitle, { color: ui.textSecondary }]}>
                  {trip.walkToBoardLabel} | {trip.walkToDropLabel} | {trip.fareLabel}
                </ThemedText>
              </View>

              {onToggleAlert ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onToggleAlert(trip)}
                  style={[
                    styles.iconOnlyAction,
                    {
                      backgroundColor: alertEnabled ? ui.statusWarning : ui.interactiveNeutral,
                      borderColor: alertEnabled ? ui.accentWarning : ui.dividerSoft,
                    },
                  ]}>
                  <Ionicons
                    name={alertEnabled ? 'notifications' : 'notifications-outline'}
                    size={16}
                    color={alertEnabled ? ui.accentWarning : ui.textSecondary}
                  />
                </Pressable>
              ) : (
                <Ionicons name="arrow-forward" size={18} color={ui.textSecondary} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  listGroup: {
    gap: 0,
  },
  tripRow: {
    minHeight: 86,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: passengerSpacing.sm,
  },
  flexOne: {
    flex: 1,
  },
  tripTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: passengerSpacing.xs,
    marginBottom: 6,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  iconOnlyAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
