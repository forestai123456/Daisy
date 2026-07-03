import os from "node:os";
import path from "node:path";
import { ChatMessage, DeepSeekClient } from "./deepseek";
import { SYSTEM_PROMPT } from "./system-prompt";

const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_TOKENS_ESTIMATE = 6000;

function getSystemPromptWithEnv(): string {
  try {
    const username = os.userInfo().username;
    const homedir = os.homedir();
    const desktop = path.join(homedir, "Desktop");
    const now = new Date();
    const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const weekday = weekdays[now.getDay()];
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekday} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    return `${SYSTEM_PROMPT}\n\n当前运行环境信息：\n- 当前时间 (Current Time): ${dateStr}\n- 当前 macOS 用户名 (Username): "${username}"\n- 用户主目录 (Home Directory): "${homedir}"\n- 桌面路径 (Desktop Path): "${desktop}"`;
  } catch (err) {
    return SYSTEM_PROMPT;
  }
}

export class ConversationManager {
  private messages: ChatMessage[] = [];
  private lastActiveAt = 0;

  constructor() {
    this.messages.push({ role: "system", content: getSystemPromptWithEnv() });
  }

  isExpired(timeoutMs: number): boolean {
    if (this.lastActiveAt === 0) return false;
    return Date.now() - this.lastActiveAt > timeoutMs;
  }

  touch(): void {
    this.lastActiveAt = Date.now();
  }

  reset(): void {
    this.messages = [{ role: "system", content: getSystemPromptWithEnv() }];
    this.lastActiveAt = 0;
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  addUserMessage(text: string): void {
    this.trimHistory();
    this.messages.push({ role: "user", content: text });
    this.lastActiveAt = Date.now();
  }

  addAssistantMessage(text: string): void {
    this.messages.push({ role: "assistant", content: text });
    this.lastActiveAt = Date.now();
  }

  addToolResult(toolCallId: string, content: string): void {
    this.messages.push({
      role: "tool",
      content,
      tool_call_id: toolCallId,
    });
    this.lastActiveAt = Date.now();
  }

  private trimHistory(): void {
    // Keep system message + last N messages
    if (this.messages.length > MAX_HISTORY_MESSAGES + 1) {
      const system = this.messages[0];
      this.messages = [system, ...this.messages.slice(-MAX_HISTORY_MESSAGES)];
    }

    // Rough token-based trimming (1 token ≈ 4 chars for Chinese)
    let totalChars = this.messages.reduce((sum, m) => sum + m.content.length, 0);
    while (totalChars > MAX_HISTORY_TOKENS_ESTIMATE * 4 && this.messages.length > 2) {
      const removed = this.messages.splice(1, 1)[0];
      if (removed) {
        totalChars -= removed.content.length;
      } else {
        break;
      }
    }
  }
}
