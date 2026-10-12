# 101 — 版本更新：0.11.1（version）任务拆解

> **Module:** version ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **需求编号:** 101-version-0.11.1 ｜ **上游基线:** pi v1.1.0 · pi-web v0.11.1
> **规格依据:** [`spec.md`](./spec.md) ｜ **方案依据:** [`plan.md`](./plan.md)
> **日志目录:** `logs/20261012-1/`

## 依赖关系

```
T01 ─┬─ T02 ─ T03 ─┐
     └─ T04 ───────┴─ T05 ─ T06 ─ T07 ─┬─ T08 ─ T09 ─┐
                                        └─ T10 ───────┴─ T11 ─ T12 ─ T13
```

- T01（锚定）是一切的前提。
- T02（清理）与 T04（版本号）互不依赖，但都必须在 T05 之前完成。
- T03（补丁评估）依赖 T02（清理后才能确认工作树状态）。
- T08/T09（基本功能）与 T10（能力复测）都依赖 T07（部署成功），可并行取材但**同一设备**上建议串行。
- T11（报告）依赖 T10；T12（评审）依赖 T03/T04/T05 的产物；T13（提交）最后。

## 任务清单

### T01 — 上游基线锚定核对

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-001、FR-ver-002、FR-ver-003；AC-01、AC-02 |
| 动作 | ① `pi` 与 `pi-web`：`git rev-parse <tag>` / `git rev-parse <tag>^{commit}`、`git log -1`、`git status --short`、`git branch --show-current`；② 记录**执行前**与**执行后**全部分支列表快照（本工程 + 上游）到 `logs/20261012-1/branches-before.txt` 与 `branches-after.txt` |
| 完成判据 | tag↔commit↔分支一致；上游工作树干净；分支快照落盘 |
| 产出 | `logs/20261012-1/T01-anchor.txt`（含分支快照段）、`branches-before.txt`、`branches-after.txt` |

### T02 — 清理中间文件 / 临时文件

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-004、FR-ver-005、FR-ver-006；AC-03 |
| 动作 | 按 `plan.md` D4 的「删」清单逐项删除，逐项打印「命中 / 未命中」；**不删**「不删」清单 |
| 完成判据 | 清单命中情况落盘；`git status --short` 无非预期变更（不得出现 deleted 交付物） |
| 产出 | `logs/20261012-1/T02-clean.txt` |
| 风险 | R-f（清理过度）→ 立即 `git status` 复核 |

### T03 — 补丁集评估

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-007、FR-ver-008；AC-04 |
| 动作 | 逐条复核 `patches/README.md` 的 **8 个候选**（7 条原有 + 1 条本轮新增：`pi` 的 `bash` 工具等待子进程结束）；用 `grep`/读源码给每条「上游文件路径」证据；结论写回 `patches/README.md` 新增节 `## v0.11.1 基线复核（2026-10-12）` |
| 完成判据 | **8 条候选**逐条有「需要 / 不需要 + 依据」；全部不需要则**不建** `patches/v0.11.1/`（候选 8 为「需要处置、按 R14 首选零补丁路线本轮不补」） |
| 产出 | `patches/README.md`（更新） |

### T04 — 版本号 0.1.0 → 0.11.1

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-009、FR-ver-010、FR-ver-011；AC-05 |
| 动作 | ① `AppScope/app.json5`：`versionName = "0.11.1"`、`versionCode = 1101`，加注释写明公式 `major*10000 + minor*100 + patch`；② `README.md` 版本行 → `0.11.1`（并去掉「规划阶段，未构建」的口径，改为已构建已真机验证）；③ `docs/工程规划.md` 文档头/版本表同步；④ `specs/README.md` 相关行同步 |
| 完成判据 | `grep -rn "0\.1\.0"` 仅命中**历史记录**（`docs/真机验证记录.md` 轮次 0/1 的当时值）与**流程图/示例**，且每处都能解释；`versionCode = 1101 > 1000` |
| 产出 | 改动文件 + `logs/20261012-1/T04-version.txt` |

### T05 — 全流水线重新构建

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-012、FR-ver-013；AC-06、AC-07 |
| 动作 | ① `node scripts/collect-runtime.mjs`；② `node scripts/prepare-next.mjs --node <scratch>/node-v22.17.0-win-x64/node.exe`；③ `<node22> scripts/smoke-node22.mjs`；④ 用同一 node22 `node scripts/collect-pi.mjs`；⑤ `node scripts/collect-app.mjs`；⑥ `powershell -ExecutionPolicy Bypass -File scripts/build-debug.ps1` |
| 完成判据 | ①守卫全 PASS；②BUILD 成功；③**0 FAIL**；④tar + SHA-256 marker；⑤resfile 投放完成；⑥`BUILD SUCCESSFUL` + 签名断言（Profile `type=debug`）通过 |
| 产出 | `logs/20261012-1/T05-*.log` + `electron/build/default/outputs/default/electron-default-signed.hap` |
| 风险 | R-a（运行时归档缺失）、R-b（npm 网络） |

### T06 — 真机部署

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-014；AC-08 |
| 动作 | `hdc -t <key> uninstall org.fellow99.pi.PiDesktop` → `cd` 到产物目录 → `hdc -t <key> app install electron-default-signed.hap`（相对路径）→ `hdc -t <key> shell "aa start -a EntryAbility -b org.fellow99.pi.PiDesktop"` |
| 完成判据 | 安装输出 `install bundle successfully`；`aa start` 成功返回 |
| 产出 | `logs/20261012-1/T06-install.txt` |
| 风险 | R-e（hdc 重试）、无 BOM 的幂等重试 |

