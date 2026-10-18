# 插件·GIT 操作（204-plugin-git）—— 规格（pi-desktop-hos）

> **Module:** 204-plugin-git ｜ **Status:** Proposed ｜ **Last Updated:** 2026-10-18
> **上游基线:** pi v1.2.0 ｜ pi-web ｜ Electron-on-鸿蒙（进程内 Node 22.17.0）
> **需求编号:** 204-plugin-git ｜ **需求名称:** 插件：GIT 操作
> **git 分支:** 不改动（沿用纪律：不新建、不切换、不重命名；main）
> **参考模块:** `dsh-desktop-hos/specs/204-plugin-git/`、`dsh-desktop-hos/plugins/harmony-plugin-git/`（领域逻辑来源；接缝为 cordis，不沿用）
> **设计文档:** [`../../docs/204-插件-GIT.md`](../../docs/204-插件-GIT.md)
> **姊妹规格:** `pi-desktop-ark/specs/204-plugin-git/`（代码共享，hos 为单一事实源）

## 1. 模块概述

### 1.1 目的（Why this module exists）

鸿蒙环境**没有 `git`**（toybox 不提供；`git: inaccessible or not found`，能力清单 #17/#18），`git` 全部命令不可用。本模块交付一个 **pi agent 扩展** `harmony-git`，把**纯 JS 的 isomorphic-git 1.44.2** 嵌入应用，向模型注册 **21 个 `git_*` 工具** + 1 个凭据管理工具 `git_credentials`，并提供**设备自管的 git 原生凭据文件**。全部操作在设备进程内完成，不依赖外部二进制、不需要子进程、不联网安装（`PI_OFFLINE=1`），**不触碰父工程**。

### 1.2 解决的问题（What pain points it addresses）

| # | 现状 | 证据 |
|---|---|---|
| 1 | 设备无 `git`，工作区里有仓库也无法做任何版本控制 | 能力清单 v0.12.1 #17/#18 |
| 2 | 设备 `npm`/`npx` 存在但不可用（`Signal 31` seccomp），`PI_OFFLINE=1`，无法运行时安装 isomorphic-git | 能力清单 #20 |
| 3 | pi 扩展须**自包含、只用 `node:` 内置**；pi-dist 的 `node_modules` 不在扩展解析路径上 | specs/102 FR-tool-021；`loader.ts`；`pi-web-launch.js#materializeAgentResources` |
| 4 | 设备**禁 symlink**（EACCES），资源 copy 物化 | `src-main/main.js:417-452` |
| 5 | **无 dsh 式逐写审批**，唯一门禁是 project trust（`ask`） | specs/102 C1；`docs/工程规划.md:435` |
| 6 | pi 无凭据库/设置页挂载点，带账号仓库认证无现成凭据面 | `types.ts:1592-1919`（`pi` 无 secrets/host API） |
| 7 | isomorphic-git 用 `isPromiseFs()` 判 fs 方言，适配器同步抛错会被判成 callback 风格 → 11 命令永久挂起 | dsh 真机发现 §3.1-①（同风险，必须沿用其修法） |

### 1.3 范围（Scope）

**包含**：

- `harmony-git` 目录扩展（`index.js` 工厂 + `lib/` + `vendor/`），注册 21 个 `git_*` 工具 + `git_credentials`；
- isomorphic-git + `diff@9` 的 esbuild 单文件 bundle（构建期产出，提交入库，置 `vendor/`）；
- 仓库根 chroot 围栏（防逃逸/绝对路径/根外软链）+ `PI_HOS_ROOTS` 合理性提示；
- 设备自管 git 原生凭据文件（`$PI_CODING_AGENT_DIR/.git-credentials`，0600，原子写），`onAuth` 注入；
- isomorphic-git 缺口的自建：`diff`（bundle `createTwoFilesPatch`）、`show`、`revert`（fail-closed）；
- 本模块 `spec.md`/`plan.md`/`tasks.md`/`test-cases.md` 与 `docs/204-插件-GIT.md`；
- 主机单测 + jiti 加载冒烟 + 两工程 hvigor HAP 编译；真机用例待回归。

**不包含**：

