import { createHash } from "node:crypto";
import { LicensePayload, normalizeDeviceCode } from "./license";

const CODE_PATTERN = /^DAISY-RDM1(?:-[A-F0-9]{5}){6}$/;
const CONTENT_PATH = "redemptions.json";
const MAX_WRITE_RETRIES = 5;

interface RedemptionRecord {
  state: "available" | "redeemed";
  licenseId: string;
  customer: string;
  createdAt: string;
  redeemedAt?: string;
  deviceCode?: string;
  issuedAt?: string;
}

interface LedgerFile {
  version: 1;
  codes: Record<string, RedemptionRecord>;
}

interface LedgerSnapshot {
  ledger: LedgerFile;
  sha: string;
}

export type ClaimResult =
  | { kind: "claimed" | "already-claimed-by-this-device"; payload: LicensePayload }
  | { kind: "invalid-code" | "already-claimed-by-another-device" };

function environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("授权服务配置不完整");
  return value;
}

function repository(): string {
  const value = environment("DAISY_LICENSE_LEDGER_REPOSITORY");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error("授权服务配置不正确");
  }
  return value;
}

function headers(): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${environment("DAISY_LICENSE_LEDGER_GITHUB_TOKEN")}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Daisy-License-Service",
  };
}

function contentUrl(): string {
  return `https://api.github.com/repos/${repository()}/contents/${CONTENT_PATH}`;
}

export function normalizeRedeemCode(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^DAISYRDM1[A-F0-9]{30}$/.test(compact)) {
    throw new Error("兑换码格式不正确");
  }
  const id = compact.slice("DAISYRDM1".length);
  const normalized = `DAISY-RDM1-${id.match(/.{1,5}/g)!.join("-")}`;
  if (!CODE_PATTERN.test(normalized)) throw new Error("兑换码格式不正确");
  return normalized;
}

export function redeemCodeHash(code: string): string {
  return createHash("sha256").update(normalizeRedeemCode(code), "utf8").digest("hex");
}

function parseLedger(value: unknown): LedgerFile {
  if (!value || typeof value !== "object") throw new Error("授权记录格式无效");
  const candidate = value as Partial<LedgerFile>;
  if (candidate.version !== 1 || !candidate.codes || typeof candidate.codes !== "object") {
    throw new Error("授权记录格式无效");
  }
  return candidate as LedgerFile;
}

async function readLedger(): Promise<LedgerSnapshot> {
  const response = await fetch(contentUrl(), { headers: headers() });
  if (!response.ok) throw new Error("授权记录暂时不可用");
  const body = await response.json() as { content?: string; sha?: string };
  if (typeof body.content !== "string" || typeof body.sha !== "string") throw new Error("授权记录格式无效");
  try {
    const text = Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8");
    return { ledger: parseLedger(JSON.parse(text)), sha: body.sha };
  } catch {
    throw new Error("授权记录格式无效");
  }
}

async function writeLedger(ledger: LedgerFile, sha: string): Promise<boolean> {
  const response = await fetch(contentUrl(), {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Record Daisy redemption",
      content: Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`, "utf8").toString("base64"),
      sha,
    }),
  });
  if (response.status === 409 || response.status === 422) return false;
  if (!response.ok) throw new Error("授权记录暂时不可用");
  return true;
}

export async function claimRedeemCode(codeInput: string, deviceCodeInput: string): Promise<ClaimResult> {
  const codeHash = redeemCodeHash(codeInput);
  const deviceCode = normalizeDeviceCode(deviceCodeInput);

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt += 1) {
    const { ledger, sha } = await readLedger();
    const record = ledger.codes[codeHash];
    if (!record) return { kind: "invalid-code" };

    if (record.state === "redeemed") {
      if (record.deviceCode !== deviceCode || !record.issuedAt) {
        return { kind: "already-claimed-by-another-device" };
      }
      return {
        kind: "already-claimed-by-this-device",
        payload: {
          v: 1,
          appId: "com.daisy.app",
          deviceCode,
          licenseId: record.licenseId,
          issuedAt: record.issuedAt,
          edition: "full",
          customer: record.customer || "",
        },
      };
    }

    const issuedAt = new Date().toISOString();
    record.state = "redeemed";
    record.deviceCode = deviceCode;
    record.redeemedAt = issuedAt;
    record.issuedAt = issuedAt;

    if (!await writeLedger(ledger, sha)) continue;
    return {
      kind: "claimed",
      payload: {
        v: 1,
        appId: "com.daisy.app",
        deviceCode,
        licenseId: record.licenseId,
        issuedAt,
        edition: "full",
        customer: record.customer || "",
      },
    };
  }

  throw new Error("兑换请求较多，请稍后重试");
}
