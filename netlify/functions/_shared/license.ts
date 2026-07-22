import { createPrivateKey, sign } from "node:crypto";

export const APP_ID = "com.daisy.app";
const DEVICE_CODE_PATTERN = /^DSY1(?:-[0-9A-F]{5}){8}$/;

export interface LicensePayload {
  v: 1;
  appId: typeof APP_ID;
  deviceCode: string;
  licenseId: string;
  issuedAt: string;
  edition: "full";
  customer: string;
}

function readEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("授权服务配置不完整");
  return value;
}

export function normalizeDeviceCode(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^DSY1[0-9A-F]{40}$/.test(compact)) {
    throw new Error("设备码格式不正确");
  }
  const id = compact.slice(4);
  const normalized = `DSY1-${id.match(/.{1,5}/g)!.join("-")}`;
  if (!DEVICE_CODE_PATTERN.test(normalized)) throw new Error("设备码格式不正确");
  return normalized;
}

export function canonicalPayload(payload: LicensePayload): string {
  return JSON.stringify({
    v: 1,
    appId: APP_ID,
    deviceCode: payload.deviceCode,
    licenseId: payload.licenseId,
    issuedAt: payload.issuedAt,
    edition: "full",
    customer: payload.customer || "",
  });
}

export function issueActivationCode(payload: LicensePayload): string {
  const pem = Buffer.from(readEnvironment("DAISY_LICENSE_PRIVATE_KEY_PEM_B64"), "base64").toString("utf8");
  const signature = sign(null, Buffer.from(canonicalPayload(payload), "utf8"), createPrivateKey(pem));
  return Buffer.from(JSON.stringify({ payload, signature: signature.toString("base64url") })).toString("base64url");
}
