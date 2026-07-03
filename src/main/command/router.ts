import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { log, logError } from "../utils/logger";

const execAsync = promisify(exec);

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("osascript", [], (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
    child.stdin?.write(script);
    child.stdin?.end();
  });
}

export interface AppEntry {
  name: string;       // display name without .app
  path: string;        // full path to .app
  aliases: string[];   // lowercase aliases for matching
}

const APP_DIRS = [
  "/Applications",
  "/System/Applications",
  "/System/Applications/Utilities",
  path.join(process.env.HOME || "", "Applications"),
  "/Volumes/外接盘/Applications",
];

let appCache: AppEntry[] = [];
let lastScanTime = 0;
const SCAN_INTERVAL_MS = 30 * 60 * 1000; // rescan every 30 minutes

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
        const name = entry.replace(/\.app$/, "");
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const aliases = generateAliases(name);
        apps.push({ name, path: fullPath, aliases });
      }
    } catch {
      // ignore
    }
  }

  log(`CommandRouter: scanned ${apps.length} apps`);
  // Debug: check if specific apps are in cache
  const debugApps = ["lark", "wechat", "qqmusic"];
  for (const dbg of debugApps) {
    const found = apps.find(a => a.name.toLowerCase() === dbg);
    log(`CommandRouter: cache check "${dbg}" → ${found ? `found (${found.name}, aliases: ${found.aliases.join(",")})` : "NOT FOUND"}`);
  }
  return apps;
}

function generateAliases(name: string): string[] {
  const aliases = new Set<string>();
  const lower = name.toLowerCase();
  aliases.add(lower);

  // Remove spaces
  aliases.add(lower.replace(/\s+/g, ""));

  // Common Chinese names for popular apps
  const cnMap: Record<string, string[]> = {
    "wechat": ["微信"],
    "google chrome": ["谷歌浏览器", "chrome", "谷歌", "浏览器chrome"],
    "safari": ["safari浏览器", "苹果浏览器"],
    "terminal": ["终端"],
    "finder": ["访达"],
    "notes": ["备忘录"],
    "reminders": ["提醒事项"],
    "calendar": ["日历"],
    "maps": ["地图"],
    "music": ["apple音乐", "苹果音乐"],
    "qqmusic": ["qq音乐", "QQ音乐", "qq 音乐"],
    "photos": ["照片", "相册"],
    "messages": ["信息", "短信"],
    "mail": ["邮件", "邮箱"],
    "app store": ["应用商店"],
    "system settings": ["系统设置", "设置"],
    "calculator": ["计算器"],
    "preview": ["预览"],
    "textedit": ["文本编辑"],
    "quicktime player": ["播放器", "quicktime"],
    "logic pro": ["音频编辑", "logic"],
    "final cut pro": ["视频剪辑", "fcp", "final cut"],
    "cursor": ["光标编辑器"],
    "visual studio code": ["代码编辑器", "vscode", "vs code", "code"],
    "discord": ["迪斯科"],
    "spotify": ["音乐播放器"],
    "notion": ["笔记应用"],
    "figma": ["设计工具"],
    "slack": ["办公通讯"],
    "zoom": ["视频会议"],
    "pages": ["文档", "文稿"],
    "numbers": ["表格"],
    "keynote": ["演示文稿", "ppt"],
    "imovie": ["视频编辑"],
    "garageband": ["音乐制作"],
    "doubaoime": ["豆包输入法"],
    "doubao": ["豆包", "豆包app", "豆包ai"],
    "bluetooth": ["蓝牙"],
    "activity monitor": ["活动监视器"],
    "screenshot": ["截图"],
    "stickies": ["便签", "便利贴"],
    "videofusion-macos": ["剪映", "capcut", "jianying"],
    "qq": ["腾讯qq", "qq聊天"],
    "lark": ["飞书", "larksuite"],
    "codex": ["codex", "openai codex"],
    "telegram": ["电报"],
    "bilibili": ["b站", "哔哩哔哩", "b 站"],
    "xcode": ["开发者工具"],
    "android studio": ["安卓开发"],
    "docker": ["容器"],
    "postman": ["接口测试"],
    "obs": ["直播软件", "录屏"],
    "claude": ["克劳德"],
    "chatgpt": ["gpt", "chat gpt"],
    "opencode": ["open code", "opencode"],
    "douyin": ["抖音", "tiktok"],
    "netease cloudmusic": ["网易云音乐", "网易云"],
    "qq音乐": ["qq音乐"],
  };

  const lowerKey = lower;
  if (cnMap[lowerKey]) {
    for (const alias of cnMap[lowerKey]) {
      aliases.add(alias.toLowerCase());
    }
  }

  return Array.from(aliases);
}

