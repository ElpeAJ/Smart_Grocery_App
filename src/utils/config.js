// Configuration file for the mobile app
export const API_BASE_URL = __DEV__
  ? 'http://127.0.0.1:8001'  // Development backend URL
  : 'https://your-production-api.com';  // Production backend URL

export const COLORS = {
  primary: '#007AFF',
  secondary: '#5856D6',
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  light: '#F2F2F7',
  dark: '#1C1C1E',
};

export const FONT_SIZES = {
  small: 12,
  medium: 16,
  large: 20,
  xlarge: 24,
  xxlarge: 28,
};

export const SPACING = {
  small: 8,
  medium: 16,
  large: 24,
  xlarge: 32,
};