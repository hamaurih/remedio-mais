import { afterEach, expect } from "vitest";
import { installTestNetworkGuard, takeBlockedNetworkAttempts } from "./networkGuard";

installTestNetworkGuard();
afterEach(() => {
  expect(takeBlockedNetworkAttempts(), "Unexpected network attempt: mock the integration instead").toEqual([]);
});

import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
