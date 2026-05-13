import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { api } from '../services/api';

export function useSignalR(campaignId, handlers = {}) {
  const connRef = useRef(null);

  useEffect(() => {
    if (!campaignId) return;

    let connection;

    async function start() {
      const info = await api.negotiate(campaignId);

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

      await connection.start();
      connRef.current = connection;
    }

    start().catch(console.error);

    return () => {
      connection?.stop();
    };
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps
}
