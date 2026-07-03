import { GlobalKeyboardListener } from "node-global-key-listener";
import { EventEmitter } from "node:events";
import { config } from "../config/env";

export class GlobalShortcut extends EventEmitter {
  private listener: GlobalKeyboardListener;
  private targetKeys: string[];
  private pressedKeys = new Set<string>();
  private isRecording = false;
  private releaseDebounceTimer: NodeJS.Timeout | null = null;
  private readonly RELEASE_DEBOUNCE_MS = 150;
  private captureMode = false;

  constructor() {
    super();
    this.listener = new GlobalKeyboardListener();
    this.targetKeys = this.parseShortcut(config.shortcut.globalShortcut);
    this.setup();
  }

  startCapture(): void {
    this.captureMode = true;
    this.pressedKeys.clear();
  }

  stopCapture(): void {
    this.captureMode = false;
  }

  private keyNameToDisplayName(key: string): string {
    const displayNames: Record<string, string> = {
      leftalt: "LeftOption",
      rightalt: "RightOption",
      leftmeta: "LeftCommand",
      rightmeta: "RightCommand",
      leftcontrol: "LeftControl",
      rightcontrol: "RightControl",
      leftshift: "LeftShift",
      rightshift: "RightShift",
      space: "Space",
      return: "Return",
      escape: "Escape",
      tab: "Tab",
      backspace: "Backspace",
      delete: "Delete",
      mouseleft: "Mouse Left",
      mouseright: "Mouse Right",
      mousemiddle: "Mouse Middle",
    };
    return displayNames[key] || key;
  }

  private parseShortcut(shortcut: string): string[] {
    if (!shortcut || typeof shortcut !== "string") return ["rightalt"];
    return shortcut
      .toLowerCase()
      .split(/[+\s]/)
      .map((k) => k.trim())
      .filter(Boolean);
  }

  private normalizeKey(key: string): string {
    const lower = key.toLowerCase().replace(/\s+/g, "");
    const aliases: Record<string, string> = {
      leftalt: "leftalt",
      rightalt: "rightalt",
      option: "alt",
      leftoption: "leftalt",
      rightoption: "rightalt",
      alt: "alt",
      leftcommand: "leftmeta",
      rightcommand: "rightmeta",
      command: "meta",
      cmd: "meta",
      meta: "meta",
      leftcontrol: "leftcontrol",
      rightcontrol: "rightcontrol",
      control: "control",
      ctrl: "control",
      leftshift: "leftshift",
      rightshift: "rightshift",
      shift: "shift",
      space: "space",
      return: "return",
      enter: "return",
      escape: "escape",
      esc: "escape",
      tab: "tab",
      backspace: "backspace",
      delete: "delete",
    };
    return aliases[lower] || lower;
  }

  private normalizeEmittedKey(name: string): string {
    const standard = (name || "").toLowerCase().replace(/\s+/g, "");
    // node-global-key-listener emits standard names like "LEFT ALT", "RIGHT ALT"
    if (standard === "leftalt") return "leftalt";
    if (standard === "rightalt") return "rightalt";
    if (standard === "leftcommand" || standard === "leftmeta") return "leftmeta";
    if (standard === "rightcommand" || standard === "rightmeta") return "rightmeta";
    if (standard === "leftcontrol") return "leftcontrol";
    if (standard === "rightcontrol") return "rightcontrol";
    if (standard === "leftshift") return "leftshift";
    if (standard === "rightshift") return "rightshift";
    return standard;
  }

  private matchesTargetShortcut(): boolean {
    return this.targetKeys.every((k) => {
      const target = this.normalizeKey(k);
      if (target === "alt") {
        return this.pressedKeys.has("leftalt") || this.pressedKeys.has("rightalt");
      }
      if (target === "meta") {
        return this.pressedKeys.has("leftmeta") || this.pressedKeys.has("rightmeta");
      }
      if (target === "control") {
        return this.pressedKeys.has("leftcontrol") || this.pressedKeys.has("rightcontrol");
      }
      if (target === "shift") {
        return this.pressedKeys.has("leftshift") || this.pressedKeys.has("rightshift");
      }
      return this.pressedKeys.has(target);
    });
  }

  private isTargetKey(key: string): boolean {
    return this.targetKeys.some((k) => this.normalizeKey(k) === key);
  }

  private setup(): void {
    this.listener.addListener((event) => {
      const key = this.normalizeEmittedKey(event.name || "");
      if (!key) return;

      if (this.captureMode) {
        if (event.state === "DOWN") {
          const displayName = this.keyNameToDisplayName(key);
          this.captureMode = false;
          this.emit("captured", displayName);
        }
        return;
      }

      if (event.state === "DOWN") {
        // Cancel any pending release (key bounce: user held key, phantom UP, then real DOWN)
        if (this.releaseDebounceTimer) {
          clearTimeout(this.releaseDebounceTimer);
          this.releaseDebounceTimer = null;
        }
        this.pressedKeys.add(key);
        if (this.matchesTargetShortcut() && !this.isRecording) {
          this.isRecording = true;
          this.emit("pressed");
        }
      } else if (event.state === "UP") {
        if (this.isTargetKey(key) && this.isRecording) {
          // Debounce the release to filter out key bounce.
          // If the key comes back down within RELEASE_DEBOUNCE_MS, cancel the release.
          this.releaseDebounceTimer = setTimeout(() => {
            this.isRecording = false;
            this.pressedKeys.clear();
            this.releaseDebounceTimer = null;
            this.emit("released");
          }, this.RELEASE_DEBOUNCE_MS);
        } else {
          this.pressedKeys.delete(key);
        }
      }
    });
  }

  destroy(): void {
    this.listener.kill();
  }

  updateShortcut(shortcut: string): void {
    this.targetKeys = this.parseShortcut(shortcut);
    this.pressedKeys.clear();
    this.isRecording = false;
  }
}
