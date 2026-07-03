export interface DiriAPI {
  openSettings: () => void;
  sendTtsPlayEnded: () => void;
  onStateUpdate: (callback: (value: string) => void) => () => void;
  onShowWindow: (callback: () => void) => () => void;
  onHideWindow: (callback: () => void) => () => void;
  onTtsPlay: (callback: (filePath: string) => void) => () => void;
  onTtsEnd: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    diriAPI: DiriAPI;
  }
}

export {};
