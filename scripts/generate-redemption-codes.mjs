#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repository = process.env.DAISY_LICENSE_LEDGER_REPOSITORY || "forestai123456/Daisy-license-ledger";
const token = process.env.DAISY_LICENSE_LEDGER_GITHUB_TOKEN;
const contentPath = "redemptions.json";

if (!token) throw new Error("缺少 DAISY_LICENSE_LEDGER_GITHUB_TOKEN。请使用仅可访问 Daisy-license-ledger 的令牌运行此脚本。");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("授权台账仓库名不正确。");

const args = process.argv.slice(2);
const valueOf = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const count = Number(valueOf("--count") || 100);
const customer = String(valueOf("--customer") || "").trim().slice(0, 80);
const output = valueOf("--output") || `Daisy-redemption-codes-${new Date().toISOString().slice(0, 10)}.json`;

if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error("--count 必须是 1 到 1000 的整数。");

const url = `https://api.github.com/repos/${repository}/contents/${contentPath}`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "Daisy-License-Admin",
};

function createCode() {
  const id = randomBytes(15).toString("hex").toUpperCase();
  return `DAISY-RDM1-${id.match(/.{1,5}/g).join("-")}`;
}

function codeHash(code) {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

async function readLedger() {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error("无法读取私有授权台账。请确认仓库与令牌权限。");
  const body = await response.json();
  return {
    sha: body.sha,
    ledger: JSON.parse(Buffer.from(String(body.content).replace(/\n/g, ""), "base64").toString("utf8")),
  };
}

async function writeLedger(ledger, sha) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Add ${count} Daisy redemption codes`,
      content: Buffer.from(`${JSON.stringify(ledger, null, 2)}\n`, "utf8").toString("base64"),
      sha,
    }),
  });
  return response.ok;
}

let generated;
for (let attempt = 0; attempt < 5; attempt += 1) {
  const { ledger, sha } = await readLedger();
  if (ledger?.version !== 1 || !ledger.codes || typeof ledger.codes !== "object") throw new Error("授权台账格式不正确。");
  generated = Array.from({ length: count }, () => ({ code: createCode(), licenseId: randomUUID(), customer }));
  for (const entry of generated) {
    ledger.codes[codeHash(entry.code)] = { state: "available", licenseId: entry.licenseId, customer, createdAt: new Date().toISOString() };
  }
  if (await writeLedger(ledger, sha)) break;
  generated = undefined;
}

if (!generated) throw new Error("台账正在被更新，请重新运行此脚本。");
const outputPath = path.resolve(output);
fs.writeFileSync(outputPath, `${JSON.stringify(generated, null, 2)}\n`, { mode: 0o600 });
fs.chmodSync(outputPath, 0o600);
console.log(`已生成 ${generated.length} 个兑换码：${outputPath}`);
