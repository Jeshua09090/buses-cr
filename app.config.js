/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'Buses CR',
  slug: 'buses-cr',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'busescr',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: 'com.jeshua.busescr',
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
    ],
  },
  web: {
    output: 'server',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: {
          backgroundColor: '#000000',
        },
      },
    ],
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? '',
      },
    ],
    'expo-asset',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'bd0ec63f-ce5e-4d28-a2d2-1110cafd6086',
    },
  },
};

module.exports = config;
