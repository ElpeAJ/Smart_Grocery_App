export type Product = {
  id: number;
  store_id: number | null;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  status: 'in_stock' | 'out_of_stock';
  category: ProductCategory | null;
  image_url: string | null;
};

export type Store = {
  id: number;
  name: string;
  location: string;
};

export type ProductCategory = {
  id: number;
  name: string;
};

export type UserProfile = {
  id: number;
  user_id: number;
  phone_number: string | null;
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  preferred_store_id: number | null;
  preferred_store: Store | null;
};

export type AppUser = {
  id: number;
  full_name: string;
  email: string;
  role: 'customer' | 'staff' | 'manager' | 'driver' | 'admin';
};

export type CartItem = {
  id: number;
  product_id: number;
  quantity: number;
  product: Product;
};

export type Cart = {
  id: number;
  store_id: number | null;
  items: CartItem[];
  total_amount: number;
};

export type OrderItem = {
  id: number;
  product_id: number;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  is_picked: boolean;
};

export type OrderReview = {
  id: number;
  order_id: number;
  user_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: number;
  user_id: number;
  customer_name: string | null;
  store_id: number | null;
  store_name: string | null;
  delivery_window_label: string | null;
  status: 'pending' | 'accepted' | 'picking' | 'awaiting_review' | 'out_for_delivery' | 'delivered' | 'cancelled';
  created_at: string;
  items: OrderItem[];
  all_items_picked: boolean;
  review: OrderReview | null;
};

export type Delivery = {
  id: number;
  order_id: number;
  driver_id: number | null;
  customer_id: number | null;
  driver_name: string | null;
  customer_name: string | null;
  store_name: string | null;
  delivery_address: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  driver_latitude: number | null;
  driver_longitude: number | null;
  driver_location_updated_at: string | null;
  delivery_window_label: string | null;
  delivery_window_start: string | null;
  delivery_window_end: string | null;
  driver_assigned_at: string | null;
  started_at: string | null;
  delivered_at: string | null;
  status: 'assigned' | 'on_the_way' | 'delivered';
  order_status: Order['status'] | null;
};

export type DeliveryWindow = {
  key: string;
  label: string;
  starts_at: string;
  ends_at: string;
};

export type ReportPeriod = 'day' | 'week' | 'month' | 'quarter' | 'half_year' | 'year';

export type ReportEntry = {
  order_id: number;
  customer_id: number;
  customer_name: string | null;
  store_id: number | null;
  store_name: string | null;
  order_status: Order['status'] | null;
  total_amount: number;
  completed_at: string;
  delivery_id: number | null;
  driver_id: number | null;
  driver_name: string | null;
  items_count: number;
  pick_minutes: number | null;
  delivery_minutes: number | null;
  assignment_to_delivery_minutes: number | null;
  review: OrderReview | null;
};

export type PickerPerformanceSummary = {
  total_orders_picked: number;
  total_items_picked: number;
  average_pick_minutes: number;
  average_items_per_hour: number;
  fastest_pick_minutes: number | null;
  slowest_pick_minutes: number | null;
};

export type DriverPerformanceSummary = {
  completed_deliveries: number;
  average_delivery_minutes: number;
  average_assignment_to_delivery_minutes: number;
  fastest_delivery_minutes: number | null;
  slowest_delivery_minutes: number | null;
};

export type StorePerformanceSummary = {
  store_id: number | null;
  store_name: string;
  completed_orders: number;
  total_revenue: number;
  average_pick_minutes: number;
  average_delivery_minutes: number;
};

export type PickerLeaderboardEntry = {
  user_id: number;
  full_name: string;
  completed_orders: number;
  total_items_picked: number;
  average_pick_minutes: number;
  average_items_per_hour: number;
};

export type DriverLeaderboardEntry = {
  user_id: number;
  full_name: string;
  completed_deliveries: number;
  average_delivery_minutes: number;
  average_assignment_to_delivery_minutes: number;
};

export type SystemPerformanceSummary = {
  total_deliveries: number;
  average_pick_minutes: number;
  average_delivery_minutes: number;
  stores: StorePerformanceSummary[];
  picker_leaderboard: PickerLeaderboardEntry[];
  driver_leaderboard: DriverLeaderboardEntry[];
};

export type ReportSummary = {
  scope: 'system' | 'staff' | 'driver';
  period: ReportPeriod;
  anchor_date: string;
  range_start: string;
  range_end: string;
  completed_orders: number;
  total_revenue: number;
  entries: ReportEntry[];
  picker_summary: PickerPerformanceSummary | null;
  driver_summary: DriverPerformanceSummary | null;
  system_summary: SystemPerformanceSummary | null;
};

export type Notification = {
  id: number;
  title: string;
  message: string;
  kind: string;
  is_read: boolean;
  created_at: string;
};

export type OrderChatMessage = {
  id: number;
  thread_id: number;
  sender_user_id: number;
  sender_name: string | null;
  sender_role: string | null;
  message: string;
  message_type: 'text' | 'suggestion' | 'system';
  is_read: boolean;
  created_at: string;
};

export type OrderChatThread = {
  id: number;
  order_id: number;
  order_status: Order['status'];
  is_open: boolean;
  can_send_message: boolean;
  counterpart_label: string;
  created_at: string;
  updated_at: string;
  messages: OrderChatMessage[];
};

export type OrderChatSummary = {
  order_id: number;
  has_messages: boolean;
  unread_count: number;
  message_count: number;
  last_message_preview: string | null;
  last_sender_name: string | null;
  last_sender_role: string | null;
  last_message_at: string | null;
};
