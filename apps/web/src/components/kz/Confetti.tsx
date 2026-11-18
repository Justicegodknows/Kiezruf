'use client';

// Confetti after signing (app prototype). Decorative: hidden from assistive technology, and still under
// prefers-reduced-motion (kiezruf.css shortens every animation there).
const COLORS = ['#1E4BFF', '#FFC857', '#7A9DE8', '#0A1A3F', '#EA3A12', '#B9CCF5'];

const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37) % 100,
  w: 6 + (i % 3) * 3,
  h: 10 + (i % 4) * 3,
  round: i % 5 === 0,
  color: COLORS[i % COLORS.length]!,
  sway: 0.9 + (i % 5) * 0.25,
  dur: 2 + (i % 6) * 0.25,
  delay: (i % 9) * 0.07,
}));

export function Confetti() {
  return (
    <div className="kz-confetti" aria-hidden="true">
      {PIECES.map((p, i) => (
        <span key={i} style={{ left: `${p.left}%`, animationDuration: `${p.sway}s` }}>
          <span
            style={{
              width: p.w,
              height: p.h,
              borderRadius: p.round ? '50%' : 2,
              background: p.color,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        </span>
      ))}
    </div>
  );
}
