import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { log, logError } from "../utils/logger";
import { matchApp } from "../command/router";
import { getBundledBin } from "../config/env";

const execAsync = promisify(exec);

function expandPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    return stdout.trim();
  } catch (error) {
    throw new Error(`AppleScript 执行失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getDefaultBrowserBundleId(): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers | grep -B 1 -A 2 "http" | grep LSHandlerRoleAll | head -n 1 | awk -F'"' '{print $2}'`
    );
    const trimmed = stdout.trim();
    return trimmed || "com.apple.Safari";
  } catch {
    return "com.apple.Safari";
  }
}

export async function openApplication(name: string): Promise<string> {
  let target = name;
  let useBundleId = false;

  const isBrowserKeyword = ["browser", "默认浏览器", "浏览器", "default_browser", "default browser"].includes(name.trim().toLowerCase());
  
  if (isBrowserKeyword) {
    target = await getDefaultBrowserBundleId();
    useBundleId = true;
  } else {
    const matched = matchApp(name);
    if (matched) {
      target = matched.name;
    }
  }

  try {
    if (useBundleId) {
      await execAsync(`open -b "${target}"`);
      return `已打开默认浏览器`;
    } else {
      await runAppleScript(`tell application "${target}" to activate`);
      return `已打开 ${target}`;
    }
  } catch {
    try {
      if (useBundleId) {
        await execAsync(`open -b com.apple.Safari`);
        return `已打开默认浏览器`;
      } else {
        await execAsync(`open -a "${target}"`);
        return `已打开 ${target}`;
      }
    } catch (error) {
      return `无法打开 ${name}，请检查应用名称是否正确`;
    }
  }
}