- 父工程 `specs/` 登记（规格仅落子工程）；父工程代码改动（**0**）；
- `rebase`/`blame`/`grep`/SSH 传输/SHA-256 仓库；
- dsh 式一次性提权审批、凭据库 API、设置页 UI（pi 无这些接缝）；
- 运行时 `npm install`、子进程 spawn、网络下载二进制；
- git 分支改动。

## 2. 用户故事

- 作为用户，我希望在对话里直接让模型 clone 一个公开仓库并读懂它，不必先想办法装 git。
- 作为用户，我希望填一次带账号仓库的用户名/密码，之后模型执行 pull/push 不必知道密码、密码也不进对话。
- 作为用户，我希望模型在工作区内自由操作；指向异常路径时得到**清晰报错**而非静默。
- 作为用户，我希望任何失败都**如实说明原因**（缺凭据/认证失败/冲突/越界），而不是假装成功或静默重试。
- 作为用户，我希望知道哪些 git 操作**本平台做不到**（`rebase`），而不是让它悄悄用别的方式代替。

## 3. 功能需求（RFC 2119）

### 3.1 扩展形态与注册

- **FR-204-001** 扩展**必须**为 pi 自动发现的目录扩展 `extensions/harmony-git/`，入口 `index.js` 为 ESM，**default export 工厂** `(pi) => void|Promise<void>`；**必须**经 jiti 2.7.0 可加载。
- **FR-204-002** 工厂**必须**通过 `pi.registerTool({name,label,description,parameters,execute,...})` 注册全部工具；**必须不**在工厂内创建长驻资源（进程/socket/watcher/定时器）。
- **FR-204-003** 工具 `parameters` **必须**为普通 JSON-schema 对象字面量；校验失败**必须**在 `execute` 前报格式错误。
- **FR-204-004** `execute(toolCallId, params, signal, onUpdate, ctx)` **必须**返回 `{content:[{type:"text",text}], details, isError?}`；失败**必须**抛错或返回 `isError:true`；**必须不**伪造成功。
- **FR-204-005** 扩展**必须**自包含：只依赖 `node:` 内置与本扩展目录内文件（vendor bundle）；**必须不** import 上游内部路径、**必须不**依赖 pi-dist 的 `node_modules`、**必须不**在设备上做 `npm install`。

### 3.2 依赖供给（bundle）

- **FR-204-006** isomorphic-git（含 `http/node`）与 `diff@9`（`createTwoFilesPatch`/`structuredPatch`）**必须**以**构建期 esbuild 单文件 CJS bundle** 供给，置 `extensions/harmony-git/vendor/isomorphic-git.bundle.cjs` 并**提交入库**。
- **FR-204-007** bundle 构建**必须** `--platform=node`、`node:*` 内置全部 external、版本 pin 死（isomorphic-git `1.44.2`、diff `9.0.0`），产物头部**必须**标注版本 + 构建命令；构建脚本**必须**可离线 `--verify` 校验已提交产物的版本与关键入口。
- **FR-204-008** bundle **必须**以平铺命名空间导出（`init`/`clone`/`statusMatrix`/… + `http` + `createTwoFilesPatch`），供 `lib/runtime.js` 装载并断言。

### 3.3 文件访问与围栏

- **FR-204-009** 每个工具调用**必须**先把 `dir` 归一（`path.resolve`，相对会话 `ctx.cwd`）为**仓库根绝对路径**；这是后续全部路径的唯一来源。
- **FR-204-010** fs 适配器**必须**对每个路径 `join(root, rel)` → `normalize` → **前缀包含校验**；越界（`..` 逃逸、绝对路径、软链指向根外）**必须**拒绝，不落到 `node:fs`。
- **FR-204-011** fs 适配器**所有方法必须声明 `async`**（isomorphic-git `isPromiseFs()` 方言契约，FR-204-007 关联 F4/发现①）；**必须不**同步抛错。
- **FR-204-012** `dir` 落在 `PI_HOS_ROOTS`（sandbox/desktop/documents/download）之外时**必须**给**清晰错误提示**；**必须不**提供逐写审批（pi 信任模型无此机制），**必须不**假装审批。
- **FR-204-013** 用户目录 OS 未授权（`EPERM`/`EACCES`）时**必须**原样归因并提示需系统设置授权后重启。

