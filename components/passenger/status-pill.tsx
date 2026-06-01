import { passengerRadii, passengerTouch } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ThemedText } from '@/components/themed-text';

type StatusPillProps = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'accent' | 'neutral' | 'live' | 'warning' | 'danger' | 'primary' | 'secondary' | 'success' | 'muted';
  style?: StyleProp<ViewStyle>;
};

export function StatusPill({ label, icon, tone = 'neutral', style }: StatusPillProps) {
  const ui = usePassengerUI();
  const normalizedTone =
    tone === 'primary'
      ? 'accent'
      : tone === 'secondary' || tone === 'muted'
        ? 'neutral'
        : tone === 'success'
          ? 'live'
          : tone;
  const backgroundColor =
    normalizedTone === 'accent'
      ? ui.interactiveAccent
      : normalizedTone === 'live'
        ? ui.statusLive
        : normalizedTone === 'warning'
          ? ui.statusWarning
          : normalizedTone === 'danger'
            ? ui.dangerSubtle
            : ui.interactiveNeutral;
  const color =
    normalizedTone === 'accent'
      ? ui.accentPrimary
      : normalizedTone === 'live'
        ? ui.accentSuccess
        : normalizedTone === 'warning'
          ? ui.accentWarning
          : normalizedTone === 'danger'
            ? ui.accentDanger
            : ui.textPrimary;
  const borderColor =
    normalizedTone === 'accent'
      ? `${ui.accentPrimary}1F`
      : normalizedTone === 'live'
        ? `${ui.accentSuccess}22`
        : normalizedTone === 'warning'
          ? `${ui.accentWarning}22`
          : normalizedTone === 'danger'
            ? `${ui.accentDanger}24`
            : ui.dividerSoft;

  return (
    <View style={[styles.pill, { backgroundColor, borderColor }, style]}>
      {icon ? <Ionicons name={icon} size={13} color={color} /> : <View style={[styles.dot, { backgroundColor: color }]} />}
      <ThemedText style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 32,
    maxWidth: '100%',
    borderRadius: passengerRadii.capsule,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: passengerRadii.capsule,
  },
  label: {
    minHeight: passengerTouch.minimum,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlignVertical: 'center',
    includeFontPadding: false,
    paddingVertical: 8,
  },
});
