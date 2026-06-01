import { getFloatingTabBarReservedSpace } from '@/constants/passenger-ui';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useFloatingTabBarClearance(extraBottom = 0) {
  const insets = useSafeAreaInsets();

  return useMemo(() => getFloatingTabBarReservedSpace(insets.bottom) + extraBottom, [extraBottom, insets.bottom]);
}