function ensureCache(): void {
  const now = Date.now();
  if (appCache.length === 0 || now - lastScanTime > SCAN_INTERVAL_MS) {
    appCache = scanApps();
    lastScanTime = now;
  }
}

export function matchApp(target: string): AppEntry | null {
  ensureCache();
  const targetLower = target.toLowerCase().trim();

  // 1. Exact alias match (highest priority)
  for (const app of appCache) {
    if (app.aliases.includes(targetLower)) return app;
  }

  // 2. Exact app name match
  for (const app of appCache) {
    if (app.name.toLowerCase() === targetLower) return app;
  }

  // 3. Target is a prefix of app name or vice versa (e.g. "chrome" → "Google Chrome")
  //    Only if target length >= 3 to avoid "qq" matching "qqmusic"
  if (targetLower.length >= 3) {
    for (const app of appCache) {
      const appNameLower = app.name.toLowerCase();
      if (appNameLower.includes(targetLower) || targetLower.includes(appNameLower)) {
        // But don't match if target is a substring that's too short relative to app name
        const ratio = targetLower.length / appNameLower.length;
        if (ratio > 0.4 || targetLower.length >= 4) {
          return app;
        }
      }
    }
  }

  // 4. Check aliases for substring match (e.g. "飞书" in alias list)
  for (const app of appCache) {
    for (const alias of app.aliases) {
      if (alias.length < 2) continue;
      if (alias === targetLower) return app;
      // Only match if lengths are similar
      if (Math.abs(alias.length - targetLower.length) <= 2 && alias.length >= 2) {
        if (alias.includes(targetLower) || targetLower.includes(alias)) {
          return app;
        }
      }
    }
  }

  return null;
}

export interface CommandResult {
  handled: boolean;
  action?: string;
}

async function openApp(name: string): Promise<CommandResult> {
  const isBrowserKeyword = ["browser", "默认浏览器", "浏览器", "default_browser", "default browser"].includes(name.trim().toLowerCase());
  
  if (isBrowserKeyword) {
    try {
      const { getDefaultBrowserBundleId } = require("../control/macos");
      const bundleId = await getDefaultBrowserBundleId();
      await execAsync(`open -b "${bundleId}"`);
      log(`CommandRouter: opened default browser (${bundleId})`);
      return { handled: true, action: `open:browser` };
    } catch (e) {
      log(`CommandRouter: failed to open default browser, falling back to matchApp`);
    }
  }

  const app = matchApp(name);
  if (!app) {
    log(`CommandRouter: openApp("${name}") — no match found in ${appCache.length} apps`);
    return { handled: false };
  }
  try {
    await execAsync(`open -a "${app.path}"`);
    log(`CommandRouter: opened ${app.name} (${app.path})`);
    return { handled: true, action: `open:${app.name}` };
  } catch {
    return { handled: false };
  }
}

const BROWSER_APP_NAMES = [
  "Google Chrome", "Safari", "Firefox", "Microsoft Edge",
  "Opera", "Brave Browser", "Arc", "Vivaldi", "Chromium",
];

async function quitAllBrowsers(): Promise<CommandResult> {
  let quitCount = 0;
  for (const browserName of BROWSER_APP_NAMES) {
    try {
      // Check if the app is running before trying to quit
      const { stdout } = await execAsync(
        `osascript -e 'tell application "System Events" to (name of every process) contains "${browserName}"'`
      );
      if (stdout.trim() === "true") {
        await execAsync(`osascript -e 'tell application "${browserName}" to quit'`);
        quitCount++;
        log(`CommandRouter: quit browser ${browserName}`);
      }
    } catch {
      // App not installed or not running, skip
    }
  }
  if (quitCount > 0) {
    return { handled: true, action: `quit:browsers(${quitCount})` };
  }
  return { handled: false };
}

