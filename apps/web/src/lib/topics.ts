import { useMemo, useSyncExternalStore } from 'react';
// The topics a citizen picked in the onboarding or the account (app prototype), and whether the onboarding was seen.
// Kept in this browser only: they steer the feed and are no personal data the API needs. Storage can be blocked
// (private mode), so every access is guarded and the feed works without it.
import { TOPICS, type TopicId } from './petition';

const TOPICS_KEY = 'kz-topics';
const ONBOARDED_KEY = 'kz-onboarded';

export function readTopics(): TopicId[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(TOPICS_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is TopicId => TOPICS.some((t) => t.id === x)) : [];
  } catch {
    return [];
  }
}

export function saveTopics(topics: readonly TopicId[]): void {
  try {
    window.localStorage.setItem(TOPICS_KEY, JSON.stringify(topics));
  } catch {
    // Not stored; the choice still applies until the page reloads.
  }
  window.dispatchEvent(new Event('kz-topics'));
}

export function wasOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboarded(): void {
  try {
    window.localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Shown again next time; harmless.
  }
}

// React access as an external store: the raw stored string is the snapshot (stable between changes), so components
// re-render only when the topics change, here or in another tab.
const subscribeTopics = (onChange: () => void) => {
  window.addEventListener('kz-topics', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('kz-topics', onChange);
    window.removeEventListener('storage', onChange);
  };
};
const rawTopics = () => {
  try {
    return window.localStorage.getItem(TOPICS_KEY) ?? '[]';
  } catch {
    return '[]';
  }
};

export function useTopics(): TopicId[] {
  const raw = useSyncExternalStore(subscribeTopics, rawTopics, () => '[]');
  return useMemo(() => {
    try {
      const list = JSON.parse(raw) as unknown;
      return Array.isArray(list) ? list.filter((x): x is TopicId => TOPICS.some((t) => t.id === x)) : [];
    } catch {
      return [];
    }
  }, [raw]);
}

/** Whether the onboarding was seen, read once on the client (the server renders as "seen", so nothing flashes). */
export function useWasOnboarded(): boolean {
  return useSyncExternalStore(
    () => () => {},
    wasOnboarded,
    () => true,
  );
}