### T07 — 启动取证（含 SWC 落点）

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-015、FR-ver-016；AC-08 |
| 动作 | 启动后 ≥60 s 内抓 `hilog -x`，检索并落盘这些行：`解压完成：N 个文件`、`Next 入口`、`启动 Next 服务器（进程内`、`PI_WEB_HOSTNAME`、`Running next.config.ts`、`[ready] 第 1 次探测通过`、`加载 Pi Web UI`、`首屏完成`；另用 `ls` 确认 `pi-dist/node_modules/next/wasm/@next/swc-wasm-nodejs/` 存在且 `files/tmp/next-swc` **不存在** |
| 完成判据 | 全部关键行出现；SWC 落点为正、下载缓存不存在 |
| 产出 | `logs/20261012-1/T07-hilog.txt`、`T07-swc.txt` |

### T08 — 基本功能：DeepSeek API KEY + 工作区

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-017、FR-ver-018；AC-09、AC-10 |
| 动作 | ① 在 UI「设置 → 模型」写入 DeepSeek API KEY（或同源 `fetch` 保存路由）；② 回读沙箱内配置文件确认存在该 provider/KEY（**输出脱敏**，只留前后各 6 字符）；③ 创建工作区目录 `/data/storage/el2/base/files/pi-workspace-test` 并通过 pi-web 的目录选择/`default-cwd` 路由设为工作区；④ `hdc shell ls -la` 验证目录真实存在 |
| 完成判据 | 配置回读命中；工作区目录存在且被应用认作 cwd |
| 产出 | `logs/20261012-1/T08-*.txt` |
| 风险 | 无鼠标注入能力 → 走同源 API 兜底（须在报告中注明取证通道） |

### T09 — 基本功能：一次对话

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-019、FR-ver-020；AC-11 |
| 动作 | ① `POST /api/agent/new` 建会话；② 发提示词「介绍一下你自己」；③ 消费 SSE 至结束（同一条命令内完成）；④ 读回助手回复文本；⑤ 读取沙箱内会话 JSONL 片段（只读、脱敏）；⑥ 若失败，按根因分层记缺陷 |
| 完成判据 | 助手回复文本非空且语义合理；JSONL 落盘 |
| 产出 | `logs/20261012-1/T09-dialog.txt`（**不得**落盘 API KEY 明文） |

### T10 — 鸿蒙环境能力复测

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-021、FR-ver-022、FR-ver-023；AC-12 |
| 动作 | 按 `test-cases.md` 的能力项清单（源自 `dsh-desktop-hos/docs/鸿蒙环境能力清单-v0.1.5.md` 与 `toybox命令清单.md`）在设备上逐项执行，记录**原样输出** |
| 完成判据 | 每项有结论（✅/⚠️/❌ + 原因）；toybox 命令逐项有判定 |
| 产出 | `logs/20261012-1/` 下的 `T10-env-toybox.txt`、`T10-toybox-applets.txt`、`T10-toybox-links.txt`、`T10-toybox-analysis.txt`、`T10-sysbin-listing.txt`、`T10-appdomain-fs.txt`、`T10-spawn.txt`、`T10-node-subprocess.txt`、`T10-background.txt`、`T10-0-reboot.txt`、`T10-0-hilog-second-start.txt`、`T10-review-probe-shell.txt`、`T10-crash-evidence.txt`、`T10-restart-window.txt` |
| 风险 | Git-Bash 路径改写 → 全程 `MSYS_NO_PATHCONV=1` |

### T11 — 能力报告落盘

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-024、FR-ver-025；AC-12 |
| 动作 | 写 `docs/鸿蒙环境能力清单-v0.11.1.md`，结构同构于 `v0.1.5`；含本工程独有差异节 |
| 完成判据 | 文件存在；章节结构可与 v0.1.5 对齐；逐项结论齐备 |
| 产出 | `docs/鸿蒙环境能力清单-v0.11.1.md` |

### T12 — 代码评审

| 项 | 内容 |
|---|---|
| 回引 | AC-13 |
| 动作 | ① 按 `requesting-code-review` 技能，取 `base..head` SHA 派发 reviewer（产物：`Critical/Important/Minor` 分级）；② 落盘 `logs/20261012-1/REVIEW_REPORT.md`；③ 按 `receiving-code-review` 技能逐条**验证→评估→处置**，Critical/Important 修完后复验 |
| 完成判据 | 无未决 Critical / Important |
| 产出 | `REVIEW_REPORT.md` + 修复提交 |

### T13 — 提交

| 项 | 内容 |
|---|---|
| 回引 | AC-14 |
| 动作 | 加载 `git-commit` 技能，按**该技能规定的 type/scope 前缀**提交（Conventional Commits）；分阶段提交，禁止使用其它前缀 |
| 完成判据 | `git log` 中本需求提交均符合技能前缀；工作树干净 |
| 产出 | commits |

## 里程碑

| 里程碑 | 含任务 | 判定 |
|---|---|---|
| M1 静态收敛 | T01–T04 | AC-01…AC-05 全绿 |
| M2 构建可用 | T05–T07 | AC-06…AC-08 全绿 |
| M3 功能可用 | T08–T09 | AC-09…AC-11 全绿 |
| M4 交付完成 | T10–T13 | AC-12…AC-14 全绿 |
