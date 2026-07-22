# Daisy 一次性兑换码

`/api/license/redeem` 是 Daisy 付费版首次激活接口。用户输入购买时收到的 `DAISY-RDM1-...` 兑换码后，接口将该码原子绑定到当前 `DSY1-...` 设备码，并返回与现有 macOS 离线授权完全相同格式的 Ed25519 激活码。客户端只保存并离线验证最终激活码。

## 安全边界

- 私钥只配置为 Netlify 生产环境密钥 `DAISY_LICENSE_PRIVATE_KEY_PEM_B64`，绝不进入 Git、DMG 或客户端。
- 兑换记录仅保存在私有仓库 `Daisy-license-ledger` 的 `redemptions.json`。
- 每次绑定用 GitHub Contents API 的 `sha` 条件更新；冲突时重新读取，因此一个兑换码只能绑定一台设备。
- 同一设备可安全重试，服务会返回同一许可载荷的新签名；另一设备会收到“已绑定其他设备”。
- 不记录兑换码、设备码、最终激活码或密钥到函数日志。

## 批量生成

在作者电脑上运行（令牌只应拥有 `Daisy-license-ledger` 私有仓库的 Contents 读写权限）：

```bash
DAISY_LICENSE_LEDGER_GITHUB_TOKEN="..." node scripts/generate-redemption-codes.mjs --count 100 --output ~/Desktop/Daisy-redemption-codes.json
```

生成的文件含明文兑换码，仅用于逐个发给购买用户；它被 `.gitignore` 排除，发送完应移动到受保护位置。手工设备码激活流程仍然保留，供完全离线用户使用。
