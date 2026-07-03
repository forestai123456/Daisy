import { EventEmitter } from "node:events";
import { config } from "../config/env";
import { availableTools, ToolCall, ToolResult } from "./tools";
import { SYSTEM_PROMPT } from "./system-prompt";
import { log } from "../utils/logger";

const SILENT_ACTION_TOOLS = new Set([
  "open_application",
  "quit_application",
  "quit_all_applications",
  "open_url",
  "type_text",
  "press_keys",
  "create_note",
  "create_reminder",
  "create_calendar_event",
  "set_timer",
  "set_alarm",
  "write_file",
  "create_file",
  "delete_file",
  "list_directory",
  "read_file",
  "read_selected_text",
  "get_frontmost_application",
  "search_notes",
  "get_calendar_events"
]);

const INSPECTION_TOOLS = new Set([
  "list_directory",
  "read_file",
  "read_selected_text",
  "get_frontmost_application",
  "search_notes",
  "get_calendar_events"
]);

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface DualChannel {
  speech: string;
  display: string;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\{"display"\s*:\s*"?/g, "")
    .replace(/"speech"\s*:\s*"?/g, "")
    .replace(/"\s*\}/g, "")
    .replace(/\\n/g, " ")
    .replace(/\\["\\/]/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*#_~|]/g, "")
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
    .replace(/℃/g, "度")
    .replace(/°C/g, "度")
    .replace(/°/g, "度")
    .replace(/~/g, "到")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseDualChannel(text: string): DualChannel {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*?"display"[\s\S]*?"speech"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.display === "string" && typeof parsed.speech === "string") {
        return { display: parsed.display, speech: parsed.speech };
      }
    } catch {
      // fall through
    }
  }
  return { display: text, speech: stripMarkdown(text) };
}

export class DeepSeekClient extends EventEmitter {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private conversation: ChatMessage[] = [];
  private abortController: AbortController | null = null;
  private aborted = false;

  constructor(existingMessages?: ChatMessage[]) {
    super();
    this.apiKey = config.llm.apiKey;
    this.baseUrl = config.llm.baseUrl.replace(/\/$/, "");
    this.model = config.llm.model;
    this.conversation = existingMessages && existingMessages.length > 0
      ? [...existingMessages]
      : [{ role: "system", content: SYSTEM_PROMPT }];
  }

  getConversation(): ChatMessage[] {
    return this.conversation;
  }

  abort(): void {
    this.aborted = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.removeAllListeners();
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.apiKey) {
      this.emit("error", "缺少 DeepSeek API Key");
      return;
    }

    this.conversation.push({ role: "user", content: text });

    try {
      await this.streamChat(this.conversation);
    } catch (error) {
      if (this.aborted) return;
      this.emit("error", error instanceof Error ? error.message : String(error));
    }
  }

  private async streamChat(messages: ChatMessage[]): Promise<void> {
    this.abortController = new AbortController();
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        max_tokens: 1024,
        tools: availableTools,
        tool_choice: "auto",
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DeepSeek API 错误 ${response.status}: ${body}`);
    }

    if (!response.body) {
      throw new Error("DeepSeek 返回空响应体");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let assistantContent = "";
    const toolCalls: ToolCall[] = [];
    let toolAckEmitted = false;

    while (true) {
      if (this.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            assistantContent += delta.content;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const last = toolCalls[toolCalls.length - 1];
              if (!tc.id && last) {
                last.function.arguments += tc.function?.arguments || "";
                if (tc.function?.name) last.function.name = tc.function.name;
                continue;
              }
              const existing = toolCalls.find((t) => t.id === tc.id);
              if (existing) {
                existing.function.arguments += tc.function?.arguments || "";
                if (tc.function?.name) existing.function.name = tc.function.name;
              } else {
                toolCalls.push({
                  id: tc.id,
                  function: {
                    name: tc.function?.name || "",
                    arguments: tc.function?.arguments || "",
                  },
                });
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    // Check if aborted during streaming
    if (this.aborted) return;

    if (toolCalls.length > 0) {
      const allSilent = toolCalls.every(tc => SILENT_ACTION_TOOLS.has(tc.function.name));

      if (allSilent) {
        log(`DeepSeekClient: all tool calls are silent action tools. Executing silently...`);
        this.conversation.push({
          role: "assistant",
          content: assistantContent || "",
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: tc.function,
          })),
        });

        const toolResults = await this.executeToolCalls(toolCalls);
        if (this.aborted) return;
        this.conversation.push(...toolResults.map((r) => ({
          role: "tool" as const,
          content: r.content,
          tool_call_id: r.tool_call_id,
        })));

        const failed = toolResults.some(r => 
          /无法|失败|错误|Error|Failed|not found|does not|invalid|cannot|could not/i.test(r.content)
        );

        if (failed) {
          log(`DeepSeekClient: Silent tool execution failed. Falling back to chat to report...`);
          toolAckEmitted = false;
          await this.streamChat(this.conversation);
          return;
        }

        const hasInspection = toolCalls.some(tc => INSPECTION_TOOLS.has(tc.function.name));
        if (hasInspection) {
          log(`DeepSeekClient: Silent tools contain inspection tools. Continuing chat loop to let LLM process results...`);
          toolAckEmitted = false;
          await this.streamChat(this.conversation);
          return;
        }

        this.emit("silent_done");
        return;
      }

      if (!toolAckEmitted && assistantContent.trim()) {
        const parsed = parseDualChannel(assistantContent);
        log(`Tool ack raw: ${assistantContent}`);
        log(`Tool ack speech: ${parsed.speech}`);
        this.emit("tool_ack", parsed.speech);
      }

      this.conversation.push({
        role: "assistant",
        content: assistantContent || "",
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: tc.function,
        })),
      });

      const toolResults = await this.executeToolCalls(toolCalls);
      if (this.aborted) return;
      this.conversation.push(...toolResults.map((r) => ({
        role: "tool" as const,
        content: r.content,
        tool_call_id: r.tool_call_id,
      })));

      toolAckEmitted = false;
      await this.streamChat(this.conversation);
      return;
    }

    if (this.aborted) return;
    const parsed = parseDualChannel(assistantContent);
    log(`LLM raw response: ${assistantContent}`);
    log(`LLM speech text: ${parsed.speech}`);
    this.conversation.push({ role: "assistant", content: parsed.display });
    this.emit("done", parsed.speech);
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const { executeTool } = await import("../control/macos");
    const results: ToolResult[] = [];

    for (const tc of toolCalls) {
      const result = await executeTool(tc.function.name, tc.function.arguments);
      results.push({
        tool_call_id: tc.id,
        role: "tool",
        content: result,
      });
    }

    return results;
  }
}
