import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../ipc/channels";
import { log } from "../utils/logger";

let audioWindow: BrowserWindow | null = null;
let isRecording = false;
let isReady = false;
let pendingStart = false;
let onAudioData: ((buffer: Buffer) => void) | null = null;
let onAudioError: ((message: string) => void) | null = null;

export function initAudioRecorder(
  onData: (buffer: Buffer) => void,
  onError: (message: string) => void,
): void {
  onAudioData = onData;
  onAudioError = onError;

  ipcMain.on(IPC_CHANNELS.AUDIO_DATA, (_event, base64: string) => {
    if (onAudioData) {
      onAudioData(Buffer.from(base64, "base64"));
    }
  });

  ipcMain.on(IPC_CHANNELS.AUDIO_ERROR, (_event, message: string) => {
    if (onAudioError) {
      onAudioError(message);
    }
  });

  // Pre-create audio window so it's ready when user presses hotkey
  ensureAudioWindow();
}

export function ensureAudioWindow(): BrowserWindow {
  if (audioWindow && !audioWindow.isDestroyed()) {
    return audioWindow;
  }

  isReady = false;
  audioWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "../../preload/index.js"),
    },
  });

  audioWindow.loadFile(path.join(__dirname, "../../renderer/audio.html"));

  audioWindow.webContents.on("did-finish-load", () => {
    isReady = true;
    log("[recorder] audio window loaded");
    if (pendingStart) {
      pendingStart = false;
      sendToAudioWindow(IPC_CHANNELS.START_RECORDING);
    }
  });

  audioWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    log(`[recorder] audio window FAILED to load: ${code} ${desc}`);
  });

  audioWindow.on("closed", () => {
    audioWindow = null;
    isReady = false;
  });

  return audioWindow;
}

function sendToAudioWindow(channel: string): void {
  try {
    const win = ensureAudioWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(channel);
    }
  } catch (err) {
    console.error(`Error sending to audio window on channel ${channel}:`, err);
  }
}

export function startRecording(): void {
  isRecording = true;
  sendToAudioWindow(IPC_CHANNELS.START_RECORDING);
}

export function stopRecording(): void {
  isRecording = false;
  pendingStart = false;
  sendToAudioWindow(IPC_CHANNELS.STOP_RECORDING);
}

export function getIsRecording(): boolean {
  return isRecording;
}
