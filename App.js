import React from 'react';
import { LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Suppress expo-notifications warnings in Expo Go since they require a dev build
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported',
  'Require cycle:'
]);

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import RestaurantRouteScreen from './screens/RestaurantRouteScreen';
import CustomerNavigationScreen from './screens/CustomerNavigationScreen';
import VerifyPickupScreen from './screens/VerifyPickupScreen';
import CompleteDeliveryScreen from './screens/CompleteDeliveryScreen';
import DeliveryCompleteScreen from './screens/DeliveryCompleteScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import VehicleInfoScreen from './screens/VehicleInfoScreen';
import MyDocumentsScreen from './screens/MyDocumentsScreen';
import BankDetailsScreen from './screens/BankDetailsScreen';
import SettingsScreen from './screens/SettingsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="RestaurantRoute" component={RestaurantRouteScreen} />
        <Stack.Screen name="VerifyPickup" component={VerifyPickupScreen} />
        <Stack.Screen name="CustomerNavigation" component={CustomerNavigationScreen} />
        <Stack.Screen name="CompleteDelivery" component={CompleteDeliveryScreen} />
        <Stack.Screen name="DeliveryComplete" component={DeliveryCompleteScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="VehicleInfo" component={VehicleInfoScreen} />
        <Stack.Screen name="MyDocuments" component={MyDocumentsScreen} />
        <Stack.Screen name="BankDetails" component={BankDetailsScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
