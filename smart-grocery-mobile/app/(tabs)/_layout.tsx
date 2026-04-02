import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import {
  canHandleDeliveries,
  canHandleOperations,
  canManageCatalog,
  canViewReports,
  isCustomerRole,
} from '../../src/utils/roles';

export default function TabsLayout() {
  const { loading, isAuthenticated, user } = useAuth();
  const role = user?.role;
  const showCustomerTabs = isCustomerRole(role);
  const showOperations = canHandleOperations(role);
  const showDeliveries = canHandleDeliveries(role);
  const showAdmin = canManageCatalog(role);
  const showReports = canViewReports(role);

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#16A34A' }}>
      <Tabs.Screen name="index" options={{ title: 'Shop', href: showCustomerTabs ? undefined : null }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', href: showCustomerTabs ? undefined : null }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', href: showCustomerTabs ? undefined : null }} />
      <Tabs.Screen
        name="operations"
        options={{ title: 'Operations', href: showOperations ? undefined : null }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{ title: 'Deliveries', href: showDeliveries ? undefined : null }}
      />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', href: showReports ? undefined : null }} />
      <Tabs.Screen name="admin" options={{ title: 'Admin', href: showAdmin ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