async function quitApp(name: string): Promise<CommandResult> {
  // Special case: "浏览器" → quit ALL running browsers
  if (name === "浏览器" || name === "browser" || name === "browsers") {
    return await quitAllBrowsers();
  }

  const app = matchApp(name);
  if (!app) {
    log(`CommandRouter: quitApp("${name}") — no match found in ${appCache.length} apps`);
    return { handled: false };
  }

  const bundleName = path.basename(app.path, ".app");

  // Step 1: Try AppleScript quit (graceful)
  try {
    await execAsync(`osascript -e 'tell application "${app.name}" to quit'`, { timeout: 3000 });
  } catch {
    // AppleScript failed — will try kill below
  }

  // Step 2: Wait briefly, check if process still running
  await new Promise(r => setTimeout(r, 300));
  try {
    const { stdout: stillRunning } = await execAsync(`pgrep -x "${bundleName}" 2>/dev/null || true`, { timeout: 2000 });
    if (!stillRunning.trim()) {
      log(`CommandRouter: quit ${app.name} (AppleScript)`);
      return { handled: true, action: `quit:${app.name}` };
    }
  } catch {
    // pgrep failed — assume not running
    log(`CommandRouter: quit ${app.name} (AppleScript)`);
    return { handled: true, action: `quit:${app.name}` };
  }

  // Step 3: Process still running — force kill
  try {
    await execAsync(`pkill -x "${bundleName}"`, { timeout: 3000 });
    log(`CommandRouter: quit ${app.name} (kill - fallback)`);
    return { handled: true, action: `quit:${app.name}` };
  } catch {
    log(`CommandRouter: failed to quit ${app.name}`);
    return { handled: false };
  }
}

async function setVolume(direction: "up" | "down" | "mute"): Promise<CommandResult> {
  try {
    if (direction === "mute") {
      await execAsync(`osascript -e 'set volume with output muted'`);
    } else {
      // Get current volume
      const { stdout } = await execAsync(`osascript -e 'output volume of (get volume settings)'`);
      let vol = parseInt(stdout.trim(), 10);
      vol = direction === "up" ? Math.min(100, vol + 10) : Math.max(0, vol - 10);
      await execAsync(`osascript -e 'set volume ${vol}'`);
    }
    log(`CommandRouter: volume ${direction}`);
    return { handled: true, action: `volume:${direction}` };
  } catch {
    return { handled: false };
  }
}

async function controlPlayback(action: "playpause" | "next" | "prev"): Promise<CommandResult> {
  try {
    const keyMap: Record<string, string> = {
      playpause: "space",
      next: "fast forward",
      prev: "rewind",
    };
    await execAsync(`osascript -e 'tell application "System Events" to key code ${action === "playpause" ? "49" : action === "next" ? "123" : "124"}'`);
    log(`CommandRouter: playback ${action}`);
    return { handled: true, action: `playback:${action}` };
  } catch {
    return { handled: false };
  }
}

async function setDoNotDisturb(enable: boolean): Promise<CommandResult> {
  const targetVal = enable ? 1 : 0;
  const script = `
tell application "System Events"
    tell process "ControlCenter"
        key code 53
        delay 0.1
        set menuItems to menu bar items of menu bar 1
        repeat with itemRef in menuItems
            set desc to description of itemRef
            if desc contains "控制中心" or desc contains "Control Center" then
                perform action "AXPress" of itemRef
                exit repeat
            end if
        end repeat
        delay 0.5
        try
            set checkBoxes to checkboxes of UI elements of window 1
            repeat with chk in checkBoxes
                set chkDesc to description of chk
                set chkName to name of chk
                if chkDesc contains "专注" or chkDesc contains "勿扰" or chkDesc contains "Focus" or chkName contains "专注" or chkName contains "勿扰" or chkName contains "Focus" then
                    set curVal to value of chk
                    if curVal is not ${targetVal} then
                        perform action "AXPress" of chk
                    end if
                    exit repeat
                end if
            end repeat
        end try
        delay 0.1
        key code 53
    end tell
end tell
  `;
  try {
    await runAppleScript(script);
    log(`CommandRouter: Set DND to ${enable}`);
    return { handled: true, action: `dnd:${enable ? "on" : "off"}` };
  } catch (err) {
    logError("CommandRouter: Set DND failed", err);
    return { handled: false };
  }
}

async function minimizeAllWindowsExcept(exceptName: string): Promise<CommandResult> {
  const app = matchApp(exceptName);
  const keepAppName = app ? app.name : exceptName;
  
  const script = `
tell application "System Events"
    set allProcesses to application processes whose visible is true
    repeat with p in allProcesses
        set pName to name of p
        if pName is not in {"${keepAppName}", "Daisy", "Finder"} then
            try
                set value of attribute "AXMinimized" of every window of p to true
            end try
        end if
    end repeat
end tell
  `;
  try {
    await runAppleScript(script);
    log(`CommandRouter: Minimized all windows except ${keepAppName}`);
    return { handled: true, action: `window:minimize-except:${keepAppName}` };
  } catch (err) {
    logError("CommandRouter: Minimize except failed", err);
    return { handled: false };
  }
}

