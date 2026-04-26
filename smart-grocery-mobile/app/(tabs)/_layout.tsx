import React, { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, usePathname } from 'expo-router';

import api from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import type { Cart, Delivery, Notification, Order } from '../../src/types/api';
import {
  canAccessAdminWorkspace,
  canHandleDeliveries,
  canHandleOperations,
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
  const showAdmin = canAccessAdminWorkspace(role);
  const showReports = canViewReports(role);
  const visibleTabCount =
    (showCustomerTabs ? 3 : 0) +
    (showOperations ? 1 : 0) +
    (showDeliveries ? 1 : 0) +
    1 +
    (showReports ? 1 : 0) +
    (showAdmin ? 1 : 0) +
    1;
  const useCompactTabs = visibleTabCount >= 6;
  const [ordersBadgeCount, setOrdersBadgeCount] = useState(0);
  const [cartBadgeCount, setCartBadgeCount] = useState(0);
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
      setCartBadgeCount(0);
      setUnreadAlertsCount(0);
      setOperationsBadgeCount(0);
      setDeliveriesBadgeCount(0);
      return;
    }

    try {
      const requests: Promise<any>[] = [api.get<Notification[]>('/notifications/')];

      if (showCustomerTabs) {
        requests.push(api.get<Cart>('/cart/'));
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
        const cart = responses[responseIndex].data as Cart;
        responseIndex += 1;
        setCartBadgeCount(cart.items.reduce((sum, item) => sum + item.quantity, 0));

        const customerOrders = responses[responseIndex].data as Order[];
        responseIndex += 1;

        setOrdersBadgeCount(
          customerOrders.filter((order) => !['delivered', 'cancelled'].includes(order.status)).length
        );
      } else {
        setCartBadgeCount(0);
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
        setCartBadgeCount(0);
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
          height: useCompactTabs ? 64 : 68,
          paddingTop: useCompactTabs ? 4 : 6,
          paddingBottom: useCompactTabs ? 6 : 8,
        },
        tabBarItemStyle: {
          paddingHorizontal: useCompactTabs ? 0 : 2,
        },
        tabBarLabelStyle: {
          fontSize: useCompactTabs ? 10 : 12,
          fontWeight: '700',
        },
        tabBarLabelPosition: 'below-icon',
        tabBarAllowFontScaling: false,
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons
            name={getTabIconName(route.name, focused)}
            size={useCompactTabs ? Math.max(size - 2, 18) : size}
            color={color}
          />
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Shop', href: showCustomerTabs ? undefined : null }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          href: showCustomerTabs ? undefined : null,
          tabBarBadge: cartBadgeCount > 0 ? cartBadgeCount : undefined,
        }}
      />
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
          title: useCompactTabs ? 'Ops' : 'Operations',
          href: showOperations ? undefined : null,
          tabBarBadge: operationsBadgeCount > 0 ? operationsBadgeCount : undefined,
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          title: useCompactTabs ? 'Delivery' : 'Deliveries',
          href: showDeliveries ? undefined : null,
          tabBarBadge: deliveriesBadgeCount > 0 ? deliveriesBadgeCount : undefined,
        }}
      />
      <Tabs.Screen name="order-chat/[orderId]" options={{ href: null }} />
      <Tabs.Screen name="delivery-map/[deliveryId]" options={{ href: null }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Alerts', tabBarBadge: unreadAlertsCount > 0 ? unreadAlertsCount : undefined }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: useCompactTabs ? 'Report' : 'Reports', href: showReports ? undefined : null }}
      />
      <Tabs.Screen name="admin" options={{ title: 'Admin', href: showAdmin ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
