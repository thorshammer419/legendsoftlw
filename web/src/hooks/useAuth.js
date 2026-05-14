import { useState, useEffect } from 'react';
import { getUser } from '../services/auth';
import { api } from '../services/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    getUser().then(async (principal) => {
      if (principal) {
        try {
          const player = await api.registerPlayer();
          setUser({ ...principal, ...player });
        } catch (err) {
          if (err?.status === 403) {
            setUnauthorized(true);
          } else {
            setUser(principal);
          }
        }
      }
      setLoading(false);
    });
  }, []);

  const isAdmin = (campaign) =>
    campaign?.admin_emails?.includes(user?.userDetails) ?? false;

  return { user, loading, isAdmin, unauthorized };
}
