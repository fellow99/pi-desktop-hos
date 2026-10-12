# 102 — 鸿蒙环境能力补齐：纯 JS 工具插件（harmony-js-tools）功能规格

> **Module:** harmony-js-tools ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）
> **需求编号:** 102-harmony-js-tools ｜ **需求名称:** 环境能力补齐（纯 JS 工具插件）
> **git 分支:** 不改动（沿用 101 的分支纪律：不新建、不切换、不重命名）
> **依据:** [`../docs/鸿蒙环境能力清单-v0.11.1.md`](../docs/鸿蒙环境能力清单-v0.11.1.md)（结论权威）
> 参考工程: `dsh-desktop-hos/plugins/README.md`（**仓库外**：`d:\deepseek-harness-workspace\dsh-desktop-hos\plugins\`）

## 1. 目的

`docs/鸿蒙环境能力清单-v0.11.1.md` 认定：本构建有**三项用户可见的能力实质不可用** ——
`bash` 工具会挂住（#15）、`grep` 工具不可用（#19）、`find` 工具不可用（#18），
且后两项原本的替代路径（`bash("grep …")`）也因 #15 一并不可达。

本需求把这三项**用纯 JavaScript 在 pi 扩展层补齐**：不引入任何外部二进制、不联网、
不用原生模块、不用 PTY，全部跑在 **agent 进程内**（设备上唯一确定可用的执行环境）。

**为什么这条路可行（已实测前置验证，见 §6 R1）**：

1. pi 的扩展**可以用同名工具整体顶替内建工具**（`agent-session.ts` 的工具注册表先放内建、
   再让扩展 `set(name, tool)` 覆盖）→ 顶替 `bash`/`grep`/`find` 后，模型与 pi-web 的
   `toolNames` preset（只认识内建名）都无需改动；
2. 设备上子进程的 `exit`/`close` 事件永不送达，但 **`stdout` 的 `end` 事件会送达**，
   因此「常驻 `/system/bin/sh` + 随机哨兵行」可以让命令**有确定的结束判定与退出码**
   —— 这正是 #15 挂死的根因，绕开它即可；
3. `toybox` 的 `find`/`grep` **命令本身是好的**（#23），只是没有通道；顶替后的 `bash`
   顺便把它们解锁。

## 2. 范围

**In scope**

- `extensions/harmony-exec.js`：以同名工具顶替内建 `bash`（常驻非 PTY shell + 哨兵行协议）。
- `extensions/harmony-search.js`：以同名工具顶替内建 `grep` 与 `find`（纯 JS 目录遍历）。
- 与内建**参数兼容**（`bash {command, timeout?}`、`grep {pattern, path?, glob?, ignoreCase?, literal?, context?, limit?}`、
  `find {pattern, path?, limit?}`），保证「顶替」对模型是透明的。
- 文档同步：`extensions/README.md`、`skills/harmony-runtime-capabilities/SKILL.md`、
  `docs/鸿蒙环境能力清单-v0.11.1.md`（追加修订节，**不删改既有结论**）。
- 真机构建、部署、端到端验证（模型真实调用三个工具）。

**Out of scope（本轮明确不做，理由见各自条目）**

- **文件操作工具**（`rm`/`mv`/`cp`/`mkdir`）：`bash` 修好后 `rm/mv/cp` 直接可用 → 属冗余增强（YAGNI）。
- **命令围栏**（token 级路径白名单）：能显著缓解 #32，但会让含 `$VAR`/管道/`xargs` 的合法命令被拒
  （fail-closed）。本轮**保持与既有 `bash` 相同的信任模型**（不新增也不削弱），把围栏登记为可选后续。
- **进程内 JS（`worker_threads`）**：替代不可用的子进程 `node`（#17）。登记为可选后续；
  本轮不实现，理由是它需要额外的资源上限/隔离设计，且不属「已被认定不可用」的那三项。
- **PTY（#16）/ 后台常驻（#29）/ 开机自启（#31）/ 用户目录写（#14）/ 符号链接（#11）**：
  分别缺原生产物、需 Ability 无窗形态、OS 只读接口、OS 授权门、SELinux 硬拒 —— **JS 插件无法触及**。
- **插件联网安装（#20）**：PL1「仅本地源」是本工程既定策略，不改。
- 不改上游 `pi`/`pi-web` 一个字节；不新增补丁（`patches/` 仍为 0 条）。

## 3. 上游事实（本规格前提，已核实）

| # | 事实 | 出处 |
|---|---|---|
| U1 | 扩展工具与内建**同名即整体顶替**：注册表先 `new Map(builtIn)`，再对每个扩展工具 `set(name, tool)` | `pi/packages/coding-agent/src/core/agent-session.ts:3560-3563`；上游自带例 `examples/extensions/sandbox/index.ts` 注明「intentionally overrides the built-in `bash` tool」 |
| U2 | 两个扩展注册同名工具时**先注册者胜** | `.../core/extensions/runner.ts:629-640` |
| U3 | `pi.registerTool(tool)`；`ToolDefinition` = `{name,label,description,parameters(TypeBox),promptSnippet?,execute,...}` | `.../core/extensions/types.ts:574-652`、`:1642-1645` |
| U4 | `execute(toolCallId, params, signal, onUpdate, ctx) => Promise<AgentToolResult>`；返回必须有 `content: [{type:"text",text}]`；失败**抛错**或返回 `isError:true`；可用 `onUpdate({content,details})` 报进度 | `.../extensions/types.ts`、`pi/packages/agent/src/types.ts:424-461` |
| U5 | 扩展工具**默认自动对模型可见**（`exposure: "direct"` 且 `defaultActive !== false`）；`settings.json` 的 `defaultTools` 是**初始激活集**、不是白名单 | `.../core/sdk.ts:282-293`、`agent-session.ts:3578-3581` |
| U6 | pi-web 的 `toolNames` 只接受**内建工具名** | `pi-web/app/api/agent/new/route.ts:48-62`、`lib/session-tool-selection.ts:22-57` |
| U7 | 扩展**没有沙箱 fs**，用裸 `node:fs`；`node:worker_threads` 未被禁止（上游 codemode 扩展在用） | `.../extensions/types.ts:325-397`；`pi/packages/codemode/src/runtime/host.ts:1` |
| U8 | 工厂里**不得**起进程/socket/watcher/定时器（pi 有不启会话就加载扩展的路径）；长驻资源应在 `session_start` 起、`session_shutdown` 释放 | `pi/packages/coding-agent/docs/extensions.md:56-60` |
| U9 | 设备实测：常驻 `sh` 的 `spawn` 事件到达、stdout 正常；**`exit`/`close` 永不送达**，但 **`stdout` 的 `end` 会送达** | `logs/20261012-1/T20-exec-protocol2.txt`（本需求前置验证） |
| U10 | 设备实测：`/data/local/tmp` 在**应用域**不存在（shell 域才有）→ 命令 cwd 只能落在应用沙箱内 | 同上（步骤 5 报 `No such file or directory`） |
| U11 | 内建 `bash` **没有默认超时**（`timeout` 可选、无默认），且其等待逻辑无轮询、无截止 → 这是「永久挂住」的另一半原因 | `pi/.../tools/bash.ts`、`patches/README.md` 候选 8 |
| U12 | 内建工具名与参数：`bash{command,timeout?}`、`grep{pattern,path?,glob?,ignoreCase?,literal?,context?,limit?}`（默认 100）、`find{pattern,path?,limit?}`（默认 1000） | `pi/.../tools/{bash,grep,find}.ts` |

## 4. 需求条目

> 只追加不修订；MUST / MUST NOT / SHOULD / MAY。Plan 逐条回引。

### 4.1 顶替方式

- **FR-tool-001**（MUST）：三个工具必须以**与内建同名**的方式注册（`bash` / `grep` / `find`），
  从而对整个系统（模型看到的工具名、pi-web 的 preset 校验）表现为「同一个工具变好了」，
  而不是「多出几个新工具」。
- **FR-tool-002**（MUST）：顶替后**参数必须与内建兼容**（U12 的字段集）；不得新增必填参数、
  不得改变字段语义。可以**新增可选**参数，但缺失时必须退回到内建默认行为。
- **FR-tool-003**（MUST NOT）：不得改动上游 `pi`/`pi-web` 的任何文件；不得新增 `patches/` 下的补丁。

### 4.2 `bash`（exec）

- **FR-tool-004**（MUST）：必须使用**常驻的非 PTY `/system/bin/sh`**，通过 stdin 下发
  「哨兵行包裹」的命令帧，并只依赖 **stdout 的内容**判定结束 —— **MUST NOT** 依赖
  `exit` / `close` 事件（设备上永不送达，U9）。
- **FR-tool-005**（MUST）：哨兵必须是**每条命令随机生成**且**不泄露给被执行的命令**
  （命令无法伪造结束标记）；退出码必须从结束哨兵行解析，**无法解析时不得伪造 0**。
- **FR-tool-006**（MUST）：必须把子进程的 stderr **合并**到同一输出流（顺序可读），
  且非零退出码必须以**可见**方式呈现（例如在结果里显式给出退出码并标 `isError`）。
- **FR-tool-007**（MUST）：必须有**默认超时**（`timeout` 参数以秒为单位，与内建一致；
  未给出时使用一个有限默认值），超时后必须杀掉常驻 shell、重置状态，并明确报告超时 ——
  **MUST NOT** 出现无上界的等待（这是 #15 的直接教训，U11）。
- **FR-tool-008**（MUST）：必须能识别常驻 shell 的**死亡**并在下一次调用时**自动重启**：
  唯一可用信号是 stdout 的 `end`（U9）；重启后命令仍必须能正常执行。
- **FR-tool-009**（MUST）：每条命令的执行目录必须**确定**：命令前隐式 `cd` 到会话工作目录
  （`ctx.cwd`）；**MUST NOT** 依赖跨命令的 `cd` 持久化（内建 `bash` 每条命令都新建 shell
  且设 `cwd`，本工具保持同一语义；设备上 `/` 等目录不可写会让「继承进程 cwd」不可预测）。
- **FR-tool-010**（MUST）：必须支持命令在**同一常驻 shell** 内串行执行（不并发写入同一 stdin），
  并保证一个命令的输出不会串到下一个命令的结果里（帧内清零缓冲）。
- **FR-tool-011**（MUST）：输出必须有**上限**并在超限时显式标注截断（不得静默丢内容）。
- **FR-tool-012**（SHOULD）：应在超时前给出可选的进度回报（`onUpdate`），使长命令在 UI 上不是黑箱。

### 4.3 `grep` / `find`（纯 JS 搜索）

- **FR-tool-013**（MUST）：两者必须是**纯 JavaScript**：**MUST NOT** 启动任何子进程、
  **MUST NOT** 依赖 `rg`/`fd` 或任何外部二进制、**MUST NOT** 联网。
- **FR-tool-014**（MUST）：`grep` 必须支持 `pattern`（正则，`literal` 时按字面量）、`path`、`glob`
  文件过滤、`ignoreCase`、`context`（前后行数）、`limit`（默认 100）；输出行为
  `<相对或绝对路径>:<行号>: <行内容>`。
- **FR-tool-015**（MUST）：`find` 必须支持 `pattern`（`*` / `?` 匹配单个路径段，`**` 跨段）、
  `path`、`limit`（默认 1000）；**只返回文件**，返回目录树遍历中命中的文件路径。
- **FR-tool-016**（MUST）：两者都必须有**多重上限**：最大结果数、最大文件数、单文件最大字节数、
  最大递归深度、单行最大字符数；任一触顶都必须**在输出中显式说明**（不得静默截断）。
- **FR-tool-017**（MUST）：遍历必须默认跳过 `node_modules`、`.git` 与其它**点开头的目录**；
  跳过不可读文件（读取失败计为「已跳过」而不是整体失败）；显式给出的根目录必须被遍历
  （即使它是点目录）。
- **FR-tool-018**（SHOULD）：单文件读取应有字节上限，超限文件跳过并计入统计，避免把大文件读进内存。
- **FR-tool-019**（MUST NOT）：不得跟随指向目录之外的符号链接进入无限递归；遇到无法 stat 的条目必须跳过。

### 4.4 运行期与生命周期

- **FR-tool-020**（MUST NOT）：扩展**工厂函数内**不得启动常驻进程、定时器、socket 或 watcher（U8）。
  常驻 shell 必须**惰性启动**（首次工具调用时）或在 `session_start` 启动，
  并在 `session_shutdown` 幂等释放（杀掉常驻 shell、清定时器）。
- **FR-tool-021**（MUST）：扩展必须自包含（只用 `node:` 内建模块），**不得** import 上游内部路径
  （避免上游升级即碎）；shell 绝对路径必须是常量并与 `config/settings.json` 的 `shellPath` 一致。
- **FR-tool-022**（MUST）：扩展必须在设备上**真实可用**：模型端到端调用 `bash`/`grep`/`find`
  能拿到正确结果（见 §5 AC）。
- **FR-tool-023**（MUST）：扩展的运行不得破坏既有能力：应用能正常启动到「就绪」、
  会话能创建、真实模型对话能完成。
- **FR-tool-024**（MUST）：必须在 `docs/鸿蒙环境能力清单-v0.11.1.md` 追加**修订节**
  （不删改既有结论），把 #15/#18/#19（以及随之解锁的 #21）的状态改为「已由纯 JS 工具补齐」，
  并明确标注**新的信任模型与限制**（无围栏、无 PTY、`cd` 不持久、状态不跨重启保留）。

### 4.5 明确不做（登记为可选后续）

- **FR-tool-025**（MAY NOT 本轮）：文件操作工具（`rm`/`mv`/`cp`/`mkdir`）——**本轮不实现**，
  理由：`bash` 修好后等价能力已可用（YAGNI）；登记为可选增强。
- **FR-tool-026**（MAY NOT 本轮）：命令围栏（token 级路径白名单）——**本轮不实现**，
  理由：会让合法命令 fail-closed，且需与审批流集成；登记为可选增强（缓解 #32）。
- **FR-tool-027**（MAY NOT 本轮）：进程内 JS（`worker_threads`）替代子进程 `node`（#17）——**本轮不实现**，
  登记为可选增强（需额外的资源上限与隔离设计）。

## 5. 验收标准

| 编号 | 验收条件 | 判定方式 |
|---|---|---|
| AC-01 | 三个扩展文件随包投放并被 pi 加载（无加载错误） | 应用启动 hilog + 应用域读文件 |
| AC-02 | `bash` 能执行**真实命令**并返回 stdout 与**正确退出码** | 会话中对 `echo`/`id`/`false` 的调用结果 |
| AC-03 | `bash` 能合并 stderr、报告非零退出码 | 对 `echo E 1>&2; exit 4` 的调用结果 |
| AC-04 | `bash` **不会挂住**：每条命令在有限时间内返回 | 每次调用的 `durationMs` 有限且无超时 |
| AC-05 | `bash` 在常驻 shell 被杀后能自动重启并继续工作 | 先 `exit 3` 再执行普通命令，两次都成功 |
| AC-06 | `bash` 能跑 `toybox` 的 `find`/`grep`（解锁 #23 的替代路径） | 会话中对二者各一次调用 |
| AC-07 | `grep` 返回 `<path>:<行号>: <内容>`，支持 `glob`/`ignoreCase`/`context`/`limit` | 会话中调用 + 结果形状核对 |
| AC-08 | `find` 按 glob 返回**文件**路径（含 `**`） | 会话中调用 |
| AC-09 | 二者均**无子进程**（设备上 `fd`/`rg` 仍不存在） | 报告 + 源码审查 |
| AC-10 | 上限与「跳过」在输出中可见 | 触发 limit/跳过的调用 |
| AC-11 | 应用仍能启动到「就绪」、会话可建、真实对话完成 | 部署后的 hilog + 会话 JSONL |
| AC-12 | 上游与补丁集零改动 | `git -C ../pi status`、`patches/` 内容 |
| AC-13 | 能力清单报告已追加修订节且**未删改**既有结论 | diff 审阅 |
| AC-14 | 代码评审完成且无未决 Critical/Important | `REVIEW_REPORT.md` |
| AC-15 | 提交信息符合 `git-commit` 技能的规范前缀 | `git log` |

## 6. 已知风险与本轮前置验证

| # | 风险 / 未知 | 状态 |
|---|---|---|
| R1 | 「常驻 shell + 哨兵行」是否真在本机可用？ | ✅ **已在本需求实现前实测**（应用域，`logs/20261012-1/T20-exec-protocol2.txt`）：基本命令 127 ms、`false`→rc=1、`(exit 7)` 不影响常驻 shell、stderr 合并、`cd` 语义、`no-such-cmd`→127、**toybox `find`/`grep` 均可用**、**顶层 `exit 3` 杀死 shell 后下一命令自动重启成功** |
| R2 | 顶层 `exit`/`exec` 会杀死常驻 shell | 已识别（R1 步骤 10）→ 由 FR-tool-008 的「死亡检测 + 自动重启」覆盖；并在文档中说明「shell 状态（变量/`cd`）不跨重启保留」 |
| R3 | 应用域看不到 `/data/local/tmp` | 已识别（R1 步骤 5）→ 由 FR-tool-009 的「每条命令 `cd` 到 `ctx.cwd`」覆盖 |
| R4 | 同名顶替是否真对内建生效 | ✅ 源码级证据（U1/U2）+ 上游自带例；**本需求在真机上再验一次**（AC-02…AC-06） |
| R5 | 输出串包（上一个命令的残留混入下一个） | 由 FR-tool-010「帧内清零缓冲 + 串行队列」覆盖；测试用例含连续命令 |
| R6 | 长命令把 UI 卡成黑箱 | 由 FR-tool-012 的 `onUpdate` 进度缓解（SHOULD） |
| R7 | 输出体量撑爆上下文 | 由 FR-tool-011 的上限 + 截断标注覆盖（沿用内建的量级） |
| C1 | **信任模型不因本需求改变**：顶替后的 `bash` 与既有 `bash` 一样**不被 pi 的文件审批覆盖**（#32 未处置） | 在报告修订节与技能中**显式重申**，避免读者误以为「修好了 bash = 有了沙箱」 |