async function minimizeApp(appName: string): Promise<CommandResult> {
  const app = matchApp(appName);
  const targetName = app ? app.name : appName;
  
  const script = `
tell application "System Events"
    repeat with p in (application processes whose visible is true)
        if name of p is "${targetName}" then
            try
                set value of attribute "AXMinimized" of every window of p to true
            end try
        end if
    end repeat
end tell
  `;
  try {
    await runAppleScript(script);
    log(`CommandRouter: Minimized app ${targetName}`);
    return { handled: true, action: `window:minimize-app:${targetName}` };
  } catch (err) {
    logError("CommandRouter: Minimize app failed", err);
    return { handled: false };
  }
}

async function splitScreen(leftName: string, rightName: string): Promise<CommandResult> {
  const leftApp = matchApp(leftName);
  const rightApp = matchApp(rightName);
  
  if (!leftApp || !rightApp) {
    log(`CommandRouter: Split screen apps not found: left="${leftName}" right="${rightName}"`);
    return { handled: false };
  }
  
  const script = `
tell application "Finder"
    set desktopBounds to bounds of window of desktop
    set screenWidth to item 3 of desktopBounds
    set screenHeight to item 4 of desktopBounds
end tell

tell application "System Events"
    -- Left app
    if exists process "${leftApp.name}" then
        set frontmost of process "${leftApp.name}" to true
        try
            set value of attribute "AXPosition" of window 1 of process "${leftApp.name}" to {0, 23}
            set value of attribute "AXSize" of window 1 of process "${leftApp.name}" to {(screenWidth / 2), (screenHeight - 23)}
        end try
    end if
    
    -- Right app
    if exists process "${rightApp.name}" then
        set frontmost of process "${rightApp.name}" to true
        try
            set value of attribute "AXPosition" of window 1 of process "${rightApp.name}" to {(screenWidth / 2), 23}
            set value of attribute "AXSize" of window 1 of process "${rightApp.name}" to {(screenWidth / 2), (screenHeight - 23)}
        end try
    end if
end tell
  `;
  try {
    await runAppleScript(script);
    log(`CommandRouter: Split screen ${leftApp.name} (left) and ${rightApp.name} (right)`);
    return { handled: true, action: `window:split-screen:${leftApp.name}:${rightApp.name}` };
  } catch (err) {
    logError("CommandRouter: Split screen failed", err);
    return { handled: false };
  }
}

async function saveClipboardImageToDesktop(): Promise<CommandResult> {
  try {
    const { clipboard } = require("electron");
    const img = clipboard.readImage();
    if (img.isEmpty()) {
      log("CommandRouter: Clipboard does not contain an image");
      return { handled: false };
    }
    
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    
    const desktopPath = path.join(os.homedir(), "Desktop");
    const now = new Date();
    const dateStr = now.getFullYear() + 
      String(now.getMonth() + 1).padStart(2, '0') + 
      String(now.getDate()).padStart(2, '0') + "_" + 
      String(now.getHours()).padStart(2, '0') + 
      String(now.getMinutes()).padStart(2, '0') + 
      String(now.getSeconds()).padStart(2, '0');
      
    const filename = `剪贴板图片_${dateStr}.png`;
    const targetPath = path.join(desktopPath, filename);
    
    fs.writeFileSync(targetPath, img.toPNG());
    log(`CommandRouter: Saved clipboard image to ${targetPath}`);
    return { handled: true, action: `clipboard:save-image:${filename}` };
  } catch (err) {
    logError("CommandRouter: Save clipboard image failed", err);
    return { handled: false };
  }
}

