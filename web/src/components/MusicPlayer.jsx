import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

const REPLAY_DELAY_MS = 60_000;

export default function MusicPlayer() {
  const audioRef = useRef(null);
  const timeoutRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const location = useLocation();

  const isGameRoute = location.pathname.startsWith('/game/');

  // Start playback on mount
  useEffect(() => {
    audioRef.current?.play().catch(() => {});
    return () => clearTimeout(timeoutRef.current);
  }, []);

  // Pause/resume based on route
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

  const handleEnded = () => {
    timeoutRef.current = setTimeout(() => {
      audioRef.current?.play().catch(() => {});
    }, REPLAY_DELAY_MS);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !muted;
    setMuted(next);
    audio.muted = next;
  };

  return (
    <>
      <audio
        ref={audioRef}
        src="/music/unconventional_wisdom.mp3"
        onEnded={handleEnded}
        muted={muted}
      />
      <button
        aria-label={muted ? 'Unmute music' : 'Mute music'}
        onClick={toggleMute}
        style={{
          position: 'fixed',
          top: 14,
          right: 16,
          zIndex: 9000,
          background: 'transparent',
          border: 'none',
          color: 'var(--gold)',
          fontSize: 22,
          cursor: 'pointer',
          padding: 4,
          lineHeight: 1,
          textShadow: '0 0 8px rgba(184,146,48,0.6)',
        }}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </>
  );
}
