/// <reference types="vite/client" />

import type { DesignXDesktopApi } from './shared/contracts';

export {};

declare global {
  interface Window {
    designx?: DesignXDesktopApi;
  }
}