### 3.4 凭据

- **FR-204-014** 带账号仓库认证**必须**经 isomorphic-git `onAuth`/`onAuthFailure`（HTTPS Basic）；凭据**必须**来自设备自管文件 `$PI_CODING_AGENT_DIR/.git-credentials`。
- **FR-204-015** 该文件**必须**为 git 原生格式（一行一条带 userinfo 的 URL `<协议>://<user>:<pass>@<host[:port]>`，userinfo 百分号编码），**必须**容忍空行/注释/坏行，匹配对齐 `git credential-store`（协议+host 含端口一致、带路径前缀优先、同分后者覆盖）。
- **FR-204-016** 写入**必须**临时文件 + `rename` 原子替换、保留其余行与注释、强制 `0600`；删除只删匹配行、删空则删文件。
- **FR-204-017** `git_credentials` 工具**必须**提供 `set`/`unset`/`list`；`list` **必须**脱敏（只回显协议/host/用户名，**绝不**回显密码）；**必须不**把密码写进 details/日志/对话。
- **FR-204-018** 缺凭据/凭据被拒**必须**给可照抄指引（点名文件路径与占位行），**必须不**抛裸 401、**必须不**猜测/匿名重试；认证被拒**最多重试 1 次**。
- **FR-204-019** `user.name`/`user.email` **必须**由 `git_config` 写仓库本地配置；默认**必须**为占位值（`yourname`/`yourname@somehost`），**必须不含**真实个人信息。

### 3.5 工具面

- **FR-204-020** **必须**注册 21 个 `git_*` 工具：`git_init/clone/status/diff/log/show/add/commit/branch/checkout/reset/merge/cherry_pick/revert/stash/tag/remote/fetch/pull/push/config`（映射与行为见设计文档 §10）。
- **FR-204-021** `git_diff` **必须**支持 workdir↔index / index↔HEAD / workdir↔HEAD / 任意两 ref（`mode:"refs"` 需 `ref`+`ref2`）与 `stat`、pathspec；二进制文件**必须**如实标记 `Binary files … differ`，不做文本 diff；非 `refs` 模式传 `ref`/`ref2` **必须**报错而非忽略。
- **FR-204-022** `git_show`/`git_revert` 为 isomorphic-git 缺口，**必须**按设计 §11.1/§11.3 自建；`revert` **必须** fail-closed（工作区分叉时拒绝并列出冲突路径）。
- **FR-204-023** 合并/摘取**必须** `abortOnConflict` 默认 `true`（不污染工作区），冲突**必须**报冲突路径。
- **FR-204-024** `git_push` 的 `force`/`delete` **必须**为显式开关；non-fast-forward **必须**原样报服务端错误，**必须不**自动 force。
- **FR-204-025** `rebase`（模型发起时）**必须**明确报「本平台不支持」，**必须不**静默用 merge 冒充。
- **FR-204-026** 取消**必须**经 `signal` 透传；被取消**必须不**当作失败报告。
- **FR-204-027** 非仓库目录**必须**明确报「不是 git 仓库」并建议 `git_init`/`git_clone`，**必须不**静默创建。

### 3.6 装配与共享

- **FR-204-028** 扩展+vendor **必须**随既有 `collect-pi.mjs`（`cpSync extensions → resources/pi-agent/extensions, recursive`）与运行期 `materializeBundledResources` 自动物化到 `<userData>/pi-agent/extensions/harmony-git/`；**必须不**改 `src-main/main.js` 或装配脚本。
- **FR-204-029** `harmony-git` 代码**必须**以 hos 为单一事实源；ark 经 `pi-desktop-ark/scripts/sync-git-extension.mjs` 幂等拷贝到 `payload/extensions/harmony-git/` 并加 V2 头注。
- **FR-204-030** 父工程代码改动**必须为 0**；规格仅落子工程 `specs/204-plugin-git/`。

## 4. 关键实体

