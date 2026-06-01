import { passengerRadii, passengerSpacing } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import React, { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type GlassPanelProps = PropsWithChildren<{
  variant?: 'subtle' | 'panel' | 'hero' | 'sheet' | 'strong' | 'elevated' | 'raised';
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function GlassPanel({ children, variant = 'panel', style, contentStyle }: GlassPanelProps) {
  const ui = usePassengerUI();
  const normalizedVariant =
    variant === 'strong'
      ? 'panel'
      : variant === 'elevated'
        ? 'sheet'
        : variant === 'raised'
          ? 'hero'
          : variant;

  const backgroundColor =
    normalizedVariant === 'subtle'
      ? ui.interactiveNeutral
      : normalizedVariant === 'hero'
        ? ui.surfaceHero
        : normalizedVariant === 'sheet'
          ? ui.surfaceStrong
          : ui.surfaceBase;
  const borderColor = normalizedVariant === 'hero' ? ui.outlineSoft : ui.dividerSoft;
  const shadow = normalizedVariant === 'sheet' || normalizedVariant === 'hero' ? ui.shadowFloating : ui.shadowCard;

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor,
          borderColor,
          boxShadow: shadow,
        },
        style,
      ]}>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: passengerRadii.card,
    overflow: 'hidden',
  },
  content: {
    padding: passengerSpacing.md,
    gap: passengerSpacing.sm,
  },
});
