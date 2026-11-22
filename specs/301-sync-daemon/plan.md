# 301 — 中枢服务同步 技术实现方案【pi-desktop-hos】

> 与 `spec.md` 成对。行为基准：`pi-desktop/specs/301-sync-daemon/{spec,plan}.md`（D1–D20）。
> 本方案只解决「hos 不能 spawn Node 子进程」与「Electron 主进程内嵌 daemon」两个差异。

## 1. 技术上下文

- 宿主：Electron 37.2.3（Node **22.17.0** / ABI v138）经 `harmonypc-electron` 运行；主进程
  `src-main/main.js` 进程内起 Next（`startServerWithFallback`），HTTP 轮询就绪后加载 UI。
- 平台：`spawn('/bin/sh', …)` 可执行，但 **fork+exec Node 脚本 SIGSYS**；子进程 `exit/close` 不可靠；
  `worker_threads` 可用但不是本方案依赖。
- 产物：`scripts/prepare-next.mjs`（幂等补丁 + next build）→ `collect-pi.mjs`（pi-dist + tar + SHA-256）。
- 上游包：`@pi-agent-hub/sync-daemon@0.1.2`、`@pi-agent-hub/sync-plugin-pi-web@0.1.2`。

## 2. 关键决策

| # | 决策 | 理由 |
|---|---|---|
| DH-1 | daemon + 插件在主进程内同进程运行 | Node 子进程链路不可用（SIGSYS）；避免与窗口/服务进程隔离冲突 |
| DH-2 | 复用 `Daemon`，替换 `manager`/`executor` | 复用 hub/调度/SSE/下发；不重写同步引擎 |
| DH-3 | 不走 `daemon.start()`，用嵌入式启动序列 | 上游 `start()` 安装 `process.exit` 崩溃钩子，会杀整个 App |
| DH-4 | 插件 `InProcessClient` | 直接 import `PiWebPlugin`；方法表同 `dist/main.js` |
| DH-5 | 设置 UI = pi-web 补丁 + `/api/sync-daemon` route | 与桌面一致；Electron 主进程与渲染层同源 HTTP，无需 preload 桥 |
| DH-6 | 配置 `<HOME>/.pi-desktop/sync-daemon.json` | 与桌面同构；沙箱 HOME 隔离 |
| DH-7 | 依赖装入 `pi-dist/node_modules` | 与 pi-web 同解析根；离线运行；`pluginInstall=false` |
| DH-8 | Node 22.17 兼容 | 低于 engines 22.19 的平台事实；不引入新 API，构建+代码复核，真机由交接方验证 |

## 3. 组件与数据流

```
pi-web 设置 ›「中枢服务」（补丁 SyncConfig.tsx）
   │ fetch GET/PUT /api/sync-daemon（同源）
   ▼
app/api/sync-daemon/route.ts（补丁；读 control.json → 代理）
   ▼
src-main/sync-runtime.js（主进程内；控制面 127.0.0.1 + Bearer）
   ├─ 配置读写（0600/原子）
   ├─ 嵌入式 Daemon 启动序列
   └─ InProcessPluginManager + InProcessClient（PiWebPlugin）
```

- `src-main/main.js`：`waitForReady` 后 `startSyncRuntime({ piDistRoot, serverUrl, agentDir, password })`（非阻塞）；
  `before-quit` 中 **先** `stopSyncRuntime()`，再关闭 Next server。
- route 标记 `pi-sync-daemon-route-v1`；prepare-next 构建期断言补丁生效（源码与产物）。

## 4. 文件与落点

| 文件 | 动作 |
|---|---|
| `src-main/sync-runtime.js` | **新增**（与 Ark/Android 同源实现） |
| `src-main/main.js` | **改**：启动/退出钩子；`require('./sync-runtime.js')` |
| `scripts/collect-pi.mjs` | **改**：pi-dist 内补齐 `@pi-agent-hub/*`（安装/复制）+ keep |
| `patches/v0.17.0/0004-sync-daemon-settings-tab.patch` | **新增** |
| `patches/README.md` | **改**：登记 P301-H1；补丁数 3→4 |
| `specs/301-sync-daemon/{spec,plan}.md` | **替换** |
| `docs/工程规划.md`、`README(_zh).md`、`specs/README.md` | **改**：口径/补丁数/能力 |

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| Node 22.17 低于上游 engines 22.19 | 不依赖 22.19+ API；构建+代码复核；交接方在 PC/平板真机复验；升级运行时时复核 |
| 同进程阻塞 | 上游串行化；异步控制面；观测主进程内存/事件循环 |
| `Daemon` 内部字段变化 | 固定 0.1.2；升级复核；补丁 README 记录 |
| 无全局崩溃钩子导致静默 | 运行时捕获并落状态/日志，不阻塞主流程 |
| 依赖被裁剪 | keep `@pi-agent-hub/**` + 装配后入口断言 |
| 服务绑局域网 IP | route 沿用 pi-web 鉴权（密码/Host/Origin）；令牌不出服务端 |

## 6. 验证

- 静态：补丁往返（4 条）、`node --check`、prepare-next/collect-pi 构建与标记断言。
- 构建：HAP 构建由本机 hvigor 完成；**无 HarmonyOS PC/平板真机**，不做设备测试。
- 真机（交接）：PC/平板安装 HAP → 设置配置 → hub 观察 → 禁用/恢复 → 退出清理。