| 工具 | 职责 | isomorphic-git 原语 |
|---|---|---|
| `git_init` | 初始化仓库（默认分支可指定） | `init` |
| `git_clone` | 克隆（`ref`/`depth`/`noTags`/`singleBranch`） | `clone` |
| `git_status` | 工作区状态分组渲染 | `statusMatrix`、`isIgnored` |
| `git_diff` | unified diff + stat + 二进制检测 | `statusMatrix`/`readBlob`/`readTree`/`resolveRef`/`expandOid` + `createTwoFilesPatch` |
| `git_log` | 提交历史 | `log`、`walk` |
| `git_show` | commit/tree/blob/tag 内容与元信息 | `readCommit`/`readTree`/`readBlob`/`readTag` |
| `git_add` | 暂存/删除登记/取消暂存 | `add`/`remove`/`updateIndex`/`resetIndex`/`isIgnored` |
| `git_commit` | 提交（`message`/`author`/`amend`） | `commit`/`getConfig`/`resolveRef` |
| `git_branch` | 列出/新建/删除/重命名 | `listBranches`/`currentBranch`/`branch`/`deleteBranch`/`renameBranch` |
| `git_checkout` | 切换/检出/恢复路径 | `checkout`/`fastCheckout`/`resolveRef` |
| `git_reset` | soft/mixed/hard | `resetIndex`/`writeRef`/`branch`/`checkout` |
| `git_merge` | 合并（ff/no-ff/dryRun/中止） | `merge`/`abortMerge`/`findMergeBase`/`isDescendent`/`fastForward` |
| `git_cherry_pick` | 摘取提交 | `cherryPick`/`abortMerge` |
| `git_revert` | 反向提交（自建 fail-closed） | `readCommit`/`readTree`/`readBlob`/`add`/`commit` |
| `git_stash` | push/pop/apply/drop/list/clear | `stash` |
| `git_tag` | 轻量/附注标签 | `tag`/`annotatedTag`/`listTags`/`deleteTag` |
| `git_remote` | 远端增删列 + refs 探测 | `listRemotes`/`addRemote`/`deleteRemote`/`getRemoteInfo2`/`listServerRefs` |
| `git_fetch` | 拉取对象与 refs | `fetch` |
| `git_pull` | 拉取并合并 | `pull`/`fastForward` |
| `git_push` | 推送分支/标签（`force`/`delete` 显式） | `push` |
| `git_config` | 读写仓库本地/全局配置 | `getConfig`/`getConfigAll`/`setConfig` |
| `git_credentials` | 凭据文件 set/unset/list（脱敏） | `git-credentials.js` |

## 5. 非功能需求

- **NFR-204-001** 离线：构建期供给 bundle，设备端零网络安装；`PI_OFFLINE=1` 语义不破。
- **NFR-204-002** 安全：凭据明文不进对话/details/日志；凭据文件 `0600`；chroot 防逃逸。
- **NFR-204-003** 体积：扩展目录新增 bundle ≈ 888 KB（含 diff）。
- **NFR-204-004** 性能：纯 JS clone 大仓库慢于原生 git；提供 `depth`/`singleBranch`/`noTags` 缓解；取消经 `signal`。
- **NFR-204-005** 如实性：失败如实归因，不假装成功、不静默重试（宪法 A6 一致）。

## 6. 验收标准

沿用设计文档 §13（AC-1…AC-10）：扩展被加载且工具可列；无账号全链成功；带账号链凭据经 onAuth；凭据文件 git 原生 + 0600 + 脱敏；缺凭据报错点名路径；凭据明文不泄露；rebase 明确不支持；revert 分叉 fail-closed；bundle 可复现并入包；既有扩展回归不受影响。

## 7. 假设与依赖

- **A1** pi 扩展契约（jiti + registerTool + 自动发现）如 `loader.ts`/`types.ts` 所述 —— 已由现有 4 扩展实证。
- **A2** bundle 在 jiti 2.7.0 + 本机 Node v24 可加载并跑通真仓库 —— 已实测（F9）。
- **A3** 设备出网 HTTPS 可用（能力清单 #22）—— 带账号网络链成立，真机回归确认。
- **A4** 两工程 Node（22 / 24）均可运行同一 bundle（`node:*` external）—— v24 已实测，v22 真机回归。

