import { useState, useEffect } from 'react';
import { getUser } from '../services/auth';
import { api } from '../services/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser().then(async (principal) => {
      if (principal) {
        try {
          const player = await api.registerPlayer();
          setUser({ ...principal, ...player });
        } catch {
          setUser(principal);
        }
      }
      setLoading(false);
    });
  }, []);

  const isAdmin = (campaign) =>
    campaign?.admin_emails?.includes(user?.userDetails) ?? false;

  return { user, loading, isAdmin };
}
