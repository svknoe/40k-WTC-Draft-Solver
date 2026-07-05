// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { App } from './App';

describe('App', () => {
  test('renders the editor shell with the Local-only pill', () => {
    render(<App />);
    expect(screen.getByText(/Local-only/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Matrix' })).toBeInTheDocument();
  });

  test('the Local-only pill opens (and closes) the privacy explainer', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByText(/Everything stays on your computer/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Local-only/i }));
    expect(screen.getByText(/Everything stays on your computer/i)).toBeInTheDocument();
    expect(screen.getByText(/Built for practice, not for live events/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Everything stays on your computer/i)).not.toBeInTheDocument();
  });
});
