import { useFloatingTabBarClearance } from '@/hooks/use-floating-tab-bar-clearance';
import React from 'react';
import { View } from 'react-native';

type TabBarSpacerProps = {
  extraBottom?: number;
};

export function TabBarSpacer({ extraBottom = 0 }: TabBarSpacerProps) {
  const height = useFloatingTabBarClearance(extraBottom);

  return <View pointerEvents="none" style={{ height }} />;
}
