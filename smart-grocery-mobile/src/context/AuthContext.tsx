import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosError } from 'axios';

import api from '../api/client';
import { BASE_URL } from '../config';

type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  role: string;
};

type AuthResult = {
  success: boolean;
  error?: string;
  data?: AuthUser;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (userData: { fullName: string; email: string; password: string }) => Promise<AuthResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const getErrorMessage = (error: unknown, fallback: string) => {
  const axiosError = error as AxiosError<any>;
  const detail = axiosError.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join(', ');
  }

  if (axiosError.message === 'Network Error' || !axiosError.response) {
    return `Could not reach backend at ${BASE_URL}`;
  }

  const responseData = axiosError.response?.data;
  const statusCode = axiosError.response?.status;

  if (typeof responseData === 'string' && responseData.trim()) {
    return `HTTP ${statusCode}: ${responseData}`;
  }

  if (responseData && typeof responseData === 'object') {
    try {
      return `HTTP ${statusCode}: ${JSON.stringify(responseData)}`;
    } catch {
      return `HTTP ${statusCode}: ${fallback}`;
    }
  }

  return statusCode ? `HTTP ${statusCode}: ${fallback}` : fallback;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const persistSession = async (token: string) => {
    await AsyncStorage.setItem('access_token', token);
    const meResponse = await api.get<AuthUser>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    await AsyncStorage.setItem('user_data', JSON.stringify(meResponse.data));
    setUser(meResponse.data);
  };

  const clearSession = async () => {
    await AsyncStorage.multiRemove(['access_token', 'user_data']);
    setUser(null);
  };

  const refreshUser = async () => {
    const token = await AsyncStorage.getItem('access_token');

    if (!token) {
      await clearSession();
      return;
    }

    await persistSession(token);
  };

  useEffect(() => {
    const initializeAuthState = async () => {
      try {
        const token = await AsyncStorage.getItem('access_token');

        if (!token) {
          setUser(null);
          return;
        }

        await persistSession(token);
      } catch (error) {
        const axiosError = error as AxiosError<any>;
        const statusCode = axiosError.response?.status;
        const isExpectedSessionFailure =
          statusCode === 401 || statusCode === 403 || axiosError.message === 'Network Error';

        if (!isExpectedSessionFailure) {
          console.error('Unexpected auth bootstrap error:', error);
        }
        await clearSession();
      } finally {
        setLoading(false);
      }
    };

    initializeAuthState();
  }, []);

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const formBody = new URLSearchParams();
      formBody.append('username', email.trim());
      formBody.append('password', password);

      const response = await api.post<{ access_token: string }>('/auth/login', formBody.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      await persistSession(response.data.access_token);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: getErrorMessage(error, 'Login failed'),
      };
    }
  };

  const register = async (userData: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<AuthResult> => {
    try {
      const response = await api.post<AuthUser>('/auth/register', {
        full_name: userData.fullName.trim(),
        email: userData.email.trim(),
        password: userData.password,
      });

      return { success: true, data: response.data };
    } catch (error: any) {
      return {
        success: false,
        error: getErrorMessage(error, 'Registration failed'),
      };
    }
  };

  const logout = async () => {
    try {
      await clearSession();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        refreshUser,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
