import path from "node:path";
import { BrowserWindow, screen } from "electron";
import { IPC_CHANNELS } from "../ipc/channels";
import { log } from "../utils/logger";

const ORB_SIZE = 120;

let floatWindow: BrowserWindow | null = null;

let hideTimeout: NodeJS.Timeout | null = null;

export function createFloatWindow(): BrowserWindow {
  if (floatWindow && !floatWindow.isDestroyed()) {
    return floatWindow;
  }

  const { x: workX, y: workY, width: workWidth } = screen.getPrimaryDisplay().workArea;
  const x = workX + Math.round((workWidth - ORB_SIZE) / 2);
  const y = workY + 20;

  floatWindow = new BrowserWindow({
    width: ORB_SIZE,
    height: ORB_SIZE,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  floatWindow.loadFile(path.join(__dirname, "../../renderer/float.html"));
  floatWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatWindow.setAlwaysOnTop(true, "screen-saver");

  floatWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Float window render process gone:", details);
  });

  floatWindow.webContents.on("console-message", (_event, level, message) => {
    const levels = ["debug", "log", "warn", "error"];
    console.error(`[float:${levels[level] ?? level}] ${message}`);
  });

  floatWindow.on("closed", () => {
    floatWindow = null;
  });

  return floatWindow;
}

export function getFloatWindow(): BrowserWindow | null {
  return floatWindow;
}

export function showFloatWindow(): void {
  if (!floatWindow || floatWindow.isDestroyed()) return;
  
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  // 1. Show the window immediately to eliminate visual delay!
  floatWindow.showInactive();

  // 2. Reposition it only if display boundary changed, to avoid blocking display server queries
  try {
    const { x: workX, y: workY, width: workWidth } = screen.getPrimaryDisplay().workArea;
    const x = workX + Math.round((workWidth - ORB_SIZE) / 2);
    const y = workY + 20;
    const currentPos = floatWindow.getPosition();
    if (currentPos[0] !== x || currentPos[1] !== y) {
      floatWindow.setPosition(x, y);
    }
  } catch (err) {
    console.error("Error setting float window position:", err);
  }

  sendToFloatWindow(IPC_CHANNELS.SHOW_WINDOW);
  log("Float window shown");
}

export function hideFloatWindow(): void {
  if (!floatWindow || floatWindow.isDestroyed()) return;
  sendToFloatWindow(IPC_CHANNELS.HIDE_WINDOW);
  
  if (hideTimeout) {
    clearTimeout(hideTimeout);
  }
  
  hideTimeout = setTimeout(() => {
    hideTimeout = null;
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.hide();
      log("Float window hidden");
    }
  }, 300);
}

export function sendToFloatWindow(channel: string, ...args: unknown[]): void {
  try {
    if (floatWindow && !floatWindow.isDestroyed() && !floatWindow.webContents.isDestroyed()) {
      floatWindow.webContents.send(channel, ...args);
    }
  } catch (err) {
    // Suppress disposed frame or hidden webContents errors
    console.error(`Error sending to float window on channel ${channel}:`, err);
  }
}
