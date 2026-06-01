import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth-context';
import { isRaptorRuntimeEnabled, prefetchSnapshot } from '@/lib/raptor';

// Import location task so it registers early on app boot
import '@/lib/location-task';

export const unstable_settings = {
  initialRouteName: 'welcome',
};

function RootNavigator() {
  const { userRole, isReady } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isReady) return;

    const rootSegment = segments[0];
    if (!rootSegment) return;

    const inDriverArea = rootSegment === '(driver)';
    const inPassengerArea =
      rootSegment === '(tabs)' ||
      rootSegment === 'favorite-editor' ||
      rootSegment === 'planner-lab' ||
      rootSegment === 'report-stop' ||
      rootSegment === 'record-trace' ||
      rootSegment === 'saved-places' ||
      rootSegment === 'trip-alerts' ||
      rootSegment === 'trip-details' ||
      rootSegment === 'settings' ||
      rootSegment === 'service-status';
    const inProtectedArea = inDriverArea || inPassengerArea;

    if (userRole === 'driver' && !inDriverArea) {
      router.replace('/(driver)');
    } else if (userRole === 'passenger' && !inPassengerArea) {
      router.replace('/(tabs)');
    } else if (!userRole && inProtectedArea) {
      router.replace('/welcome');
    }
  }, [userRole, isReady, router, segments]);

  useEffect(() => {
    if (!isRaptorRuntimeEnabled()) return;

    void prefetchSnapshot().catch((error) => {
      if (__DEV__) {
        console.warn('RAPTOR snapshot prefetch failed.', error);
      }
    });
  }, []);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_RAPTOR_DEVICE_PERF_BOOT !== '1') return;

    void import('@/lib/raptor/device-perf-probe')
      .then(({ runRaptorDevicePerfProbe }) => runRaptorDevicePerfProbe())
      .catch((error) => {
        console.warn('RAPTOR device perf probe failed.', error);
      });
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(driver)" options={{ headerShown: false }} />
      <Stack.Screen name="driver-login" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen
        name="favorite-editor"
        options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="report-stop" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="record-trace" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="saved-places" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="trip-alerts" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="trip-details" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="service-status" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="planner-lab" options={{ animation: 'slide_from_right', title: 'Planner Lab' }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DarkTheme}>
        <AuthProvider>
          <RootNavigator />
          <StatusBar style="light" />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
