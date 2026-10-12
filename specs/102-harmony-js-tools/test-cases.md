# 102 — 鸿蒙环境能力补齐：纯 JS 工具插件（harmony-js-tools）测试用例与执行结果

> **Module:** harmony-js-tools ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **需求编号:** 102-harmony-js-tools ｜ **规格:** [`spec.md`](./spec.md)（FR-tool-001…027 / AC-01…15）
> **方案:** [`plan.md`](./plan.md) ｜ **任务:** [`tasks.md`](./tasks.md)
> **原始取证:** `logs/20261012-2/`（不入库）。图例：✅ 通过 ｜ ❌ 失败 ｜ ⬜ 未执行

## A. 机制前置验证（实现前）

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-01 | 常驻 shell + 哨兵行协议是否在本机成立 | 应用域起 `/system/bin/sh`，下发哨兵帧 | ✅ 基本命令 127 ms、`false`→rc=1、`(exit 7)` 不杀 shell、stderr 合并、`no-such-cmd`→127 | `T20-exec-protocol2.txt` |
| TC-02 | 顶层 `exit` 是否杀死常驻 shell | 帧内用**花括号组**跑 `exit 3` | ⚠️ **会杀**（识别出的设计风险）→ 改为**子 shell 括号组** | `T20-exec-protocol2.txt` 步骤 10 |
| TC-03 | 应用域能否访问 `/data/local/tmp` | 帧内 `cd /data/local/tmp` | ❌ 不存在（`No such file or directory`）→ 每条命令必须 `cd` 到会话目录 | `T20-exec-protocol2.txt` 步骤 5 |
| TC-04 | **最终帧**（子 shell 括号组）9 项边界 | `cd`/`exit 3`/stderr/多行/引号/`$((1+1))`/toybox find·grep | ✅ **9/9 通过**；`exit 3`→rc=3 **且 shell 存活**；9 条命令**只 spawn 1 次** | `T20-frame-final.txt` |

## B. 静态与单元（实现后）

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-10 | 两个扩展语法正确（ESM） | `node --check`（拷为 `.mjs`） | ✅ 双通过 | `T21-static.txt` |
| TC-11 | `harmony-search.js` 无子进程 | `grep child_process` | ✅ 零命中 | `T21-static.txt` |
| TC-12 | 两者只用 `node:` 内建模块 | 审查 import 行 | ✅ exec：`node:crypto`+`node:child_process`；search：`node:fs`+`node:path` | `T21-static.txt` |
| TC-13 | **grep/find 离线单元测试**（宿主侧，20 条断言） | 假 `pi` 捕获工具 → 真实文件树逐条断言 | ✅ **20 PASS / 0 FAIL**（含 `**`、`glob`、`ignoreCase`、`literal`、`context`、`limit`、超大文件跳过、非法正则/不存在路径抛错） | `T21-search-unit.txt` |
| TC-14 | 单元测试发现的两个真实缺陷 | ① `runGrep` 是 async 但调用未 `await`；② 单文件分支未给 match 附 `abs` | ✅ 均已修复并复测通过（**离线测试的价值证明**） | `T21-search-unit.txt` |

## C. 构建与投放

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-20 | `collect-pi` 把两个扩展打进包 | 检查 `pi-dist/resources/pi-agent/extensions/` | ✅ 4 个文件（exec / search / runtime / README）；pi-dist 文件数 27279 → **27281** | `T21-build.log` |
| TC-21 | `collect-app` 投放 | 脚本输出 | ✅ 9 文件 / 116.0 MB | `T21-build.log` |
| TC-22 | 签名构建 | `build-debug.ps1` | ✅ `BUILD SUCCESSFUL in 32 s 949 ms`；`pack.info` 仍 `0.11.1 / 1101`（**本需求未要求改版本号**） | `T21-build-hap.log` |
| TC-23 | 应用启动 + 扩展物化 | hilog | ✅ `解压完成：27281 个文件` + `壳资源物化完成：extensions 新增/覆盖 4 项` → 就绪 | `T22-hilog.txt` |
| TC-24 | 扩展内容落地正确（应用域读文件） | 读 `pi-agent/extensions/*.js` | ✅ `harmony-exec.js` 含 `__PI_BEGIN__`；`harmony-search.js` 含 `Pure-JavaScript implementation for this HarmonyOS build` | `T22-setup.txt` |
| TC-25 | 环境准备：工作区 + DeepSeek KEY | `POST /api/cwd/validate` / `api-key/deepseek` | ✅ 工作区 `pi-workspace-test`（13 项夹具树）；KEY `{success:true}`；`auth.json` `mode=0600`、`type=api_key`、脱敏 `sk-e32……a17f` | `T22-setup.txt` |

## D. 端到端：模型真实调用三个工具（**核心验收**）

方式：`POST /api/agent/new {cwd, type:"prompt", message:…}` 发起真实对话（`deepseek-flash`），
要求模型**逐步真实调用工具**，再从会话 JSONL 读回每次 `toolCall` 与 `toolResult`。

