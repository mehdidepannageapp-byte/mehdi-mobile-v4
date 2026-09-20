import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Mehdi Dépannage',
  slug: 'mehdi-depannage',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  scheme: 'mehdi-depannage',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'fr.mehdidepannage.app',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Votre position permet au dépanneur de vous retrouver rapidement.',
      NSPhotoLibraryUsageDescription: 'Vous pouvez ajouter des photos facultatives de votre moto.',
      NSCameraUsageDescription: 'Vous pouvez photographier votre moto ou une intervention.',
    },
  },
  android: {
    package: 'fr.mehdidepannage.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
    config: { googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '' } },
  },
  plugins: [
    ['expo-location', { locationWhenInUsePermission: 'Autoriser Mehdi Dépannage à accéder à votre position.' }],
    ['expo-image-picker', { photosPermission: 'Autoriser l’accès aux photos pour illustrer la panne.' }],
    ['expo-notifications', { color: '#F6C400' }],
    ['@stripe/stripe-react-native', { merchantIdentifier: 'merchant.fr.mehdidepannage.app', enableGooglePay: true }],
  ],
};

export default config;
