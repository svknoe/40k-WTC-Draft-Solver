// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { App } from './App';

describe('App', () => {
  test('renders the editor shell with the Local-only pill', () => {
    render(<App />);
    expect(screen.getByText(/Local-only/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Matrix' })).toBeInTheDocument();
  });

  test('the benchmark link is built from the Vite base path (not a hardcoded root href)', () => {
    render(<App />);
    const link = screen.getByRole('link', { name: /engine benchmark/i });
    // Must derive from import.meta.env.BASE_URL so it resolves under the
    // GitHub Pages project-site base, not the account root.
    expect(link).toHaveAttribute('href', `${import.meta.env.BASE_URL}bench.html`);
  });
});
