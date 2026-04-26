import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../../src/api/client';
import LoadingScreen from '../../../src/components/LoadingScreen';
import { useAuth } from '../../../src/context/AuthContext';
import type { Order, OrderChatThread } from '../../../src/types/api';

function buildSuggestions(role?: string | null, orderStatus?: Order['status']) {
  if (orderStatus === 'out_for_delivery') {
    if (role === 'customer') {
      return [
        'I am available to receive the order now.',
        'Please call me when you arrive.',
        'I need to update my delivery directions.',
      ];
    }

    if (role === 'driver') {
      return [
        'I am on the way with your order.',
        'I am nearby. Please confirm your exact location.',
        'I have arrived at the delivery point.',
      ];
    }

    return [
      'The driver has been assigned and is preparing to leave.',
      'Please keep this chat focused on delivery coordination now.',
      'I am stepping in to help with this delivery update.',
    ];
  }

  if (role === 'customer') {
    return [
      'Please substitute with a similar item.',
      'Please remove the unavailable item.',
      'What alternatives do you have in stock?',
    ];
  }

  return [
    'This item is unavailable. Would you like a substitute?',
    'We can remove this item and continue with the rest of your order.',
    'We have a similar product in stock if you would like a replacement.',
  ];
}

function getHelperText(thread: OrderChatThread, role?: string | null) {
  if (thread.order_status === 'out_for_delivery') {
    if (role === 'customer') {
      return 'Use this chat to coordinate directly with your delivery driver while managers stay available for support.';
    }

    if (role === 'driver') {
      return 'Use this chat to coordinate delivery details directly with the customer.';
    }

    return 'Delivery chat is now active. Managers and admins can oversee the conversation if support is needed.';
  }

  return 'Use this chat for substitutions, unavailable items, and order clarification while the order is active.';
}

function getReadOnlyCopy(thread: OrderChatThread, role?: string | null) {
  if (thread.order_status === 'delivered') {
    return {
      title: 'Order conversation closed',
      body: 'This order has been delivered successfully, so the chat is now read-only for everyone.',
    };
  }

  if (thread.order_status === 'cancelled') {
    return {
      title: 'Order conversation closed',
      body: 'This order was cancelled, so the chat is now read-only.',
    };
  }

  if (thread.order_status === 'out_for_delivery') {
    return {
      title: 'Chat is now read-only for your role',
      body:
        role === 'staff'
          ? 'This order is already with the delivery team, so active messaging now belongs to the customer, driver, and management team.'
          : 'This order is in delivery, so active messaging now belongs to the customer, driver, and management team.',
    };
  }

  return {
    title: 'Chat is now read-only for your role',
    body: 'This conversation is no longer open for new messages.',
  };
}

const STATUS_STEPS: {
  key: Order['status'];
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'pending', label: 'Placed', shortLabel: 'Placed', icon: 'bag-check-outline' },
  { key: 'accepted', label: 'Accepted', shortLabel: 'Accepted', icon: 'checkmark-circle-outline' },
  { key: 'awaiting_review', label: 'Awaiting Review', shortLabel: 'Review', icon: 'document-text-outline' },
  { key: 'out_for_delivery', label: 'Out for Delivery', shortLabel: 'Delivery', icon: 'bicycle-outline' },
  { key: 'delivered', label: 'Delivered', shortLabel: 'Delivered', icon: 'home-outline' },
];

