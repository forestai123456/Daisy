import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { log } from "../utils/logger";

const execAsync = promisify(exec);

interface AppEntry {
  name: string;
  path: string;
}

interface AliasMap {
  [alias: string]: string;
}

const APP_DIRS = [
  "/Applications",
  "/System/Applications",
  "/Applications/Utilities",
  path.join(process.env.HOME || "", "Applications"),
];

const SCAN_INTERVAL_MS = 5 * 60 * 1000;

let appCache: AppEntry[] = [];
let lastScanTime = 0;
let scanTimer: NodeJS.Timeout | null = null;

const userAliasFile = path.join(process.env.HOME || "", ".diri-aliases.json");

function loadAliases(): AliasMap {
  try {
    if (fs.existsSync(userAliasFile)) {
      return JSON.parse(fs.readFileSync(userAliasFile, "utf-8"));
    }
  } catch {
    // ignore
  }
  return {};
}

function scanApps(): AppEntry[] {
  const apps: AppEntry[] = [];
  const seen = new Set<string>();

  for (const dir of APP_DIRS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith(".app")) continue;
        const fullPath = path.join(dir, entry);
        const name = entry.replace(/\.app$/i, "");
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        apps.push({ name, path: fullPath });
      }
    } catch {
      // ignore permission errors
    }
  }

  log(`CommandRouter: scanned ${apps.length} apps`);
  return apps;
}

function refreshCache(): void {
  appCache = scanApps();
  lastScanTime = Date.now();
}

export function startCommandRouter(): void {
  refreshCache();
  scanTimer = setInterval(refreshCache, SCAN_INTERVAL_MS);
  log("CommandRouter: started");
}

export function stopCommandRouter(): void {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.]/g, "");
}

function findApp(target: string): AppEntry | null {
  const aliases = loadAliases();
  const normalized = normalizeName(target);

  // Check aliases first
  if (aliases[target] || aliases[normalized]) {
    const realName = aliases[target] || aliases[normalized];
    const found = appCache.find(a => a.name === realName);
    if (found) return found;
  }

  // Exact match (case-insensitive)
  let found = appCache.find(a => a.name.toLowerCase() === target.toLowerCase());
  if (found) return found;

  // Normalized match
  found = appCache.find(a => normalizeName(a.name) === normalized);
  if (found) return found;

  // Contains match (target is substring of app name or vice versa)
  found = appCache.find(a => {
    const an = normalizeName(a.name);
    return an.includes(normalized) || normalized.includes(an);
  });
  if (found) return found;

  return null;
}

async function openApp(name: string): Promise<string> {
  const app = findApp(name);
  if (!app) return `__NOT_FOUND__:${name}`;
  try {
    await execAsync(`open "${app.path}"`);
    log(`CommandRouter: opened ${app.name}`);
    return `__OK__:已打开${app.name}`;
  } catch {
    return `__ERROR__:打开${name}失败`;
  }
}

async function quitApp(name: string): Promise<string> {
  const app = findApp(name);
  if (!app) return `__NOT_FOUND__:${name}`;
  try {
    await execAsync(`osascript -e 'tell application "${app.name}" to quit'`);
    log(`CommandRouter: quit ${app.name}`);
    return `__OK__:已关闭${app.name}`;
  } catch {
    return `__ERROR__:关闭${name}失败`;
  }
}

async function setVolume(action: string): Promise<string> {
  try {
    if (action === "mute") {
      await execAsync("osascript -e 'set volume with output muted'");
    } else if (action === "unmute") {
      await execAsync("osascript -e 'set volume without output muted'");
    } else {
      const { stdout } = await execAsync("osascript -e 'output volume of (get volume settings)'");
      let vol = parseInt(stdout.trim(), 10);
      if (action === "up") vol = Math.min(100, vol + 10);
      else if (action === "down") vol = Math.max(0, vol - 10);
      await execAsync(`osascript -e 'set volume output volume ${vol}'`);
    }
    return `__OK__:音量已调整`;
  } catch {
    return `__ERROR__:音量调整失败`;
  }
}

async function playControl(action: string): Promise<string> {
  try {
    const key = action === "pause" || action === "play" ? "space" : action === "next" ? "fastforward" : "rewind";
    await execAsync(`osascript -e 'tell application "System Events" to key code ${key === "space" ? "49" : key === "fastforward" ? "124" : "123"} using {option down, command down}' 2>/dev/null || osascript -e 'tell application "System Events" to keystroke " " '`);
    return `__OK__:播放控制已执行`;
  } catch {
    return `__ERROR__:播放控制失败`;
  }
}

export interface RouteResult {
  handled: boolean;
  message?: string;
}

export async function routeCommand(text: string): Promise<RouteResult> {
  const trimmed = text.trim();

  // Refresh cache if stale
  if (Date.now() - lastScanTime > SCAN_INTERVAL_MS) {
    refreshCache();
  }

  // 打开应用
  const openMatch = trimmed.match(/^(?:帮我?|请|麻烦|你)?(?:打开|启动|开启|运行)(.+?)(?:吧|一下|应用|程序)?$/);
  if (openMatch) {
    const target = openMatch[1].trim();
    // Make sure there's no additional intent after the app name
    if (target.length > 0 && target.length < 30 && !/[，,。！！？？]/.test(target)) {
      const result = await openApp(target);
      return { handled: true, message: result };
    }
  }

  // 关闭应用
  const quitMatch = trimmed.match(/^(?:帮我?|请|麻烦|你)?(?:关闭|关掉|退出|结束|kill)(.+?)(?:吧|一下|应用|程序)?$/);
  if (quitMatch) {
    const target = quitMatch[1].trim();
    if (target.length > 0 && target.length < 30 && !/[，,。！！？？]/.test(target)) {
      const result = await quitApp(target);
      return { handled: true, message: result };
    }
  }

  // 音量控制
  if (/^(调高|调大|增大|提高).{0,4}音量|音量.{0,4}(大|高|调高)/.test(trimmed)) {
    const result = await setVolume("up");
    return { handled: true, message: result };
  }
  if (/^(调低|调小|减小|降低).{0,4}音量|音量.{0,4}(小|低|调低)/.test(trimmed)) {
    const result = await setVolume("down");
    return { handled: true, message: result };
  }
  if (/^(静音|取消静音|解除静音)/.test(trimmed)) {
    const action = trimmed.includes("取消") || trimmed.includes("解除") ? "unmute" : "mute";
    const result = await setVolume(action);
    return { handled: true, message: result };
  }

  // 播放控制
  if (/^(暂停|继续播放|播放|暂停播放)$/.test(trimmed)) {
    const result = await playControl("pause");
    return { handled: true, message: result };
  }
  if (/^(下一首|下一曲|next)$/.test(trimmed)) {
    const result = await playControl("next");
    return { handled: true, message: result };
  }
  if (/^(上一首|上一曲|previous)$/.test(trimmed)) {
    const result = await playControl("prev");
    return { handled: true, message: result };
  }

  // Not a local command
  return { handled: false };
}
