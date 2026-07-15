import path from "node:path";
import { BrowserWindow, shell } from "electron";
import { log, logError } from "../utils/logger";

let settingsWindow: BrowserWindow | null = null;

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 721,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    title: "Daisy 设置",
    resizable: true,
    backgroundColor: "#eef2fa",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "../../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, "../../renderer-settings/settings.html"));

  // Intercept target="_blank" links → open in system default browser instead of Electron popup
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 把渲染进程的 console 转发到主进程日志，方便定位问题
  settingsWindow.webContents.on("console-message", (_event, level, message, line, source) => {
    const levels = ["debug", "log", "warn", "error"];
    const tag = levels[level] ?? "log";
    if (level >= 2) {
      logError(`[settings:${tag}] ${message} (${source}:${line})`);
    } else {
      log(`[settings:${tag}] ${message}`);
    }
  });

  settingsWindow.webContents.on("render-process-gone", (_event, details) => {
    logError("Settings window render process gone", details);
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}