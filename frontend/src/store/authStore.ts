import { create } from 'zustand';
import { apiClient } from '@/api/client';

interface AuthState {
  username: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  username: null,
  isAuthenticated: false,
  loading: false,
  error: null,

  hydrate: () => {
    const token = localStorage.getItem('nbpdcl_token');
    const user = localStorage.getItem('nbpdcl_user');
    if (token && user) {
      set({ isAuthenticated: true, username: user });
    }
  },

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await apiClient.post('/auth/login', { username, password });
      localStorage.setItem('nbpdcl_token', res.data.access_token);
      localStorage.setItem('nbpdcl_user', res.data.username);
      set({ isAuthenticated: true, username: res.data.username, loading: false });
      return true;
    } catch (err: any) {
      set({
        loading: false,
        error: err.response?.data?.detail || 'Login failed. Please check your credentials.',
      });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('nbpdcl_token');
    localStorage.removeItem('nbpdcl_user');
    set({ isAuthenticated: false, username: null });
  },
}));
