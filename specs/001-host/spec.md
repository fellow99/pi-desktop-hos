# 001 — Host 宿主（host）功能规格

> **Module:** host ｜ **Status:** Proposed ｜ **Last Updated:** 2026-10-11
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）
> **实现落点:** `src-main/main.js`（构建期由 `scripts/collect-app.mjs` 投放到
> `web_engine/src/main/resources/resfile/resources/app/`）
> **规划依据:** `docs/工程规划.md` §4.2、§4.4、§4.5、§4.6、§4.9、§8.1、§11.1 R2/R3

## 1. 目的

Host 宿主的职责是：**在 Electron 主进程（Node 22.17.0）内把 pi-web 的 Next 服务器拉起来
并交给渲染层一个可访问的 URL**，同时把 pi 的数据与配置钉在应用沙箱内。

它是本工程的核心模块：整个应用能否可用，取决于这一步能否在鸿蒙上成立。

## 2. 范围

**In scope**

- 启动前的环境装配（沙箱目录、数据目录、临时目录、离线旗标、代理例外）。
- 端口分配与服务器启动（**进程内**，不引入子进程）。
- 预览密钥轮换（复用上游脚本，必须在注册路由前执行）。
- 访问凭据（随机强密码）的生成与注入。
- 就绪判定（HTTP 轮询）。
- 启动失败时的 fail-visible 诊断。

**Out of scope**

- 窗口创建与页面加载 → 002-window。
- 产物解压与壳预置内容物化 → 004-artifact-bootstrap。
- 关闭与崩溃兜底 → 003-lifecycle。
- 服务器自身的业务行为（路由、SSE、agent 会话）→ 上游 pi-web，本工程不实现、不 fork。

## 3. 上游事实（本规格的前提，已源码核实）

| # | 事实 | 出处 |
|---|---|---|
| U1 | pi-web 的一个 Node 进程**同时**提供 SPA 与 `/api/*`；agent 在**进程内**创建（不 spawn `pi` 二进制）。 | `pi-web/lib/rpc-manager.ts`、`pi-web/next.config.ts` 的 `serverExternalPackages` |
| U2 | 事件下行是 **SSE**，不是 WebSocket。 | `pi-web/app/api/agent/[id]/events/route.ts` |
| U3 | `bin/pi-web.js` 的核心工作量是：解析参数 → `rotatePreviewSecrets(.next)` → `spawn(next start)` → 等 stdout 出现 `Ready`。 | `pi-web/bin/pi-web.js` |
| U4 | 自带的 Node 版本门禁（`>=22.19.0`）位于 `bin/node-version.js`，**只作用于 `bin/pi-web.js`**。 | `pi-web/bin/node-version.js`、`pi-web/bin/pi-web.js` |
| U5 | 请求信任围栏只检查 Host 是否为 IP 字面量 / 本机名；**任意 IP 字面量放行**，同源请求天然通过 Origin 校验。 | `pi-web/lib/request-security.ts#isApiRequestHostAllowed`、`isApiRequestOriginAllowed` |
| U6 | pi 的数据根可用 `PI_CODING_AGENT_DIR` 重定向。 | `pi/packages/coding-agent/docs/configuration.md`、`pi-web/README.md` |
| U7 | `PI_OFFLINE` 一旦为真值，包管理器的 `installMissing()` 首行短路，且 `fd`/`rg` 的自动下载退化为一条 warning。 | `pi/packages/coding-agent/src/core/package-manager.ts`、`src/utils/tools-manager.ts` |
| U8 | Next 的 CLI 入口（`next/dist/bin/next`）会 `process.exit()` 并注册信号处理，**不能**在 Electron 主进程内直接使用。 | ⬜ 待验证（Phase 0 的 P0-1 探针） |

> **U8 是本规格唯一的结构性未知。** 详见 §6。

## 4. 功能需求

动作词：**MUST** 必须满足；**MUST NOT** 禁止；**SHOULD** 建议；**MAY** 可选。

### 4.1 环境装配

