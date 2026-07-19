/// <reference types="vite/client" />

interface Window {
  designxDesktop?: {
    platform: string;
    versions: {
      electron: string;
    };
  };
}