export async function quitApplication(name: string): Promise<string> {
  try {
    let targetName = name;
    const isBrowserKeyword = ["browser", "默认浏览器", "浏览器", "default_browser", "default browser"].includes(name.trim().toLowerCase());

    if (isBrowserKeyword) {
      const bundleId = await getDefaultBrowserBundleId();
      if (bundleId.includes("chrome")) {
        targetName = "Google Chrome";
      } else if (bundleId.includes("safari")) {
        targetName = "Safari";
      } else {
        try {
          const { stdout } = await execAsync(`osascript -e 'tell application "Finder" to name of application file id "${bundleId}"'`);
          const resolvedName = stdout.trim().replace(/\.app$/, "");
          if (resolvedName) targetName = resolvedName;
        } catch {
          targetName = "Safari";
        }
      }
    } else {
      const matched = matchApp(name);
      if (matched) {
        targetName = matched.name;
      }
    }

    log(`quitApplication: resolved "${name}" -> "${targetName}"`);

    const checkScript = `tell application "System Events" to exists process "${targetName}"`;
    const beforeCheck = await runAppleScript(checkScript).catch(() => "false");
    if (beforeCheck.trim() === "false") {
      log(`quitApplication: process "${targetName}" is not running`);
      return `已关闭 ${name}`;
    }

    try {
      await execAsync(`osascript -e 'tell application "${targetName}" to quit'`, { timeout: 3000 });
    } catch {
      // Ignore AppleScript error as Electron apps close abruptly and throw connection invalid errors
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const afterCheck = await runAppleScript(checkScript).catch(() => "false");
    if (afterCheck.trim() === "false") {
      log(`quitApplication: process "${targetName}" quitted gracefully`);
      return `已关闭 ${name}`;
    }

    try {
      await execAsync(`pkill -x "${targetName}"`, { timeout: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 300));
      const finalCheck = await runAppleScript(checkScript).catch(() => "false");
      if (finalCheck.trim() === "false") {
        log(`quitApplication: process "${targetName}" forced killed`);
        return `已关闭 ${name}`;
      }
    } catch {
      // Ignore shell errors
    }

    log(`quitApplication: failed to close process "${targetName}"`);
    return `无法关闭 ${name}，可能该应用有未保存的工作或无法响应`;
  } catch (error) {
    return `关闭 ${name} 失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function quitAllApplications(excludeNames: string[] = []): Promise<string> {
  try {
    const defaultExcludes = ["Finder", "Terminal", "iTerm", "iTerm2", "Diri", "Daisy", "Xcode"];
    const allExcludes = Array.from(new Set([...defaultExcludes, ...excludeNames]));
    const conditions = allExcludes.map(name => `appStr is not "${name}"`).join(" and ");
    
    const script = `
tell application "System Events"
    set appNames to name of every application process whose background only is false
end tell
repeat with appName in appNames
    set appStr to appName as string
    if ${conditions} then
        try
            tell application appStr to quit
        end try
    end if
end repeat
    `;
    
    await runAppleScript(script);
    return "已成功关闭所有其他应用程序";
  } catch (error) {
    return `关闭应用程序失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function typeText(text: string): Promise<string> {
  try {
    const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await runAppleScript(`tell application "System Events" to keystroke "${escaped}"`);
    return "已输入文字";
  } catch (error) {
    return `输入文字失败: ${error instanceof Error ? error.message : String(error)}。请检查是否已授予辅助功能权限。`;
  }
}

export async function pressKeys(keys: string): Promise<string> {
  try {
    const normalized = keys.toLowerCase().replace(/\s+/g, "");
    const parts = normalized.split("+");
    const mainKey = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    const keyMap: Record<string, string> = {
      command: "command down",
      cmd: "command down",
      option: "option down",
      alt: "option down",
      control: "control down",
      ctrl: "control down",
      shift: "shift down",
      return: "return",
      enter: "return",
      escape: "escape",
      esc: "escape",
      tab: "tab",
      space: "space",
      backspace: "delete",
      delete: "delete",
      up: "key code 126",
      down: "key code 125",
      left: "key code 123",
      right: "key code 124",
    };

    const modifierList = modifiers
      .map((m) => keyMap[m])
      .filter(Boolean)
      .join(", ");

    let script: string;
    if (mainKey in keyMap && keyMap[mainKey].startsWith("key code")) {
      script = `tell application "System Events" to ${keyMap[mainKey]}${modifierList ? ` using {${modifierList}}` : ""}`;
    } else {
      const key = mainKey.length === 1 ? mainKey : mainKey in keyMap ? keyMap[mainKey] : mainKey;
      if (key.startsWith("key code")) {
        script = `tell application "System Events" to ${key}${modifierList ? ` using {${modifierList}}` : ""}`;
      } else {
        script = `tell application "System Events" to keystroke "${key}"${modifierList ? ` using {${modifierList}}` : ""}`;
      }
    }

    await runAppleScript(script);
    return `已发送快捷键 ${keys}`;
  } catch (error) {
    return `发送快捷键失败: ${error instanceof Error ? error.message : String(error)}。请检查是否已授予辅助功能权限。`;
  }
}

export async function getFrontmostApplication(): Promise<string> {
  try {
    const name = await runAppleScript(
      'tell application "System Events" to get name of first application process whose frontmost is true',
    );
    return `当前最前面的应用是：${name}`;
  } catch (error) {
    return `获取当前应用失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function readSelectedText(): Promise<string> {
  try {
    // Save current clipboard (may fail if clipboard has non-text content)
    let originalClipboard = "";
    try {
      originalClipboard = await runAppleScript("get the clipboard as text");
    } catch {
      // Clipboard might contain image or other non-text content
    }

    // Copy selected text
    await runAppleScript('tell application "System Events" to keystroke "c" using command down');

    // Wait a bit for clipboard
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Read clipboard
    let selected = "";
    try {
      selected = await runAppleScript("get the clipboard as text");
    } catch {
      return "没有读取到选中的文字，请确认当前有选中的内容";
    }

    // Restore original clipboard
    if (originalClipboard) {
      try {
        await runAppleScript(`set the clipboard to "${originalClipboard.replace(/"/g, '\\"')}"`);
      } catch {
        // ignore restore failure
      }
    }

    if (!selected || selected === originalClipboard) {
      return "没有读取到选中的文字，请确认当前有选中的内容";
    }

    return `选中的文字是：${selected}`;
  } catch (error) {
    return `读取选中文本失败: ${error instanceof Error ? error.message : String(error)}。请检查是否已授予辅助功能权限。`;
  }
}

export async function getCurrentTime(): Promise<string> {
  const now = new Date();
  const days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const dayOfWeek = days[now.getDay()];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `当前时间是 ${year}年${month}月${date}日 ${dayOfWeek} ${hours}:${minutes}`;
}

