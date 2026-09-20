import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme';
import type { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { ChatScreen } from '../screens/shared/ChatScreen';
import { OnboardingScreen, OtpScreen, PhoneLoginScreen, SplashScreen } from '../screens/shared/AuthScreens';
import { SupportScreen } from '../screens/shared/SupportScreen';
import { ClientHistoryScreen, ClientHomeScreen, ClientProfileScreen } from '../screens/client/HomeScreens';
import { IssueChoiceScreen, LocationPermissionScreen, QuoteScreen, RouteChoiceScreen, ScheduleScreen, VehicleInfoScreen } from '../screens/client/RequestScreens';
import { ClientCompletedScreen, ClientTrackingScreen, InvoiceScreen, SearchingScreen } from '../screens/client/TrackingScreens';
import { DriverDocumentsScreen, DriverEarningsScreen, DriverHistoryScreen, DriverHomeScreen, DriverProfileScreen } from '../screens/driver/DashboardScreens';
import { DeliveryScreen, DriverArrivalScreen, DriverNavigationScreen, MissionOfferScreen, MissionSummaryScreen, PickupPhotosScreen, TransportScreen } from '../screens/driver/MissionScreens';

const Stack = createNativeStackNavigator<RootStackParamList>();
const theme: Theme = { dark: true, colors: { primary: colors.yellow, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, notification: colors.red }, fonts: { regular: { fontFamily: 'System', fontWeight: '400' }, medium: { fontFamily: 'System', fontWeight: '600' }, bold: { fontFamily: 'System', fontWeight: '700' }, heavy: { fontFamily: 'System', fontWeight: '900' } } };

export function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.yellow} /></View>;
  return <NavigationContainer theme={theme}><Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
    {!user ? <><Stack.Screen name="Splash" component={SplashScreen} /><Stack.Screen name="Onboarding" component={OnboardingScreen} /><Stack.Screen name="PhoneLogin" component={PhoneLoginScreen} /><Stack.Screen name="Otp" component={OtpScreen} /></>
      : user.role === 'CLIENT' ? <>
        <Stack.Screen name="ClientHome" component={ClientHomeScreen} /><Stack.Screen name="LocationPermission" component={LocationPermissionScreen} /><Stack.Screen name="IssueChoice" component={IssueChoiceScreen} /><Stack.Screen name="VehicleInfo" component={VehicleInfoScreen} /><Stack.Screen name="RouteChoice" component={RouteChoiceScreen} /><Stack.Screen name="Schedule" component={ScheduleScreen} /><Stack.Screen name="Quote" component={QuoteScreen} /><Stack.Screen name="Searching" component={SearchingScreen} /><Stack.Screen name="ClientTracking" component={ClientTrackingScreen} /><Stack.Screen name="ClientCompleted" component={ClientCompletedScreen} /><Stack.Screen name="Invoice" component={InvoiceScreen} /><Stack.Screen name="ClientHistory" component={ClientHistoryScreen} /><Stack.Screen name="ClientProfile" component={ClientProfileScreen} /><Stack.Screen name="Support" component={SupportScreen} /><Stack.Screen name="Chat" component={ChatScreen} />
      </> : <>
        <Stack.Screen name="DriverHome" component={DriverHomeScreen} /><Stack.Screen name="MissionOffer" component={MissionOfferScreen} /><Stack.Screen name="DriverNavigation" component={DriverNavigationScreen} /><Stack.Screen name="DriverArrival" component={DriverArrivalScreen} /><Stack.Screen name="PickupPhotos" component={PickupPhotosScreen} /><Stack.Screen name="Transport" component={TransportScreen} /><Stack.Screen name="Delivery" component={DeliveryScreen} /><Stack.Screen name="MissionSummary" component={MissionSummaryScreen} /><Stack.Screen name="DriverHistory" component={DriverHistoryScreen} /><Stack.Screen name="DriverEarnings" component={DriverEarningsScreen} /><Stack.Screen name="DriverProfile" component={DriverProfileScreen} /><Stack.Screen name="DriverDocuments" component={DriverDocumentsScreen} /><Stack.Screen name="Support" component={SupportScreen} /><Stack.Screen name="Chat" component={ChatScreen} />
      </>}
  </Stack.Navigator></NavigationContainer>;
}
