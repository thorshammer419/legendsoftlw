import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useSignalR } from './useSignalR';

export function useRerollApproval({ campaignId, myEmail, onApproved }) {
  const [status, setStatus] = useState('idle');
  const pendingChipRef = useRef(null);
  const timerRef = useRef(null);

  useSignalR(campaignId, {
    onLobbyEvent: useCallback((event) => {
      if (event.type !== 'reroll_response') return;
      if (event.player_email !== myEmail) return;
      clearTimeout(timerRef.current);
      if (event.approved) {
        setStatus('approved');
        onApproved?.(pendingChipRef.current);
        pendingChipRef.current = null;
      } else {
        setStatus('denied');
      }
    }, [myEmail, onApproved]),
  });

  const requestReroll = useCallback(async (chipValue) => {
    pendingChipRef.current = chipValue;
    setStatus('pending');
    await api.rerollRequest(campaignId, { old_value: chipValue });
    timerRef.current = setTimeout(() => {
      setStatus('idle');
      pendingChipRef.current = null;
    }, 60000);
  }, [campaignId]);

  const clearDenied = useCallback(() => {
    setStatus('idle');
    pendingChipRef.current = null;
  }, []);

  return { status, requestReroll, clearDenied };
}
