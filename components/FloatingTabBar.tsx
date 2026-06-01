import { floatingTabBarMetrics, passengerRadii } from '@/constants/passenger-ui';
import { usePassengerUI } from '@/hooks/use-passenger-ui';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const OUTLINED_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'search-outline',
  explore: 'map-outline',
  profile: 'person-outline',
};

const FILLED_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'search',
  explore: 'map',
  profile: 'person',
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function TabItem({
  isFocused,
  label,
  routeName,
  onPress,
}: {
  isFocused: boolean;
  label: string;
  routeName: string;
  onPress: () => void;
}) {
  const ui = usePassengerUI();
  const progress = useSharedValue(isFocused ? 1 : 0);
  const activeIcon = ui.textPrimary;
  const activeLabel = ui.textPrimary;
  const inactiveLabel = ui.textTertiary;
  const inactiveIcon = ui.textSecondary;
  const activeIconBg = ui.theme === 'dark' ? ui.surfaceElevated : ui.interactiveAccent;
  const activeIconBorder = `${ui.accentPrimary}24`;

  useEffect(() => {
    progress.value = withTiming(isFocused ? 1 : 0, { duration: 180 });
  }, [isFocused, progress]);

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * -1 }],
  }));

  const iconWrapStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(255,255,255,0)', activeIconBg]),
    borderColor: interpolateColor(progress.value, [0, 1], ['rgba(255,255,255,0)', activeIconBorder]),
    transform: [{ scale: 0.98 + progress.value * 0.03 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inactiveLabel, activeLabel]),
  }));

  const icon = isFocused ? FILLED_ICONS[routeName] ?? 'ellipse' : OUTLINED_ICONS[routeName] ?? 'ellipse-outline';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      hitSlop={8}
      onPress={() => {
        if (Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress();
      }}
      style={styles.tab}>
      <Animated.View style={[styles.tabInner, innerStyle]}>
        <Animated.View style={[styles.iconWrap, iconWrapStyle]}>
          <Ionicons name={icon} size={21} color={isFocused ? activeIcon : inactiveIcon} />
        </Animated.View>
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
      </Animated.View>
    </AnimatedPressable>
  );
}

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ui = usePassengerUI();
  const barWidth = Math.max(296, width - floatingTabBarMetrics.marginHorizontal * 2);

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: Math.max(insets.bottom, floatingTabBarMetrics.safeBottomOffset) },
      ]}>
      <View style={[styles.shell, { width: barWidth, borderColor: ui.outlineSoft, boxShadow: ui.shadowFloating }]}>
        <BlurView tint={ui.theme === 'dark' ? 'dark' : 'light'} intensity={64} style={StyleSheet.absoluteFill} />
        <View style={[styles.overlay, { backgroundColor: ui.surfaceHero }]} />
        <View style={[styles.topShine, { backgroundColor: ui.theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)' }]} />

        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === index;
            const label =
              typeof options.tabBarLabel === 'string'
                ? options.tabBarLabel
                : options.title ?? route.name;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            return (
              <TabItem
                key={route.key}
                isFocused={isFocused}
                label={label}
                routeName={route.name}
                onPress={onPress}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  shell: {
    height: floatingTabBarMetrics.height,
    borderRadius: passengerRadii.sheet,
    overflow: 'hidden',
    borderWidth: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topShine: {
    position: 'absolute',
    top: 0,
    left: 26,
    right: 26,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: floatingTabBarMetrics.innerPadding,
    paddingVertical: floatingTabBarMetrics.innerPadding,
    gap: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    minHeight: 50,
    width: '100%',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
