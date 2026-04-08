import React, { useCallback, useState } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
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
import { useAuth } from '../../src/context/AuthContext';
import type { ReportPeriod, ReportSummary } from '../../src/types/api';
import { formatCedi } from '../../src/utils/currency';
import { canViewReports, getHomeRouteForRole } from '../../src/utils/roles';

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'half_year', label: 'Bi-Annual' },
  { value: 'year', label: 'Annual' },
];

function formatScopeLabel(scope: ReportSummary['scope']) {
  switch (scope) {
    case 'system':
      return 'System view';
    case 'staff':
      return 'Picker view';
    case 'driver':
      return 'Driver view';
    default:
      return 'Report view';
  }
}

export default function ReportsScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReport = useCallback(async (nextPeriod: ReportPeriod) => {
    try {
      const response = await api.get<ReportSummary>('/reports/summary', {
        params: { period: nextPeriod },
      });
      setReport(response.data);
    } catch (error: any) {
      Alert.alert('Could not load reports', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReport(period);
    }, [loadReport, period])
  );

  if (!canViewReports(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  if (loading || !report) {
    return <LoadingScreen label="Loading reports..." />;
  }

  const heading =
    report.scope === 'system'
      ? 'Fulfillment Reports'
      : report.scope === 'staff'
        ? 'Picker Reports'
        : 'Driver Reports';

  const subtitle =
    report.scope === 'system'
      ? 'Delivered orders across the system.'
      : report.scope === 'staff'
        ? 'Completed orders you helped pick.'
        : 'Completed deliveries assigned to you.';

  const averageOrderValue =
    report.completed_orders > 0 ? report.total_revenue / report.completed_orders : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={report.entries}
        keyExtractor={(item) => `${item.order_id}-${item.completed_at}`}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadReport(period);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>Performance</Text>
              <Text style={styles.title}>{heading}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
              <Text style={styles.scopeBadge}>{formatScopeLabel(report.scope)}</Text>
            </View>

            <FlatList
              data={PERIOD_OPTIONS}
              horizontal
              keyExtractor={(item) => item.value}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.periodRow}
              renderItem={({ item }) => {
                const active = item.value === period;
                return (
                  <TouchableOpacity
                    style={[styles.periodChip, active && styles.periodChipActive]}
                    onPress={() => setPeriod(item.value)}
                  >
                    <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{report.completed_orders}</Text>
                <Text style={styles.metricLabel}>Completed Orders</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{formatCedi(report.total_revenue)}</Text>
                <Text style={styles.metricLabel}>Revenue</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{formatCedi(averageOrderValue)}</Text>
                <Text style={styles.metricLabel}>Avg. Order</Text>
              </View>
            </View>

            <View style={styles.sectionIntro}>
              <Text style={styles.sectionTitle}>Completed activity</Text>
              <Text style={styles.sectionHint}>A clean record of work finished during this period.</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No completed work in this period yet.</Text>
            <Text style={styles.emptyText}>Delivered orders will appear here automatically.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <View>
                <Text style={styles.cardTitle}>Order #{item.order_id}</Text>
                <Text style={styles.cardSubtitle}>{item.customer_name || `Customer #${item.customer_id}`}</Text>
              </View>
              <Text style={styles.amountPill}>{formatCedi(item.total_amount)}</Text>
            </View>
            <Text style={styles.metaText}>
              Store: {item.store_name || (item.store_id ? `Store #${item.store_id}` : 'Unassigned')}
            </Text>
            <Text style={styles.metaText}>
              Driver: {item.driver_name || (item.driver_id ? `Driver #${item.driver_id}` : 'Unassigned')}
            </Text>
            <Text style={styles.metaText}>
              Completed: {new Date(item.completed_at).toLocaleString()}
            </Text>
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
    fontSize: 15,
    color: '#E7FBE8',
    marginTop: 8,
    lineHeight: 21,
  },
  scopeBadge: {
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '700',
  },
  periodRow: {
    gap: 10,
  },
  periodChip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  periodChipActive: {
    backgroundColor: '#1D4ED8',
  },
  periodChipText: {
    color: '#334155',
    fontWeight: '600',
  },
  periodChipTextActive: {
    color: '#fff',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
  },
  metricValue: {
    fontSize: 21,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  metricLabel: {
    marginTop: 6,
    color: '#64748B',
  },
  sectionIntro: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionHint: {
    color: '#64748B',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#166534',
  },
  cardSubtitle: {
    marginTop: 6,
    color: '#475569',
    fontWeight: '600',
  },
  metaText: {
    marginTop: 6,
    color: '#475569',
  },
  amountPill: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
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
});
