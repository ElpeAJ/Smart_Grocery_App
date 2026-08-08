import type { Order, PaymentStatus } from '../types/api';

type StatusTone = {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
};

const ORDER_STATUS_TONES: Record<Order['status'], StatusTone> = {
  pending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    textColor: '#92400E',
  },
  accepted: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    textColor: '#92400E',
  },
  picking: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
    textColor: '#1D4ED8',
  },
  awaiting_review: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FBBF24',
    textColor: '#9A6700',
  },
  out_for_delivery: {
    backgroundColor: '#DBEAFE',
    borderColor: '#60A5FA',
    textColor: '#1D4ED8',
  },
  delivered: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    textColor: '#166534',
  },
  cancelled: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    textColor: '#B91C1C',
  },
};

const PAYMENT_STATUS_TONES: Record<PaymentStatus, StatusTone> = {
  cash_pending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    textColor: '#92400E',
  },
  pending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
    textColor: '#92400E',
  },
  paid: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    textColor: '#166534',
  },
  failed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    textColor: '#B91C1C',
  },
  cash_confirmed: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    textColor: '#166534',
  },
};

export const getOrderStatusTone = (status: Order['status']): StatusTone => ORDER_STATUS_TONES[status];
export const getPaymentStatusTone = (status: PaymentStatus): StatusTone => PAYMENT_STATUS_TONES[status];
