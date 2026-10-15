# patches/ — 上游补丁集

> **现状（2026-10-15）**：**2 条**补丁 —— `patches/v0.11.1/0001-workspace-picker-roots.patch`（编号 `P203-1`）与 `patches/v0.11.1/0002-session-export-in-process-fallback.patch`（编号 `PFIX-1`）。
> 本文件 §1 起的历史结论（「本版本为空」）保留可追溯；补丁登记见 §0。

## 0. 已登记补丁

### P203-1 — 四主目录「选择工作区目录」对话框

| 项 | 内容 |
|---|---|
| 文件 | `patches/v0.11.1/0001-workspace-picker-roots.patch` |
| 全局编号 | `P203-1`（只增不改、不复用） |
| 被 patch 的上游 | `pi-web` tag `v0.11.1`（`e783721`） |
| 触及文件（7） | `lib/directory-browser.ts`（只增 + `getBrowseStartDirectory` 缺省起点）、`app/api/cwd/browse/route.ts`、`app/api/cwd/workspace-permission/route.ts`（新增）、`components/DirectoryPicker.tsx`、`lib/i18n/messages/{zh-CN,en,zh-TW}.ts`（入口文案「自定义路径…」→「选择工作区目录…」） |
| **触发条件** | pi-web **没有** UI 插槽 / 客户端面插件机制：pi 扩展的 `ctx.ui` 只有 `select`/`confirm`/`input`/`editor` 四种对话框，`custom()` 在 RPC 模式返回 `undefined`（`pi/packages/coding-agent/docs/rpc-extension-ui.md`）。因此「四个主目录 Tab」这一对话框改造**无法**用插件机制实现，也没有任何上游现成机制可替代（对比：PL1 安装闸门有 `PI_OFFLINE` 等三点可选）。 |
| **实施时机** | 需求 `203-plugin-workspace-picker` 开发期一次性生成；由 `scripts/prepare-next.mjs` 阶段 **1b** 在每次 `next build` 前**幂等应用**（`--reverse --check` 命中即跳过）。 |
| **替代方案** | ① 纯插件方案：退化为 `ctx.ui.select` 列表，放弃四 Tab 与面包屑围栏（不满足验收标准 AC-1/AC-4，已否决）；② 只改 pi-web 工作树不打补丁：违反「上游工作树零改动」纪律、上游升级即丢失（已否决）；③ 自建独立 UI 页面/路由：改动面最大且重造目录浏览（已否决）。 |
| 往返校验 | 构建期强制执行「应用 → 反向 → 断言 SHA-256 还原」（FR-203-022），并断言 `lib/directory-browser.ts` 含 `WORKSPACE_ROOTS_ENV`。构建成功后由阶段 6 **自动回退**，pi-web 结束时 pristine（FR-203-023）。另由 `scripts/test-workspace-picker.mjs` 的 44 断言在零设备条件下复验。 |
| 生成方式 | 独立 detached worktree（`git worktree add --detach <tmp> v0.11.1`）上修改并 `git diff` 导出；不含 `package-lock.json`、不含二进制。 |
| 回退方式 | `git -C ../pi-web apply --reverse patches/v0.11.1/0001-workspace-picker-roots.patch` |
| 规格 | `specs/203-plugin-workspace-picker/`、`docs/203-插件-选择工作区目录.md` |

### PFIX-1 — 会话导出在「无独立运行时二进制」的设备上回退到进程内导出

