import React, { useCallback, useMemo, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import api from '../../src/api/client';
import LoadingScreen from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/context/AuthContext';
import type { OrderChatSummary, ReportEntry, ReportPeriod, ReportSummary } from '../../src/types/api';
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

const STATUS_COLORS: Record<string, string> = {
  delivered: '#16A34A',
  pending: '#F59E0B',
  accepted: '#0EA5E9',
  picking: '#8B5CF6',
  awaiting_review: '#F97316',
  out_for_delivery: '#2563EB',
  cancelled: '#DC2626',
  unknown: '#94A3B8',
};

const CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function addYears(value: Date, amount: number) {
  return new Date(value.getFullYear() + amount, value.getMonth(), 1);
}

function startOfWeek(value: Date) {
  const next = new Date(value);
  const mondayOffset = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - mondayOffset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfQuarter(value: Date) {
  return new Date(value.getFullYear(), Math.floor(value.getMonth() / 3) * 3, 1);
}

function startOfHalfYear(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() < 6 ? 0 : 6, 1);
}

function startOfYear(value: Date) {
  return new Date(value.getFullYear(), 0, 1);
}

function formatPeriodChoiceLabel(period: ReportPeriod, anchor: Date) {
  if (period === 'day') {
    return anchor.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  if (period === 'week') {
    const start = startOfWeek(anchor);
    const end = addDays(start, 6);
    return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  }

  if (period === 'month') {
    return anchor.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  if (period === 'quarter') {
    const quarter = Math.floor(anchor.getMonth() / 3) + 1;
    return `Q${quarter} ${anchor.getFullYear()}`;
  }

  if (period === 'half_year') {
    return `${anchor.getMonth() < 6 ? 'H1' : 'H2'} ${anchor.getFullYear()}`;
  }

  return `${anchor.getFullYear()}`;
}

function formatReportRangeLabel(report: ReportSummary) {
  return formatPeriodChoiceLabel(report.period, fromDateKey(report.anchor_date));
}

function buildPeriodChoices(period: ReportPeriod, anchorKey: string) {
  const anchor = fromDateKey(anchorKey);
  const items: { key: string; label: string }[] = [];

  if (period === 'week') {
    for (let offset = -10; offset <= 10; offset += 1) {
      const date = addDays(startOfWeek(anchor), offset * 7);
      items.push({ key: toDateKey(date), label: formatPeriodChoiceLabel(period, date) });
    }
    return items;
  }

  if (period === 'month') {
    for (let offset = -10; offset <= 10; offset += 1) {
      const date = addMonths(startOfMonth(anchor), offset);
      items.push({ key: toDateKey(date), label: formatPeriodChoiceLabel(period, date) });
    }
    return items;
  }

  if (period === 'quarter') {
    for (let offset = -8; offset <= 8; offset += 1) {
      const date = addMonths(startOfQuarter(anchor), offset * 3);
      items.push({ key: toDateKey(date), label: formatPeriodChoiceLabel(period, date) });
    }
    return items;
  }

  if (period === 'half_year') {
    for (let offset = -6; offset <= 6; offset += 1) {
      const date = addMonths(startOfHalfYear(anchor), offset * 6);
      items.push({ key: toDateKey(date), label: formatPeriodChoiceLabel(period, date) });
    }
    return items;
  }

  for (let offset = -6; offset <= 6; offset += 1) {
    const date = addYears(startOfYear(anchor), offset);
    items.push({ key: toDateKey(date), label: formatPeriodChoiceLabel(period, date) });
  }

  return items;
}

function buildCalendarDays(displayedMonth: Date) {
  const monthStart = startOfMonth(displayedMonth);
  const gridStart = startOfWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function getReportIdentity(role?: string | null, scope?: ReportSummary['scope']) {
  if (scope === 'staff') {
    return {
      title: 'Picking Performance',
      subtitle: 'Review your picking speed, item throughput, and completed work for the selected period.',
      badge: 'Staff view',
      detailTitle: 'Detailed picking activity',
      detailHint: 'Completed picking records and related customer order history.',
    };
  }

  if (scope === 'driver') {
    return {
      title: 'Delivery Performance',
      subtitle: 'Track delivery speed, handoff timing, and completed trips for the selected period.',
      badge: 'Driver view',
      detailTitle: 'Detailed delivery activity',
      detailHint: 'Completed delivery records and preserved order conversations.',
    };
  }

  if (role === 'admin') {
    return {
      title: 'System Performance',
      subtitle: 'Monitor revenue, store health, picker output, and driver throughput across the platform.',
      badge: 'Admin view',
      detailTitle: 'Completed system activity',
      detailHint: 'Finished orders and deliveries captured in the selected reporting window.',
    };
  }

  return {
    title: 'Store Performance',
    subtitle: 'Track store health, picker performance, and driver throughput across your operation.',
    badge: 'Manager view',
    detailTitle: 'Completed store activity',
    detailHint: 'Finished orders and deliveries captured in the selected reporting window.',
  };
}

function formatMinutes(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  return `${value.toFixed(1)} min`;
}

function formatOrderStatus(status: ReportEntry['order_status']) {
  if (!status) {
    return 'Unknown';
  }

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

function getStatusBreakdown(entries: ReportEntry[]) {
  const counts = new Map<string, number>();

  entries.forEach((entry) => {
    const key = entry.order_status ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([status, count]) => ({
      status,
      label: formatOrderStatus(status as ReportEntry['order_status']),
      count,
      color: STATUS_COLORS[status] ?? STATUS_COLORS.unknown,
    }))
    .sort((first, second) => second.count - first.count);
}

function getSummaryCards(report: ReportSummary, role?: string | null) {
  const averageOrderValue = report.completed_orders > 0 ? report.total_revenue / report.completed_orders : 0;

  if (report.scope === 'staff' && report.picker_summary) {
    return [
      { label: 'Orders Picked', value: `${report.picker_summary.total_orders_picked}` },
      { label: 'Items Picked', value: `${report.picker_summary.total_items_picked}` },
      { label: 'Avg. Pick Time', value: formatMinutes(report.picker_summary.average_pick_minutes) },
      { label: 'Items / Hour', value: report.picker_summary.average_items_per_hour.toFixed(1) },
    ];
  }

  if (report.scope === 'driver' && report.driver_summary) {
    return [
      { label: 'Completed Deliveries', value: `${report.driver_summary.completed_deliveries}` },
      { label: 'Avg. Delivery', value: formatMinutes(report.driver_summary.average_delivery_minutes) },
      { label: 'Assign to Delivered', value: formatMinutes(report.driver_summary.average_assignment_to_delivery_minutes) },
      { label: 'Revenue', value: formatCedi(report.total_revenue) },
    ];
  }

  return [
    { label: role === 'admin' ? 'Completed Orders' : 'Completed Orders', value: `${report.completed_orders}` },
    { label: 'Revenue', value: formatCedi(report.total_revenue) },
    { label: 'Avg. Order Value', value: formatCedi(averageOrderValue) },
    {
      label: role === 'admin' ? 'Active Deliveries' : 'Deliveries',
      value: `${report.system_summary?.total_deliveries ?? report.entries.length}`,
    },
  ];
}

function DonutChart({
  breakdown,
  total,
}: {
  breakdown: ReturnType<typeof getStatusBreakdown>;
  total: number;
}) {
  const size = 150;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size} style={styles.donutSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {breakdown.map((item) => {
          const fraction = total > 0 ? item.count / total : 0;
          const segmentLength = circumference * fraction;
          const element = (
            <Circle
              key={item.status}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={item.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${segmentLength} ${circumference}`}
              strokeDashoffset={-cumulativeOffset}
              rotation="-90"
              origin={`${size / 2}, ${size / 2}`}
            />
          );
          cumulativeOffset += segmentLength;
          return element;
        })}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutCenterValue}>{total}</Text>
        <Text style={styles.donutCenterLabel}>Total</Text>
      </View>
    </View>
  );
}

function InsightCard({
  title,
  subtitle,
  breakdown,
  total,
}: {
  title: string;
  subtitle: string;
  breakdown: ReturnType<typeof getStatusBreakdown>;
  total: number;
}) {
  const topTotal = breakdown.reduce((sum, item) => sum + item.count, 0) || 1;
  const isSingleStatus = breakdown.length === 1;

  return (
    <View style={styles.insightCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionHint}>{subtitle}</Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalBadgeValue}>{total}</Text>
          <Text style={styles.totalBadgeLabel}>Total</Text>
        </View>
      </View>

      <View style={styles.insightBody}>
        <DonutChart breakdown={breakdown} total={total} />
        <View style={[styles.statusLegend, isSingleStatus && styles.statusLegendSingle]}>
          {breakdown.map((item) => {
            const percentage = (item.count / topTotal) * 100;
            return (
              <View
                key={item.status}
                style={[styles.statusLegendRow, isSingleStatus && styles.statusLegendRowSingle]}
              >
                <View style={styles.statusLegendLabelWrap}>
                  <View style={[styles.statusDot, { backgroundColor: item.color }]} />
                  <Text
                    style={[styles.statusLegendLabel, isSingleStatus && styles.statusLegendLabelSingle]}
                    numberOfLines={isSingleStatus ? 1 : 2}
                  >
                    {item.label}
                  </Text>
                </View>
                <Text style={[styles.statusLegendValue, isSingleStatus && styles.statusLegendValueSingle]}>
                  {item.count} ({percentage.toFixed(1)}%)
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function EntryCard({
  item,
  scope,
  chatSummary,
  role,
}: {
  item: ReportEntry;
  scope: ReportSummary['scope'];
  chatSummary?: OrderChatSummary;
  role?: string;
}) {
  const hasChatHistory = Boolean(chatSummary?.has_messages);
  const canOpenChatHistory = !(role === 'staff' && item.order_status === 'out_for_delivery');

  return (
    <TouchableOpacity
      activeOpacity={canOpenChatHistory ? 0.88 : 1}
      disabled={!canOpenChatHistory}
      style={[styles.card, styles.cardInteractive, !canOpenChatHistory && styles.cardMuted]}
      onPress={() => {
        if (canOpenChatHistory) {
          router.push(`/order-chat/${item.order_id}`);
        }
      }}
    >
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
      <Text style={styles.metaText}>Order status: {formatOrderStatus(item.order_status)}</Text>
      {scope !== 'staff' ? (
        <Text style={styles.metaText}>
          Driver: {item.driver_name || (item.driver_id ? `Driver #${item.driver_id}` : 'Unassigned')}
        </Text>
      ) : null}
      {scope === 'staff' ? (
        <>
          <Text style={styles.metaText}>Items picked: {item.items_count}</Text>
          <Text style={styles.metaText}>Pick time: {formatMinutes(item.pick_minutes)}</Text>
        </>
      ) : null}
      {scope === 'driver' ? (
        <>
          <Text style={styles.metaText}>Delivery time: {formatMinutes(item.delivery_minutes)}</Text>
          <Text style={styles.metaText}>
            Assignment to delivered: {formatMinutes(item.assignment_to_delivery_minutes)}
          </Text>
        </>
      ) : null}
      {scope === 'system' ? (
        <>
          <Text style={styles.metaText}>Pick time: {formatMinutes(item.pick_minutes)}</Text>
          <Text style={styles.metaText}>Delivery time: {formatMinutes(item.delivery_minutes)}</Text>
        </>
      ) : null}
      <Text style={styles.metaText}>Completed: {new Date(item.completed_at).toLocaleString()}</Text>
      {item.review ? (
        <View style={styles.reviewSummaryCard}>
          <Text style={styles.reviewSummaryTitle}>Customer review</Text>
          <Text style={styles.reviewSummaryRating}>
            {'★'.repeat(item.review.rating)}
            {'☆'.repeat(5 - item.review.rating)}
          </Text>
          {item.review.comment ? (
            <Text style={styles.reviewSummaryComment}>{item.review.comment}</Text>
          ) : (
            <Text style={styles.reviewSummaryCommentMuted}>No written comment provided.</Text>
          )}
        </View>
      ) : null}
      <View style={styles.chatHistoryRow}>
        <Text style={styles.chatHistoryLabel}>Chat History</Text>
        <Text style={styles.chatHistoryAction}>
          {canOpenChatHistory ? 'Tap card or button' : 'Available after delivery'}
        </Text>
      </View>
      <Text style={styles.chatMeta}>
        {!canOpenChatHistory
          ? 'This order is still in delivery, so chat history becomes viewable here after completion.'
          : hasChatHistory
          ? chatSummary!.unread_count > 0
            ? `${chatSummary!.unread_count} new ${chatSummary!.unread_count === 1 ? 'chat message' : 'chat messages'}`
            : 'Conversation history saved with this order'
          : 'Open this order to view the preserved conversation history.'}
      </Text>
      <TouchableOpacity
        style={[styles.chatButton, !canOpenChatHistory && styles.chatButtonDisabled]}
        onPress={() => {
          if (canOpenChatHistory) {
            router.push(`/order-chat/${item.order_id}`);
          }
        }}
        disabled={!canOpenChatHistory}
      >
        <Text style={[styles.chatButtonText, !canOpenChatHistory && styles.chatButtonTextDisabled]}>
          {canOpenChatHistory ? 'Open Order Chat' : 'Chat Unavailable'}
        </Text>
        {canOpenChatHistory && hasChatHistory && chatSummary!.unread_count > 0 ? (
          <View style={styles.chatBadge}>
            <Text style={styles.chatBadgeText}>{chatSummary!.unread_count}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function ReportsScreen() {
  const { user } = useAuth();
  const role = user?.role;
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [anchorDate, setAnchorDate] = useState(() => toDateKey(new Date()));
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [chatSummaries, setChatSummaries] = useState<Record<number, OrderChatSummary>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodPickerVisible, setPeriodPickerVisible] = useState(false);
  const [pickerPeriod, setPickerPeriod] = useState<ReportPeriod>('week');
  const [displayedMonth, setDisplayedMonth] = useState(() => startOfMonth(new Date()));

  const loadReport = useCallback(async (nextPeriod: ReportPeriod, nextAnchorDate: string) => {
    try {
      const [reportResult, chatResult] = await Promise.allSettled([
        api.get<ReportSummary>('/reports/summary', {
          params: { period: nextPeriod, anchor_date: nextAnchorDate },
        }),
        api.get<OrderChatSummary[]>('/order-chats/summary'),
      ]);

      if (reportResult.status !== 'fulfilled') {
        throw reportResult.reason;
      }

      setReport(reportResult.value.data);
      setAnchorDate(reportResult.value.data.anchor_date);
      setPeriod(nextPeriod);
      const chatResponse = chatResult.status === 'fulfilled' ? chatResult.value : null;
      setChatSummaries(
        Object.fromEntries((chatResponse?.data ?? []).map((summary) => [summary.order_id, summary]))
      );
    } catch (error: any) {
      Alert.alert('Could not load reports', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReport(period, anchorDate);
    }, [anchorDate, loadReport, period])
  );

  const periodChoices = useMemo(() => buildPeriodChoices(pickerPeriod, anchorDate), [anchorDate, pickerPeriod]);
  const calendarDays = useMemo(() => buildCalendarDays(displayedMonth), [displayedMonth]);

  const applyPeriodSelection = async (nextPeriod: ReportPeriod, nextAnchorDate: string) => {
    setPeriodPickerVisible(false);
    setPickerPeriod(nextPeriod);
    setDisplayedMonth(startOfMonth(fromDateKey(nextAnchorDate)));
    await loadReport(nextPeriod, nextAnchorDate);
  };

  if (!canViewReports(role)) {
    return <Redirect href={getHomeRouteForRole(role)} />;
  }

  if (loading || !report) {
    return <LoadingScreen label="Loading reports..." />;
  }

  const heading =
    getReportIdentity(role, report.scope).title;
  const subtitle = getReportIdentity(role, report.scope).subtitle;
  const reportIdentity = getReportIdentity(role, report.scope);
  const summaryCards = getSummaryCards(report, role);
  const statusBreakdown = getStatusBreakdown(report.entries);

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
              loadReport(period, anchorDate);
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.heroCard}>
              <Text style={styles.eyebrow}>Performance</Text>
              <Text style={styles.title}>{heading}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
              <Text style={styles.scopeBadge}>{reportIdentity.badge}</Text>
            </View>

            <TouchableOpacity
              style={styles.periodDropdown}
              onPress={async () => {
                setPickerPeriod(period);
                setDisplayedMonth(startOfMonth(fromDateKey(anchorDate)));
                setPeriodPickerVisible(true);
              }}
            >
              <View style={styles.periodDropdownCopy}>
                <Text style={styles.periodDropdownLabel}>Reporting Period</Text>
                <Text style={styles.periodDropdownValue}>
                  {PERIOD_OPTIONS.find((item) => item.value === period)?.label}: {formatReportRangeLabel(report)}
                </Text>
              </View>
              <Text style={styles.periodDropdownChevron}>▼</Text>
            </TouchableOpacity>

            <View style={styles.summaryGrid}>
              {summaryCards.map((card) => (
                <View key={card.label} style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{card.value}</Text>
                  <Text style={styles.summaryLabel}>{card.label}</Text>
                </View>
              ))}
            </View>

            <InsightCard
              title={report.scope === 'driver' ? 'Delivery status' : 'Order status'}
              subtitle="A quick visual breakdown for the selected period."
              breakdown={statusBreakdown}
              total={report.entries.length}
            />

            {report.scope === 'staff' && report.picker_summary ? (
              <SectionCard
                title="Detailed summary"
                hint="Role-specific performance signals for this reporting window."
              >
                <View style={styles.detailGrid}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{formatMinutes(report.picker_summary.fastest_pick_minutes)}</Text>
                    <Text style={styles.metricLabel}>Fastest Pick</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{formatMinutes(report.picker_summary.slowest_pick_minutes)}</Text>
                    <Text style={styles.metricLabel}>Slowest Pick</Text>
                  </View>
                </View>
              </SectionCard>
            ) : null}

            {report.scope === 'driver' && report.driver_summary ? (
              <SectionCard
                title="Detailed summary"
                hint="Role-specific performance signals for this reporting window."
              >
                <View style={styles.detailGrid}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{formatMinutes(report.driver_summary.fastest_delivery_minutes)}</Text>
                    <Text style={styles.metricLabel}>Fastest Delivery</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{formatMinutes(report.driver_summary.slowest_delivery_minutes)}</Text>
                    <Text style={styles.metricLabel}>Slowest Delivery</Text>
                  </View>
                </View>
              </SectionCard>
            ) : null}

            {report.scope === 'system' && report.system_summary ? (
              <>
                <SectionCard
                  title={role === 'admin' ? 'System overview' : 'Operations overview'}
                  hint="High-level operational health for the selected period."
                >
                  <View style={styles.detailGrid}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{report.system_summary.total_deliveries}</Text>
                      <Text style={styles.metricLabel}>Deliveries</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{formatMinutes(report.system_summary.average_pick_minutes)}</Text>
                      <Text style={styles.metricLabel}>Avg. Pick Time</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{formatMinutes(report.system_summary.average_delivery_minutes)}</Text>
                      <Text style={styles.metricLabel}>Avg. Delivery</Text>
                    </View>
                  </View>
                </SectionCard>

                <SectionCard
                  title="Store performance"
                  hint={role === 'admin' ? 'Cross-store comparison for revenue and fulfillment.' : 'Branch-by-branch performance snapshot.'}
                >
                  {report.system_summary.stores.map((store) => (
                    <View key={`${store.store_id}-${store.store_name}`} style={styles.card}>
                      <View style={styles.cardTopRow}>
                        <View>
                          <Text style={styles.cardTitle}>{store.store_name}</Text>
                          <Text style={styles.cardSubtitle}>{store.completed_orders} completed orders</Text>
                        </View>
                        <Text style={styles.amountPill}>{formatCedi(store.total_revenue)}</Text>
                      </View>
                      <Text style={styles.metaText}>Avg. pick time: {formatMinutes(store.average_pick_minutes)}</Text>
                      <Text style={styles.metaText}>Avg. delivery time: {formatMinutes(store.average_delivery_minutes)}</Text>
                    </View>
                  ))}
                </SectionCard>

                <SectionCard
                  title="Picker performance"
                  hint="Top staff productivity for the selected period."
                >
                  {report.system_summary.picker_leaderboard.map((picker) => (
                    <View key={picker.user_id} style={styles.card}>
                      <Text style={styles.cardTitle}>{picker.full_name}</Text>
                      <Text style={styles.metaText}>Orders picked: {picker.completed_orders}</Text>
                      <Text style={styles.metaText}>Items picked: {picker.total_items_picked}</Text>
                      <Text style={styles.metaText}>Avg. pick time: {formatMinutes(picker.average_pick_minutes)}</Text>
                      <Text style={styles.metaText}>Items per hour: {picker.average_items_per_hour.toFixed(1)}</Text>
                    </View>
                  ))}
                </SectionCard>

                <SectionCard
                  title="Driver performance"
                  hint="Delivery throughput and handoff speed across active drivers."
                >
                  {report.system_summary.driver_leaderboard.map((driver) => (
                    <View key={driver.user_id} style={styles.card}>
                      <Text style={styles.cardTitle}>{driver.full_name}</Text>
                      <Text style={styles.metaText}>Completed deliveries: {driver.completed_deliveries}</Text>
                      <Text style={styles.metaText}>Avg. delivery time: {formatMinutes(driver.average_delivery_minutes)}</Text>
                      <Text style={styles.metaText}>
                        Assign to delivered: {formatMinutes(driver.average_assignment_to_delivery_minutes)}
                      </Text>
                    </View>
                  ))}
                </SectionCard>
              </>
            ) : null}

            <View style={styles.sectionIntro}>
              <Text style={styles.sectionTitle}>{reportIdentity.detailTitle}</Text>
              <Text style={styles.sectionHint}>{reportIdentity.detailHint}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No completed work in this period yet.</Text>
            <Text style={styles.emptyText}>Finished orders and deliveries will appear here automatically.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <EntryCard
            item={item}
            scope={report.scope}
            chatSummary={chatSummaries[item.order_id]}
            role={role}
          />
        )}
      />

      <Modal
        visible={periodPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPeriodPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.periodModalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.periodModalHeader}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.modalTitle}>Choose reporting period</Text>
                <Text style={styles.modalSubtitle}>Pick the exact day or range you want to review.</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPeriodPickerVisible(false)}
              >
                <Text style={styles.modalCloseGlyph}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.periodTypeRow}>
              {PERIOD_OPTIONS.map((item) => {
                const active = item.value === pickerPeriod;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[styles.periodTypeChip, active && styles.periodTypeChipActive]}
                    onPress={() => setPickerPeriod(item.value)}
                  >
                    <Text style={[styles.periodTypeChipText, active && styles.periodTypeChipTextActive]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {pickerPeriod === 'day' ? (
              <View style={styles.calendarWrap}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={() => setDisplayedMonth((current) => addMonths(current, -1))}>
                    <Text style={styles.calendarArrow}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.calendarMonthLabel}>
                    {displayedMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                  </Text>
                  <TouchableOpacity onPress={() => setDisplayedMonth((current) => addMonths(current, 1))}>
                    <Text style={styles.calendarArrow}>›</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.calendarWeekRow}>
                  {CALENDAR_WEEKDAY_LABELS.map((label) => (
                    <Text key={label} style={styles.calendarWeekdayLabel}>
                      {label}
                    </Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarDays.map((day) => {
                    const dayKey = toDateKey(day);
                    const isSelected = dayKey === anchorDate;
                    const isOutsideMonth = day.getMonth() !== displayedMonth.getMonth();
                    return (
                      <TouchableOpacity
                        key={dayKey}
                        style={[styles.calendarDayCell, isSelected && styles.calendarDayCellActive]}
                        onPress={() => applyPeriodSelection('day', dayKey)}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            isOutsideMonth && styles.calendarDayTextMuted,
                            isSelected && styles.calendarDayTextActive,
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <ScrollView style={styles.periodChoiceList} contentContainerStyle={styles.periodChoiceListContent}>
                {periodChoices.map((item) => {
                  const active = item.key === anchorDate;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.periodChoiceCard, active && styles.periodChoiceCardActive]}
                      onPress={() => applyPeriodSelection(pickerPeriod, item.key)}
                    >
                      <Text style={[styles.periodChoiceLabel, active && styles.periodChoiceLabelActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  periodDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  periodDropdownCopy: {
    flex: 1,
    gap: 4,
  },
  periodDropdownLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  periodDropdownValue: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  periodDropdownChevron: {
    color: '#1D4ED8',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionBlock: {
    gap: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  summaryLabel: {
    marginTop: 6,
    color: '#64748B',
    fontWeight: '600',
  },
  insightCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
  },
  insightBody: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  donutWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutSvg: {
    transform: [{ rotate: '0deg' }],
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterValue: {
    color: '#0F172A',
    fontSize: 26,
    fontWeight: '800',
  },
  donutCenterLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  totalBadge: {
    minWidth: 74,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  totalBadgeValue: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
  },
  totalBadgeLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statusLegend: {
    flex: 1,
    gap: 10,
  },
  statusLegendSingle: {
    justifyContent: 'center',
  },
  statusLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusLegendRowSingle: {
    alignItems: 'center',
  },
  statusLegendLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  statusLegendLabel: {
    color: '#334155',
    fontWeight: '600',
    flexShrink: 1,
  },
  statusLegendLabelSingle: {
    flexShrink: 0,
  },
  statusLegendValue: {
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 0,
    paddingLeft: 8,
  },
  statusLegendValueSingle: {
    minWidth: 104,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  sectionBody: {
    gap: 12,
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 12,
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
  cardInteractive: {
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  cardMuted: {
    opacity: 0.9,
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
  reviewSummaryCard: {
    marginTop: 12,
    backgroundColor: '#FFFDF7',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
  },
  reviewSummaryTitle: {
    color: '#92400E',
    fontWeight: '800',
  },
  reviewSummaryRating: {
    marginTop: 6,
    color: '#D97706',
    fontWeight: '800',
    letterSpacing: 1,
  },
  reviewSummaryComment: {
    marginTop: 6,
    color: '#4B5563',
    lineHeight: 19,
  },
  reviewSummaryCommentMuted: {
    marginTop: 6,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  chatMeta: {
    marginTop: 12,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 20,
  },
  chatHistoryRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  chatHistoryLabel: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  chatHistoryAction: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  chatButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  chatButtonText: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  chatButtonTextDisabled: {
    color: '#6B7280',
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
  amountPill: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#64748B',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    justifyContent: 'flex-end',
  },
  periodModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '82%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    marginBottom: 14,
  },
  periodModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    marginTop: 4,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 20,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseGlyph: {
    color: '#475569',
    fontSize: 22,
    lineHeight: 24,
  },
  periodTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 18,
    paddingBottom: 10,
  },
  periodTypeChip: {
    width: '31%',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  periodTypeChipActive: {
    backgroundColor: '#1D4ED8',
  },
  periodTypeChipText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  periodTypeChipTextActive: {
    color: '#FFFFFF',
  },
  calendarWrap: {
    marginTop: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  calendarArrow: {
    color: '#1D4ED8',
    fontSize: 26,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  calendarMonthLabel: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarWeekdayLabel: {
    width: '14.2%',
    textAlign: 'center',
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  calendarDayCell: {
    width: '13.3%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayCellActive: {
    backgroundColor: '#1D4ED8',
  },
  calendarDayText: {
    color: '#0F172A',
    fontWeight: '700',
  },
  calendarDayTextMuted: {
    color: '#94A3B8',
  },
  calendarDayTextActive: {
    color: '#FFFFFF',
  },
  periodChoiceList: {
    marginTop: 10,
  },
  periodChoiceListContent: {
    gap: 10,
    paddingBottom: 8,
  },
  periodChoiceCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  periodChoiceCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1D4ED8',
  },
  periodChoiceLabel: {
    color: '#0F172A',
    fontWeight: '700',
  },
  periodChoiceLabelActive: {
    color: '#1D4ED8',
  },
});
