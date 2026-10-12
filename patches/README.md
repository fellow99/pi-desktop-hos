# patches/ — 上游补丁集（本版本为空）

**本目录当前没有任何补丁文件。** 这是工程规划 §7 得出的**结论**，不是尚未开始。

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

## 构建脚本如何消费本目录

`scripts/` 下**没有** `build-pi-web.mjs` 这类"打补丁 + 构建"脚本，因为补丁集为空 ——
`scripts/prepare-next.mjs` 直接 `npm ci` + `next build` + 裁剪。**第一条补丁出现时**，
需要在 `prepare-next.mjs` 里加一个补丁应用阶段（照 `dsh-desktop-hos/scripts/build-dsh.mjs`
的幂等循环写），并同步本文件与工程规划 §7 的表格。

## 与工程规划的对应

- 补丁集为空的完整理由（逐条登记）：`docs/工程规划.md` §7
- 补丁纪律（上下文区间、往返校验）：§2.4c、§7
- 上游基线锚定与升级复核责任：§11.3

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