| 项 | 内容 |
|---|---|
| 文件 | `patches/v0.11.1/0002-session-export-in-process-fallback.patch` |
| 全局编号 | `PFIX-1`（只增不改、不复用；缺陷修复补丁，不挂编号需求） |
| 被 patch 的上游 | `pi-web` tag `v0.11.1`（`e783721`） |
| 触及文件（1） | `app/api/sessions/[id]/export/route.ts`（`:219` 的 spawn 前置条件加 `existsSync(process.execPath)`） |
| **触发条件** | 真机点「完整历史」→ `/api/sessions/<id>/export` 走 `exportSession()` 的 **spawn CLI** 分支：`execFileAsync(process.execPath, [cliPath, "--export", …])`。设备上 `process.execPath` = `/data/app/electron.org/electron_1.0/bin/electron/electron` —— **该路径不存在**（实测 `fs.existsSync` 为 false），且鸿蒙侧本就没有可用的独立 node/electron 可执行文件，于是 `spawn … ENOENT` → 路由 500，导出页只显示一行 JSON 错误。修前必须先修掉「点『完整历史』闪退」（`PFIX-1` 的上游症状链见 `logs/20261015-crash/`）。 |
| **实施时机** | 2026-10-15 缺陷修复一并生成；由 `scripts/prepare-next.mjs` 阶段 **1b** 幂等应用（排序在 `0001` 之后，两者触及文件不相交、上下文区间不重叠）。 |
| **替代方案** | ① 让设备侧能 spawn：需鸿蒙可用的 node/electron 可执行文件，环境不具备（`docs/鸿蒙环境能力清单-v0.11.1.md` 已登记 spawn/PTY 不可用），且不在本工程可改范围（已否决）；② 把 `dist/cli.js` 从 pi-dist 载荷中删掉以让 `getPiCliPath()` 返回 null：会牵连其它依赖 CLI 的路径，且是「靠删文件改变分支」的隐式耦合（已否决）；③ 在壳侧伪造 `process.execPath`：无法改变「设备上确实没有该二进制」的事实（已否决）。 |
| 往返校验 | 构建期强制执行「应用 → 反向 → 断言 SHA-256 还原」。构建成功后由阶段 6 **自动回退**，pi-web 结束时 pristine。 |
| 生成方式 | 独立 detached worktree（`git worktree add --detach <tmp> v0.11.1`）上修改并 `git diff` 导出；另在该 worktree 内验证「pristine 可应用」「先 0001 再 0002 不冲突」「两条往返后残留 0」。 |
| 回退方式 | `git -C ../pi-web apply --reverse patches/v0.11.1/0002-session-export-in-process-fallback.patch` |
| 规格 | `logs/20261015-crash/`（崩溃取证与修复记录） |

---

## 1. 历史结论（v1.1 / v1.2 / v0.11.1 冻结时点）

**当时本目录没有任何补丁文件。** 那是工程规划 §7 得出的**结论**，不是尚未开始。
补丁按上下游版本分目录（`patches/<tag>/`），上游升级时**新建目录**、旧目录保留可追溯。
本工程的上游基线是：

| 上游 | 基线 | 本工程消费方式 |
|---|---|---|
| `pi` | tag `v1.1.0`（`Branch_v1.1.0`） | 源码引用：`npm install` 产出 `@earendil-works/*` 依赖树 |
| `pi-web` | tag `v0.11.1`（`Branch_v0.11.1`） | 源码引用：`npm ci` + `next build` → 收集 `.next` 产物 |

因此本版本的目录名应为 `patches/v0.11.1/`（按被 patch 的那一侧的上游 tag 命名）。它现在
是空的，所以**不建目录** —— 空目录在 git 里不存在，建了也会被丢弃，徒增误导。第一条
补丁出现时再建，并在本文件里登记。

## 为什么 0 条就够

每一条「可能需要补丁」的问题，在实测/源码核实后都被上游现成机制覆盖了：

