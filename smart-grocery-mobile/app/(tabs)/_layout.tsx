import React, { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, usePathname } from 'expo-router';

import api from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import type { Delivery, Notification, Order } from '../../src/types/api';
import {
  canHandleDeliveries,
  canHandleOperations,
  canManageCatalog,
  canViewReports,
  isCustomerRole,
} from '../../src/utils/roles';

export default function TabsLayout() {
  const { loading, isAuthenticated, user } = useAuth();
  const pathname = usePathname();
  const role = user?.role;
  const showCustomerTabs = isCustomerRole(role);
  const showOperations = canHandleOperations(role);
  const showDeliveries = canHandleDeliveries(role);
  const showAdmin = canManageCatalog(role);
  const showReports = canViewReports(role);
  const [ordersBadgeCount, setOrdersBadgeCount] = useState(0);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [operationsBadgeCount, setOperationsBadgeCount] = useState(0);
  const [deliveriesBadgeCount, setDeliveriesBadgeCount] = useState(0);

  const getTabIconName = (routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap => {
    switch (routeName) {
      case 'index':
        return focused ? 'storefront' : 'storefront-outline';
      case 'cart':
        return focused ? 'cart' : 'cart-outline';
      case 'orders':
        return focused ? 'receipt' : 'receipt-outline';
      case 'operations':
        return focused ? 'list-circle' : 'list-circle-outline';
      case 'deliveries':
        return focused ? 'bicycle' : 'bicycle-outline';
      case 'notifications':
        return focused ? 'notifications' : 'notifications-outline';
      case 'reports':
        return focused ? 'bar-chart' : 'bar-chart-outline';
      case 'admin':
        return focused ? 'settings' : 'settings-outline';
      case 'profile':
        return focused ? 'person-circle' : 'person-circle-outline';
      default:
        return focused ? 'ellipse' : 'ellipse-outline';
    }
  };

  const loadTabBadges = useCallback(async () => {
    if (!user) {
      setOrdersBadgeCount(0);
      setUnreadAlertsCount(0);
      setOperationsBadgeCount(0);
      setDeliveriesBadgeCount(0);
      return;
    }

    try {
      const requests: Promise<any>[] = [api.get<Notification[]>('/notifications/')];

      if (showCustomerTabs) {
        requests.push(api.get<Order[]>('/orders/my-orders'));
      }

      if (showOperations) {
        requests.push(api.get<Order[]>('/orders/'));
      }

      if (showDeliveries) {
        requests.push(api.get<Delivery[]>('/deliveries/'));
      }

      const responses = await Promise.all(requests);
      const notifications = responses[0].data as Notification[];
      setUnreadAlertsCount(notifications.filter((item) => !item.is_read).length);

      let responseIndex = 1;

      if (showCustomerTabs) {
        const customerOrders = responses[responseIndex].data as Order[];
        responseIndex += 1;

        setOrdersBadgeCount(
          customerOrders.filter((order) => !['delivered', 'cancelled'].includes(order.status)).length
        );
      } else {
        setOrdersBadgeCount(0);
      }

      if (showOperations) {
        const orders = responses[responseIndex].data as Order[];
        responseIndex += 1;

        const activeOperationsOrders = orders.filter((order) => {
          if (['out_for_delivery', 'delivered', 'cancelled'].includes(order.status)) {
            return false;
          }

          if (role === 'staff') {
            return !order.all_items_picked;
          }

          return true;
        });

        setOperationsBadgeCount(activeOperationsOrders.length);
      } else {
        setOperationsBadgeCount(0);
      }

      if (showDeliveries) {
        const deliveries = responses[responseIndex].data as Delivery[];
        setDeliveriesBadgeCount(deliveries.filter((delivery) => delivery.status !== 'delivered').length);
      } else {
        setDeliveriesBadgeCount(0);
      }
    } catch {
      if (!showCustomerTabs) {
        setOrdersBadgeCount(0);
      }
      setUnreadAlertsCount(0);
      if (!showOperations) {
        setOperationsBadgeCount(0);
      }
      if (!showDeliveries) {
        setDeliveriesBadgeCount(0);
      }
    }
  }, [role, showCustomerTabs, showDeliveries, showOperations, user]);

  useEffect(() => {
    loadTabBadges();
  }, [loadTabBadges, pathname]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadTabBadges();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [loadTabBadges]);

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#16A34A',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          height: 68,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons name={getTabIconName(route.name, focused)} size={size} color={color} />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Shop', href: showCustomerTabs ? undefined : null }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', href: showCustomerTabs ? undefined : null }} />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          href: showCustomerTabs ? undefined : null,
          tabBarBadge: ordersBadgeCount > 0 ? ordersBadgeCount : undefined,
        }}
      />
      <Tabs.Screen
        name="operations"
        options={{
          title: 'Operations',
          href: showOperations ? undefined : null,
          tabBarBadge: operationsBadgeCount > 0 ? operationsBadgeCount : undefined,
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          title: 'Deliveries',
          href: showDeliveries ? undefined : null,
          tabBarBadge: deliveriesBadgeCount > 0 ? deliveriesBadgeCount : undefined,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Alerts', tabBarBadge: unreadAlertsCount > 0 ? unreadAlertsCount : undefined }}
      />
      <Tabs.Screen name="reports" options={{ title: 'Reports', href: showReports ? undefined : null }} />
      <Tabs.Screen name="admin" options={{ title: 'Admin', href: showAdmin ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
