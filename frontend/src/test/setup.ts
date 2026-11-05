import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no matchMedia. The theme provider reads it, so give it a neutral light default.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }) as unknown as MediaQueryList,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