| 潜在补丁 | 为什么不需要 |
|---|---|
| Node 版本门禁（上游声明 `>=22.19.0`，运行时是 Node 22.17.0） | 该门禁位于 `pi-web/bin/node-version.js`，只作用于 `bin/pi-web.js` 这个入口。本工程**不经该入口**（采用主进程进程内嵌入 Next 服务器，见工程规划 §4.2），门禁根本不触发。pi 侧对 Node 新特性普遍用运行时守卫（例：zstd 是 `typeof zlib.zstdCompressSync !== "function"` 判空后才用）。 |
| 插件/包安装闸门 | PL1「仅本地源」由三个上游现成机制覆盖：公开注入点 `DefaultPackageManager.resolve(onMissing)`、总闸 `PI_OFFLINE`（`installMissing()` 首行短路）、本地路径源走 `resolveLocalExtensionSource()` 完全不碰 npm/git。见 §5.1、§5.2。 |
| `node:sqlite` 不可用 | pi 的 SQLite 后端在 `packages/durable`，本工程不消费；pi-web 的会话存储是 JSONL 文件。 |
| zstd / 其它新 Node API | 上游有运行守卫（同上）。 |
| 原生模块（PTY / sharp / koffi） | 本工程**不随包分发任何原生 `.node`**；终端面板降级（§9.2、§9.3）。 |
| 网络绑定 / Host-Origin 头改写 | pi-web 的 `lib/request-security.ts#isApiRequestHostAllowed()` 在 `isIP(hostname)` 为真时直接放行，局域网 IP 字面量天然通过 Host 白名单；同源请求的 `Origin` 与 `Host` 也一致。**因此本工程比参考工程 `dsh-desktop-hos` 少一整套补丁。** |
| symlink / hardlink / chmod 回退 | pi 与 pi-web 的写入路径未依赖它们。**⬜ 若真机实测命中，再按下面的规则补一条回退补丁**，并同步文档 §7 与 §11.2 的开放问题。 |

`pi` 与 `pi-web` 均以 tag + 分支固定，本工程所有「上游机制」结论都在 `docs/工程规划.md`
里**带文件路径**记录。上游升级时逐条复核那些路径，而不是盲目重跑构建。

## 新增补丁时必须遵守的规则

沿用参考工程 `dsh-desktop-hos` 与 `oc-desktop-hos` 的补丁纪律（工程规划 §2.4c、§7）：

1. **幂等**：应用前先 `git apply --reverse --check <patch>`，成功即视为已应用 → 跳过。
2. **冲突即终止**：绝不 `--3way` 强行合并，绝不覆盖上游 checkout 里的用户改动。
3. **不带镜像噪声**：`package-lock.json` 等由 `npm install` 重新生成，不进补丁。
4. **按上游 tag 组织**：`patches/<tag>/`；上游升级时新建目录，旧目录保留可追溯。
5. **不得落在既有补丁的连续上下文区间**（`git apply` 默认前后各 3 行）—— 新补丁一律
   追加到列表末尾，追加前对**每一个**既有补丁跑一遍 `--reverse --check`。
6. **可往返**：正向应用 → 反向应用后受影响文件的 SHA-256 必须完全还原。
7. **只在独立的 detached worktree 里生成与校验**，不在工作树上直接 diff。
8. **登记三要素**：每条补丁必须写明「触发条件 / 实施时机 / 替代方案」，并占用全局
   唯一编号（编号只增不改、不复用）。

## 构建脚本如何消费本目录（已实现，2026-10-14）

`scripts/prepare-next.mjs` 的阶段 **1b**（「上游补丁」）在 `next build` **之前**消费本目录：

```
for (patch of patches/<tag>/*.patch)          # 按文件名排序，确定性
    ├ git apply --reverse --check 命中 → 已应用，skip（幂等，no-op）
    ├ 否则 git apply --check 命中
    │    ├ 记录受影响文件 SHA-256（补丁新增的文件记为 null）
    │    ├ git apply            → 断言「可往返」
    │    ├ git apply --reverse
    │    ├ 断言 SHA-256 与记录值逐条相等（FR-203-022）→ 不等即硬失败
    │    └ git apply（正式生效）+ 断言 directory-browser.ts 含 WORKSPACE_ROOTS_ENV
    └ 两者都失败 → 硬失败中止（**绝不** --3way）
```

补丁目录名 = 被 patch 的那一侧的上游 tag（当前 `patches/v0.11.1/`）。上游升级时**新建目录**、
旧目录保留可追溯，并把 `prepare-next.mjs` 的 `PI_WEB_PATCH_TAG` 与本节同步。

## 与工程规划的对应

- 补丁集登记与理由：`docs/工程规划.md` §7
- 补丁纪律（上下文区间、往返校验、detached worktree 生成）：§2.4c、§7
- 上游基线锚定与升级复核责任：§11.3
- 本条补丁的触发条件与替代方案：本文件 §0（`P203-1`）

