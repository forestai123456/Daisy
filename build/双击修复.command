#!/bin/bash
# 解决 macOS 提示“无法验证开发者”或“已损坏”的问题

# 切换到脚本所在目录
cd "$(dirname "$0")"

APP="/Applications/Daisy.app"
[ -d "$APP" ] || APP="$HOME/Applications/Daisy.app"

if [ ! -d "$APP" ]; then
  echo "============================================="
  echo "错误: 未找到 Daisy.app。"
  echo "请先将「Daisy」应用拖到「应用程序」文件夹中，再运行此修复脚本。"
  echo "============================================="
  echo "按回车键关闭窗口..."
  read
  exit 1
fi

echo "============================================="
echo "正在为您修复 Daisy.app..."
echo "正在清除隔离属性..."

# 尝试直接清除隔离标记
xattr -d com.apple.quarantine "$APP" 2>/dev/null
xattr -cr "$APP" 2>/dev/null

# 检查是否还有隔离属性
if xattr "$APP" 2>/dev/null | grep -q "com.apple.quarantine"; then
  echo "提示: 需要管理员权限来解除隔离标记，请输入您的 Mac 锁屏密码（输入时密码不显示，输完按回车）："
  sudo xattr -r -d com.apple.quarantine "$APP"
  sudo xattr -cr "$APP"
fi

# 再次验证
if xattr "$APP" 2>/dev/null | grep -q "com.apple.quarantine"; then
  echo "============================================="
  echo "修复失败：未能成功清除隔离标记。请确认您输入了正确的密码。"
  echo "============================================="
else
  echo "============================================="
  echo "修复完成！正在为您启动 Daisy..."
  echo "============================================="
  open "$APP"
fi

echo "按回车键退出终端..."
read
