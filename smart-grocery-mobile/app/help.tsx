import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const HELP_SECTIONS = [
  {
    title: 'How shopping works',
    body:
      'Choose a store, browse products by category, add items to your cart, and place an order through checkout. Your order history keeps only your own customer orders.',
  },
  {
    title: 'How fulfillment works',
    body:
      'Store staff pick items one by one. Once everything is picked, the order is marked ready for delivery and moves to the deliveries queue for assignment.',
  },
  {
    title: 'Who sees what',
    body:
      'Customers shop and track personal orders. Staff handle picking. Drivers handle assigned deliveries. Managers run catalog, fulfillment, and delivery operations, while admins oversee stores, users, roles, and system-wide reporting.',
  },
  {
    title: 'Notifications and reports',
    body:
      'Alerts keep each role updated on order, delivery, and stock activity. Reports show completed work by day, week, month, quarter, half-year, and year.',
  },
];

export default function HelpScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Support</Text>
          <Text style={styles.title}>Help & Support</Text>
          <Text style={styles.subtitle}>
            A quick guide to how the live Smart Grocery app works across customer, operations, delivery,
            and admin roles.
          </Text>
        </View>

        {HELP_SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            <Text style={styles.cardBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>Need to test a different workflow?</Text>
          <Text style={styles.tipBody}>
            Use separate accounts for customer, staff, driver, and manager/admin roles so each workspace
            stays clean and realistic.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F6F0',
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '700',
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
    marginTop: 10,
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 10,
    color: '#E7FBE8',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardBody: {
    marginTop: 10,
    color: '#475569',
    lineHeight: 22,
  },
  tipCard: {
    backgroundColor: '#ECFCCB',
    borderRadius: 22,
    padding: 18,
  },
  tipTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#365314',
  },
  tipBody: {
    marginTop: 10,
    color: '#4D7C0F',
    lineHeight: 22,
  },
});
