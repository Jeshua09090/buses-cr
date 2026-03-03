import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth-context';

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

    const inAuthGroup = segments[0] === '(driver)' || segments[0] === '(tabs)';

    if (userRole === 'driver' && segments[0] !== '(driver)') {
      router.replace('/(driver)');
    } else if (userRole === 'passenger' && segments[0] !== '(tabs)') {
      router.replace('/(tabs)/explore');
    } else if (!userRole && inAuthGroup) {
      router.replace('/welcome');
    }
  }, [userRole, isReady, segments]);

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
