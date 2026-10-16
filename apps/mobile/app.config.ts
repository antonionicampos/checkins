import type { ExpoConfig } from 'expo/config';

// Valores do Google/Firebase vêm do .env (veja .env.example). Nenhum deles é segredo.
const config: ExpoConfig = {
  name: 'Check-ins',
  slug: 'checkins',
  scheme: 'checkins',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.antonionicampos.checkins',
  },
  android: {
    package: 'com.antonionicampos.checkins',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Usamos sua localização para mostrar lugares perto de você e confirmar que você está no local ao fazer check-in.',
      },
    ],
    [
      '@react-native-google-signin/google-signin',
      // "Reversed client ID" do cliente iOS no Google Cloud; só é usado no build para iPhone.
      // "||" e não "??": a variável costuma existir vazia no .env.
      { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME || 'com.googleusercontent.apps.configure-me' },
    ],
  ],
};

export default config;
