/**
 * src/context/AuthContext.jsx
 * Holds the session (JWT + user), exposes login/register/logout and re-hydrates
 * the session on refresh. All network calls go through src/api/client.js.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  authApi,
  postsApi,
  tokenStorage,
  setUnauthorizedHandler,
} from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const [config, setConfig] = useState(null);

  /** Public bootstrap config (max upload size, allowed types, …). */
  useEffect(() => {
    authApi
      .publicConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  /** Re-hydrate the session from the stored token. */
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!tokenStorage.get()) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      try {
        const { user: me } = await authApi.me();
        if (!cancelled) {
          setUser(me);
          setStatus('authenticated');
        }
      } catch {
        tokenStorage.clear();
        if (!cancelled) {
          setUser(null);
          setStatus('anonymous');
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Any 401 from any request logs the user out immediately. */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
      tokenStorage.clear();
    });
  }, []);

  const applySession = useCallback(({ token, user: me }) => {
    tokenStorage.set(token);
    setUser(me);
    setStatus('authenticated');
    return me;
  }, []);

  const login = useCallback(
    async (credentials) => applySession(await authApi.login(credentials)),
    [applySession]
  );

  const register = useCallback(
    async (payload) => applySession(await authApi.register(payload)),
    [applySession]
  );

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      config,
      isAuthenticated: status === 'authenticated',
      isReady: status !== 'loading',
      login,
      register,
      logout,
      refreshStats: () => postsApi.stats().catch(() => null),
    }),
    [user, status, config, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
