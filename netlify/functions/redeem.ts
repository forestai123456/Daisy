import type { Config, Context } from "@netlify/functions";
import { claimRedeemCode } from "./_shared/ledger";
import { issueActivationCode } from "./_shared/license";

function json(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default async (request: Request, context: Context): Promise<Response> => {
  if (request.method !== "POST") return json(405, { message: "仅支持 POST 请求" });

  let body: { redeemCode?: unknown; deviceCode?: unknown };
  try {
    body = await request.json() as { redeemCode?: unknown; deviceCode?: unknown };
  } catch {
    return json(400, { message: "请求格式不正确" });
  }
  if (typeof body.redeemCode !== "string" || typeof body.deviceCode !== "string") {
    return json(400, { message: "兑换码或设备码格式不正确" });
  }

  try {
    const result = await claimRedeemCode(body.redeemCode, body.deviceCode);
    if (result.kind === "invalid-code") return json(400, { message: "兑换码无效" });
    if (result.kind === "already-claimed-by-another-device") {
      return json(409, { message: "该兑换码已绑定其他设备" });
    }
    return json(200, { activationCode: issueActivationCode(result.payload) });
  } catch (error) {
    // Do not log any code, device identifier, activation code, or secret.
    console.error("Daisy redemption failed", { requestId: context.requestId });
    return json(503, { message: error instanceof Error ? error.message : "授权服务暂时不可用" });
  }
};

export const config: Config = {
  path: "/api/license/redeem",
  method: ["POST"],
};
