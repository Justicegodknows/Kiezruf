// The Supabase client for sign-in (ENG-22). Only Supabase Auth is used: the app never talks to the Data API.
// The session is kept in secure storage (src/auth/secureStorage.ts). Token refresh follows the app's foreground
// state (AuthProvider calls startAutoRefresh / stopAutoRefresh); jest replaces this module with
// src/testing/fakeSupabase.ts.
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { createChunkedSecureStorage } from './secureStorage';

if (!SUPABASE_ANON_KEY && __DEV__) {
  console.warn('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set: browsing works, signing in will fail. See apps/mobile/.env.example.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || 'missing-publishable-key', {
  auth: {
    storage: createChunkedSecureStorage(),
    storageKey: 'kiezruf.auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
