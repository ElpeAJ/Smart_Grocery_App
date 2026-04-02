import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import type { Notification } from '../../src/types/api';

function formatNotificationKind(kind: string) {
  switch (kind) {
    case 'order':
      return 'Order';
    case 'delivery':
      return 'Delivery';
    case 'inventory':
      return 'Inventory';
    case 'operations':
      return 'Operations';
    default:
      return 'General';
  }
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await api.get<Notification[]>('/notifications/');
      setNotifications(response.data);
    } catch (error: any) {
      Alert.alert('Could not load alerts', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markOneRead = async (notificationId: number) => {
    setBusyId(notificationId);
    try {
      const response = await api.put<Notification>(`/notifications/${notificationId}/read`);
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) => (item.id === response.data.id ? response.data : item))
      );
    } catch (error: any) {
      Alert.alert('Could not update alert', error.response?.data?.detail || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const response = await api.put<Notification[]>('/notifications/read-all');
      setNotifications(response.data);
    } catch (error: any) {
      Alert.alert('Could not mark all read', error.response?.data?.detail || 'Please try again.');
    } finally {
      setMarkingAll(false);
    }
  };

  if (loading) {
    return <LoadingScreen label="Loading alerts..." />;
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadNotifications();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Alerts</Text>
              <Text style={styles.subtitle}>
                {unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'All caught up'}
              </Text>
            </View>
            {notifications.length ? (
              <TouchableOpacity
                style={[styles.markAllButton, markingAll && styles.disabledButton]}
                onPress={markAllRead}
                disabled={markingAll}
              >
                <Text style={styles.markAllText}>{markingAll ? 'Saving...' : 'Mark all read'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No alerts yet.</Text>
            <Text style={styles.emptyText}>Order, delivery, and inventory updates will show up here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, item.is_read && styles.readCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.kindBadge}>{formatNotificationKind(item.kind)}</Text>
            </View>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.metaText}>{new Date(item.created_at).toLocaleString()}</Text>
            {!item.is_read ? (
              <TouchableOpacity
                style={[styles.readButton, busyId === item.id && styles.disabledButton]}
                onPress={() => markOneRead(item.id)}
                disabled={busyId === item.id}
              >
                <Text style={styles.readButtonText}>{busyId === item.id ? 'Saving...' : 'Mark as read'}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.readLabel}>Read</Text>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 6,
    color: '#64748B',
  },
  markAllButton: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  markAllText: {
    color: '#0369A1',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A',
  },
  readCard: {
    borderLeftColor: '#CBD5E1',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  kindBadge: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  message: {
    marginTop: 10,
    color: '#334155',
    lineHeight: 20,
  },
  metaText: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 12,
  },
  readButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  readButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  readLabel: {
    marginTop: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyText: {
    marginTop: 8,
    color: '#64748B',
    textAlign: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