---

## v0.11.1 基线复核（2026-10-12，需求 101-version-0.11.1）

上游基线与上一轮**完全相同**（`pi` `v1.1.0` = `abe508e1b`，`Branch_v1.1.0`；`pi-web`
`v0.11.1^{commit}` = `e78372193b`，`Branch_v0.11.1`；两者工作树干净）。本节是**复核留痕**，
不是重复论证：逐条重读上游源码，记录文件与代码构造，以便上游升级时逐条对照。

**复核结论：本版本补丁集仍为 0 条，`patches/v0.11.1/` 目录不建。**

| # | 候选 | 结论 | 复核依据（上游文件 : 位置） |
|---|---|---|---|
| 1 | Node 版本门禁 | 不需要补丁 | `pi-web/bin/node-version.js:3`（`MIN_NODE_VERSION = "22.19.0"`）；唯一导入点 `pi-web/bin/pi-web.js:5`，`:7-10` 不满足即 `process.exit(1)`。全仓无第二处 Node 版本门禁；`engines` 只写在各 `package.json` 且无 `engine-strict`。本工程入口 `src-main/main.js` 直接 require `next/dist/server/lib/start-server.js`，**从不经 `bin/pi-web.js`**。 |
| 2 | 插件/包安装闸门 | 不需要补丁 | `pi/packages/coding-agent/src/core/package-manager.ts:115`（`resolve(onMissing?)` 公开注入点）、`:920`（实现）、`:54-58`（`isOfflineModeEnabled()`）、`:1302-1303`（`installMissing()` **首行**短路）、`:1360`（`resolveLocalExtensionSource()`，只 `existsSync`/`statSync`，不碰 npm/git）；另有 5 处 offline 短路（`:1123/:1218/:1516/:1567/:2021`）。本工程 `src-main/main.js` 默认置 `PI_OFFLINE='1'`。 |
| 3 | `node:sqlite` 不可用 | 不需要补丁 | 硬顶层 import 只在 `pi/packages/durable/src/storage/sqlite/node.ts:3-4`，消费方全在 `packages/coding-agent/src/experimental/`；`pi-durable` **不在** coding-agent 依赖里，`pi-web/node_modules/@earendil-works/` 下也无该包 → 代码路径不可达。pi-web 会话持久化是 JSONL（`pi-web/lib/session-reader.ts:362`）。 |
| 4 | zstd / 其它新 Node API | 不需要补丁 | 守卫 `pi/packages/ai/src/api/openai-codex-responses.ts:212,220`（`process.getBuiltinModule?.("node:zlib")` + `typeof zlib.zstdCompressSync !== "function"` 直接返回 `null`，仅影响 Codex SSE 压缩）。其它新 API 均在 ≤22.17：`fs.globSync`（`package-manager.ts:295`，22.14+）、`util.styleText`（`theme.ts:345`）。pi-web 自身零使用。 |
| 5 | 原生模块（PTY / sharp / koffi） | 不需要补丁 | pi-web 仅 `node-pty`（`pi-web/package.json:59`）；唯一使用是 `lib/terminal-manager.ts:80-95` 函数体内 `require("node-pty")` 的 try/catch（失败即终端面板降级），`:3` 是 `import type` 不触发加载。`sharp` 只是 next 的可选依赖，且 `next.config.ts` 用 `images.unoptimized` 绕过。pi 侧无 node-pty/sharp/koffi。 |
| 6 | 网络绑定 / Host·Origin 头改写 | 不需要补丁 | `pi-web/lib/request-security.ts:97` `if (isLoopbackHostname(hostname) || isIP(hostname)) return true;`；`Host: 192.168.x.y:port` 经 `:92-94` → `:10-22` 归一为纯 hostname 后 `isIP` 放行。同源判定 `:133-141` 用 `canonicalOrigin(origin) === getRequestOrigin(request)`，由 `protocol + host` 构造 → 同源天然相等。**本轮真机复核**：`[ready]` 探测与 CDP 内的 API 调用（Host = `127.0.0.1:<port>`）全部 200，未做任何头改写。 |
| 7 | symlink / hardlink / chmod 回退 | 不需要补丁（残余观察项） | 创建型调用在 pi/pi-web 源码内 **0 处**（`symlinkSync`/`linkSync` 只出现在测试文件）。`chmod` 真实命中 4 处且均**未捕获**：`package-manager.ts:234`、`tools-manager.ts:322`（被 `PI_OFFLINE` 禁用）、`pi-web/lib/global-settings-file.ts:70`、`lib/provider-credential-store.ts:20,62`、`lib/mcp-config-file.ts:324`。真机为 Linux 内核 + POSIX fs；应用域实测行为见 `docs/鸿蒙环境能力清单-v0.11.1.md`。若真返回 `EPERM`，各 API 层会捕获，不崩服务。 |
| 8 | **`pi` 的 `bash` 工具等待子进程结束**（新增候选） | **需要处置，但本轮不产出补丁** | `pi/packages/coding-agent/src/core/tools/bash.ts:114-121`（spawn）→ `:148` `await waitForChildProcess(child)`；决胜逻辑 `utils/child-process.ts:49-135` —— 三条路径**全部以事件为前置**（`close` / `exit` + 双 `end` / `exit` 后 100 ms 空闲），**无轮询、无绝对截止时间**；`bash.ts:132-137` 的 `timeout` 只 `killProcessTree`，而 `timedOut` 判定在 await **之后** → 等待无上界。真机实测（`docs/真机验证记录.md` 轮次 1 发现 11）：stdout 正常返回、`exit`/`close` 事件数组**始终为空**、子进程 1.5 s 起变 `Z`。 |