export async function readFile(filePath: string): Promise<string> {
  const resolved = expandPath(filePath);
  try {
    const content = fs.readFileSync(resolved, "utf-8");
    const truncated = content.length > 5000 ? content.slice(0, 5000) + "\n...(内容过长，已截断)" : content;
    return `文件 ${filePath} 的内容：\n${truncated}`;
  } catch (error) {
    return `读取文件失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function writeFile(filePath: string, content: string): Promise<string> {
  const resolved = expandPath(filePath);
  try {
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, "utf-8");
    return `已写入文件 ${filePath}（${content.length} 字符）`;
  } catch (error) {
    return `写入文件失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function createFile(filePath: string, content: string): Promise<string> {
  const resolved = expandPath(filePath);
  try {
    if (fs.existsSync(resolved)) {
      return `文件 ${filePath} 已存在，未做修改。如需覆盖请明确说明。`;
    }
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, content, "utf-8");
    return `已创建文件 ${filePath}`;
  } catch (error) {
    return `创建文件失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function deleteFile(filePath: string): Promise<string> {
  const resolved = expandPath(filePath);
  try {
    if (!fs.existsSync(resolved)) {
      return `文件 ${filePath} 不存在`;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      fs.rmdirSync(resolved);
    } else {
      fs.unlinkSync(resolved);
    }
    return `已删除 ${filePath}`;
  } catch (error) {
    return `删除文件失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function downloadMedia(url: string, type: string = "video", destination?: string): Promise<string> {
  try {
    const defaultDir = path.join(os.homedir(), "Downloads");
    let saveDir = destination ? expandPath(destination) : defaultDir;

    // Resolve target path if it's a symlink (handles broken Downloads folder symlink!)
    try {
      saveDir = fs.realpathSync(saveDir);
    } catch (err) {
      try {
        const stat = fs.lstatSync(saveDir);
        if (stat.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(saveDir);
          saveDir = path.isAbsolute(linkTarget) ? linkTarget : path.resolve(path.dirname(saveDir), linkTarget);
          log(`downloadMedia: saveDir is a symlink pointing to ${saveDir}. Re-creating target folder...`);
        }
      } catch (lstatErr) {
        // saveDir doesn't exist at all, it will be created by mkdirSync
      }
    }

    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    log(`downloadMedia: starting download for ${url} (type: ${type}) to saveDir: ${saveDir}`);
    
    let ytdlpPath = getBundledBin("yt-dlp");
    
    let args = "";
    if (type === "audio") {
      args = `-x --audio-format mp3 --audio-quality 0 -o "%(title)s.%(ext)s"`;
    } else {
      args = `-f "bv*+ba/b" -o "%(title)s.%(ext)s"`;
    }
    
    const cmd = `"${ytdlpPath}" ${args} -P "${saveDir}" "${url}"`;
    log(`downloadMedia: running command: ${cmd}`);
    
    const { stdout } = await execAsync(cmd);
    
    const destMatch = stdout.match(/Destination:\s*(.+)/i) || stdout.match(/Merging formats into\s*"(.*?)"/i);
    let filename = "";
    if (destMatch && destMatch[1]) {
      filename = path.basename(destMatch[1].replace(/"/g, "").trim());
    }
    
    const savedName = filename ? `「${filename}」` : "媒体文件";
    const destName = saveDir.includes("Desktop") ? "桌面" : "下载（Downloads）文件夹";
    return `已成功下载${type === "audio" ? "音频" : "视频"}${savedName}并保存至${destName}。`;
  } catch (error) {
    logError("downloadMedia failed", error);
    return `下载失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function listDirectory(dirPath: string): Promise<string> {
  const resolved = expandPath(dirPath || "~/Desktop");
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries.map((entry) => {
      const type = entry.isDirectory() ? "📁" : "📄";
      return `${type} ${entry.name}`;
    });
    if (items.length === 0) {
      return `目录 ${dirPath} 为空`;
    }
    return `目录 ${dirPath} 的内容：\n${items.join("\n")}`;
  } catch (error) {
    return `列出目录失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function runShellCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 5,
      timeout: 30000,
      cwd: os.homedir(),
    });
    const output = (stdout + (stderr ? `\nSTDERR: ${stderr}` : "")).trim();
    const truncated = output.length > 5000 ? output.slice(0, 5000) + "\n...(输出过长，已截断)" : output;
    return truncated || "命令执行完成（无输出）";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `命令执行失败: ${message}`;
  }
}

export async function createNote(title: string, body: string): Promise<string> {
  try {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body ? body.replace(/"/g, '\\"') : "";

    // Auto-detect the first account
    const accountName = await runAppleScript(`
      tell application "Notes"
        return name of account 1
      end tell
    `);

    await runAppleScript(`
      tell application "Notes"
        tell account "${accountName.replace(/"/g, '\\"')}"
          make new note with properties {name:"${escapedTitle}", body:"${escapedBody}"}
        end tell
      end tell
    `);
    return `已创建备忘录「${title}」`;
  } catch (error) {
    return `创建备忘录失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function searchNotes(query: string): Promise<string> {
  try {
    const escaped = query.replace(/"/g, '\\"');
    const result = await runAppleScript(`
      tell application "Notes"
        set output to ""
        repeat with n in (every note whose name contains "${escaped}" or body contains "${escaped}")
          set output to output & "【" & (name of n) & "】" & return & (body of n) & return & return
        end repeat
        return output
      end tell
    `);
    return result || `没有找到包含「${query}」的备忘录`;
  } catch (error) {
    return `搜索备忘录失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function createReminder(title: string, dueDate?: string, notes?: string): Promise<string> {
  try {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedNotes = notes ? notes.replace(/"/g, '\\"') : "";
    let script = `
      tell application "Reminders"
        set newReminder to make new reminder with properties {name:"${escapedTitle}"}
    `;
    if (dueDate) {
      const parts = dueDate.trim().split(/[\s/]/);
      const datePart = parts[0].split("-");
      const timePart = parts[1] ? parts[1].split(":") : ["9", "0"];
      const y = parseInt(datePart[0]);
      const m = parseInt(datePart[1]);
      const d = parseInt(datePart[2]);
      const h = parseInt(timePart[0]);
      const min = parseInt(timePart[1] || "0");
      script += `
        set dueDate to (current date)
        set year of dueDate to ${y}
        set month of dueDate to ${m}
        set day of dueDate to ${d}
        set hours of dueDate to ${h}
        set minutes of dueDate to ${min}
        set seconds of dueDate to 0
        set due date of newReminder to dueDate
      `;
    }
    if (notes) {
      script += `        set body of newReminder to "${escapedNotes}"\n`;
    }
    script += `      end tell`;
    await runAppleScript(script);
    return `已创建提醒「${title}」${dueDate ? `，提醒时间：${dueDate}` : ""}`;
  } catch (error) {
    return `创建提醒失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function createCalendarEvent(title: string, startDate: string, endDate?: string, location?: string, notes?: string): Promise<string> {
  try {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedLocation = location ? location.replace(/"/g, '\\"') : "";
    const escapedNotes = notes ? notes.replace(/"/g, '\\"') : "";

    const startParts = startDate.trim().split(/[\s/]/);
    const startDatePart = startParts[0].split("-");
    const startTimePart = startParts[1] ? startParts[1].split(":") : ["9", "0"];
    const sy = parseInt(startDatePart[0]);
    const sm = parseInt(startDatePart[1]);
    const sd = parseInt(startDatePart[2]);
    const sh = parseInt(startTimePart[0]);
    const smin = parseInt(startTimePart[1] || "0");

    let ey = sy, em = sm, ed = sd, eh = sh, emin = smin;
    if (endDate) {
      const endParts = endDate.trim().split(/[\s/]/);
      const endDatePart = endParts[0].split("-");
      const endTimePart = endParts[1] ? endParts[1].split(":") : [String(sh + 1), "0"];
      ey = parseInt(endDatePart[0]);
      em = parseInt(endDatePart[1]);
      ed = parseInt(endDatePart[2]);
      eh = parseInt(endTimePart[0]);
      emin = parseInt(endTimePart[1] || "0");
    } else {
      eh = sh + 1;
    }

    // Auto-detect the first writable calendar (skip read-only system calendars)
    const systemCalendars = ["中国大陆节假日", "US Holidays", "生日", "Birthdays", "Siri建议", "Siri Suggestions", "计划的提醒事项"];
    const calName = await runAppleScript(`
      tell application "Calendar"
        set calName to ""
        repeat with c in calendars
          set n to name of c
          if n is not "中国大陆节假日" and n is not "US Holidays" and n is not "生日" and n is not "Birthdays" and n is not "Siri建议" and n is not "Siri Suggestions" and n is not "计划的提醒事项" then
            set calName to n
            exit repeat
          end if
        end repeat
        if calName is "" then
          set calName to name of calendar 1
        end if
        return calName
      end tell
    `);

    let script = `
      tell application "Calendar"
        tell calendar "${calName.replace(/"/g, '\\"')}"
          set startDate to (current date)
          set year of startDate to ${sy}
          set month of startDate to ${sm}
          set day of startDate to ${sd}
          set hours of startDate to ${sh}
          set minutes of startDate to ${smin}
          set seconds of startDate to 0
          set endDate to (current date)
          set year of endDate to ${ey}
          set month of endDate to ${em}
          set day of endDate to ${ed}
          set hours of endDate to ${eh}
          set minutes of endDate to ${emin}
          set seconds of endDate to 0
          make new event with properties {summary:"${escapedTitle}", start date:startDate, end date:endDate`;
    if (location) {
      script += `, location:"${escapedLocation}"`;
    }
    if (notes) {
      script += `, description:"${escapedNotes}"`;
    }
    script += `}
        end tell
      end tell`;
    await runAppleScript(script);
    return `已创建日历事件「${title}」，时间：${startDate}${endDate ? " 至 " + endDate : ""}`;
  } catch (error) {
    return `创建日历事件失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function getCalendarEvents(days: number): Promise<string> {
  try {
    const result = await runAppleScript(`
      tell application "Calendar"
        set output to ""
        set startDate to (current date)
        set endDate to (current date) + (${days} * days)
        repeat with c in calendars
          repeat with e in (every event of c whose start date is greater than startDate and start date is less than endDate)
            set output to output & (short date string of (start date of e)) & " " & (time string of (start date of e)) & " " & (summary of e) & return
          end repeat
        end repeat
        return output
      end tell
    `);
    return result || `未来${days}天内没有日历事件`;
  } catch (error) {
    return `获取日历事件失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function setTimer(seconds: number): Promise<string> {
  try {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const desc = mins > 0 ? `${mins}分${secs > 0 ? secs + "秒" : ""}` : `${secs}秒`;

    const cmd = `nohup bash -c 'sleep ${seconds} && afplay /System/Library/Sounds/Glass.aiff && osascript -e "display notification \\"计时器完成：${desc}\\" with title \\"Daisy 计时器\\"" ' > /dev/null 2>&1 &`;
    await execAsync(cmd);

    return `已设置计时器：${desc}，时间到了会播放提示音`;
  } catch (error) {
    return `设置计时器失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function setAlarm(time: string, label?: string): Promise<string> {
  try {
    const parts = time.trim().split(/[\s/]/);
    const datePart = parts[0].split("-");
    const timePart = parts[1] ? parts[1].split(":") : ["7", "0"];
    const y = parseInt(datePart[0]);
    const m = parseInt(datePart[1]);
    const d = parseInt(datePart[2]);
    const h = parseInt(timePart[0]);
    const min = parseInt(timePart[1] || "0");

    const now = new Date();
    const alarmDate = new Date(y, m - 1, d, h, min, 0);
    const diffMs = alarmDate.getTime() - now.getTime();

    if (diffMs <= 0) {
      return `闹钟时间 ${time} 已过期，请指定一个未来的时间`;
    }

    const diffSec = Math.round(diffMs / 1000);
    const diffMins = Math.round(diffSec / 60);
    let timeDesc: string;
    if (diffMins < 60) {
      timeDesc = `${diffMins}分钟后`;
    } else if (diffMins < 1440) {
      timeDesc = `${Math.round(diffMins / 60 * 10) / 10}小时后`;
    } else {
      timeDesc = `${Math.round(diffMins / 1440 * 10) / 10}天后`;
    }

    const alarmLabel = label ? label.replace(/"/g, '\\"') : "闹钟";
    const alarmTimeStr = `${m}月${d}日 ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;

    // Background process: sleep until alarm time, then play alarm sound repeatedly + notification
    const cmd = `nohup bash -c 'sleep ${diffSec} && for i in 1 2 3 4 5; do afplay /System/Library/Sounds/Alarm.aiff 2>/dev/null || afplay /System/Library/Sounds/Sosumi.aiff; sleep 1; done && osascript -e "display notification \\"${alarmLabel}：${alarmTimeStr}\\" with title \\"Daisy 闹钟\\" sound name \\"Sosumi\\"" ' > /dev/null 2>&1 &`;
    await execAsync(cmd);

    return `已设置闹钟「${label || "闹钟"}」，时间：${alarmTimeStr}（${timeDesc}响起）`;
  } catch (error) {
    return `设置闹钟失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function searchMaps(query: string): Promise<string> {
  try {
    await execAsync(`open "maps://?q=${encodeURIComponent(query)}"`);
    return `已在地图中搜索「${query}」`;
  } catch (error) {
    return `地图搜索失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function openUrl(url: string): Promise<string> {
  try {
    let finalUrl = url.trim();
    if (!/^https?:\/\//.test(finalUrl)) {
      finalUrl = "https://" + finalUrl;
    }
    await execAsync(`open "${finalUrl}"`);
    return `已用默认浏览器打开 ${finalUrl}`;
  } catch (error) {
    return `打开网址失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function executeTool(name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson || "{}") as Record<string, unknown>;
    log(`executeTool: ${name} with args ${argsJson}`);

    switch (name) {
      case "web_search": {
        const { webSearch } = await import("./search");
        return await webSearch(String(args.query));
      }
      case "search_wallpapers": {
        const { searchWallpapers } = await import("./search");
        return await searchWallpapers(String(args.query));
      }
      case "open_application":
        return await openApplication(String(args.name));
      case "quit_application":
        return await quitApplication(String(args.name));
      case "quit_all_applications": {
        const excludes = args.exclude_names ? (Array.isArray(args.exclude_names) ? args.exclude_names.map(String) : [String(args.exclude_names)]) : [];
        return await quitAllApplications(excludes);
      }
      case "type_text":
        return await typeText(String(args.text));
      case "press_keys":
        return await pressKeys(String(args.keys));
      case "get_frontmost_application":
        return await getFrontmostApplication();
      case "read_selected_text":
        return await readSelectedText();
      case "get_current_time":
        return await getCurrentTime();
      case "weather_forecast": {
        const { weatherForecast } = await import("./weather");
        const days = parseInt(String(args.days ?? "1"), 10);
        return await weatherForecast(String(args.city), isNaN(days) ? 1 : Math.min(Math.max(days, 1), 10));
      }
      case "read_file":
        return await readFile(String(args.path));
      case "write_file":
        return await writeFile(String(args.path), String(args.content ?? ""));
      case "create_file":
        return await createFile(String(args.path), String(args.content ?? ""));
      case "delete_file":
        return await deleteFile(String(args.path));
      case "download_media":
        return await downloadMedia(
          String(args.url),
          args.type ? String(args.type) : "video",
          args.destination ? String(args.destination) : undefined
        );
      case "list_directory":
        return await listDirectory(String(args.path ?? "~/Desktop"));
      case "run_shell_command":
        return await runShellCommand(String(args.command));
      case "create_note":
        return await createNote(String(args.title), String(args.body ?? ""));
      case "search_notes":
        return await searchNotes(String(args.query));
      case "create_reminder":
        return await createReminder(String(args.title), args.due_date ? String(args.due_date) : undefined, args.notes ? String(args.notes) : undefined);
      case "create_calendar_event":
        return await createCalendarEvent(String(args.title), String(args.start_date), args.end_date ? String(args.end_date) : undefined, args.location ? String(args.location) : undefined, args.notes ? String(args.notes) : undefined);
      case "get_calendar_events": {
        const d = parseInt(String(args.days ?? "7"), 10);
        return await getCalendarEvents(isNaN(d) ? 7 : d);
      }
      case "set_timer": {
        const s = parseInt(String(args.seconds), 10);
        return await setTimer(isNaN(s) ? 300 : s);
      }
      case "set_alarm":
        return await setAlarm(String(args.time), args.label ? String(args.label) : undefined);
      case "set_alarm": {
        return await setAlarm(String(args.time), args.label ? String(args.label) : undefined);
      }
      case "search_maps":
        return await searchMaps(String(args.query));
      case "sports_schedule": {
        const { sportsSchedule } = await import("./sports");
        return await sportsSchedule(String(args.league));
      }
      case "open_url":
        return await openUrl(String(args.url));
      default:
        return `未知工具: ${name}`;
    }
  } catch (error) {
    return `工具执行失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}
