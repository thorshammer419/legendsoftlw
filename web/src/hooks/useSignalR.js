import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { api } from '../services/api';

export function useSignalR(campaignId, handlers = {}) {
  const connRef = useRef(null);

  useEffect(() => {
    if (!campaignId) return;

    let cancelled = false;
    let connection;

    async function start() {
      let info;
      try {
        info = await api.negotiate(campaignId);
      } catch (err) {
        if (!cancelled) console.error('SignalR negotiate failed:', err);
        return;
      }
      if (cancelled) return;

      connection = new signalR.HubConnectionBuilder()
        .withUrl(info.url, { accessTokenFactory: () => info.accessToken })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      if (handlers.onNarrativeUpdate) {
        connection.on('narrativeUpdate', handlers.onNarrativeUpdate);
      }
      if (handlers.onLobbyEvent) {
        connection.on('lobbyEvent', handlers.onLobbyEvent);
      }

      try {
        await connection.start();
      } catch (err) {
        if (!cancelled) console.error('SignalR connection failed:', err);
        return;
      }

      if (cancelled) {
        connection.stop();
        return;
      }
      connRef.current = connection;
    }

    start();

    return () => {
      cancelled = true;
      connection?.stop();
      connRef.current = null;
    };
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps
}
