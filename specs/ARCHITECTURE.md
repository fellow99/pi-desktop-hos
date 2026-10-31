# ARCHITECTURE.md — pi-desktop-hos 整体架构

> 本工程是 **Pi Desktop · Electron on HarmonyOS 版**：用 Electron-on-鸿蒙运行时承载
> `pi-web` 的 Next 服务（含 agent 与 `/api/*`），渲染层同源加载 Pi Web UI，打包为签名 HAP。

---

## 1. 进程模型

```
┌─ HarmonyOS 应用进程 ─────────────────────────────────────────────┐
│  EntryAbility（ArkTS）                                           │
│    → 启动 Electron-on-鸿蒙运行时（electron 模块）                 │
│    → Electron 主进程（Node 22.17.0）                             │
│         → src-main/main.js：环境装配 / 鉴权 / 窗口 / 能力桥       │
│         → 进程内 require Next（pi-web）                          │
│    → web_engine HAR：ArkUI 承载窗口 + ArkWeb 外链页               │
│    → Renderer：Chromium（包内）同源加载 http://<host>:<port>/     │
└──────────────────────────────────────────────────────────────────┘
```

- **无子进程 Node**；宿主崩溃 = 应用崩溃。
- **单实例**：EntryAbility 单实例；端口随机。
- **鉴权**：局域网绑定 + 随机密码 + HMAC 会话 Cookie（Electron 渲染进程 loopback 隔离）。

---

## 2. 分层

| 层 | 职责 | 落点 |
|---|---|---|
| 渲染层 | Pi Web UI | Chromium（包内） |
| 壳层 | EntryAbility、窗口、外链中转、能力桥 | `electron/`、`web_engine/`、`src-main/main.js` |
| 数据面 | SPA + `/api/*` + SSE + agent | 上游 `pi-web`（进程内） |
| 工具/扩展 | bash/find/grep/git 顶替、runtime skill | `extensions/` |
| 运行时 | Electron 37.2.3 / Node 22.17.0 / Chromium 138 | `harmonypc-electron` |
| 系统 | 文件、网络、通知、权限、浏览器 | HarmonyOS |

---

## 3. 启动时序

```
EntryAbility.onCreate
  → 沙箱环境装配（HOME / TMPDIR / PI_OFFLINE / 证书 / NO_PROXY）
  → 定位/解压 pi-dist（SHA-256 marker 幂等）
  → 复制 config/ extensions/ skills/
  → 进程内 require Next，随机端口监听
  → 轮询 /api/web-auth 就绪
  → 创建 BrowserWindow（loading 页 → 同源加载）
  → 注入 Basic + Cookie
  → 首屏渲染
```

失败：阶段文本 + 错误页 + 日志；不静默退出。

---

## 4. 数据流

```
用户输入 → POST /api/agent/<id> → pi agent → 模型 SSE → UI 增量渲染
                              → 会话 JSONL（userData/pi-agent/sessions）
                              → 工具（read/write/edit/ls/find/grep/bash/git）
```

- 数据面不过 IPC；preload 桥只承载壳层动作。
- 文件根：沙箱 + 文档/下载/桌面（需授权）；`PI_HOS_ROOTS` 注入。
- 工作区选择器：补丁 0001 + ArkTS 桥。

---

## 5. 载荷与补丁

- 载荷：`collect-pi` 组装 `pi-dist.tar.gz` + marker；`collect-app` 投放到 `resfile`。
- 补丁：`patches/v0.12.1/` 两条（选择器 roots、会话导出回退）。
- 扩展：`extensions/` 同名顶替 `bash`/`find`/`grep`，Git 扩展纯 JS。
- 品牌：`013-branding`（pi-dist 文案/图标 + AppScope 图标 + overlay 字形）。

---

## 6. 关键决策

| # | 决策 | 理由 | 代价 |
|---|---|---|---|
| A1 | 保留 Electron 运行时 | 桌面 API/Chromium 一致 | 包体大、Node 22.17 落后 |
| A2 | 进程内 Next | 无子进程、就绪确定 | 宿主崩溃 = 应用崩溃 |
| A3 | 局域网绑定 + 密码 | Electron 渲染进程 loopback 隔离 | 需要 Basic/Cookie 注入 |
| A4 | 纯 JS 工具顶替 | 无系统 git/fd/rg | 性能/功能受限 |
| A5 | 外链中转页 | 规避 SIGSEGV | 多一步交互 |
| A6 | 零上游改动 | 可升级 | 补丁需幂等可逆 |

---

## 7. 责任边界

| 责任 | 本工程 | 父工程 | 上游/运行时 |
|---|---|---|---|
| 壳/窗口/鉴权/能力桥 | ✅ | — | — |
| 整体规划/公共需求 | 引用 | ✅ | — |
| pi-web / agent | 载荷 | — | ✅ |
| 运行时 | 集成 | — | ✅ `harmonypc-electron` |
| 品牌物料 | 使用 | ✅ `assets/` | — |
