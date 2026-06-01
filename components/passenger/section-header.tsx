import { passengerSpacing } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onPressAction?: () => void;
};

export function SectionHeader({ title, subtitle, actionLabel, onPressAction }: SectionHeaderProps) {
  const ui = usePassengerUI();

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <ThemedText style={[styles.title, { color: ui.textPrimary }]}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]}>{subtitle}</ThemedText>
        ) : null}
      </View>

      {actionLabel && onPressAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPressAction}
          hitSlop={8}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: ui.interactiveNeutral,
              borderColor: ui.dividerSoft,
              opacity: pressed ? 0.88 : 1,
            },
          ]}>
          <ThemedText style={[styles.actionText, { color: ui.accentPrimary }]}>{actionLabel}</ThemedText>
          <Ionicons name="arrow-forward" size={13} color={ui.accentPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: passengerSpacing.sm,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  action: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
});
