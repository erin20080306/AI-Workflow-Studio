import type { DesktopAgentBridge } from '../shared/contracts';

declare global {
  interface Window {
    readonly desktopAgent?: DesktopAgentBridge;
  }
}

export {};