### 候选 8 为什么不在本轮补

1. **既有决策优先**：`docs/工程规划.md` R14 的首选路线是「**壳扩展替换/包装 `bash` 工具**」
   （零上游补丁），最小上游补丁只是**次选**，且标记为**待决策**。
2. **本需求范围**：101-version-0.11.1 是版本收敛 + 验证，`specs/101-version-0.11.1/spec.md` §2 已把
   「修 `bash` 工具」显式列为 Out of scope；本轮只**登记**该缺口（能力清单报告 + R14），
   不夹带行为改动。
3. **最小补丁形状已探明**（供决策后使用）：在 `waitForChildProcess()` 内加 100–200 ms
   `setInterval` 读 `/proc/<pid>/stat`，`state === 'Z'` 时用第 52 字段作为退出码 `finalize`，
   `ENOENT`（已被回收）同样 `finalize`；必须在 `cleanup()` 里清掉定时器，并保留硬截止兜底。
   ⚠ **不要**改走「轮询 `child.exitCode`」——Node 在同一内部退出回调里先写 `exitCode` 再 emit
   `'exit'`，而真机上该回调从未跑（事件数组为空），`exitCode` 会永远是 `null`。

### 复核方式与局限

- 方式：`git -C ../pi` / `../pi-web` **只读**（`git status --porcelain` 为空），逐条 `grep` + 读源码。
- 局限（**未核实**，不得当作已证）：① `child.exitCode` 的语义只在「Node 内部实现约定 + 真机
  事件数组为空」上推断，未做源码级核实；② `spawnSync` 在真机是否同样卡住未实测（僵尸长期
  不回收说明宿主侧回收机制不可用，而它依赖同一套 libuv 回调）；③ 上游 `>=22.19.0` 门槛的具体
  技术动因未查（CHANGELOG 未给原因），本轮只按 API 清单逐族排查，**不是**穷尽性 API 审计。
- 补偿面核对：`runtime-overlays/`（23 个文件）与 `extensions/harmony-runtime.js` 均**不覆盖**
  `pi` / `pi-web` 的任何文件，因此候选 1–8 **都没有**「已经由 overlay 变相补掉」的情况。
  `config/` 是候选 2 的落地补偿（`settings.json` 不含 `packages` + `PI_OFFLINE=1`）。