### D.1 第一轮（7 步）

| # | 工具调用 | 结果 | 判定 |
|---|---|---|---|
| 1 | `bash {command:"echo hello-from-ext; id \| head -1"}` | `hello-from-ext` + `uid=20020215(pci) … u:r:debug_hap:s0`，`isError=false`，**716 ms** | ✅ AC-02 |
| 2 | `bash {command:"false"}` | `(exit code 1)`，`isError=true`，**1006 ms** | ✅ AC-02（非零 rc 可见） |
| 3 | `bash {command:"echo ERR-LINE 1>&2; echo OUT-LINE; exit 4"}` | `ERR-LINE`+`OUT-LINE`（**stderr 已合并**）+ `(exit code 4)`，`isError=true`，971 ms | ✅ AC-03 |
| 4 | `bash {command:"exit 3"}` | `(exit code 3)`，`isError=true`，763 ms | ✅ 顶层 `exit` 如实返回 rc |
| 5 | `bash {command:"echo after-exit-ok"}` | `after-exit-ok`，`isError=false`，742 ms | ✅ **AC-05：上一步的 `exit` 没有杀死常驻 shell** |
| 6 | `grep {pattern:"hello"}` | `hello.txt:1`、`docs/readme.md:3`、`src/app.js:1,2`、`src/lib/util.js:1`、`src/deep/nested/leaf.js:1`；**未命中 `node_modules/skipme.txt` 与 `.hidden/secret.txt`**；`(5 files scanned)`，468 ms | ✅ AC-07 + **FR-tool-017 跳过规则** |
| 7 | `find {pattern:"**/*.js"}` | `src/app.js`、`src/lib/util.js`、`src/deep/nested/leaf.js`，615 ms | ✅ AC-08（`**` 递归） |
| 8 | 模型最终总结 | `stop`，2569 ms | ✅ AC-11 |

> **无一挂起**：8 次模型往返全部 ≤ 2.6 s（内建 `bash` 在此场景会**永久挂住**）→ 明确证明
> **同名顶替生效**（AC-01/R4）。证据：`T23-e2e-session.json`。

### D.2 第二轮（9 步，覆盖超时/toybox/选项/上限）

| # | 工具调用 | 结果 | 判定 |
|---|---|---|---|
| 1 | `bash {command:"sleep 30", timeout:3}` | `[命令超时，常驻 shell 已重置（下一条命令会自动重启它）]`，`isError=true` | ✅ AC-04 / FR-tool-007 |
| 2 | `bash {command:"echo after-timeout-ok"}` | `after-timeout-ok`，`isError=false` | ✅ **AC-05：超时重置后自动重启并继续工作** |
| 3 | `bash {command:"toybox find . -maxdepth 2 -name \"*.js\""}` | `./src/app.js` | ✅ AC-06（解锁 #23 的 toybox 路径） |
| 4 | `bash {command:"grep -rn hello src"}` | `src/app.js:1`、`src/app.js:2`、`src/lib/util.js:1`、`src/deep/nested/leaf.js:1` | ✅ AC-06 |
| 5 | `grep {pattern:"hello", glob:"**/*.js"}` | 仅 4 条 .js 命中 + `(已按 glob "**/*.js" 过滤文件; 5 files scanned)` | ✅ AC-07（`glob`） |
| 6 | `grep {pattern:"hello", limit:1}` | 1 条 + `(已达匹配上限 limit=1，可能还有更多结果; …)` | ✅ AC-10（上限可见） |
| 7 | `grep {pattern:"HELLO", ignoreCase:true}` | 命中 `hello.txt:3: HELLO upper`（默认大小写敏感时**不**命中） | ✅ AC-07（`ignoreCase`） |
| 8 | `grep {pattern:"readme", context:1}` | `docs/readme.md:1: # readme` + `docs/readme.md-2- `（上下文行用 `-` 分隔） | ✅ AC-07（`context`） |
| 9 | `find {pattern:"*.js", limit:1}` | 1 条 + `(已达结果上限 limit=1，可能还有更多文件; …)` | ✅ AC-08/AC-10 |
| 10 | 模型最终总结 | `stop`，4344 ms | ✅ |

**并发串行化（FR-tool-010 的硬证据）**：第 3、4 步是**同一个 assistant 回合里的两个并发 `bash` 调用**，
第 5–9 步是**同一回合里的 5 个并发调用** —— 每个调用都拿回了**各自正确、互不串扰**的输出
（`toybox find` 只回 `./src/app.js`，`grep -rn` 只回它的 4 条）。→ 队列串行 + 帧内清零缓冲有效。
证据：`T23-e2e-round2.json`。

