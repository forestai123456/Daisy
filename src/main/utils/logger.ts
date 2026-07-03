import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { app } from "electron";

function getLogFile(): string {
  try {
    const logDir = app?.getPath?.("logs") || path.join(os.tmpdir(), "diri-logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    return path.join(logDir, "diri-main.log");
  } catch {
    return path.join(os.tmpdir(), "diri-main.log");
  }
}

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    process.stdout.write(line);
  } catch {
    // stdout may not be available in packaged app
  }
  try {
    fs.appendFileSync(getLogFile(), line);
  } catch {
    // ignore
  }
}

export function logError(message: string, error?: unknown): void {
  let detail = "";
  if (error instanceof Error) {
    detail = `${error.message}\n${error.stack || ""}`;
  } else if (error !== undefined) {
    detail = String(error);
  }
  log(`ERROR: ${message} ${detail}`.trim());
}