| 编号 | 需求 |
|---|---|
| FR-host-001 | 在**任何** pi / pi-web 模块被导入**之前**，MUST 完成环境变量的装配。 |
| FR-host-002 | `HOME` 与 `USERPROFILE` MUST 指向 `app.getPath('userData')`。（依据：真机 `homedir()` 返回沙箱外的 `/storage/Users/currentUser`，应用对其无权限。） |
| FR-host-003 | `PI_CODING_AGENT_DIR` MUST 指向 `<userData>/pi-agent`。 |
| FR-host-004 | `TMPDIR` MUST 指向 `<userData>/tmp`，且 MUST 同时 monkey-patch `os.tmpdir()` 返回同一路径。（依据：真机上仅设环境变量对 Node 无效。） |
| FR-host-005 | `PI_OFFLINE` MUST 置为 `1`。（PL1 插件机制与 fd/rg 下载禁令的落地，见 201-plugin-runtime。） |
| FR-host-006 | `NO_PROXY` 与 `no_proxy` MUST 同时包含 `127.0.0.1`、`localhost` 与本机局域网 IP。 |
| FR-host-007 | 上述目录 MUST 在启动服务器前创建完毕，否则 MUST 以可读错误失败（不得让服务器在缺目录的状态下启动）。 |

### 4.2 服务器启动

| 编号 | 需求 |
|---|---|
| FR-host-010 | 服务器 MUST 在 **Electron 主进程内**启动。**MUST NOT** 默认 spawn 一个 Node 子进程。（依据：应用域子进程 JIT 被 seccomp 拦 → `Signal 31`；子进程 exit 事件不可观测；每次 spawn 泄漏一个僵尸。三者均为真机实测结论。） |
| FR-host-011 | 监听地址 MUST 为 `0.0.0.0`，端口 MUST 为运行时选定的空闲高位端口。**MUST NOT** 绑定 `127.0.0.1`。（依据：鸿蒙进程间 loopback 隔离。） |
| FR-host-012 | 启动服务器**之前** MUST 执行预览密钥轮换（复用 pi-web 自带的轮换实现，不得自行重写算法）。 |
| FR-host-013 | `PI_WEB_HOSTNAME` MUST 在服务器开始处理请求**之前**设置为本机局域网 IP。 |
| FR-host-014 | 服务器 MUST NOT 因为启动过程而终止宿主进程（即不得让 Next 的 `process.exit()` 生效）。若上游入口无法避免，MUST 明确登记该限制并采用 §6 的候选 B。 |
| FR-host-015 | 就绪判定 MUST 用 **HTTP 轮询**。**MUST NOT** 依赖子进程 stdout 的 `Ready` 字样。 |
| FR-host-016 | 就绪轮询 MUST 有超时上限（默认 30 s）并在超时后以 fail-visible 方式失败。 |

### 4.3 访问控制

| 编号 | 需求 |
|---|---|
| FR-host-020 | 服务器 MUST 设置 `PI_WEB_PASSWORD` 为一个高熵随机值（≥32 字符）。 |
| FR-host-021 | 该密码 MAY 被环境变量 `PI_DESKTOP_PASSWORD` 覆盖（用于本地调试）。 |
| FR-host-022 | 内核 MUST 向渲染层自动注入 Basic 凭据，使用户无需手工登录。凭据 MUST NOT 出现在任何日志、窗口标题或 loading 页文本中。 |
| FR-host-023 | 密码 MUST NOT 被写盘（不写 `settings.json`、不写 marker 文件）。 |

### 4.4 可观测性与诊断

| 编号 | 需求 |
|---|---|
| FR-host-030 | 每个启动阶段 MUST 有可读的日志输出，统一前缀 `[pi-desktop]`。 |
| FR-host-031 | 启动失败时 MUST 把具体阶段名与原因写入窗口标题**并**呈现于 loading 页。**MUST NOT** 出现「空白窗口且无任何说明」。 |
| FR-host-032 | 失败原因 MUST 同时挂到全局诊断槽（`globalThis.__hostError` / `__extractError` / `__renderError`），以便经 CDP 探针取证。 |
| FR-host-033 | 日志 MUST NOT 输出密码、API Key、会话内容。 |

### 4.5 生命周期

| 编号 | 需求 |
|---|---|
| FR-host-040 | 应用退出前 MUST 关闭服务器并释放端口。 |
| FR-host-041 | 服务器对象 MUST 暴露一个幂等的关闭入口（重复调用不得抛错）。 |

