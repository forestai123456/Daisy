import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { app } from "electron";
import dotenv from "dotenv";

function getUserDataEnvPath(): string {
  try {
    return path.join(app.getPath("userData"), "daisy.env");
  } catch {
    return path.join(os.homedir(), ".daisy.env");
  }
}

function findEnvFile(): string | null {
  const userDataEnv = getUserDataEnvPath();
  const candidates = [
    userDataEnv,
    path.join(process.cwd(), "daisy.env"),
    path.join(__dirname, "..", "..", "..", "daisy.env"),
    path.join(__dirname, "..", "..", "daisy.env"),
    path.join(app?.getAppPath?.() || "", "daisy.env"),
    path.join(process.cwd(), ".env"),
    path.join(__dirname, "..", "..", "..", ".env"),
    path.join(__dirname, "..", "..", ".env"),
    path.join(app?.getAppPath?.() || "", ".env"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadEnv(): void {
  const envPath = findEnvFile();
  if (envPath) {
    dotenv.config({ path: envPath });
  }
}

loadEnv();

export function getWritableEnvPath(): string {
  const userDataEnv = getUserDataEnvPath();
  if (fs.existsSync(userDataEnv)) return userDataEnv;
  const found = findEnvFile();
  if (found) {
    try {
      fs.accessSync(found, fs.constants.W_OK);
      return found;
    } catch {
      // bundled file is read-only, fall through to userData
    }
  }
  return userDataEnv;
}

export const config = {
  asr: {
    appId: process.env.VOLCENGINE_APP_ID || "",
    accessToken: process.env.VOLCENGINE_ACCESS_TOKEN || "",
    resourceId: process.env.VOLCENGINE_RESOURCE_ID || "volc.seedasr.sauc.duration",
    wsUrl: process.env.VOLCENGINE_ASR_WS_URL || "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async",
  },
  llm: {
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.AI_TRANSLATION_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || process.env.AI_TRANSLATION_MODEL || "deepseek-v4-flash",
  },
  tts: {
    voice: process.env.EDGE_TTS_VOICE || "zh-CN-XiaoxiaoNeural",
    rate: process.env.EDGE_TTS_RATE || "+20%",
  },
  whisper: {
    model: process.env.WHISPER_MODEL || "ggml-base.bin",
    shortcutUseWhisper: process.env.SHORTCUT_USE_WHISPER === "true",
  },
  shortcut: {
    globalShortcut: process.env.GLOBAL_SHORTCUT || "RightOption",
  },
  wakeWord: {
    enabled: process.env.WAKE_WORD_ENABLED !== "false",
    keyword: process.env.WAKE_WORD || "嘿 Daisy",
  },
  firecrawl: {
    apiKey: process.env.FIRECRAWL_API_KEY || "fc-22220cee179d4e55ae7635f0fbb0e2c1",
  },
  autoLaunch: process.env.AUTO_LAUNCH === "true",
};

export const WHISPER_MODELS: Record<string, { label: string; size: string; url: string }> = {
  "ggml-tiny.bin": {
    label: "Tiny (39MB, 最快)",
    size: "39MB",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  },
  "ggml-base.bin": {
    label: "Base (142MB, 推荐)",
    size: "142MB",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  },
  "ggml-small.bin": {
    label: "Small (466MB, 最准)",
    size: "466MB",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  },
};

export function getWhisperModelPath(): string {
  // 优先用内置模型
  const bundled = path.join(app?.getAppPath?.() || "", "assets", "models", config.whisper.model);
  if (fs.existsSync(bundled)) return bundled;
  return path.join(os.homedir(), "Models", "whisper", config.whisper.model);
}

export function getBundledBin(name: string): string {
  const candidates = [
    path.join(app?.getAppPath?.() || "", "assets", "bin", name),
    "/opt/homebrew/bin/" + name,
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return name; // fallback to PATH
}

export function isAsrConfigured(): boolean {
  return Boolean(config.asr.appId && config.asr.accessToken);
}

export function isLlmConfigured(): boolean {
  return Boolean(config.llm.apiKey);
}
