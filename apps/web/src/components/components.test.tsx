import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { listPublicReports, listStaffQueue } from '@/lib/sample-data';
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

describe('sample data boundary (US-24)', () => {
  it('never gives the citizen view a score, level or danger marks', () => {
    for (const report of listPublicReports()) {
      expect(report).not.toHaveProperty('score');
      expect(report).not.toHaveProperty('level');
      expect(report).not.toHaveProperty('dangerMarks');
    }
  });

  it('scores the staff queue highest first, and the breakdown multiplies out to the score', () => {
    const queue = listStaffQueue();
    expect(queue.map((r) => r.score)).toEqual([...queue.map((r) => r.score)].sort((a, b) => b - a));
    for (const { breakdown: b } of queue) expect(b.base * b.decay * b.danger * b.safety).toBeCloseTo(b.score, 10);
  });
});
