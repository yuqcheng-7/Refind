import { useEffect, useState } from 'react';

const WELCOME_TEXT = 'Welcome, Refind!';

/** In-memory only: survives in-app nav, resets on full page reload. */
let welcomePlayedThisLoad = false;

function shouldAnimateWelcome() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
  } catch {
    /* jsdom may lack matchMedia */
  }
  return !welcomePlayedThisLoad;
}

/** Even stagger — no mid-phrase pauses. */
function charDelayMs(index) {
  return index * 36;
}

/**
 * Hero title for the home canvas (`.hero-block`).
 * Plays a one-shot letter reveal the first time the hero is shown in this page load.
 */
export function WelcomeHeadline() {
  const [animate] = useState(() => shouldAnimateWelcome());

  useEffect(() => {
    if (animate) welcomePlayedThisLoad = true;
  }, [animate]);

  if (!animate) {
    return <h1 className="hero-welcome">{WELCOME_TEXT}</h1>;
  }

  return (
    <h1 className="hero-welcome is-typing">
      <span className="hero-welcome__text">{WELCOME_TEXT}</span>
      <span className="hero-welcome__visual" aria-hidden="true">
        {Array.from(WELCOME_TEXT).map((char, index) => (
          <span
            key={`${char}-${index}`}
            className="hero-welcome__char"
            style={{ animationDelay: `${charDelayMs(index)}ms` }}
          >
            {char === ' ' ? '\u00a0' : char}
          </span>
        ))}
      </span>
    </h1>
  );
}
