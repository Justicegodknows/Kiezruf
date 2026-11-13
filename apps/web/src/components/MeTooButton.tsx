'use client';

import { useState } from 'react';
import { Icon } from './Icon';

// US-18. Until auth exists (US-01) the vote is local to the page; a second press takes it back.
export function MeTooButton({
  initialCount,
  label,
  pressedLabel,
  countTemplate,
}: {
  initialCount: number;
  label: string;
  pressedLabel: string;
  countTemplate: string;
}) {
  const [pressed, setPressed] = useState(false);
  const count = initialCount + (pressed ? 1 : 0);

  return (
    <div className="metoo">
      <button
        type="button"
        className="button button--primary button--lg metoo__button"
        aria-pressed={pressed}
        onClick={() => setPressed((p) => !p)}
      >
        <Icon name={pressed ? 'check' : 'hand'} size={20} />
        {pressed ? pressedLabel : label}
      </button>
      <p className="metoo__count" aria-live="polite">
        <Icon name="users" size={16} />
        {countTemplate.replace('{count}', String(count))}
      </p>
    </div>
  );
}
