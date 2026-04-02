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

export type Order = {
  id: number;
  user_id: number;
  customer_name: string | null;
  store_id: number | null;
  store_name: string | null;
  status: 'pending' | 'accepted' | 'picking' | 'out_for_delivery' | 'delivered' | 'cancelled';
  created_at: string;
  items: OrderItem[];
  all_items_picked: boolean;
};

export type Delivery = {
  id: number;
  order_id: number;
  driver_id: number | null;
  driver_name: string | null;
  customer_name: string | null;
  store_name: string | null;
  delivery_address: string;
  status: 'assigned' | 'on_the_way' | 'delivered';
  order_status: Order['status'] | null;
};

export type ReportPeriod = 'day' | 'week' | 'month' | 'quarter' | 'half_year' | 'year';

export type ReportEntry = {
  order_id: number;
  customer_id: number;
  customer_name: string | null;
  store_id: number | null;
  store_name: string | null;
  total_amount: number;
  completed_at: string;
  delivery_id: number | null;
  driver_id: number | null;
  driver_name: string | null;
};

export type ReportSummary = {
  scope: 'system' | 'staff' | 'driver';
  period: ReportPeriod;
  completed_orders: number;
  total_revenue: number;
  entries: ReportEntry[];
};

export type Notification = {
  id: number;
  title: string;
  message: string;
  kind: string;
  is_read: boolean;
  created_at: string;
};
