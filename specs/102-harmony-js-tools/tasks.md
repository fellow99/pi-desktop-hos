# 102 — 鸿蒙环境能力补齐：纯 JS 工具插件（harmony-js-tools）任务拆解

> **Module:** harmony-js-tools ｜ **Status:** Done（已交付；含代码评审修复轮）｜ **Last Updated:** 2026-10-12
> **需求编号:** 102-harmony-js-tools ｜ **规格:** [`spec.md`](./spec.md) ｜ **方案:** [`plan.md`](./plan.md)
> **日志目录:** `logs/20261012-2/`（当天序号 2）

## 依赖关系

```
T01(前置验证) ─┬─ T02(规范) ─ T03(exec) ─┐
               └──────────────── T04(search)┴─ T05(文档) ─ T06(构建)
                                                              │
                                        T10(评审/提交) ─ T09(端到端) ─ T08(部署) ─ T07(静态检查)
```

- T01（前置验证）已在规格阶段**提前完成**（`T20-exec-protocol2.txt`）。
- T03/T04 可并行编写但**同一份 git 工作树**，故串行落地。

## 任务清单

### T01 — 机制前置验证（已完成）

| 项 | 内容 |
|---|---|
| 回引 | spec §6 R1；FR-tool-004/005/006/008/009 |
| 动作 | 在**应用域**用 CDP 起常驻 `/system/bin/sh`，实测：基本命令、非零 rc、子 shell `exit` 隔离、stderr 合并、`cd` 语义、命令不存在、toybox `find`/`grep`、**顶层 `exit` 杀 shell + 自动重启** |
| 结论 | ✅ 全部通过；识别出 3 条必须覆盖的边界（顶层 `exit` 杀 shell、应用域无 `/data/local/tmp`、`stdout end` 是唯一存活信号） |
| 产出 | `logs/20261012-2/T20-exec-protocol2.txt` |

### T02 — 规格四件套

| 项 | 内容 |
|---|---|
| 回引 | — |
| 动作 | 写 `spec.md`（27 条 FR + 15 条 AC）+ `plan.md`（D1–D10）+ `tasks.md` + `test-cases.md` |
| 产出 | `specs/102-harmony-js-tools/` |

### T03 — 实现 `extensions/harmony-exec.js`（顶替 `bash`）

| 项 | 内容 |
|---|---|
| 回引 | FR-tool-001…012、020、021 |
| 动作 | TypeBox schema 与内建兼容；常驻 shell 惰性启动；帧协议（BEGIN/END + 随机 token）；串行队列；死亡检测（`stdout end` / EPIPE）+ 重启；默认 120 s 超时 + 排干；输出 256 KiB 截断标注；`onUpdate` 节流进度；非零 rc → 可见；`session_shutdown` 幂等释放 |
| 完成判据 | `node --check` 通过；源码审查无上游 import、工厂内零长驻资源 |
| 产出 | `extensions/harmony-exec.js` |

### T04 — 实现 `extensions/harmony-search.js`（顶替 `grep` + `find`）

| 项 | 内容 |
|---|---|
| 回引 | FR-tool-013…019、020、021 |
| 动作 | 共用迭代式 BFS；`grep`（`pattern`/`path`/`glob`/`ignoreCase`/`literal`/`context`/`limit=100`，输出 `<path>:<n>: <line>`）；`find`（`pattern`/`path`/`limit=1000`，只返回文件）；跳过点目录与 `node_modules`/`.git`（显式根除外）；五重上限且触顶可见；**无任何子进程** |
| 完成判据 | `node --check` 通过；审查确认零 `child_process` |
| 产出 | `extensions/harmony-search.js` |

### T05 — 文档同步

| 项 | 内容 |
|---|---|
| 回引 | FR-tool-024 |
| 动作 | ① `extensions/README.md` 目录表补两行 + 机制说明；② `skills/harmony-runtime-capabilities/SKILL.md` 把 `bash`/`grep`/`find` 从「不可用/会挂住」改为「已由壳扩展提供」并写明差异与限制；③ `docs/鸿蒙环境能力清单-v0.11.1.md` **追加修订节**（不删改既有结论） |
| 完成判据 | 三处口径一致；报告既有结论未被删改 |
| 产出 | 三个文件的 diff |

### T06 — 构建

| 项 | 内容 |
|---|---|
| 回引 | FR-tool-022/023 |
| 动作 | `collect-pi` → `collect-app` → `build-debug`（版本号不变，仍 0.11.1） |
| 完成判据 | 三个阶段全绿；`pack.info` 仍为 `0.11.1/1101` |
| 产出 | `logs/20261012-2/T21-build.log` |

