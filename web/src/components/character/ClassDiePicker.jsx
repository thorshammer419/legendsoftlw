import { useState, useRef } from 'react';
import CLASSES from '../../data/classData';

const FLIP_DURATION = 350;

export default function ClassDiePicker({ onChange }) {
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [displayIndex, setDisplayIndex] = useState(0);
  const dieRef = useRef(null);

  const advance = (dir) => {
    if (animating) return;
    setAnimating(true);

    const el = dieRef.current;
    el.style.transition = `transform ${FLIP_DURATION / 2}ms ease-in`;
    el.style.transform = 'rotateY(90deg)';

    setTimeout(() => {
      const next = (index + dir + CLASSES.length) % CLASSES.length;
      setIndex(next);
      setDisplayIndex(next);
      onChange?.(CLASSES[next].name);

      el.style.transition = 'none';
      el.style.transform = 'rotateY(-90deg)';

      // force reflow so the browser registers the instant jump
      void el.offsetWidth;

      el.style.transition = `transform ${FLIP_DURATION / 2}ms ease-out`;
      el.style.transform = 'rotateY(0deg)';

      setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
        setAnimating(false);
      }, FLIP_DURATION / 2);
    }, FLIP_DURATION / 2);
  };

  const cls = CLASSES[displayIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Class title */}
      <h2 style={{
        margin: 0,
        color: 'var(--gold)',
        fontFamily: 'Georgia, serif',
        fontSize: 28,
        letterSpacing: 2,
        textTransform: 'uppercase',
        textShadow: '0 0 20px rgba(184,146,48,0.5)',
      }}>
        {cls.name}
      </h2>

      {/* Die composite with overlaid arrows */}
      <div
        ref={dieRef}
        style={{
          position: 'relative',
          width: 'min(560px, 90vw)',
          height: 'min(560px, 90vw)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Class portrait behind frame */}
        <img
          src={cls.imagePath}
          alt={cls.name}
          style={{
            position: 'absolute',
            inset: '12%',
            width: '76%',
            height: '76%',
            objectFit: 'contain',
          }}
        />
        {/* Left arrow — overlaid on die edge */}
        <button
          aria-label="Previous class"
          onClick={() => advance(-1)}
          disabled={animating}
          style={{ ...arrowStyle, position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}
        >
          ‹
        </button>
        {/* Right arrow — overlaid on die edge */}
        <button
          aria-label="Next class"
          onClick={() => advance(1)}
          disabled={animating}
          style={{ ...arrowStyle, position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)' }}
        >
          ›
        </button>
      </div>

      {/* Class description */}
      <p style={{
        maxWidth: 360,
        textAlign: 'center',
        fontSize: 14,
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        margin: 0,
      }}>
        {cls.description}
      </p>
    </div>
  );
}

const arrowStyle = {
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid var(--gold)',
  color: 'var(--gold)',
  fontSize: 36,
  width: 48,
  height: 48,
  borderRadius: '50%',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  zIndex: 2,
  transition: 'opacity 0.15s',
};
