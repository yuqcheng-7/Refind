import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe('WelcomeHeadline', () => {
  it('types Welcome, Refind! letter by letter on first hero render', async () => {
    const { WelcomeHeadline } = await import('./WelcomeHeadline.jsx');
    render(<WelcomeHeadline />);
    const heading = screen.getByRole('heading', { name: 'Welcome, Refind!' });
    expect(heading).toHaveClass('is-typing');
    expect(heading.querySelectorAll('.hero-welcome__char')).toHaveLength('Welcome, Refind!'.length);
  });

  it('skips typing when the hero already played in this page load', async () => {
    const { WelcomeHeadline } = await import('./WelcomeHeadline.jsx');
    const first = render(<WelcomeHeadline />);
    expect(screen.getByRole('heading', { name: 'Welcome, Refind!' })).toHaveClass('is-typing');
    first.unmount();

    render(<WelcomeHeadline />);
    const heading = screen.getByRole('heading', { name: 'Welcome, Refind!' });
    expect(heading).not.toHaveClass('is-typing');
    expect(heading.querySelectorAll('.hero-welcome__char')).toHaveLength(0);
    expect(heading).toHaveTextContent('Welcome, Refind!');
  });
});