## E. 不回归与边界

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-40 | 应用仍能启动到「就绪」 | hilog 六项 | ✅ 全部出现（解压 → 进程内 Next → `227ms` 零下载 → `[ready] 200` → 加载 UI → 首屏 → 就绪） | `T22-hilog.txt` |
| TC-41 | 会话可建、真实模型对话可完成 | 两轮对话各 `stop` 收尾 | ✅ | `T23-e2e-*` |
| TC-42 | 内建 `read`/`ls` 未被影响 | 本轮未覆盖（未改造它们）；由源码审查确认只注册 `bash`/`grep`/`find` 三个名字 | ✅（审查） | `extensions/*.js` |
| TC-43 | 上游与补丁集零改动（AC-12） | `git -C ../pi status`、`git -C ../pi-web status`、`patches/` 内容 | ✅ 两者工作树干净；`patches/` 仍只有 `README.md` | `T24-scope.txt` |
| TC-44 | 设备上 `fd`/`rg` 仍不存在（说明确实没用外部二进制） | 由上一轮报告 #18/#19 结论 + 本轮零 `child_process`（search） | ✅ | `T21-static.txt` |

## F. 未测 / 不做（诚实标注）

| 项 | 说明 |
|---|---|
| 输出 256 KiB 截断路径 | 未构造 >256 KiB 的命令输出（`MAX_OUTPUT_BYTES` 分支未在真机或单测触发；逻辑已改为按 UTF-8 字节且不切多字节字符） |
| `MAX_FILES 2000` / `MAX_FILE_BYTES 512KiB` / `MAX_DEPTH 8` 触顶 | **`MAX_DEPTH` 与超大文件已在宿主侧单测覆盖**（第 9 段目录不遍历、>512 KiB 跳过并计数）；`MAX_FILES 2000` 与 256 KiB 输出未构造相应规模 |
| 命令被外部 `SIGKILL` 导致 shell 死亡 | 未构造（`exit` / 超时两条死亡/重置路径已覆盖）；`died` 分支保留 `describeFailure` 文案 |
| 文件操作工具 / 命令围栏 / 进程内 JS | **本轮明确不做**（spec FR-tool-025…027），登记为可选后续 |
| 真实 MCP 服务器 | 只证到「stdio 上 JSON-RPC 往返成立」（`T25`/`T34` 步骤 E1）；`config/mcp.json` 为空，未接真实服务器 |

## G. 代码评审修复轮（round 2：`requesting` / `receiving-code-review`）

评审发现 **1 Critical + 5 Important + 11 Minor**（全文 `logs/20261012-2/REVIEW_REPORT.md`），全部处置后
**重跑流水线 → 重装 → 重设环境 → 重新端到端验证**（`docs/真机验证记录.md` 轮次 3b）。

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-50 | 宿主侧回归测试可复现 | 新增 `scripts/test-harmony-tools.mjs`（假 `pi` + 夹具树） | ✅ **33 PASS / 0 FAIL**（覆盖 `limit` 目录/单文件两种情形、单行截断、`{a,b}`、`[0-9]`、智能大小写、深度、超大文件、非法 glob/正则、路径错误） | `T35-unit.txt` |
| TC-51 | C1：旧 shell 的迟到 `end` 不误杀新 shell | 真机：超时重置后连续调用 | ✅ 下一条命令正常返回；无「shell 意外退出」误报 | `T30-e2e-round3.txt` 第 3 步 |
| TC-52 | I1：超时仍返回已产出的输出 | 真机：`echo START; sleep 20` + `timeout:2` | ✅ 正文含 `START`（修复前为空） | 同上第 2 步 |
| TC-53 | I2：被杀命令的子进程不污染后续结果 | 真机：`sleep 20; echo LATE-LEAK` + `timeout:3`，随后 `clean-1` 与 `sleep 26; echo clean-2-final` | ✅ 两次后续输出**均无 `LATE-LEAK`** | 同上第 4–6 步 |
| TC-54 | M5：读 stdin 的命令立即返回 | 真机：`bash {command:"cat"}` | ✅ 立即返回、空输出（修复前会挂到超时，且能读到帧尾 token） | 同上第 1 步 |
| TC-55 | 哨兵行不得回显给模型（**本轮新发现**） | 真机：超时路径正文 | ✅ 修复后超时正文只有 `START`，无 `__PI_BEGIN__ <tok>` | 同上第 2 步 |
| TC-56 | I4 + M8：单文件 `limit` 触顶可见、计数措辞正确 | 真机：`grep {pattern:e, path:src/app.js, limit:1}` | ✅ `已达匹配上限 limit=1…; 1 files read` | 同上第 7 步 |
| TC-57 | M7：花括号 glob | 真机：`find {pattern:"**/*.{js,txt}"}` | ✅ 命中 `hello.txt` + 3 个 `.js` | 同上第 8 步 |
| TC-58 | 修复后不回归 | 能力复测：`rg`/`fd` 仍缺、toybox 可达、MCP stdio 往返、常驻 shell 存活；应用启动就绪、会话可建、真实对话完成 | ✅ 全绿 | `T34-reprobe-r3.txt`、`T30-e2e-round3.json` |
