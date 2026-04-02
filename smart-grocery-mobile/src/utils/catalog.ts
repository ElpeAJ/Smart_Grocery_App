const CATEGORY_THEME_MAP: Record<
  string,
  { emoji: string; backgroundColor: string; accentColor: string; textColor: string }
> = {
  'Fresh Fruits': { emoji: '🍍', backgroundColor: '#FFF1D6', accentColor: '#F59E0B', textColor: '#92400E' },
  'Fresh Vegetables': { emoji: '🥬', backgroundColor: '#DCFCE7', accentColor: '#16A34A', textColor: '#166534' },
  'Tubers and Roots': { emoji: '🥔', backgroundColor: '#FCE7D8', accentColor: '#EA580C', textColor: '#9A3412' },
  'Grains and Cereals': { emoji: '🌾', backgroundColor: '#FEF3C7', accentColor: '#D97706', textColor: '#92400E' },
  'Rice and Pasta': { emoji: '🍚', backgroundColor: '#FAF5FF', accentColor: '#9333EA', textColor: '#6B21A8' },
  'Beans and Legumes': { emoji: '🫘', backgroundColor: '#FCE7F3', accentColor: '#DB2777', textColor: '#9D174D' },
  'Flour and Baking': { emoji: '🧁', backgroundColor: '#FDF2F8', accentColor: '#EC4899', textColor: '#9D174D' },
  'Spices and Seasonings': { emoji: '🌶️', backgroundColor: '#FEE2E2', accentColor: '#EF4444', textColor: '#991B1B' },
  'Oils and Cooking Fats': { emoji: '🫒', backgroundColor: '#FEF9C3', accentColor: '#CA8A04', textColor: '#854D0E' },
  'Tomato Mix and Canned Goods': { emoji: '🥫', backgroundColor: '#FEE2E2', accentColor: '#DC2626', textColor: '#991B1B' },
  'Breakfast Foods': { emoji: '🥣', backgroundColor: '#E0F2FE', accentColor: '#0284C7', textColor: '#0C4A6E' },
  'Bread and Pastries': { emoji: '🍞', backgroundColor: '#FFF7ED', accentColor: '#FB923C', textColor: '#9A3412' },
  'Dairy and Eggs': { emoji: '🥛', backgroundColor: '#EEF2FF', accentColor: '#4F46E5', textColor: '#3730A3' },
  'Meat and Poultry': { emoji: '🍗', backgroundColor: '#FEE2E2', accentColor: '#DC2626', textColor: '#7F1D1D' },
  'Fish and Seafood': { emoji: '🐟', backgroundColor: '#DBEAFE', accentColor: '#2563EB', textColor: '#1E3A8A' },
  'Frozen Foods': { emoji: '🧊', backgroundColor: '#E0F2FE', accentColor: '#0EA5E9', textColor: '#0C4A6E' },
  'Snacks and Biscuits': { emoji: '🍪', backgroundColor: '#FEF3C7', accentColor: '#F59E0B', textColor: '#92400E' },
  'Sweets and Confectionery': { emoji: '🍬', backgroundColor: '#FCE7F3', accentColor: '#EC4899', textColor: '#9D174D' },
  Beverages: { emoji: '🥤', backgroundColor: '#DBEAFE', accentColor: '#2563EB', textColor: '#1E3A8A' },
  'Juices and Soft Drinks': { emoji: '🧃', backgroundColor: '#E0F2FE', accentColor: '#0EA5E9', textColor: '#0C4A6E' },
  'Tea, Coffee and Cocoa': { emoji: '☕', backgroundColor: '#F3E8FF', accentColor: '#7C3AED', textColor: '#5B21B6' },
  Water: { emoji: '💧', backgroundColor: '#E0F2FE', accentColor: '#0284C7', textColor: '#0C4A6E' },
  'Baby Food and Baby Care': { emoji: '🍼', backgroundColor: '#FCE7F3', accentColor: '#EC4899', textColor: '#9D174D' },
  'Household Cleaning': { emoji: '🧽', backgroundColor: '#DCFCE7', accentColor: '#16A34A', textColor: '#166534' },
  'Laundry and Fabric Care': { emoji: '🧺', backgroundColor: '#E0F2FE', accentColor: '#0284C7', textColor: '#0C4A6E' },
  'Personal Care and Toiletries': { emoji: '🧴', backgroundColor: '#FAF5FF', accentColor: '#8B5CF6', textColor: '#6B21A8' },
  'Hair Care and Beauty': { emoji: '💄', backgroundColor: '#FCE7F3', accentColor: '#DB2777', textColor: '#9D174D' },
  'Health and Wellness': { emoji: '💊', backgroundColor: '#F0FDF4', accentColor: '#16A34A', textColor: '#166534' },
  'Paper Products and Disposables': { emoji: '🧻', backgroundColor: '#F8FAFC', accentColor: '#64748B', textColor: '#334155' },
  'Pantry Essentials': { emoji: '🛍️', backgroundColor: '#F8FAFC', accentColor: '#475569', textColor: '#1E293B' },
};

export function getCategoryTheme(categoryName?: string | null) {
  if (!categoryName) {
    return { emoji: '🛒', backgroundColor: '#E2E8F0', accentColor: '#2563EB', textColor: '#1E293B' };
  }

  return (
    CATEGORY_THEME_MAP[categoryName] ?? {
      emoji: '🛒',
      backgroundColor: '#E2E8F0',
      accentColor: '#2563EB',
      textColor: '#1E293B',
    }
  );
}
