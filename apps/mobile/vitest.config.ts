import path from 'path';
import { defineConfig } from 'vitest/config';

// react-native / expo-notifications contiennent une syntaxe (Flow) que le parseur de Vite ne
// gère pas : on les alias vers des doublures minimales plutôt que d'essayer de les transformer.
export default defineConfig({
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'test-mocks/react-native.ts'),
      'expo-notifications': path.resolve(__dirname, 'test-mocks/expo-notifications.ts'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'test-mocks/async-storage.ts'),
    },
  },
  test: {
    environment: 'jsdom',
  },
});
