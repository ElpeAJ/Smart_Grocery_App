import React, { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { Order, OrderChatThread } from '../../src/types/api';

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
  const suggestions = useMemo(
    () => buildSuggestions(user?.role, thread?.order_status),
    [thread?.order_status, user?.role]
  );
  const showSuggestions = isComposerFocused && !message.trim();
  const totalMessages = thread?.messages.length ?? 0;

  const loadThread = async () => {
    if (!orderId) {
      return;
    }

    try {
      const response = await api.get<OrderChatThread>(`/order-chats/${orderId}`);
      setThread(response.data);
    } catch (error: any) {
      Alert.alert('Could not load chat', error.response?.data?.detail || 'Please try again.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadThread();
    }, 10000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Order Chat</Text>
          <Text style={styles.subtitle}>Order #{thread.order_id}</Text>
          <View style={styles.headerMetaRow}>
            <Text style={styles.headerMetaPill}>
              {totalMessages > 0 ? `${totalMessages} messages` : 'No messages yet'}
            </Text>
            <Text style={styles.headerMetaPill}>{`Talking to ${thread.counterpart_label}`}</Text>
          </View>
          <Text style={styles.helperText}>{getHelperText(thread, user?.role)}</Text>
        </View>

        <FlatList
          ref={listRef}
          data={thread.messages}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.messagesContent}
          renderItem={({ item }) => {
            const isOwn = item.sender_user_id === user?.id;
            return (
              <View style={[styles.messageCard, isOwn ? styles.ownMessageCard : styles.otherMessageCard]}>
                <Text style={styles.messageMeta}>
                  {item.sender_name || 'Unknown'} • {item.sender_role || 'user'}
                </Text>
                <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>{item.message}</Text>
                <Text style={styles.messageTime}>{new Date(item.created_at).toLocaleString()}</Text>
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
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Type a message about this order"
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
              <Text style={styles.sendButtonText}>{sending ? 'Sending...' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyTitle}>Chat is now read-only for your role</Text>
            <Text style={styles.readOnlyText}>
              This order has moved into delivery, so active messaging now belongs to the customer, driver, and management team.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  header: {
    padding: 20,
    gap: 6,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#2563EB',
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    color: '#64748B',
  },
  headerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  headerMetaPill: {
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
    fontSize: 12,
  },
  helperText: {
    marginTop: 8,
    color: '#475569',
    lineHeight: 20,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
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
  messageCard: {
    borderRadius: 18,
    padding: 14,
    maxWidth: '86%',
  },
  ownMessageCard: {
    alignSelf: 'flex-end',
    backgroundColor: '#16A34A',
  },
  otherMessageCard: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
  },
  messageMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  messageText: {
    color: '#0F172A',
    lineHeight: 21,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    marginTop: 8,
    fontSize: 11,
    color: '#94A3B8',
  },
  composer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
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
