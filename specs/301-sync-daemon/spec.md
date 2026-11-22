# 301 — 中枢服务同步（sync-daemon 内嵌）功能规格【pi-desktop-hos】

> 需求编号 `301-sync-daemon`（跨端）。行为基准：`pi-desktop/specs/301-sync-daemon/spec.md`
> （FR-301-001~023）＋第二轮改版（设置并入 pi-web，D18–D20）。
> 本文件定义 **Electron on HarmonyOS 版**的实现口径。

## 1. 目标与范围

- 在 **hos 版**（Electron 37.2.3 / Node 22.17）内嵌 `@pi-agent-hub/sync-daemon@0.1.2` +
  `@pi-agent-hub/sync-plugin-pi-web@0.1.2`，把本机 pi 会话上行到中枢并接收下行事件。
- 设置入口：**pi-web 设置对话框最后的「中枢服务」分区**（构建期补丁），不新增原生设置页。
- **不使用独立子进程**：hos 上 `spawn('/bin/sh', …)` 可执行，但应用内 fork+exec 拉起 Node 脚本会触发
  L1 seccomp `Signal 31 (SIGSYS)`，且子进程 `exit/close` 事件不保证到达（僵尸泄漏，见 `docs/工程规划.md` R14）。
  因此 daemon 与插件 MUST 在 Electron **主进程内**同进程运行。

## 2. 与桌面版的差异

| 项 | pi-desktop | **pi-desktop-hos** |
|---|---|---|
| daemon 运行 | 子进程（`ELECTRON_RUN_AS_NODE`） | **主进程内**（同 Node 22.17） |
| 插件通信 | stdio JSON-RPC 子进程 | 直接 import `PiWebPlugin`（进程内方法调用） |
| 启动点 | pi-web 就绪后 | 同（`waitForReady` 之后、加载 UI 前后均可；不阻塞首屏） |
| 设置桥 | preload + IPC | **同源 HTTP** `/api/sync-daemon`（补丁 route） |
| 崩溃处理 | 子进程隔离 | MUST NOT 安装 `process.exit` 全局钩子 |
| Node 版本 | 24.21 | **22.17（低于上游 engines >=22.19）**：运行验证需按兼容处理，升级运行时后再复核 |

## 3. 功能需求

- **FR-301-141**：pi-web 就绪后 MUST 按 `enabled` 在主进程内启动同步；MUST NOT 阻塞首屏。
- **FR-301-142**：MUST 复用上游 `Daemon`，但 MUST NOT 走会安装 `process.exit` 崩溃钩子的 `daemon.start()`；
  MUST 使用嵌入式启动序列（logger.init → manager.start → executor.init → events + initial sync + 30s 定时）。
- **FR-301-143**：插件 MUST 进程内直连（`PiWebPlugin` + 方法表），MUST NOT spawn/stdio。
- **FR-301-144**：配置 MUST 落 `<HOME>/.pi-desktop/sync-daemon.json`（SyncDaemonConfig + enabled）；
  `pluginRoot=<HOME>/.pi-desktop/sync-daemon`；`pluginInstall=false`；注入 server/agentDir/password。
- **FR-301-145**：设置 UI MUST 为 pi-web 设置对话框「中枢服务」分区（状态灯/三字段/令牌/开关/应用），三套 locale；
  MUST 由构建期补丁交付（`patches/v0.17.0/0004-sync-daemon-settings-tab.patch`）。
- **FR-301-146**：设置数据 MUST 走同源 `GET/PUT /api/sync-daemon`；route 代理控制面，令牌不下发页面；
  沿用 pi-web 既有 Host/Origin/密码鉴权（hos 服务绑局域网 IP）。
- **FR-301-147**：应用 MUST 校验 → 原子写 → 停旧 → 按 enabled 重启；错误可读、不覆盖原配置。
- **FR-301-148**：状态 MUST 为 running/starting/disabled/stopped(reason)；绿=运行时存活，不代表中枢连通。
- **FR-301-149**：应用退出（`before-quit`）MUST 在关闭 Next 服务之前停止同步（定时器/SSE/控制面），MUST NOT `process.exit`。
- **FR-301-150**：依赖固定 0.1.2，随 `pi-dist/node_modules` 分发；运行期不 npm install。
- **FR-301-151**：pi-web 改动以 `patches/v0.17.0/` 幂等补丁交付，构建后回退 pristine。

## 4. 非功能

- 同进程：同步循环串行、不得阻塞主进程事件循环；控制面仅 127.0.0.1 + Bearer；配置 0600；日志脱敏。
- Node 22.17 兼容：避免使用 22.19+ 才有的 API（`fetch`/`AbortSignal.timeout`/动态 import 均可用）。
- 内存：长进程 + 大上传时监控 RSS。

## 5. 场景

- S1：首屏 → 设置 ›「中枢服务」→ 运行中；hub 出现本 host 与会话。
- S2：关闭启用 → 应用 → 停止/未启用。
- S3：地址错 → 红 + 日志；改对后恢复。
- S4：退出应用 → 服务关闭前同步已停止，无残留定时器/连接。
- S5：校验失败 → 拒绝且配置不变。

## 6. 落点与验证

- `src-main/sync-runtime.js`（与 Ark/Android 同源实现，CJS）、`src-main/main.js`（启动/退出钩子）、
  `scripts/collect-pi.mjs`（依赖装入 pi-dist + keep）、补丁与 README、文档口径。
- 交付前：补丁往返、`node --check`、collect-pi/打包（含 route 标记断言）。
- **本机无 HarmonyOS PC/平板**（现有鸿蒙真机为手机，仅用于 Ark 版）；hos 本轮只做构建验证，
  真机验证由交接方在具备 PC/平板的设备上执行（见交接文档）。
