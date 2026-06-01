import { passengerRadii } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

type RouteBadgeProps = {
  label: string;
  tone?: 'accent' | 'live' | 'warning' | 'primary' | 'success';
};

export function RouteBadge({ label, tone = 'accent' }: RouteBadgeProps) {
  const ui = usePassengerUI();
  const normalizedTone = tone === 'primary' ? 'accent' : tone === 'success' ? 'live' : tone;
  const backgroundColor =
    normalizedTone === 'live'
      ? ui.statusLive
      : normalizedTone === 'warning'
        ? ui.statusWarning
        : ui.interactiveAccent;
  const color =
    normalizedTone === 'live'
      ? ui.accentSuccess
      : normalizedTone === 'warning'
        ? ui.accentWarning
        : ui.accentPrimary;
  const borderColor =
    normalizedTone === 'live'
      ? `${ui.accentSuccess}22`
      : normalizedTone === 'warning'
        ? `${ui.accentWarning}22`
        : `${ui.accentPrimary}1F`;

  return (
    <View style={[styles.badge, { backgroundColor, borderColor }]}>
      <Ionicons name="bus-outline" size={12} color={color} />
      <ThemedText style={[styles.text, { color }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 24,
    borderRadius: passengerRadii.capsule,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
});
