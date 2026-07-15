import { GlobalKeyboardListener } from "node-global-key-listener";
import { EventEmitter } from "node:events";
import { config } from "../config/env";

export class GlobalShortcut extends EventEmitter {
  private listener: GlobalKeyboardListener;
  private targetKeys: string[];
  private pressedKeys = new Set<string>();
  private isRecording = false;
  private releaseDebounceTimer: NodeJS.Timeout | null = null;
  private readonly RELEASE_DEBOUNCE_MS = 50;
  private captureMode = false;
  private capturePressedKeys = new Set<string>();
  private captureKeysInOrder: string[] = [];
  private pressedTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.listener = new GlobalKeyboardListener();
    this.targetKeys = this.parseShortcut(config.shortcut.globalShortcut);
    this.setup();
  }

  startCapture(): void {
    this.captureMode = true;
    this.pressedKeys.clear();
    this.capturePressedKeys.clear();
    this.captureKeysInOrder = [];
  }

  stopCapture(): void {
    this.captureMode = false;
    this.capturePressedKeys.clear();
    this.captureKeysInOrder = [];
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

  private matchesShortcut(targetKeys: string[]): boolean {
    return targetKeys.length > 0 && targetKeys.every((k) => {
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

  private matchesTargetShortcut(): boolean {
    return this.matchesShortcut(this.targetKeys);
  }

  private shortcutContainsKey(targetKeys: string[], key: string): boolean {
    return targetKeys.some((k) => {
      const target = this.normalizeKey(k);
      if (target === "alt") return key === "leftalt" || key === "rightalt";
      if (target === "meta") return key === "leftmeta" || key === "rightmeta";
      if (target === "control") return key === "leftcontrol" || key === "rightcontrol";
      if (target === "shift") return key === "leftshift" || key === "rightshift";
      return target === key;
    });
  }

  private setup(): void {
    this.listener.addListener((event) => {
      const key = this.normalizeEmittedKey(event.name || "");
      if (!key) return;

      if (this.captureMode) {
        if (event.state === "DOWN") {
          if (!this.capturePressedKeys.has(key)) {
            this.capturePressedKeys.add(key);
            this.captureKeysInOrder.push(key);
          }
        } else if (event.state === "UP") {
          this.capturePressedKeys.delete(key);
          if (this.capturePressedKeys.size === 0 && this.captureKeysInOrder.length > 0) {
            const displayName = this.captureKeysInOrder
              .map((capturedKey) => this.keyNameToDisplayName(capturedKey))
              .join("+");
            this.captureMode = false;
            this.captureKeysInOrder = [];
            this.emit("captured", displayName);
          }
        }
        return;
      }

      if (event.state === "DOWN") {
        if (this.releaseDebounceTimer) {
          clearTimeout(this.releaseDebounceTimer);
          this.releaseDebounceTimer = null;
        }
        this.pressedKeys.add(key);

        if (key !== "rightalt" && this.pressedTimer) {
          clearTimeout(this.pressedTimer);
          this.pressedTimer = null;
        }

        if (this.matchesTargetShortcut() && !this.isRecording) {
          if (this.pressedTimer) clearTimeout(this.pressedTimer);
          this.pressedTimer = setTimeout(() => {
            this.pressedTimer = null;
            this.isRecording = true;
            this.emit("pressed");
          }, 20);
        }
      } else if (event.state === "UP") {
        if (this.shortcutContainsKey(this.targetKeys, key) && this.pressedTimer) {
          clearTimeout(this.pressedTimer);
          this.pressedTimer = null;
        }
        if (this.shortcutContainsKey(this.targetKeys, key) && this.isRecording) {
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
    if (this.pressedTimer) {
      clearTimeout(this.pressedTimer);
      this.pressedTimer = null;
    }
    if (this.releaseDebounceTimer) {
      clearTimeout(this.releaseDebounceTimer);
      this.releaseDebounceTimer = null;
    }
    this.targetKeys = this.parseShortcut(shortcut);
    this.pressedKeys.clear();
    this.isRecording = false;
  }
}
