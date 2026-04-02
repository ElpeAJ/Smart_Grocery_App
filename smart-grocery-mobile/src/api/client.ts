import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

import { BASE_URL } from '../config';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await AsyncStorage.getItem('access_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;
