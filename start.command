#!/bin/zsh
cd "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 20 或更高版本。'
  read '?按回车关闭…'
  exit 1
fi
print '幽林纪启动后，请在浏览器打开 http://127.0.0.1:4173/'
print '关闭此窗口或按 Ctrl+C 停止服务。'
node server.mjs
