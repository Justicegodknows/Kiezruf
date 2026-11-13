import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LevelChip, StatusBadge } from './Badges';
import { MeTooButton } from './MeTooButton';

describe('console: level chip (US-23)', () => {
  it('renders Critical, High, Medium and Low with text, not colour alone (BITV)', () => {
    for (const level of ['Critical', 'High', 'Medium', 'Low'] as const) {
      render(<LevelChip level={level} label={level} />);
      expect(screen.getByText(level)).toHaveClass(`badge--level-${level.toLowerCase()}`);
    }
  });
});

describe('status badge', () => {
  it('shows the status as text', () => {
    render(<StatusBadge status="inProgress" label="In Bearbeitung" />);
    expect(screen.getByText('In Bearbeitung')).toBeInTheDocument();
  });
});

describe('citizen web: Me too button (US-18)', () => {
  it('toggles off on a second tap', () => {
    render(<MeTooButton initialCount={20} label="Me too" pressedLabel="You support this" countTemplate="{count} affected" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('21 affected')).toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('20 affected')).toBeInTheDocument();
  });
});

// The data boundary (no score or level in the citizen view) is tested in packages/shared/src/demo.test.ts.
