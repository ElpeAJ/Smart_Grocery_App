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

const PRODUCT_EMOJI_RULES: { keywords: string[]; emoji: string }[] = [
  { keywords: ['banana', 'plantain'], emoji: '🍌' },
  { keywords: ['avocado'], emoji: '🥑' },
  { keywords: ['orange', 'tangerine'], emoji: '🍊' },
  { keywords: ['mango'], emoji: '🥭' },
  { keywords: ['pineapple'], emoji: '🍍' },
  { keywords: ['watermelon'], emoji: '🍉' },
  { keywords: ['papaya'], emoji: '🍈' },
  { keywords: ['apple'], emoji: '🍎' },
  { keywords: ['grapes'], emoji: '🍇' },
  { keywords: ['strawberr'], emoji: '🍓' },
  { keywords: ['lemon', 'lime'], emoji: '🍋' },
  { keywords: ['coconut'], emoji: '🥥' },
  { keywords: ['pear'], emoji: '🍐' },
  { keywords: ['guava'], emoji: '🍏' },
  { keywords: ['tomato'], emoji: '🍅' },
  { keywords: ['onion'], emoji: '🧅' },
  { keywords: ['pepper', 'chili'], emoji: '🌶️' },
  { keywords: ['okra'], emoji: '🥬' },
  { keywords: ['cabbage', 'lettuce', 'kontomire', 'broccoli'], emoji: '🥬' },
  { keywords: ['carrot'], emoji: '🥕' },
  { keywords: ['cucumber'], emoji: '🥒' },
  { keywords: ['yam', 'cassava', 'potato', 'cocoyam'], emoji: '🥔' },
  { keywords: ['ginger'], emoji: '🫚' },
  { keywords: ['turmeric'], emoji: '🟠' },
  { keywords: ['rice'], emoji: '🍚' },
  { keywords: ['spaghetti', 'pasta', 'noodles', 'macaroni', 'penne', 'fusilli', 'lasagna'], emoji: '🍝' },
  { keywords: ['beans', 'lentils', 'peas', 'chickpeas'], emoji: '🫘' },
  { keywords: ['flour'], emoji: '🌾' },
  { keywords: ['cake', 'cupcake'], emoji: '🧁' },
  { keywords: ['bread', 'baguette', 'croissant'], emoji: '🍞' },
  { keywords: ['milk', 'yoghurt', 'cream'], emoji: '🥛' },
  { keywords: ['egg'], emoji: '🥚' },
  { keywords: ['cheese'], emoji: '🧀' },
  { keywords: ['butter', 'margarine'], emoji: '🧈' },
  { keywords: ['chicken', 'turkey'], emoji: '🍗' },
  { keywords: ['beef', 'goat', 'mutton', 'pork', 'liver'], emoji: '🥩' },
  { keywords: ['fish', 'tilapia', 'salmon', 'mackerel', 'sardines', 'tuna', 'shrimp', 'prawn', 'crab'], emoji: '🐟' },
  { keywords: ['ice cream'], emoji: '🍨' },
  { keywords: ['pizza'], emoji: '🍕' },
  { keywords: ['fries'], emoji: '🍟' },
  { keywords: ['sausage', 'nuggets', 'burger'], emoji: '🍔' },
  { keywords: ['biscuit', 'cookies', 'cracker', 'shortbread'], emoji: '🍪' },
  { keywords: ['chips', 'chin chin', 'popcorn', 'pretzel'], emoji: '🥨' },
  { keywords: ['chocolate'], emoji: '🍫' },
  { keywords: ['candy', 'toffee', 'mint', 'lollipop', 'gum', 'gummy', 'marshmallow'], emoji: '🍬' },
  { keywords: ['malt', 'drink', 'soda', 'cola', 'juice', 'water', 'tea', 'coffee', 'milo', 'cocoa'], emoji: '🥤' },
  { keywords: ['oil'], emoji: '🫒' },
  { keywords: ['salt', 'sugar', 'honey', 'vinegar', 'ketchup', 'mayonnaise', 'jam'], emoji: '🧂' },
  { keywords: ['cereal', 'corn flakes', 'granola', 'oats', 'custard'], emoji: '🥣' },
  { keywords: ['cerelac', 'baby cereal'], emoji: '🥣' },
  { keywords: ['formula'], emoji: '🍼' },
  { keywords: ['diapers', 'diaper'], emoji: '🧷' },
  { keywords: ['wipes'], emoji: '🫧' },
  { keywords: ['lotion', 'powder', 'bath wash'], emoji: '🧴' },
  { keywords: ['bottle', 'feeding bottle'], emoji: '🍼' },
  { keywords: ['bib'], emoji: '🪁' },
  { keywords: ['puree'], emoji: '🍎' },
  { keywords: ['baby'], emoji: '👶' },
  { keywords: ['soap', 'detergent', 'cleaner', 'bleach', 'freshener'], emoji: '🧽' },
  { keywords: ['toilet roll', 'tissue', 'paper', 'serviettes'], emoji: '🧻' },
  { keywords: ['shampoo', 'conditioner', 'pomade', 'hair', 'spray'], emoji: '💇' },
  { keywords: ['toothpaste', 'toothbrush', 'deodorant', 'lotion', 'shaving'], emoji: '🧴' },
  { keywords: ['vitamin', 'thermometer', 'sanitizer', 'mask', 'balm', 'glucose'], emoji: '💊' },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shiftHex(hex: string, amount: number) {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  const red = clamp((value >> 16) + amount, 0, 255);
  const green = clamp(((value >> 8) & 0xff) + amount, 0, 255);
  const blue = clamp((value & 0xff) + amount, 0, 255);
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

function hashText(value: string) {
  return [...value].reduce((total, char) => total * 31 + char.charCodeAt(0), 7);
}

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

function getProductEmoji(productName: string, categoryEmoji: string) {
  const lowerName = productName.toLowerCase();
  const match = PRODUCT_EMOJI_RULES.find((rule) =>
    rule.keywords.some((keyword) => lowerName.includes(keyword))
  );
  return match?.emoji ?? categoryEmoji;
}

export function getProductTheme(categoryName?: string | null, productName?: string | null) {
  const baseTheme = getCategoryTheme(categoryName);

  if (!productName?.trim()) {
    return baseTheme;
  }

  const hash = hashText(productName.trim());
  const variation = [-12, -4, 8, 14][Math.abs(hash) % 4];

  return {
    emoji: getProductEmoji(productName, baseTheme.emoji),
    backgroundColor: shiftHex(baseTheme.backgroundColor, variation),
    accentColor: shiftHex(baseTheme.accentColor, variation > 0 ? -10 : 10),
    textColor: baseTheme.textColor,
  };
}
