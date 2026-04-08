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

type FilterMode = 'unread' | 'read' | 'all';

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

function getNotificationTheme(kind: string) {
  switch (kind) {
    case 'order':
      return {
        tint: '#16A34A',
        soft: '#DCFCE7',
        text: '#166534',
        emoji: '🧾',
      };
    case 'delivery':
      return {
        tint: '#2563EB',
        soft: '#DBEAFE',
        text: '#1E3A8A',
        emoji: '🛵',
      };
    case 'inventory':
      return {
        tint: '#D97706',
        soft: '#FEF3C7',
        text: '#92400E',
        emoji: '📦',
      };
    case 'operations':
      return {
        tint: '#7C3AED',
        soft: '#EDE9FE',
        text: '#5B21B6',
        emoji: '🛒',
      };
    default:
      return {
        tint: '#475569',
        soft: '#E2E8F0',
        text: '#334155',
        emoji: '🔔',
      };
  }
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('unread');

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

  const updateReadState = async (notificationId: number, isRead: boolean) => {
    setBusyId(notificationId);
    try {
      const response = await api.put<Notification>(`/notifications/${notificationId}`, {
        is_read: isRead,
      });
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
      if (!Array.isArray(response.data)) {
        throw new Error('Unexpected notifications response');
      }
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
  const readCount = notifications.length - unreadCount;
  const sortedNotifications = [...notifications].sort((a, b) => {
    if (a.is_read !== b.is_read) {
      return a.is_read ? 1 : -1;
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const filteredNotifications = sortedNotifications.filter((notification) => {
    if (filterMode === 'unread') {
      return !notification.is_read;
    }

    if (filterMode === 'read') {
      return notification.is_read;
    }

    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={filteredNotifications}
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
          <View style={styles.headerWrap}>
            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>Inbox</Text>
              <Text style={styles.title}>Alerts</Text>
              <Text style={styles.subtitle}>
                {unreadCount
                  ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'} waiting for your attention.`
                  : 'You are all caught up on order, delivery, and inventory activity.'}
              </Text>
              <View style={styles.metricsRow}>
                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    filterMode === 'unread' && styles.metricCardActive,
                  ]}
                  onPress={() => setFilterMode('unread')}
                >
                  <Text style={styles.metricValue}>{unreadCount}</Text>
                  <Text style={styles.metricLabel}>Unread</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    filterMode === 'read' && styles.metricCardActive,
                  ]}
                  onPress={() => setFilterMode('read')}
                >
                  <Text style={styles.metricValue}>{readCount}</Text>
                  <Text style={styles.metricLabel}>Read</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.metricCard,
                    filterMode === 'all' && styles.metricCardActive,
                  ]}
                  onPress={() => setFilterMode('all')}
                >
                  <Text style={styles.metricValue}>{notifications.length}</Text>
                  <Text style={styles.metricLabel}>Total</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.actionRow}>
              <View>
                <Text style={styles.sectionLabel}>Recent activity</Text>
                <Text style={styles.sectionHint}>
                  {filterMode === 'unread'
                    ? 'Unread alerts stay pinned to the top.'
                    : filterMode === 'read'
                      ? 'Showing alerts you have already reviewed.'
                      : 'Showing every alert in your inbox.'}
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
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No alerts yet.</Text>
            <Text style={styles.emptyText}>Order, delivery, and inventory updates will show up here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.card,
              item.is_read && styles.readCard,
              { borderLeftColor: getNotificationTheme(item.kind).tint },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderMain}>
                <View
                  style={[
                    styles.kindIconWrap,
                    { backgroundColor: getNotificationTheme(item.kind).soft },
                  ]}
                >
                  <Text style={styles.kindIcon}>{getNotificationTheme(item.kind).emoji}</Text>
                </View>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <View style={styles.badgeRow}>
                    <Text
                      style={[
                        styles.kindBadge,
                        {
                          backgroundColor: getNotificationTheme(item.kind).soft,
                          color: getNotificationTheme(item.kind).text,
                        },
                      ]}
                    >
                      {formatNotificationKind(item.kind)}
                    </Text>
                    {!item.is_read ? <View style={styles.unreadDot} /> : null}
                  </View>
                </View>
              </View>
            </View>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.metaText}>{new Date(item.created_at).toLocaleString()}</Text>
            {!item.is_read ? (
              <TouchableOpacity
                style={[styles.readButton, busyId === item.id && styles.disabledButton]}
                onPress={() => updateReadState(item.id, true)}
                disabled={busyId === item.id}
              >
                <Text style={styles.readButtonText}>{busyId === item.id ? 'Saving...' : 'Mark as read'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.unreadButton, busyId === item.id && styles.disabledButton]}
                onPress={() => updateReadState(item.id, false)}
                disabled={busyId === item.id}
              >
                <Text style={styles.unreadButtonText}>
                  {busyId === item.id ? 'Saving...' : 'Mark as unread'}
                </Text>
              </TouchableOpacity>
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
  headerWrap: {
    gap: 14,
    paddingTop: 20,
    paddingBottom: 8,
  },
  heroCard: {
    backgroundColor: '#0F5A35',
    borderRadius: 28,
    padding: 22,
  },
  eyebrow: {
    color: '#C7F9CC',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 10,
  },
  subtitle: {
    marginTop: 8,
    color: '#E7FBE8',
    lineHeight: 21,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    padding: 12,
  },
  metricCardActive: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  metricLabel: {
    marginTop: 6,
    color: '#D6F5D9',
    fontWeight: '600',
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHint: {
    marginTop: 4,
    color: '#64748B',
  },
  markAllButton: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  markAllText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    borderLeftWidth: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  readCard: {
    opacity: 0.86,
  },
  cardHeader: {
    alignItems: 'flex-start',
  },
  cardHeaderMain: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  kindIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindIcon: {
    fontSize: 20,
  },
  cardTitleWrap: {
    flex: 1,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  kindBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontWeight: '700',
    overflow: 'hidden',
    fontSize: 12,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#16A34A',
  },
  message: {
    marginTop: 10,
    color: '#334155',
    lineHeight: 22,
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
  unreadButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  unreadButtonText: {
    color: '#334155',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
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
