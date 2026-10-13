[English](./README.md) | 中文

---

# Pi Desktop（HarmonyOS 版）

> 基于「Electron-on-鸿蒙」运行时（[harmonypc-electron](https://atomgit.com/jianguoxu/harmonypc-electron)，
> Electron **37.2.3** / Node **22.17.0** / ABI **v138**）的 [Pi](https://pi.dev) 桌面封装 ——
> 在鸿蒙设备的 Electron 主进程内承载 **Pi Web**（`pi-web` 的 Next 服务器，含 agent 与 `/api/*`），
> 渲染层同源加载该服务端提供的 Pi Web UI，界面 100% 复用上游，不 fork 前端。

**版本**：`0.11.1` / `versionCode` `1101`（**已构建、已真机签名部署验证**，见 [docs/真机验证记录.md](docs/真机验证记录.md)）
· **上游基线**：`pi` **v1.1.0**（`Branch_v1.1.0`）+ `pi-web` **v0.11.1**（`Branch_v0.11.1`）
· **运行时**：Electron **37.2.3**（Node **22.17.0** / ABI **v138**；HarmonyOS 侧经 `harmonypc-electron` 运行时）
· **应用名 / 包名**：`Pi Desktop` / `org.fellow99.pi.PiDesktop`

完整工程规划与交付记录见 **[docs/工程规划.md](docs/工程规划.md)**；设备侧能力结论的**权威文档**是
**[docs/鸿蒙环境能力清单-v0.11.1.md](docs/鸿蒙环境能力清单-v0.11.1.md)**（含修订节 **REV-1** / **REV-2**，
冲突处以修订节为准）。

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

## 已交付的需求

需求按 `specs/NNN-<name>/` 组织，成对交付 `spec.md`（需求与验收）+ `plan.md`（方案），
复杂需求另附 `tasks.md` + `test-cases.md`。

| 需求 | 规格目录 | 交付内容 | 真机轮次 |
|---|---|---|---|
| `001-host` | [specs/001-host/](specs/001-host/) | Host 宿主：环境装配、进程内 Next 服务器、HTTP 轮询就绪判定、随机密码与凭据注入 | 轮次 1 |
| `101-version-0.11.1` | [specs/101-version-0.11.1/](specs/101-version-0.11.1/) | 版本收敛到 `0.11.1` / `1101`；清理中间物后全流水线重建与字节级可复现性；产出环境能力清单 | 轮次 2、2b |
| `102-harmony-js-tools` | [specs/102-harmony-js-tools/](specs/102-harmony-js-tools/) | 用随包**纯 JS 扩展**同名顶替 `bash` / `find` / `grep`；**上游与补丁集零改动** | 轮次 3、3b、3c |
| `103-branding` | [specs/103-branding/](specs/103-branding/) | 界面品牌改 `Pi Desktop`、Logo/图标改用父工程物料、禁用新版本检测（上游零改动） | 轮次 4 |

> `specs/README.md` 的 **§十** 给出上表的文档状态与四件套清单。

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

- **服务端在主进程进程内**，不引入 Node 子进程 —— 同时规避「应用域子进程 JIT 被 seccomp 拦」
  「子进程 `exit`/`close` 事件不可观测」「每次 spawn 泄漏一个僵尸」三个平台问题。
- **渲染层同源加载**：零 CORS、零自定义协议、零 preload 桥、零 IPC 载体。
- **不需要 Host/Origin 头改写**：pi-web 的请求信任围栏放行任意 IP 字面量，同源请求天然
  通过 Origin 校验（这一点比同型工程 `dsh-desktop-hos` 少一整套补丁）。
- **命令执行与文件搜索由随包纯 JS 扩展同名顶替内建工具**（需求 102）：`bash` 走常驻
  `/system/bin/sh` + 随机哨兵行，结束判定**只看 stdout**、不等永不送达的进程事件；
  `find` / `grep` 走纯 JS 目录遍历，**零 `fd`/`rg`、零子进程**。对模型与 pi-web preset 完全透明。
- **补丁集为 0 条必需**：已登记的 8 条候选全部由上游现成机制或壳扩展覆盖（见
  [patches/README.md](patches/README.md)）。
- **品牌化在上游产物副本上完成**（需求 103）：界面文案、Logo 与全部图标位改用父工程物料，
  并禁用首页的新版本检测；`pi` / `pi-web` / `harmonypc-electron` **零改动**。
- **上架合规的低成本项已前置**：不声明浏览器语义（`browsable` / `viewData`），
  所有外部网页统一走 ArkWeb 外链页。

## 目录结构

本工程与同级工程**并行存放**（`pi-workspace` 是 submodule 容器仓库）：

```
pi-workspace/
├── pi/                                 # [submodule] 上游宿主 + SDK，固定 Branch_v1.1.0
├── pi-web/                             # [submodule] 上游 UI + 服务端，固定 Branch_v0.11.1
├── harmonypc-electron/                 # [submodule] Electron-on-鸿蒙运行时（shell + manifest）
├── harmonypc-electron-versions/        # （普通目录，gitignore）v37 归档 + 原生模块材料
├── assets/                             # 父工程品牌物料（logo-1024-with-bg.png / logo.png / logo.svg）
└── pi-desktop-hos/                     # [submodule] ← 本工程
```

本工程内部：

```
pi-desktop-hos/
├── AppScope/                    # 应用级配置（bundleName / 版本 / 图标 / label）
├── electron/                    # entry 模块（由 collect-runtime 投放；libs/ 不入库）
├── web_engine/                  # HAR 桥接层 + resfile 承载应用产物（由 collect-runtime 投放）
├── src-main/                    # Electron 主进程源码（main.js + tar-extract.js）
├── scripts/                     # 五阶段构建流水线 + host 侧门禁 + 品牌化 + 签名构建脚本
├── runtime-overlays/            # 「copy 后回盖」白名单（保护本工程定制不被覆盖）
├── patches/                     # 上游补丁集（本版本为空，见该目录 README）
├── config/                      # 运行时预置模板（settings.json / mcp.json）
├── extensions/                  # 壳专用 pi 扩展（bash / find / grep 的纯 JS 实现）
├── skills/                      # 壳专用 pi 技能
├── specs/                       # 模块与版本需求规格（NNN-name/{spec,plan,tasks,test-cases}）
└── docs/                        # 工程规划、能力清单、真机验证记录等文档
```

**为什么 `electron/` 与 `web_engine/` 由脚本生成**：它们来自同级 `harmonypc-electron` 的
运行时外壳（ArkTS 代码 + 原生 SO + Chromium 资源）。hvigor 只构建**物理存在**于
`build-profile.json5` 模块列表里的目录，且 HAR 的 `file:` 依赖**不带 `.so` 与 `resfile`**，
所以运行时必须由 `collect-runtime.mjs` 物理拷贝进来。本工程只提交**配置 + overlay 定制**，
上游副本由脚本重新收集 —— 上游更新时重跑脚本即可，不会产生「我们改了上游文件但没人知道」的漂移。
（`resfile` 投放物当前**入库**，与上一版 README 的表述不一致，见风险 R17。）

## 构建

### 前置（一次性）

| 项 | 要求 |
|---|---|
| 工具链 | DevEco Studio 6.x + HarmonyOS SDK（API 17 起，targetSdk `6.1.1(24)`）+ hvigorw + ohpm |
| Node | ≥ 18（构建脚本）；host 侧门禁需要 **Node 22.17.0**（与 Electron 37 内置版本一致） |
| 同级工程 | `../pi`、`../pi-web`、`../harmonypc-electron`、`../harmonypc-electron-versions` |
| 运行时产物 | `harmonypc-electron-versions/v37.2.3-20260825.1-release.zip`（内为 `libelectron_138.tar.gz`） |
| 品牌物料（需求 103） | **父工程** `../assets/`：`logo-1024-with-bg.png`（1024²，不透明）、`logo.png`（200²，含 alpha）、`logo.svg`（矢量）；可用 `--assets` / `PI_ASSETS_DIR` 覆盖 |
| 图标生成工具 | **`ffmpeg`** 必须在 PATH（`scripts/brand-assets.mjs` 用它生成全部图标；缺失即构建失败） |
| 签名 | `signing.debug.local.json`（样例见 `signing.debug.local.json.sample`）；ACL 见下 |

### 五阶段流水线

```bash
# ① 收集运行时：v37 归档 → electron/ + web_engine/ + SO + Chromium 资源 + libc++_shared.so
#    含 prune（删除本应用不用的上游文件）、overlay（回盖本工程定制）
#    与阶段 0.5 品牌化（父工程 assets/ → AppScope 图标 + overlay 状态栏字形）
node scripts/collect-runtime.mjs

# ② 构建 pi-web 生产产物：npm ci → next build → 裁剪平台特定原生件 → 轮换预览密钥
node scripts/prepare-next.mjs --node <node22路径>

# ②′ host 侧门禁：用 Node 22.17.0 跑服务端冒烟（必须全绿才允许上真机）
node scripts/smoke-node22.mjs

# ③ 组装 pi-dist（pi-web 产物 + @earendil-works/* + pi-agent 资源）+ 步骤 2.5 品牌化
#    （pi-dist 副本内 `Pi Web` → `Pi Desktop`、web 图标/favicon 换物料、并做后置断言）
#    + tar.gz + SHA-256 marker
node scripts/collect-pi.mjs

# ④ 投放主进程与预置模板到 resfile
node scripts/collect-app.mjs

# ⑤ 构建 + 签名（详细参数见 scripts/build-hap.ps1 头部注释）
powershell -ExecutionPolicy Bypass -File scripts\build-debug.ps1     # debug 签名 HAP
powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1   # release 签名 App Pack
```

> 品牌化只作用于**本工程自己的产物**（`AppScope/`、overlay 源、`pi-dist/` 副本），
> 上游 `../pi`、`../pi-web`、`../harmonypc-electron` **零改动**（`patches/` 仍为空）。
> 单独重刷品牌物料（改了 `../assets/` 之后）：`node scripts/brand-assets.mjs`；
> 物料缺失即**硬失败**，不静默降级。详见 `specs/103-branding/`、`docs/media-placeholder-icons.md`。

宿主侧回归测试（零设备运行，覆盖纯 JS 的搜索扩展）：`node scripts/test-harmony-tools.mjs`。

### 安装与启动

```bash
hdc uninstall org.fellow99.pi.PiDesktop
hdc app install -r electron/build/default/outputs/default/electron-default-signed.hap
hdc shell aa start -a EntryAbility -b org.fellow99.pi.PiDesktop
```

> ⚠️ **发布签名的包无法侧载**（会报 `signature verification failed due to not trusted app source`）。
> 真机回归请用 `-BuildMode release -SignMode debug`；release 签名的包只用于 AppGallery 提交。
> 部署前**必须确认屏幕已解锁**（锁屏会硬阻断 `aa start`）。

### 真机取证

```bash
hdc shell "hilog -x | grep pi-desktop"     # 应用日志（主进程与 ArkTS 层共用该 tag）
hdc shell aa dump -a                       # 观察 Ability 状态
hdc fport tcp:19229 tcp:9229               # CDP 调试（仅 debug 构建；生产必须移除 --inspect）
```

> ⚠️ `hdc` 偶发 `need connect-key`，且在 Git-Bash 下会改写设备侧 POSIX 路径参数
> （需 `MSYS_NO_PATHCONV=1`）；`fport` 映射的生命周期不稳定，建转发与消费应尽量在同一次调用内完成。

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

> 下表是 [docs/鸿蒙环境能力清单-v0.11.1.md](docs/鸿蒙环境能力清单-v0.11.1.md) 的**结论摘要**；
> 该文件是设备侧能力的**唯一权威**（§A–§D 为需求 101 的实测原状，**REV-1 / REV-2** 为后续修订，
> 冲突处以修订节为准）。

| 能力 | 状态 | 原因 |
|---|---|---|
| 主 UI（Pi Desktop Web） | ✅ | 进程内服务器 + Chromium 渲染 |
| 会话持久化 / 续接 | ✅ | JSONL 落沙箱 `pi-agent/sessions/` |
| 文件读写 / 编辑 / 列目录 | ✅ | 纯 Node.js |
| 命令执行（`bash` 工具） | ✅ | 由 `extensions/harmony-exec.js` **同名顶替**：常驻非 PTY `/system/bin/sh`（mksh R59）+ 随机哨兵行，结束判定只看 stdout、**不等** `exit`/`close` |
| 文件查找 / 内容搜索（`find` / `grep` 工具） | ✅ | 由 `extensions/harmony-search.js` **同名顶替**：纯 JS 遍历，**零 `fd`/`rg`、零子进程**；`rg`/`fd` 仍不存在，但不再需要 |
| 终端面板 / PTY | ❌ | `node-pty` 随包只有 `darwin-arm64`/`win32-arm64` 预编译产物（**L2 已证**）；内核是否也拒绝**未证伪** |
| `git` 集成 / worktree | ❌ | 设备无 `git` 二进制，也无法安装 |
| 插件联网安装 | ❌ | PL1「仅本地源」+ `PI_OFFLINE=1`；设备无 npm/git |
| MCP stdio 服务器 | ⚠️ | 阻塞根因（子进程结束事件不送达）已随 `bash` 顶替解除，通道级验证通过；**未接真实 MCP 服务器**（`config/mcp.json` 为空） |
| 子进程内跑 Node 脚本 | ❌ | `node -e` 无 stdout/stderr 且进程变僵尸；**终止原因未取得** |
| 用户目录（Desktop/Documents/Download）读写 | ❌ | OS 授权门；需在 *设置 → 应用 → 允许访问* 授权并**重启应用**，应用内审批不改变这一点 |
| 符号链接（`symlink`） | ❌ | 应用域与 shell 域**都**拒绝（`EACCES` / `Permission denied`） |
| 开机自启 / 后台常驻 | ❌ / ⚠️ | 只有只读接口、无公开 setter；2in1 下最小化不产生真实后台态 |
| 命令的文件围栏 | ⚠️ | `bash` 子进程以应用身份（uid `20020215`）运行，**绕过 pi 的文件审批流**；缓解手段仅为技能层约束 |

详见 [skills/harmony-runtime-capabilities/SKILL.md](skills/harmony-runtime-capabilities/SKILL.md)
（面向模型的运行期摘要）与 [docs/工程规划.md](docs/工程规划.md) §9.3（降级表）、§11（风险与开放问题）。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/工程规划.md](docs/工程规划.md) | **工程规划（source of truth）**：做什么、怎么做、按什么顺序做、有哪些风险 |
| [docs/鸿蒙环境能力清单-v0.11.1.md](docs/鸿蒙环境能力清单-v0.11.1.md) | 设备侧能力结论的**权威文档**（能力 × 状态 × 根因层 L1–L4 + 证据 + REV-1/REV-2） |
| [docs/真机验证记录.md](docs/真机验证记录.md) | 逐轮真机验证的环境、步骤、结论（轮次 0–4） |
| [docs/media-placeholder-icons.md](docs/media-placeholder-icons.md) | 图标物料与生成规则（需求 103） |
| [specs/README.md](specs/README.md) | 规格索引、文档规范与版本需求（101+）清单 |
| [specs/001-host/](specs/001-host/) | Host 宿主（环境装配 / 进程内服务器 / 就绪判定） |
| [specs/101-version-0.11.1/](specs/101-version-0.11.1/) | 版本收敛 0.11.1（spec / plan / tasks / test-cases） |
| [specs/102-harmony-js-tools/](specs/102-harmony-js-tools/) | 纯 JS 工具扩展：`bash` / `find` / `grep` 同名顶替 |
| [specs/103-branding/](specs/103-branding/) | 品牌化：文案 / Logo / 图标物料 / 禁用版本检测 |
| [runtime-overlays/README.md](runtime-overlays/README.md) | 运行时定制清单与 prune/overlay 机制（23 个文件） |
| [patches/README.md](patches/README.md) | 为什么本版本补丁集为空（8 条候选逐条源码核实） |
| [config/README.md](config/README.md) | 运行时预置配置的每个键为什么这样设 |
| [extensions/README.md](extensions/README.md) | 壳专用扩展机制、编写约定与同名顶替说明 |
| [skills/README.md](skills/README.md) | 壳专用技能格式与维护纪律 |

## 相关工程

- [harmonypc-electron](https://atomgit.com/jianguoxu/harmonypc-electron)（同级 `../harmonypc-electron`）—— Electron-on-鸿蒙运行时
- [pi](https://github.com/earendil-works/pi)（同级 `../pi`）—— 被封装宿主
- [pi-web](https://github.com/agegr/pi-web)（同级 `../pi-web`）—— 被复用 UI 与服务端

## 许可证

MIT
