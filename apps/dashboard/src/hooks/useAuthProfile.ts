import { useState, useEffect } from 'react';

const SKIP_AUTH = process.env.NEXT_PUBLIC_SKIP_AUTH === 'true';

export function useAuthProfile() {
  const [user, setUser] = useState<any>(SKIP_AUTH ? { name: 'SOC Analyst', email: 'analyst@midosoc.dev' } : null);
  const [authLoading, setAuthLoading] = useState(!SKIP_AUTH);
  
  const checkAuth = async () => {
    if (SKIP_AUTH) return true;
    try {
      const res = await fetch('/auth/profile');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setAuthLoading(false);
        return true;
      }
    } catch (e) {
      // Ignored
    }
    setAuthLoading(false);
    return false;
  };

  useEffect(() => {
    if (!SKIP_AUTH) checkAuth();
  }, []);

  const ensureLoggedIn = async (): Promise<boolean> => {
    if (SKIP_AUTH) return true;
    if (user) return true;
    const isLoggedIn = await checkAuth();
    if (!isLoggedIn) {
      window.location.href = '/auth/login?returnTo=' + encodeURIComponent(window.location.pathname);
      return false;
    }
    return true;
  };

  return { user, isAuthenticated: SKIP_AUTH || !!user, ensureLoggedIn, authLoading };
}
