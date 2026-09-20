import { StripeProvider } from '@stripe/stripe-react-native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { BookingProvider } from './src/context/BookingContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { STRIPE_KEY } from './src/config';

export default function App() {
  return <SafeAreaProvider><StripeProvider publishableKey={STRIPE_KEY} merchantIdentifier="merchant.fr.mehdidepannage.app" urlScheme="mehdi-depannage"><AuthProvider><BookingProvider><StatusBar style="light" /><RootNavigator /></BookingProvider></AuthProvider></StripeProvider></SafeAreaProvider>;
}
