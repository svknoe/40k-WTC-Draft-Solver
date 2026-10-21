// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { RatingModeToggle } from './RatingModeToggle';

describe('RatingModeToggle', () => {
  test('shows the active mode and reports clicks', async () => {
    const onChange = vi.fn();
    render(<RatingModeToggle simpleMode onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Single rating' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(screen.getByRole('button', { name: 'By map' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  test('an unusable mode is disabled with a tooltip; disabled locks both', () => {
    const { rerender } = render(
      <RatingModeToggle simpleMode onChange={() => {}} canUse={{ simple: true, byMap: false }} />);
    const byMap = screen.getByRole('button', { name: 'By map' });
    expect(byMap).toBeDisabled();
    expect(byMap).toHaveAttribute('title', 'Fill in the map ratings on the Matrix screen first');
    expect(screen.getByRole('button', { name: 'Single rating' })).toBeEnabled();

    rerender(<RatingModeToggle simpleMode onChange={() => {}} disabled />);
    expect(screen.getByRole('button', { name: 'Single rating' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'By map' })).toBeDisabled();
  });
});
