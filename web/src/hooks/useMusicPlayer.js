import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const REPLAY_DELAY_MS = 60_000;

export function useMusicPlayer() {
  const audioRef = useRef(null);
  const timeoutRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const location = useLocation();

  const isGameRoute = location.pathname.startsWith('/game/');

  useEffect(() => {
    const audio = document.createElement('audio');
    audio.src = '/music/unconventional_wisdom.mp3';
    audio.onended = () => {
      timeoutRef.current = setTimeout(() => {
        audio.play().catch(() => {});
      }, REPLAY_DELAY_MS);
    };
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => {
      clearTimeout(timeoutRef.current);
      audio.pause();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isGameRoute) {
      audio.pause();
      clearTimeout(timeoutRef.current);
    } else {
      audio.play().catch(() => {});
    }
  }, [isGameRoute]);

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !muted;
    setMuted(next);
    audio.muted = next;
  };

  return { muted, toggleMute };
}
