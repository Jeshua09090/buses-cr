import { passengerSpacing } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import React, { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';

type ScreenHeroProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  topRow?: ReactNode;
  aside?: ReactNode;
}>;

export function ScreenHero({ title, subtitle, topRow, aside, children }: ScreenHeroProps) {
  const ui = usePassengerUI();

  return (
    <View style={styles.container}>
      {topRow ? <View style={styles.topRow}>{topRow}</View> : null}

      <View style={styles.header}>
        <View style={styles.copy}>
          <ThemedText style={[styles.title, { color: ui.textPrimary }]}>{title}</ThemedText>
          {subtitle ? <ThemedText style={[styles.subtitle, { color: ui.textSecondary }]}>{subtitle}</ThemedText> : null}
        </View>
        {aside ? <View style={styles.aside}>{aside}</View> : null}
      </View>

      {children ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: passengerSpacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: passengerSpacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: passengerSpacing.sm,
  },
  copy: {
    flex: 1,
    gap: passengerSpacing.xs,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  subtitle: {
    maxWidth: 320,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  aside: {
    alignItems: 'flex-end',
  },
  body: {
    gap: passengerSpacing.sm,
  },
});
