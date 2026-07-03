#!/usr/bin/env node
/**
 * 通过 Electron webContents API 从主进程模拟前端调用 IPC。
 * 用法：这个脚本会连到已运行的 Daisy Dev 进程，通过 debug port 触发 JS 执行。
 *
 * 简化版本：让运行中的 Daisy Dev 加载后一段时间自动执行几个 diriAPI 调用
 * 并把结果输出到主进程日志。
 *
 * 由于 Electron 默认不开 remote debug，我们改用另一种方式：
 * 在 App.tsx 里加入 URL 触发的自测钩子，用 file:// 加 ?selftest=1 查询触发。
 */
console.log("此文件被 index.ts 里的 selftest 逻辑替代，勿运行。");