function getStatusLabel(status: Order['status']) {
  switch (status) {
    case 'pending':
      return 'Placed';
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

function getStatusProgress(status: Order['status']) {
  if (status === 'picking') {
    return 2;
  }

  const index = STATUS_STEPS.findIndex((step) => step.key === status);
  return index === -1 ? 0 : index;
}

function getInitials(name?: string | null) {
  if (!name) {
    return 'SG';
  }

  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'SG';
}

export default function OrderChatScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { user } = useAuth();
  const listRef = useRef<FlatList<OrderChatThread['messages'][number]>>(null);
  const inputRef = useRef<TextInput>(null);
  const [thread, setThread] = useState<OrderChatThread | null>(null);
  const [message, setMessage] = useState('');
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const hasShownLoadErrorRef = useRef(false);
  const suggestions = useMemo(
    () => buildSuggestions(user?.role, thread?.order_status),
    [thread?.order_status, user?.role]
  );
  const readOnlyCopy = useMemo(
    () => (thread ? getReadOnlyCopy(thread, user?.role) : null),
    [thread, user?.role]
  );
  const showSuggestions = isComposerFocused && !message.trim();
  const statusProgress = getStatusProgress(thread?.order_status ?? 'pending');

  const loadThread = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!orderId) {
        return;
      }

      try {
        const response = await api.get<OrderChatThread>(`/order-chats/${orderId}`);
        setThread(response.data);
        if (!options?.silent) {
          hasShownLoadErrorRef.current = false;
        }
      } catch (error: any) {
        setPollingEnabled(false);

        if (!options?.silent && !hasShownLoadErrorRef.current) {
          hasShownLoadErrorRef.current = true;
          Alert.alert(
            'Could not load chat',
            error.response?.data?.detail || 'Please try again.',
            [
              {
                text: 'OK',
                onPress: () => router.back(),
              },
            ]
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [orderId]
  );

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!pollingEnabled) {
      return;
    }

    const intervalId = setInterval(() => {
      loadThread({ silent: true });
    }, 10000);

    return () => clearInterval(intervalId);
  }, [loadThread, pollingEnabled]);

  useEffect(() => {
    if (!thread?.messages.length) {
      return;
    }

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [thread?.messages.length]);

  const sendMessage = async (nextMessage: string, messageType: 'text' | 'suggestion' = 'text') => {
    if (!orderId || !nextMessage.trim()) {
      return;
    }

    setSending(true);
    try {
      const response = await api.post<OrderChatThread>(`/order-chats/${orderId}/messages`, {
        message: nextMessage.trim(),
        message_type: messageType,
      });
      setThread(response.data);
      setMessage('');
    } catch (error: any) {
      Alert.alert('Could not send message', error.response?.data?.detail || 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const applySuggestion = (suggestion: string) => {
    setMessage(suggestion);
    inputRef.current?.focus();
  };

  if (loading || !thread) {
    return <LoadingScreen label="Loading chat..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.orderLabel}>Order #{thread.order_id}</Text>
          <Text style={styles.statusLabel}>{getStatusLabel(thread.order_status)}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.progressRow}
          >
            {STATUS_STEPS.map((step, index) => {
              const isCompleted = index <= statusProgress;
              const isCurrent = index === statusProgress;

              return (
                <View key={step.key} style={styles.progressStep}>
                  <View style={styles.progressNodeRow}>
                    <View
                      style={[
                        styles.progressNode,
                        isCompleted && styles.progressNodeCompleted,
                        isCurrent && styles.progressNodeCurrent,
                      ]}
                    >
                      <Ionicons
                        name={step.icon}
                        size={15}
                        color={isCompleted ? '#FFFFFF' : '#94A3B8'}
                      />
                    </View>
                    {index < STATUS_STEPS.length - 1 ? (
                      <View
                        style={[
                          styles.progressLine,
                          index < statusProgress && styles.progressLineCompleted,
                        ]}
                      />
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.progressLabel,
                      isCurrent && styles.progressLabelCurrent,
                      isCompleted && styles.progressLabelCompleted,
                    ]}
                  >
                    {step.shortLabel}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
          <Text style={styles.helperText}>{getHelperText(thread, user?.role)}</Text>
        </View>

        <FlatList
          ref={listRef}
          data={thread.messages}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.messagesContent}
          renderItem={({ item }) => {
            const isOwn = item.sender_user_id === user?.id;
            const isSystem = item.message_type === 'system';
            return (
              <View
                style={[
                  styles.messageRow,
                  isOwn ? styles.ownMessageRow : styles.otherMessageRow,
                  isSystem && styles.systemMessageRow,
                ]}
              >
                {!isOwn && !isSystem ? (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(item.sender_name)}</Text>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.messageCard,
                    isOwn ? styles.ownMessageCard : styles.otherMessageCard,
                    isSystem && styles.systemMessageCard,
                  ]}
                >
                  {!isOwn && !isSystem ? (
                    <Text style={styles.messageMeta}>
                      {item.sender_name || 'Unknown'} • {item.sender_role || 'user'}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.messageText,
                      isOwn && styles.ownMessageText,
                      isSystem && styles.systemMessageText,
                    ]}
                  >
                    {item.message}
                  </Text>
                  <Text style={[styles.messageTime, isOwn && styles.ownMessageTime]}>
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        {thread.can_send_message ? (
          <View style={styles.composer}>
            {showSuggestions ? (
              <View style={styles.suggestionWrap}>
                <Text style={styles.suggestionTitle}>Smart suggestions</Text>
                <Text style={styles.suggestionHint}>Tap one to add it to your message box, then press Send.</Text>
                <View style={styles.suggestionRow}>
                  {suggestions.map((suggestion) => (
                    <TouchableOpacity
                      key={suggestion}
                      style={styles.suggestionChip}
                      onPress={() => applySuggestion(suggestion)}
                      disabled={sending}
                    >
                      <Text style={styles.suggestionChipText}>{suggestion}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.composerRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Type a message..."
                value={message}
                onChangeText={setMessage}
                onFocus={() => setIsComposerFocused(true)}
                onBlur={() => setIsComposerFocused(false)}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.disabledButton]}
                onPress={() => sendMessage(message)}
                disabled={sending}
              >
                <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyTitle}>{readOnlyCopy?.title}</Text>
            <Text style={styles.readOnlyText}>{readOnlyCopy?.body}</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#325D3E',
    fontWeight: '700',
  },
  orderLabel: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
  },
  statusLabel: {
    color: '#2E63D6',
    fontSize: 16,
    fontWeight: '700',
  },
  progressRow: {
    paddingTop: 8,
    paddingBottom: 4,
    gap: 12,
  },
  progressStep: {
    minWidth: 66,
    alignItems: 'center',
  },
  progressNodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  progressNodeCompleted: {
    backgroundColor: '#32A852',
    borderColor: '#32A852',
  },
  progressNodeCurrent: {
    backgroundColor: '#2E63D6',
    borderColor: '#2E63D6',
  },
  progressLine: {
    width: 46,
    height: 2,
    backgroundColor: '#D6DDE8',
  },
  progressLineCompleted: {
    backgroundColor: '#7AB8FF',
  },
  progressLabel: {
    marginTop: 6,
    color: '#8A94A6',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressLabelCurrent: {
    color: '#2E63D6',
  },
  progressLabelCompleted: {
    color: '#4B5563',
  },
  helperText: {
    color: '#6B7280',
    lineHeight: 19,
    marginTop: 2,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 6,
    gap: 12,
  },
  suggestionWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  suggestionHint: {
    color: '#475569',
    fontSize: 12,
    marginBottom: 10,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  suggestionChipText: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  ownMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  systemMessageRow: {
    justifyContent: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#325EDB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  messageCard: {
    borderRadius: 18,
    padding: 14,
    maxWidth: '78%',
  },
  ownMessageCard: {
    alignSelf: 'flex-end',
    backgroundColor: '#E8F5DD',
  },
  otherMessageCard: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5F7FB',
  },
  systemMessageCard: {
    maxWidth: '90%',
    alignSelf: 'center',
    backgroundColor: '#F3F4F6',
  },
  messageMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
  },
  messageText: {
    color: '#1F2937',
    lineHeight: 22,
    fontSize: 16,
  },
  ownMessageText: {
    color: '#1F2937',
  },
  systemMessageText: {
    textAlign: 'center',
    color: '#4B5563',
  },
  messageTime: {
    marginTop: 8,
    fontSize: 11,
    color: '#9CA3AF',
    alignSelf: 'flex-end',
  },
  ownMessageTime: {
    color: '#6B7280',
  },
  composer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 11,
    minHeight: 48,
    maxHeight: 120,
    textAlignVertical: 'center',
  },
  sendButton: {
    backgroundColor: '#16A34A',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  readOnlyBanner: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  readOnlyTitle: {
    color: '#0F172A',
    fontWeight: '700',
  },
  readOnlyText: {
    color: '#64748B',
    lineHeight: 20,
  },
});