## 5. 验收场景

| # | 场景 | 判据 |
|---|---|---|
| A1 | 冷启动 | 应用启动后进入主界面，`GET /` 返回 SPA，主界面可交互 |
| A2 | 环境正确性 | 会话文件落在 `<userData>/pi-agent/sessions/`；`os.tmpdir()` 返回 `<userData>/tmp` |
| A3 | 网络形态 | 服务器监听 `0.0.0.0:<port>`；渲染层经局域网 IP 成功加载（无 CORS / 无手工登录） |
| A4 | 鉴权 | 不带凭据访问该端口返回 401/403；带 Basic 凭据返回 200 |
| A5 | 就绪判定 | 服务器不可用时，30 s 内进入 fail-visible 状态（标题 + loading 页都有说明） |
| A6 | 无子进程 | 进程列表中该应用只有 Electron 主进程与渲染进程，无额外的 Node 子进程（默认路径） |
| A7 | 关闭 | 退出应用后端口释放（重新启动能再次成功绑定） |
| A8 | 日志纪律 | 全部日志含 `[pi-desktop]` 前缀；密码不出现在日志与标题中 |

## 6. 待验证与决策点（⬜）

| # | 问题 | 验证方式 | 决策时限 | 出口判据 |
|---|---|---|---|---|
| O1 | Next 16.3.8 是否有**非 CLI** 的服务器入口（可直接在进程内调用并掌控生命周期）？ | Phase 0 的 P0-1 探针：读取 `.next` 的 server 入口、尝试两种调用方式，观察宿主是否存活 | **Phase 0** | 候选 A 可用即定案；否则退候选 B 并登记风险 |
| O2 | Node 22.17.0 是否足以运行 pi 1.1.0 + Next 16.3.8？ | `scripts/smoke-node22.mjs`（host 侧门禁） | **Phase 0** | 全绿才允许上真机；失败触发工程规划 §11.1 R2 |
| O3 | 局域网 IP 的可靠获取方式（设备可能多网卡/无网卡） | P0-3 探针；回退 `127.0.0.1` 并记录 | Phase 0 | 取得非 internal 的 IPv4 |

**候选 A / B 的取舍**（工程规划 §4.2）：

- **候选 A（优选）**：调用 Next 的服务器入口，自行提供 `hostname` / `port` / `dir`，把
  生命周期握在自己手里 —— 满足 FR-host-010 与 FR-host-014，且天然满足 FR-host-015
  （我们本来就自己轮询）。
- **候选 B（兜底）**：`spawn(process.execPath, [nextBin, 'start', …], { env: { ELECTRON_RUN_AS_NODE: '1' } })`。
  这会**违反 FR-host-010 的默认路径**，因此采用候选 B 必须：① 在本规格追加一条新的 FR
  记录该决定；② 在工程规划 §11.1 更新 R3；③ 把就绪判定与僵尸清理按 003-lifecycle 的
  相应要求补齐。

## 7. 与其他模块的接口

| 上游 | 交接内容 |
|---|---|
| 004-artifact-bootstrap | 提供「产物已就位」的前提（`pi-dist.tar.gz` 已解压、壳预置内容已物化） |
| 003-lifecycle | 提供环境装配与 fail-visible 诊断落点 |

| 下游 | 交接内容 |
|---|---|
| 002-window | 提供 `{ port, url, password, close }`；002 据此建窗、加载 URL、注入凭据 |
| 003-lifecycle | 提供 `close()` 供退出钩子调用 |

## 8. 参考

- `docs/工程规划.md` §4.2（宿主形态）、§4.4（运行时选型与 Node 错位）、§4.5（网络与安全）、
  §4.6（沙箱映射）、§4.9（启动时序）、§8.1（流水线阶段 ②′）、§11.1 R2/R3
- `pi-web/bin/pi-web.js`、`pi-web/bin/rotate-preview-secrets.js`、`pi-web/lib/request-security.ts`
- `dsh-desktop-hos/specs/001-host/{spec.md,plan.md}`（同型工程的对照实现，形态不同但问题域相同）
