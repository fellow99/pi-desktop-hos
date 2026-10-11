# Pi Desktop（HarmonyOS 版）

> 基于「Electron-on-鸿蒙」运行时（[harmonypc-electron](https://atomgit.com/jianguoxu/harmonypc-electron)，
> Electron **37.2.3** / Node **22.17.0** / ABI **v138**）的 [Pi](https://pi.dev) 桌面封装 ——
> 在鸿蒙设备的 Electron 主进程内承载 **Pi Web**（`pi-web` 的 Next 服务器，含 agent 与 `/api/*`），
> 渲染层同源加载该服务端提供的 Pi Web UI，界面 100% 复用上游，不 fork 前端。

**版本**：`0.1.0`（规划阶段，未构建）· **上游基线**：`pi` **v1.1.0** + `pi-web` **v0.11.1**
· **应用名 / 包名**：`Pi Desktop` / `org.fellow99.pi.PiDesktop`

完整工程规划与最终实现记录见 **[docs/工程规划.md](docs/工程规划.md)**。

---

## 这是什么

`Pi` 是一个最小、可扩展的 agent harness：扩展、技能、提示模板、主题都可替换，官方提供
CLI / RPC / JSON / SDK 四种集成入口。`Pi Web` 是它的本地浏览器界面（Next.js 应用），
**一个 Node 进程同时提供 SPA 与 `/api/*`**，agent 在该进程内创建。

本工程把这一套封装进鸿蒙原生桌面壳（Electron-on-鸿蒙运行时），让它在鸿蒙 PC / 平板上
像一等公民桌面应用一样运行。它**不是**「包一层浏览器指向 localhost」的粗壳。

> **非官方声明**：本工程非 Pi / Pi Web 团队构建，与上游作者无隶属关系，未获其背书。
> `Pi` 与 `Pi Web` 均为 MIT 许可的上游开源项目，本工程仅是其桌面形态在 HarmonyOS 上的
> 第三方移植。

## 核心设计

```
┌─ 鸿蒙 HAP（pi-desktop-hos）──────────────────────────────────────────────┐
│  electron 模块（entry）：3 个原生 SO + libc++_shared.so + Ability 装配    │
│  web_engine 模块（HAR）：ArkTS 桥接层 + resfile 承载应用产物              │
│   ┌─ Electron 主进程（Node 22.17.0）─────────────────────────────────┐  │
│   │  main.js: 环境装配 → 解压 pi-dist → 进程内起 Next 服务器 → 建窗    │  │
│   │    ├─ Next 服务器 0.0.0.0:<随机端口>：SPA + /api/* + SSE          │  │
│   │    ├─ agent 会话（pi SDK，进程内）                                │  │
│   │    └─ 就绪后 loadURL(http://<局域网IP>:<port>/)                   │  │
│   └──────────────────────▲───────────────────────────────────────────┘  │
│                          │ 同源（无 CORS、无需 Host/Origin 头改写）       │
│   ┌──────────────────────┴───────────────────────────────────────────┐  │
│   │ 渲染进程：Electron BrowserWindow（Chromium）                       │  │
│   │   标准 Pi Web UI（fetch /api/* + SSE /api/agent/[id]/events）      │  │
│   └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

关键点：

- **服务端在主进程进程内**，不引入 Node 子进程 —— 同时规避「应用域子进程 JIT 被 seccomp 拦
  （`Signal 31`）」「子进程 exit 事件不可观测」「每次 spawn 泄漏一个僵尸」三个平台问题。
- **渲染层同源加载**：零 CORS、零自定义协议、零 preload 桥、零 IPC 载体。
- **不需要 Host/Origin 头改写**：pi-web 的请求信任围栏放行任意 IP 字面量，同源请求天然
  通过 Origin 校验（这一点比同型工程 `dsh-desktop-hos` 少一整套补丁）。
- **补丁集为 0 条必需**：插件机制「仅本地源」由上游三个现成机制覆盖（见
  [patches/README.md](patches/README.md)）。
- **上架合规的低成本项已前置**：不声明浏览器语义（`browsable` / `viewData`），
  所有外部网页统一走 ArkWeb 外链页。

## 目录结构

本工程与 4 个同级工程**并行存放**（`pi-workspace` 是 submodule 容器仓库）：

```
pi-workspace/
├── pi/                                 # [submodule] 上游宿主 + SDK，固定 Branch_v1.1.0
├── pi-web/                             # [submodule] 上游 UI + 服务端，固定 Branch_v0.11.1
├── harmonypc-electron/                 # [submodule] Electron-on-鸿蒙运行时（shell + manifest）
├── harmonypc-electron-versions/        # （普通目录，gitignore）v37 归档 + 原生模块材料
└── pi-desktop-hos/                     # [submodule] ← 本工程
```

本工程内部：

```
pi-desktop-hos/
├── AppScope/                    # 应用级配置（bundleName / 版本 / 图标 / label）
├── electron/                    # entry 模块（由 collect-runtime 投放；libs/ 不入库）
├── web_engine/                  # HAR 桥接层 + resfile 承载应用产物（由 collect-runtime 投放）
├── src-main/                    # Electron 主进程源码（main.js + tar-extract.js）
├── scripts/                     # 四阶段构建流水线 + host 侧门禁 + 签名构建脚本
├── runtime-overlays/            # 「copy 后回盖」白名单（保护本工程定制不被覆盖）
├── patches/                     # 上游补丁集（本版本为空，见该目录 README）
├── config/                      # 运行时预置模板（settings.json / mcp.json）
├── extensions/                  # 壳专用 pi 扩展
├── skills/                      # 壳专用 pi 技能
├── specs/                       # 模块规格（NNN-name/{spec.md,plan.md}）
└── docs/                        # 工程规划等文档
```

**为什么 `electron/` 与 `web_engine/` 由脚本生成**：它们来自同级 `harmonypc-electron` 的
运行时外壳（ArkTS 代码 + 原生 SO + Chromium 资源）。hvigor 只构建**物理存在**于
`build-profile.json5` 模块列表里的目录，且 HAR 的 `file:` 依赖**不带 `.so` 与 `resfile`**，
所以运行时必须由 `collect-runtime.mjs` 物理拷贝进来。本工程只提交**配置 + overlay 定制**，
不提交上游副本 —— 上游更新时重跑脚本即可，不会产生"我们改了上游文件但没人知道"的漂移。

## 构建

### 前置（一次性）

| 项 | 要求 |
|---|---|
| 工具链 | DevEco Studio 6.x + HarmonyOS SDK（API 17 起，targetSdk `6.1.1(24)`）+ hvigorw + ohpm |
| Node | ≥ 18（构建脚本）；host 侧门禁需要 **Node 22.17.0**（与 Electron 37 内置版本一致） |
| 同级工程 | `../pi`、`../pi-web`、`../harmonypc-electron`、`../harmonypc-electron-versions` |
| 运行时产物 | `harmonypc-electron-versions/v37.2.3-20260825.1-release.zip`（内为 `libelectron_138.tar.gz`） |
| 签名 | `signing.debug.local.json`（样例见 `signing.debug.local.json.sample`）；ACL 见下 |

### 四阶段流水线

```bash
# ① 收集运行时：v37 归档 → electron/ + web_engine/ + SO + Chromium 资源 + libc++_shared.so
#    含 prune（删除本应用不用的上游文件）与 overlay（回盖本工程定制）
node scripts/collect-runtime.mjs

# ② 构建 pi-web 生产产物：npm ci → next build → 裁剪平台特定原生件 → 轮换预览密钥
node scripts/prepare-next.mjs

# ②′ host 侧门禁：用 Node 22.17.0 跑服务端冒烟（必须全绿才允许上真机）
node scripts/smoke-node22.mjs

# ③ 组装 pi-dist（pi-web 产物 + @earendil-works/* + pi-agent 资源）+ tar.gz + SHA-256 marker
node scripts/collect-pi.mjs

# ④ 投放主进程与预置模板到 resfile
node scripts/collect-app.mjs

# ⑤ 构建 + 签名（详细参数见 scripts/build-hap.ps1 头部注释）
powershell -ExecutionPolicy Bypass -File scripts\build-debug.ps1     # debug 签名 HAP
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1   # release 签名 App Pack
```

### 安装与启动

```bash
hdc uninstall org.fellow99.pi.PiDesktop
hdc app install -r electron/build/default/outputs/default/electron-default-signed.hap
hdc shell aa start -a EntryAbility -b org.fellow99.pi.PiDesktop
```

> ⚠️ **发布签名的包无法侧载**（会报 `signature verification failed due to not trusted app source`）。
> 真机回归请用 `-BuildMode release -SignMode debug`；release 签名的包只用于 AppGallery 提交。

### 真机取证

```bash
hdc shell "hilog -x | grep pi-desktop"     # 应用日志（主进程与 ArkTS 层共用该 tag）
hdc shell aa dump -a                       # 观察 Ability 状态
hdc fport tcp:19229 tcp:9229               # CDP 调试（仅 debug 构建；生产必须移除 --inspect）
```

## 权限

**必须申请（ACL，受限权限）**：`ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY`
（`system_basic` / since API 14 / 仅平板 + 2in1 / **须经 AGC 申请 ACL**）—— 启用
Electron/V8 的 JIT，引擎必需，不可删除。

**开放权限**（写进 `requestPermissions` 即安装时授予）：`INTERNET`、`GET_NETWORK_INFO`、
`KEEP_BACKGROUND_RUNNING`、`READ_WRITE_DOCUMENTS_DIRECTORY`、`READ_WRITE_DOWNLOAD_DIRECTORY`、
`FILE_ACCESS_PERSIST`。

**本工程不需要**：二进制证书（AGC `certType: 4`，不随包分发自有 ELF）、
`ALLOW_EXTERNAL_NATIVE_CODE`、`READ_WRITE_DESKTOP_DIRECTORY`（`system_basic`，上架障碍）。

ACL 提交要点与上架前置清单见 [docs/工程规划.md](docs/工程规划.md) §11.4、§11.5。

## 能力边界（设备侧已知限制）

| 能力 | 状态 | 原因 |
|---|---|---|
| 主 UI（Pi Web） | ✅ | 进程内服务器 + Chromium 渲染 |
| 会话持久化 / 续接 | ✅ | JSONL 落沙箱 `pi-agent/sessions/` |
| 文件读写 / 编辑 / 列目录 | ✅ | 纯 Node.js |
| 命令执行（`bash` 工具） | ✅ | spawn 系统 `/system/bin/sh`（mksh R59），无 PTY |
| 文件查找 / 内容搜索（`find`/`grep` 工具） | ❌ | 需 `fd`/`rg` 外部二进制，设备没有且本构建禁止下载；改用 `bash` 里的 toybox 命令 |
| 终端面板 / PTY | ❌ | SELinux 拒绝 `forkpty`/`openpty`；`node-pty` 无 aarch64-ohos 产物 |
| `git` 集成 / worktree | ❌ | 设备无 `git` 二进制 |
| 插件联网安装 | ❌ | PL1「仅本地源」；设备无 npm/git |
| MCP stdio 服务器 | ⚠️ | 需 spawn 子进程；HTTP / streamable 类可用 |
| 子进程内跑 Node 脚本 | ❌ | seccomp 拒绝 JIT 可执行内存（`Signal 31`） |

详见 [skills/harmony-runtime-capabilities/SKILL.md](skills/harmony-runtime-capabilities/SKILL.md)
（面向模型的运行期摘要）与 [docs/工程规划.md](docs/工程规划.md) §9.3（完整降级表与根因分层）。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/工程规划.md](docs/工程规划.md) | **工程规划**：做什么、怎么做、按什么顺序做、有哪些风险 |
| [specs/README.md](specs/README.md) | 模块规格索引与文档规范 |
| [specs/001-host/](specs/001-host/) | Host 宿主（环境装配 / 进程内服务器 / 就绪判定） |
| [runtime-overlays/README.md](runtime-overlays/README.md) | 运行时定制清单与 prune/overlay 机制 |
| [patches/README.md](patches/README.md) | 为什么本版本补丁集为空 |
| [config/README.md](config/README.md) | 运行时预置配置的每个键为什么这样设 |
| [extensions/README.md](extensions/README.md) | 壳专用扩展机制与编写约定 |
| [skills/README.md](skills/README.md) | 壳专用技能格式与维护纪律 |

## 相关工程

- [harmonypc-electron](https://atomgit.com/jianguoxu/harmonypc-electron)（同级 `../harmonypc-electron`）—— Electron-on-鸿蒙运行时
- [pi](https://github.com/earendil-works/pi)（同级 `../pi`）—— 被封装宿主
- [pi-web](https://github.com/agegr/pi-web)（同级 `../pi-web`）—— 被复用 UI 与服务端

## 许可证

MIT