// Parse user command and execute if it matches a local command pattern
export async function tryLocalCommand(text: string): Promise<CommandResult> {
  const normalized = text.trim().replace(/[\s,，。！!？?、~]+$/, "");

  // 如果包含"官网""网站""网页""网址"等关键词，不走本地应用路由，交给LLM用open_url处理
  if (/官网|网站|网页|网址|首页|dot com|\.com|\.cn|\.net/i.test(normalized)) {
    return { handled: false };
  }

  // 打开/启动 应用
  let m = normalized.match(/^(?:帮我|麻烦|请)?(?:打开|启动|开启|运行|开一下)(.+)$/);
  if (m) {
    const target = m[1].replace(/^(一下|这个|那个)\s*/, "").trim();
    // Make sure it's just an app name, not a complex command
    if (target.length > 0 && !target.match(/[，,。！!？?]/)) {
      const result = await openApp(target);
      if (result.handled) return result;
    }
  }

  // 关闭/退出/关掉 应用
  m = normalized.match(/^(?:帮我|麻烦|请)?(?:关闭|关掉|退出|关一下|杀掉|结束|关了|关)(.+)$/);
  if (m) {
    const target = m[1].replace(/^(一下|这个|那个|了)\s*/, "").trim();
    if (target.length > 0 && !target.match(/[，,。！!？?]/)) {
      const result = await quitApp(target);
      if (result.handled) return result;
    }
  }

  // 音量控制
  if (/^(?:调高|增大|加大|开大|调大)(?:音量|声音)$/.test(normalized) || /^(?:音量|声音)(?:大一点|调高|调大)$/.test(normalized)) {
    return await setVolume("up");
  }
  if (/^(?:调低|减小|关小|调小|降低)(?:音量|声音)$/.test(normalized) || /^(?:音量|声音)(?:小一点|调低|调小)$/.test(normalized)) {
    return await setVolume("down");
  }
  if (/^(?:静音|取消静音|切换静音)$/.test(normalized)) {
    return await setVolume("mute");
  }

  // 播放控制
  if (/^(?:暂停|继续播放|播放)$/.test(normalized)) {
    return await controlPlayback("playpause");
  }
  if (/^(?:下一首|下一曲|下一个)$/.test(normalized)) {
    return await controlPlayback("next");
  }
  if (/^(?:上一首|上一曲|上一个)$/.test(normalized)) {
    return await controlPlayback("prev");
  }

  // 勿扰/专注模式
  if (/^(?:开启|打开|启动|进入)(?:勿扰|专注)(?:模式)?$/.test(normalized)) {
    return await setDoNotDisturb(true);
  }
  if (/^(?:关闭|退出|取消)(?:勿扰|专注)(?:模式)?$/.test(normalized)) {
    return await setDoNotDisturb(false);
  }

  // 最小化所有窗口除了
  let m2 = normalized.match(/^(?:最小化|关闭|隐藏)除了\s*(.+?)\s*之外的(?:所有|其他|其它|全部)?窗口$/);
  if (!m2) {
    m2 = normalized.match(/^除了\s*(.+?)\s*之外的(?:所有|其他|其它|全部)?窗口都(?:最小化|关闭|隐藏)$/);
  }
  if (m2) {
    const except = m2[1].trim();
    if (except) {
      const result = await minimizeAllWindowsExcept(except);
      if (result.handled) return result;
    }
  }

  // 最小化/隐藏单个应用
  let mApp = normalized.match(/^(?:帮我|把|请)?\s*(.+?)\s*(?:窗口)?(?:最小化|隐藏)$/);
  if (!mApp) {
    mApp = normalized.match(/^(?:最小化|隐藏)\s*(.+?)\s*(?:窗口)?$/);
  }
  if (mApp) {
    const target = mApp[1].replace(/^(一下|这个|那个)\s*/, "").trim();
    if (target.length > 0 && !target.match(/[，,。！!？?]/) && !/除了|之外/.test(target)) {
      const result = await minimizeApp(target);
      if (result.handled) return result;
    }
  }

  // 保存剪贴板图片到桌面
  if (/桌面/i.test(normalized) && /(?:保存|存)/.test(normalized) && /(?:图片|照片|截图)/.test(normalized)) {
    const result = await saveClipboardImageToDesktop();
    if (result.handled) return result;
  }

  // 分屏/左右分屏
  let m3 = normalized.match(/^(?:把)?\s*(.+?)\s*(?:放左边|在左边).+?(?:把)?\s*(.+?)\s*(?:放右边|在右边)$/);
  if (!m3) {
    m3 = normalized.match(/^(.+?)\s*(?:和|与)\s*(.+?)\s*(?:左右分屏|分屏)$/);
  }
  if (!m3) {
    m3 = normalized.match(/^(?:左右分屏|分屏)\s*(.+?)\s*(?:和|与)\s*(.+?)$/);
  }
  if (m3) {
    const left = m3[1].trim();
    const right = m3[2].trim();
    if (left && right) {
      const result = await splitScreen(left, right);
      if (result.handled) return result;
    }
  }

  return { handled: false };
}

// Initialize app cache on startup
export function initCommandRouter(): void {
  ensureCache();
}