### T07 — 静态与投放核对

| 项 | 内容 |
|---|---|
| 回引 | AC-01、AC-09 |
| 动作 | `node --check` 两个文件；确认 `pi-dist/resources/pi-agent/extensions/` 内出现两个新文件 |
| 产出 | `logs/20261012-2/T21-static.txt` |

### T08 — 真机部署 + 环境准备

| 项 | 内容 |
|---|---|
| 回引 | AC-11 |
| 动作 | 卸载 → 安装 → 启动到「就绪」；应用域设 **DeepSeek API KEY**；**创建工作区**（沙箱内测试目录）；核对扩展已物化到 `<userData>/pi-agent/extensions/` |
| 完成判据 | hilog 六项齐备；KEY 落盘 `auth.json`（`mode=0600`）；工作区目录存在并被识别 |
| 产出 | `logs/20261012-2/T22-*.txt` |

### T09 — 端到端验证（模型真实调用三个工具）

| 项 | 内容 |
|---|---|
| 回引 | AC-02…AC-08、AC-10 |
| 动作 | 用真实对话让模型依次调用 `bash`（echo/id、`false`、stderr+exit 4、`exit 3` 后重启、toybox find/grep）、`grep`（含 `glob`/`context`/limit 触顶）、`find`（含 `**`）；从会话 JSONL 读回 `toolResult` 与 `durationMs` |
| 完成判据 | 每条断言有工具结果证据；`durationMs` 全部有限（无挂起） |
| 产出 | `logs/20261012-2/T23-*.txt` |

### T10 — 代码评审与提交

| 项 | 内容 |
|---|---|
| 回引 | AC-14、AC-15 |
| 动作 | `requesting-code-review` 派发 → `receiving-code-review` 处置 → 落 `REVIEW_REPORT.md`；按 `git-commit` 规范前缀提交 |
| 完成判据 | 无未决 Critical/Important；提交前缀合规 |
| 产出 | `logs/20261012-2/REVIEW_REPORT.md` + commits |

## 里程碑

| 里程碑 | 含任务 | 判定 |
|---|---|---|
| M1 机制可用 | T01–T04 | 两个扩展通过语法检查，源码审查合格 |
| M2 随包可用 | T05–T07 | 构建全绿且扩展已进包 |
| M3 真机可用 | T08–T09 | 模型实际调用三个工具均成功（含边界用例） |
| M4 交付 | T10 | 评审关闭 + 提交合规 |

## 执行记录（收口）

| 任务 | 状态 | 证据 |
|---|---|---|
| T01 机制前置验证 | ✅ | `logs/20261012-2/T20-exec-protocol2.txt`、`T20-frame-final.txt` |
| T02 规格四件套 | ✅ | 本目录 4 份文档 |
| T03 `harmony-exec.js` | ✅ | 源码 + `T26-static.txt`（`node --check` / 零上游 import） |
| T04 `harmony-search.js` | ✅ | 源码 + `T35-unit.txt`（33 PASS） |
| T05 文档同步 | ✅ | `extensions/README.md`、`skills/harmony-runtime-capabilities/SKILL.md`、能力清单 **REV-1** |
| T06 构建 | ✅ | `T21-build.log`、`T21-build-hap.log`；评审修复后重跑 `T31-*` |
| T07 静态与投放核对 | ✅ | `T26-static.txt`、`T24-scope.txt`（上游 0 改动 / `patches/` 0 条） |
| T08 真机部署 + 环境准备 | ✅ | `T28-deploy.txt`、`T29-setup-r2.txt`；修复后 `T32-deploy.txt`、`T33-setup-r3.txt` |
| T09 端到端验证 | ✅ | `T23-e2e-*`（草稿轮 16 次调用）、**`T30-e2e-round3.*`（修复后 8 步，断言全过）** |
| T10 代码评审与提交 | ✅ | `logs/20261012-2/REVIEW_REPORT.md`（1 Critical + 5 Important + 11 Minor 全部处置）+ 按 `git-commit` 规范提交 |

**评审修复轮额外产出**：宿主侧可复现单测 `scripts/test-harmony-tools.mjs`（33 断言）；
真机轮次 3b 复验（`docs/真机验证记录.md`）；能力清单 **REV-1.6**；本轮新发现的第 7 个缺陷
（超时路径回显 `__PI_BEGIN__` 哨兵行）已修复并复验。
