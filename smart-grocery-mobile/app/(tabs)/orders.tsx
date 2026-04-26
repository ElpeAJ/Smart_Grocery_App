import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  Alert,
  Animated,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { Delivery, Order, OrderChatSummary } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { triggerLightHaptic, triggerSuccessHaptic } from '../../src/utils/haptics';
import { getHomeRouteForRole, isCustomerRole } from '../../src/utils/roles';

function getChatLabel(summary?: OrderChatSummary) {
  if (!summary?.has_messages) {
    return 'Start Chat';
  }

  if (summary.unread_count > 0) {
    return 'Reply to Store';
  }

  return 'Open Chat';
}

function formatOrderStatus(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'picking':
      return 'Picking';
    case 'awaiting_review':
      return 'Awaiting review';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
  }
}

function formatCustomerDeliveryStatus(order: Order, delivery?: Delivery) {
  if (delivery?.status === 'on_the_way') {
    return 'On the way';
  }

  if (delivery?.status === 'delivered' || order.status === 'delivered') {
    return 'Delivered';
  }

  return formatOrderStatus(order.status);
}

function formatTrackingTime(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDeliveryStageState(order: Order, delivery?: Delivery) {
  const stages = [
    {
      key: 'placed',
      label: 'Placed',
      complete: true,
      meta: formatTrackingTime(order.created_at),
    },
    {
      key: 'prepared',
      label: 'Prepared',
      complete: ['awaiting_review', 'out_for_delivery', 'delivered'].includes(order.status),
      meta: order.status === 'picking' ? 'Store team is picking' : null,
    },
    {
      key: 'assigned',
      label: 'Driver assigned',
      complete: Boolean(delivery?.driver_id),
      meta: delivery?.driver_name || null,
    },
    {
      key: 'on_the_way',
      label: 'On the way',
      complete: delivery?.status === 'on_the_way' || delivery?.status === 'delivered',
      meta: formatTrackingTime(delivery?.started_at),
    },
    {
      key: 'delivered',
      label: 'Delivered',
      complete: order.status === 'delivered',
      meta: formatTrackingTime(delivery?.delivered_at),
    },
  ];

  return stages;
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useState(() => new Animated.Value(0))[0];
  const [heroHeight, setHeroHeight] = useState(280);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveriesByOrderId, setDeliveriesByOrderId] = useState<Record<number, Delivery>>({});
  const [chatSummaries, setChatSummaries] = useState<Record<number, OrderChatSummary>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<number, { rating: number; comment: string }>>({});
  const [submittingReviewOrderId, setSubmittingReviewOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const role = user?.role;

  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const [ordersResult, chatResult, deliveriesResult] = await Promise.allSettled([
        api.get<Order[]>('/orders/my-orders'),
        api.get<OrderChatSummary[]>('/order-chats/summary'),
        api.get<Delivery[]>('/deliveries/my'),
      ]);
      if (ordersResult.status !== 'fulfilled') {
        throw ordersResult.reason;
      }

      const ordersResponse = ordersResult.value;
      const chatResponse = chatResult.status === 'fulfilled' ? chatResult.value : null;
      const deliveriesResponse = deliveriesResult.status === 'fulfilled' ? deliveriesResult.value : null;
      const sortedOrders = [...ordersResponse.data].sort(
        (firstOrder, secondOrder) =>
          new Date(secondOrder.created_at).getTime() - new Date(firstOrder.created_at).getTime()
      );
      setOrders(sortedOrders);
      setChatSummaries(
        Object.fromEntries((chatResponse?.data ?? []).map((summary) => [summary.order_id, summary]))
      );
      setDeliveriesByOrderId(
        Object.fromEntries((deliveriesResponse?.data ?? []).map((delivery) => [delivery.order_id, delivery]))
      );
    } catch (error: any) {
      if (!options?.silent) {
        Alert.alert('Could not load orders', error.response?.data?.detail || 'Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const updateReviewDraft = (orderId: number, nextDraft: Partial<{ rating: number; comment: string }>) => {
    setReviewDrafts((currentDrafts) => {
      const existingDraft = currentDrafts[orderId] ?? { rating: 0, comment: '' };
      return {
        ...currentDrafts,
        [orderId]: {
          ...existingDraft,
          ...nextDraft,
        },
      };
    });
  };

  const submitReview = async (orderId: number) => {
    const draft = reviewDrafts[orderId] ?? { rating: 0, comment: '' };

    if (draft.rating < 1 || draft.rating > 5) {
      Alert.alert('Missing rating', 'Choose a star rating before submitting your review.');
      return;
    }

    await triggerLightHaptic();
    setSubmittingReviewOrderId(orderId);
    try {
      await api.put(`/orders/${orderId}/review`, {
        rating: draft.rating,
        comment: draft.comment.trim() || null,
      });
      await fetchOrders({ silent: true });
      await triggerSuccessHaptic();
      Alert.alert('Review saved', 'Thanks for rating your delivery experience.');
    } catch (error: any) {
      Alert.alert('Could not save review', error.response?.data?.detail || 'Please try again.');
    } finally {
      setSubmittingReviewOrderId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchOrders();

      const intervalId = setInterval(() => {
        fetchOrders({ silent: true });
      }, 5000);

      return () => clearInterval(intervalId);
    }, [fetchOrders])
  );

  if (loading) {
    return <LoadingScreen label="Loading orders..." />;
  }

  if (!isCustomerRole(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  const activeOrdersCount = orders.filter((order) => !['delivered', 'cancelled'].includes(order.status)).length;
  const compactHeaderStart = Math.max(heroHeight - 24, 250);
  const compactHeaderEnd = compactHeaderStart + 72;
  const compactHeaderOpacity = scrollY.interpolate({
    inputRange: [compactHeaderStart, compactHeaderEnd],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const compactHeaderTranslateY = scrollY.interpolate({
    inputRange: [compactHeaderStart, compactHeaderEnd],
    outputRange: [-20, 0],
    extrapolate: 'clamp',
  });
  const listHeader = (
    <View style={styles.header}>
      <View
        style={styles.heroCard}
        onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height + 24)}
      >
        <Text style={styles.eyebrow}>TRACK YOUR GROCERIES</Text>
        <Text style={styles.title}>Your Order History</Text>
        <Text style={styles.subtitle}>
          Keep up with your shopping journey, delivery window, and any messages from the store team.
        </Text>
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{orders.length}</Text>
            <Text style={styles.heroStatLabel}>Total orders</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{activeOrdersCount}</Text>
            <Text style={styles.heroStatLabel}>Active now</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.compactHeaderWrap,
          {
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
          },
          {
            opacity: compactHeaderOpacity,
            transform: [{ translateY: compactHeaderTranslateY }],
          },
        ]}
      >
        <View style={styles.compactHeaderCard}>
          <View style={styles.compactHeaderText}>
            <Text style={styles.compactHeaderTitle}>Order History</Text>
            <Text style={styles.compactHeaderMeta}>
              {orders.length} orders • {activeOrdersCount} active
            </Text>
          </View>
          <Ionicons name="receipt-outline" size={20} color="#166534" />
        </View>
      </Animated.View>
      <Animated.FlatList
        data={orders}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchOrders();
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text>No orders yet.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            {(() => {
              const chatSummary = chatSummaries[item.id];
              const delivery = deliveriesByOrderId[item.id];
              const deliveryStages = getDeliveryStageState(item, delivery);
              const showTracking =
                item.status !== 'cancelled' &&
                (item.status === 'out_for_delivery' || item.status === 'delivered' || Boolean(delivery));

              return (
                <>
            <Text style={styles.orderTitle}>
              {`Order ${orders.length - index}`}
            </Text>
            <View style={styles.infoRow}>
              <Ionicons name="barcode-outline" size={15} color="#64748B" />
              <Text style={styles.orderMeta}>Reference: #{item.id}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="bag-check-outline" size={15} color="#64748B" />
              <Text style={styles.orderMeta}>Status: {formatCustomerDeliveryStatus(item, delivery)}</Text>
            </View>
            {item.delivery_window_label ? (
              <Text style={styles.deliveryWindow}>Delivery window: {item.delivery_window_label}</Text>
            ) : null}
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={15} color="#64748B" />
              <Text style={styles.orderMeta}>Created: {new Date(item.created_at).toLocaleString()}</Text>
            </View>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="basket-outline" size={16} color="#0F172A" />
              <Text style={styles.sectionTitle}>Items</Text>
            </View>
            {item.items.map((orderItem) => (
              <Text key={orderItem.id} style={styles.itemText}>
                {orderItem.product_name || `Product #${orderItem.product_id}`}: {orderItem.quantity} x{' '}
                {formatCedi(orderItem.unit_price)}
              </Text>
            ))}
            {showTracking ? (
              <View style={styles.trackerCard}>
                <View style={styles.trackerTitleRow}>
                  <Ionicons name="navigate-circle-outline" size={17} color="#14532D" />
                  <Text style={styles.trackerTitle}>Delivery tracking</Text>
                </View>
                <Text style={styles.trackerHint}>
                  {delivery?.status === 'delivered'
                    ? 'Your groceries have arrived.'
                    : delivery?.status === 'on_the_way'
                      ? 'Your driver is currently heading to you.'
                      : delivery?.driver_id
                        ? 'A driver has been assigned and handoff is underway.'
                        : item.status === 'awaiting_review'
                          ? 'Store team is wrapping up and preparing handoff.'
                          : 'We will update this tracker as your order moves.'}
                </Text>
                <View style={styles.stageRow}>
                  {deliveryStages.map((stage, stageIndex) => (
                    <View key={stage.key} style={styles.stageItem}>
                      <View style={[styles.stageDot, stage.complete && styles.stageDotComplete]}>
                        <Text style={[styles.stageDotText, stage.complete && styles.stageDotTextComplete]}>
                          {stageIndex + 1}
                        </Text>
                      </View>
                      {stageIndex < deliveryStages.length - 1 ? (
                        <View style={[styles.stageLine, stage.complete && styles.stageLineComplete]} />
                      ) : null}
                      <Text style={[styles.stageLabel, stage.complete && styles.stageLabelComplete]}>
                        {stage.label}
                      </Text>
                      {stage.meta ? <Text style={styles.stageMeta}>{stage.meta}</Text> : null}
                    </View>
                  ))}
                </View>
                {delivery?.driver_name ? (
                  <View style={styles.deliveryMetaPanel}>
                    <View style={styles.deliveryMetaTitleRow}>
                      <Ionicons name="information-circle-outline" size={16} color="#0F172A" />
                      <Text style={styles.deliveryMetaTitle}>Delivery details</Text>
                    </View>
                    <View style={styles.deliveryMetaRow}>
                      <Ionicons name="person-outline" size={15} color="#64748B" />
                      <Text style={styles.deliveryMetaText}>Driver: {delivery.driver_name}</Text>
                    </View>
                    <View style={styles.deliveryMetaRow}>
                      <Ionicons name="location-outline" size={15} color="#64748B" />
                      <Text style={styles.deliveryMetaText}>Address: {delivery.delivery_address}</Text>
                    </View>
                    {delivery.status === 'on_the_way' && delivery.driver_location_updated_at ? (
                      <View style={styles.deliveryMetaRow}>
                        <Ionicons name="radio-outline" size={15} color="#64748B" />
                        <Text style={styles.deliveryMetaText}>
                          Live update: {formatTrackingTime(delivery.driver_location_updated_at)}
                        </Text>
                      </View>
                    ) : null}
                    {delivery.driver_assigned_at ? (
                      <View style={styles.deliveryMetaRow}>
                        <Ionicons name="checkmark-done-outline" size={15} color="#64748B" />
                        <Text style={styles.deliveryMetaText}>
                          Assigned: {formatTrackingTime(delivery.driver_assigned_at)}
                        </Text>
                      </View>
                    ) : null}
                    {delivery.started_at ? (
                      <View style={styles.deliveryMetaRow}>
                        <Ionicons name="car-outline" size={15} color="#64748B" />
                        <Text style={styles.deliveryMetaText}>
                          Left store: {formatTrackingTime(delivery.started_at)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {delivery?.status === 'on_the_way' ? (
                  <TouchableOpacity
                    style={styles.trackButton}
                    onPress={() => router.push(`/delivery-map/${delivery.id}`)}
                  >
                    <Text style={styles.trackButtonText}>Track Driver Live</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {item.status === 'delivered' ? (
              <View style={styles.reviewCard}>
                <View style={styles.reviewTitleRow}>
                  <Ionicons name="star-outline" size={17} color="#9A6700" />
                  <Text style={styles.reviewTitle}>
                    {item.review ? 'Your review' : 'Rate this delivery'}
                  </Text>
                </View>
                <Text style={styles.reviewHint}>
                  {item.review
                    ? `Submitted ${formatTrackingTime(item.review.updated_at || item.review.created_at) ?? ''}`.trim()
                    : 'Now that delivery is complete and chat is closed, you can rate the experience.'}
                </Text>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const draftRating = reviewDrafts[item.id]?.rating ?? item.review?.rating ?? 0;
                    const active = star <= draftRating;
                    return (
                      <TouchableOpacity
                        key={`${item.id}-star-${star}`}
                        style={styles.starButton}
                        onPress={() => updateReviewDraft(item.id, { rating: star })}
                      >
                        <Ionicons
                          name={active ? 'star' : 'star-outline'}
                          size={24}
                          color={active ? '#F59E0B' : '#94A3B8'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TextInput
                  style={styles.reviewInput}
                  placeholder="Share a quick note about the order or delivery (optional)"
                  placeholderTextColor="#94A3B8"
                  multiline
                  value={reviewDrafts[item.id]?.comment ?? item.review?.comment ?? ''}
                  onChangeText={(value) => updateReviewDraft(item.id, { comment: value })}
                />
                <TouchableOpacity
                  style={[styles.reviewButton, submittingReviewOrderId === item.id && styles.disabledButton]}
                  onPress={() => submitReview(item.id)}
                  disabled={submittingReviewOrderId === item.id}
                >
                  <Text style={styles.reviewButtonText}>
                    {submittingReviewOrderId === item.id
                      ? 'Saving review...'
                      : item.review
                        ? 'Update Review'
                        : 'Submit Review'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {chatSummary?.has_messages || !['delivered', 'cancelled'].includes(item.status) ? (
              <>
                {['delivered', 'cancelled'].includes(item.status) ? (
                  <View style={styles.chatMetaRow}>
                    <Ionicons name="chatbubbles-outline" size={15} color="#64748B" />
                    <Text style={styles.chatMeta}>
                      Read-only conversation history is available for this completed order.
                    </Text>
                  </View>
                ) : chatSummary?.has_messages ? (
                  <View style={styles.chatMetaRow}>
                    <Ionicons name="chatbubble-ellipses-outline" size={15} color="#64748B" />
                    <Text style={styles.chatMeta}>
                      {chatSummary.unread_count > 0
                        ? `${chatSummary.unread_count} new ${chatSummary.unread_count === 1 ? 'store message' : 'store messages'}`
                        : `Last update from ${chatSummary.last_sender_role === 'customer' ? 'you' : 'store team'}`}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.chatMetaRow}>
                    <Ionicons name="chatbubble-outline" size={15} color="#64748B" />
                    <Text style={styles.chatMeta}>No conversation yet about this order.</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.chatButton}
                  onPress={() => router.push(`/order-chat/${item.id}`)}
                >
                  <Text style={styles.chatButtonText}>
                    {['delivered', 'cancelled'].includes(item.status) ? 'View Chat History' : getChatLabel(chatSummary)}
                  </Text>
                  {!['delivered', 'cancelled'].includes(item.status) && chatSummary?.unread_count ? (
                    <View style={styles.chatBadge}>
                      <Text style={styles.chatBadgeText}>{chatSummary.unread_count}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              </>
            ) : null}
                </>
              );
            })()}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F0',
  },
  compactHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: '#F6F6F0',
  },
  compactHeaderCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  compactHeaderText: {
    flex: 1,
    gap: 2,
  },
  compactHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#166534',
  },
  compactHeaderMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  header: {
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 6,
  },
  heroCard: {
    backgroundColor: '#1F5C3F',
    borderRadius: 28,
    padding: 22,
    gap: 12,
    shadowColor: '#163C2C',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  eyebrow: {
    color: '#CFE9D8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 29,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    color: '#D7E9DE',
    lineHeight: 21,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 6,
  },
  heroStat: {
    flex: 1,
    gap: 4,
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: '#CFE9D8',
    fontSize: 12,
    fontWeight: '600',
  },
  heroDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  listContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 30,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#A68E65',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  orderTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#166534',
  },
  infoRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderMeta: {
    color: '#475569',
    flex: 1,
  },
  deliveryWindow: {
    marginTop: 10,
    color: '#7C5C1B',
    fontWeight: '700',
    backgroundColor: '#FFF4DB',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionTitleRow: {
    marginTop: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemText: {
    marginBottom: 6,
    color: '#334155',
  },
  trackerCard: {
    marginTop: 16,
    backgroundColor: '#F8FBF8',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DDEBDD',
  },
  trackerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#14532D',
  },
  trackerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackerHint: {
    marginTop: 6,
    color: '#4B5563',
    lineHeight: 20,
  },
  stageRow: {
    marginTop: 14,
    gap: 10,
  },
  stageItem: {
    paddingLeft: 34,
    minHeight: 46,
    position: 'relative',
  },
  stageDot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageDotComplete: {
    backgroundColor: '#16A34A',
  },
  stageDotText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
  stageDotTextComplete: {
    color: '#FFFFFF',
  },
  stageLine: {
    position: 'absolute',
    left: 10,
    top: 24,
    bottom: -10,
    width: 2,
    backgroundColor: '#E5E7EB',
  },
  stageLineComplete: {
    backgroundColor: '#86EFAC',
  },
  stageLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  stageLabelComplete: {
    color: '#14532D',
  },
  stageMeta: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  deliveryMetaPanel: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
  },
  deliveryMetaTitle: {
    fontWeight: '800',
    color: '#0F172A',
  },
  deliveryMetaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  deliveryMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  deliveryMetaText: {
    color: '#475569',
    flex: 1,
  },
  trackButton: {
    marginTop: 12,
    backgroundColor: '#166534',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  trackButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  reviewCard: {
    marginTop: 16,
    backgroundColor: '#FFFDF7',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  reviewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
  },
  reviewHint: {
    marginTop: 6,
    color: '#6B7280',
    lineHeight: 19,
  },
  starRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 6,
  },
  starButton: {
    paddingVertical: 4,
    paddingRight: 2,
  },
  reviewInput: {
    marginTop: 10,
    minHeight: 88,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
    color: '#0F172A',
  },
  reviewButton: {
    marginTop: 12,
    backgroundColor: '#B45309',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  centerContainer: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    borderRadius: 24,
    shadowColor: '#A68E65',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  chatButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  chatMeta: {
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 20,
    flex: 1,
  },
  chatMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  chatBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chatBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
