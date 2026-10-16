# 101 — 版本更新：0.12.1（version）任务拆解

> **Module:** version ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-15
> **需求编号:** 101-version-0.12.1 ｜ **上游基线:** pi v1.2.0 · pi-web v0.12.1
> **规格依据:** [`spec.md`](./spec.md) ｜ **方案依据:** [`plan.md`](./plan.md)
> **日志目录:** `logs/20261015-1/`

## 依赖关系

```
T01 ─┬─ T02 ─ T03 ─┐
     └─ T04 ───────┴─ T05 ─ T06 ─ T07 ─┬─ T08 ─ T09 ─┐
                                        └─ T10 ───────┴─ T11 ─ T12 ─ T13
```

- T01（锚定）是一切的前提：未确认 tag↔commit↔分支一致，后续补丁再生与「基于 tag」结论都不成立。
- T02（清理）与 T04（版本号）互不依赖，但都必须在 T05 之前完成。
- T03（补丁再评估 + 再生成）依赖 T02（清理后才能确认工作树状态）；其改动的 `patches/v0.12.1/` 与 `PI_WEB_PATCH_TAG` 是 T05 阶段 ② `prepare-next` 的输入，故 T03 必须先于 T05 完成。
- T05（全流水线）是 T06 的前提；T06→T07 串行（先装后取证）。
- T08/T09（基本功能）与 T10（能力复测）都依赖 T07（部署成功），可并行取材但**同一设备**上建议串行。
- T11（报告）依赖 T10；T12（评审）依赖 T03/T04/T05 的产物；T13（提交 + tag）最后。

## 任务清单

### T01 — 上游基线锚定核对

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-001、FR-ver-002、FR-ver-003；AC-01、AC-02 |
| 动作 | ① `pi`：`git -C ../pi cat-file -t v1.2.0`（期望 `commit`，**轻量标签**）/ `git -C ../pi rev-parse v1.2.0^{commit}`（期望 `06a466935536f8c9bcacb2d5efc0fc021be1bdff`）/ `git -C ../pi branch --show-current`（期望 `Branch_v1.2.0`）/ `git -C ../pi log -1 --format=%H` / `git -C ../pi status --porcelain`；② `pi-web`：`git -C ../pi-web cat-file -t v0.12.1`（期望 `tag`，**带注释标签**）/ `git -C ../pi-web rev-parse v0.12.1^{commit}`（期望 `f83b1a502f8e434555a7153fe08e1c135dd65ca9`，`Release v0.12.1`）/ 与 `Branch_v0.12.1` HEAD 比对 / `git -C ../pi-web status --porcelain`；③ 记录**执行前**与**执行后**全部分支列表快照（本工程 + 上游）到 `logs/20261015-1/branches-before.txt` 与 `branches-after.txt` |
| 完成判据 | tag↔commit↔分支三者一致（并核对标签类型：`pi` 轻量、`pi-web` 带注释）；两个上游工作树干净；分支前后快照落盘且可对比 |
| 产出 | `logs/20261015-1/T01-anchor.txt`（含分支快照段）、`branches-before.txt`、`branches-after.txt` |

### T02 — 清理中间文件 / 临时文件

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-005、FR-ver-006、FR-ver-007；AC-03 |
| 动作 | 按 `plan.md` D4 的「删」清单逐项删除并逐项打印「命中 / 未命中」：`electron/build/`、`web_engine/build/`、`.hvigor/`、`pi-dist/`、`pi-dist.tar.gz`、`pi-dist.version`、`.collect-pi-tmp/`、`.collect-runtime-tmp/`、`runtime/`、`electron/libs/`、`web_engine/src/main/resources/resfile/resources/app/pi-dist.*`。**不删**「不删」清单（源码 / 配置 / 文档 / `patches/` / `runtime-overlays/` / `config/` / `extensions/` / `skills/` / `specs/` / `docs/` / `scripts/`）与 **`logs/` 历史轮次**（`20261012-*`、`20261014-*`、`20261015-crash` 保留） |
| 完成判据 | 清单命中情况落盘；`git status --short` 无非预期变更（不得出现 deleted 交付物） |
| 产出 | `logs/20261015-1/T02-clean.txt` |
| 风险 | R-f（清理过度删到交付物）→ 清理后**立即** `git status` 复核 |

### T03 — 补丁集重新评估 + 重新生成（`patches/v0.12.1/`）

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-004、FR-ver-008、FR-ver-009、FR-ver-010、FR-ver-011、FR-ver-012；AC-04 |
| 动作 | ① 逐条复核 `patches/README.md` 已登记候选（1–7）与本轮新候选，每条给「需要 / 不需要 + 依据（上游文件级证据）」；② 对确需保留的两条（`P203-1`、`PFIX-1`）：`git -C ../pi-web worktree add --detach <scratch>/pw-v0.12.1 v0.12.1` → 应用 `patches/v0.11.1/000N-*.patch` → `git add -A -- <受影响文件列表>` → `git diff --cached > patches/v0.12.1/000N-*.patch`（**不含 lockfile、不含二进制、UTF-8/LF**）→ `git reset --hard` 回 pristine；③ 在 pristine v0.12.1 上 `git apply --check` + 语义守卫（`lib/directory-browser.ts` 含 `WORKSPACE_ROOTS_ENV`；`app/api/sessions/[id]/export/route.ts` 含 `existsSync(process.execPath)`）；④ 改 `scripts/prepare-next.mjs` 的 `PI_WEB_PATCH_TAG`（`:239`）从 `'v0.11.1'` → `'v0.12.1'`；⑤ 收尾 `git -C ../pi-web worktree remove --force <scratch>/pw-v0.12.1`；⑥ 把评估与再生成结论写回 `patches/README.md`（新增 `## v0.12.1 基线复核（2026-10-15）` 节 + §0 登记两条补丁的新 tag 目录），`patches/v0.11.1/` 保留可追溯 |
| 完成判据 | 候选逐条有「需要 / 不需要 + 依据」；`patches/v0.12.1/0001-workspace-picker-roots.patch`、`patches/v0.12.1/0002-session-export-in-process-fallback.patch` 在 pristine v0.12.1 上 `--check` 通过；两名语义守卫命中；临时 worktree 已移除且 `../pi-web` 仍 pristine（工作树零改动）；`PI_WEB_PATCH_TAG === 'v0.12.1'` |
| 产出 | `patches/v0.12.1/0001-workspace-picker-roots.patch`、`patches/v0.12.1/0002-session-export-in-process-fallback.patch`、`patches/README.md`（更新）、`scripts/prepare-next.mjs`（改常量）、`logs/20261015-1/T03-patches.txt` |
| 风险 | R-b（上游 v0.12.1 改动面大：194 文件 / +4916 −7287）→ 三断言 + 语义守卫；常驻临时 worktree 残留 → 收尾强制 `worktree remove --force` |

### T04 — 版本号 0.11.1 → 0.12.1

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-013、FR-ver-014、FR-ver-015、FR-ver-016；AC-05 |
| 动作 | ① `AppScope/app.json5`：`versionName = "0.12.1"`、`versionCode = 1201`，注释写明公式 `major*10000 + minor*100 + patch`（`0.12.1 -> 0*10000 + 12*100 + 1 = 1201`）；② `src-main/package.json`：`version: 0.12.1`；③ `README.md` / `README_zh.md`：版本行 + 上游基线行（`pi v1.2.0` / `pi-web v0.12.1`）+ specs 表新增 101 行 + 能力清单链接改指 `v0.12.1`；④ `docs/工程规划.md`：文档头与 §11 相关行；⑤ `specs/README.md`：技术栈行 + §六/§七编号一览增行 |
| 完成判据 | `versionName == "0.12.1"` 且 `versionCode == 1201`（**严格大于** 1101）；`git grep "0\.11\.1"` 仅命中**可解释的历史/说明性出现**（`docs/真机验证记录.md` 历史轮次那当时值、`specs/101-version-0.11.1/*`、`patches/v0.11.1/` 登记），无「应为 0.12.1 却残留 0.11.1」的对外可见处 |
| 产出 | 上述改动文件 + `logs/20261015-1/T04-version.txt` |

### T05 — 全流水线重新构建（4 阶段）

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-017、FR-ver-018、FR-ver-021；AC-06、AC-07 |
| 动作 | ① `node scripts/collect-runtime.mjs`；② `node scripts/prepare-next.mjs --node <scratch>/node-v22.17.0-win-x64/node.exe`（**必须 Node 22.17.0**，系统 Node 24.7.0 不可用于构建）；③ `<node22> scripts/smoke-node22.mjs`；④ 用同一 node22 `node scripts/collect-pi.mjs`；⑤ `node scripts/collect-app.mjs`；⑥ `powershell -ExecutionPolicy Bypass -File scripts/build-debug.ps1` |
| 完成判据 | ①守卫全 PASS；②BUILD 成功且 `patches/v0.12.1/` 的「应用 → 反向 → SHA-256 还原」断言通过；③**0 FAIL**；④tar + SHA-256 marker；⑤resfile 投放完成；⑥`BUILD SUCCESSFUL` + 脚本自带签名断言通过（Profile `type=debug`，release 签名包无法侧载） |
| 产出 | `logs/20261015-1/T05-1-collect-runtime.log`、`T05-2-prepare-next.log`、`T05-3-smoke.log`、`T05-4-collect-pi.log`、`T05-5-collect-app.log`、`T05-6-build-debug.log` + `electron/build/default/outputs/default/electron-default-signed.hap` |
| 风险 | R-a（构建机缺 Node 22.17.0 → 先投放 `node-v22.17.0-win-x64` 到 scratch）、R-b（npm 网络 / 上游大改） |

### T06 — 真机部署（卸载 → 安装 → 启动）

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-019；AC-08 |
| 动作 | `H="/d/oh-workspace/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe"`（`hdc` **不在 PATH**，必须绝对路径 + 引号）→ `"$H" list targets` 预检目标序列号 `3QC0226526001227` → `"$H" -t 3QC0226526001227 uninstall org.fellow99.pi.PiDesktop` → `cd` 到产物目录 → `"$H" -t 3QC0226526001227 app install electron-default-signed.hap`（相对路径）→ `MSYS_NO_PATHCONV=1 "$H" -t 3QC0226526001227 shell "aa start -a EntryAbility -b org.fellow99.pi.PiDesktop"` |
| 完成判据 | 安装输出 `install bundle successfully`；`aa start` 成功返回；目标序列号在线 |
| 产出 | `logs/20261015-1/T06-install.txt` |
| 风险 | R-c（设备离线 / 需 `connect-key`）→ 每步先 `hdc list targets`；设备侧路径需 `MSYS_NO_PATHCONV=1` 防 Git-Bash 改写 |

### T07 — 启动取证（含 SWC 落点）

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-020、FR-ver-021；AC-08 |
| 动作 | 启动后 ≥60 s 内（首启解压约 2.7 万文件 / ~13 s）抓 `hilog -x`，检索并落盘这些行：`解压完成：N 个文件`、`启动 Next 服务器（进程内`、`Running next.config.ts`（且**零下载**——无 `Downloading swc package`）、`[ready] 第 1 次探测通过`、`加载 Pi Web UI`、`首屏完成`；另用应用域 `fs.existsSync` 确认 `pi-dist/node_modules/next/wasm/@next/swc-wasm-nodejs/` 存在，且 `files/tmp/next-swc` 缓存目录**不存在** |
| 完成判据 | 全部关键行出现；SWC 落点为正、下载缓存不存在 |
| 产出 | `logs/20261015-1/T07-hilog-raw.txt`、`T07-swc.txt`、`T07-probe-sandbox.txt` |
| 风险 | C5（首启解压耗时）→ 取证超时按 ≥60 s 计 |

### T08 — 基本功能：DeepSeek API KEY + 工作区

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-022、FR-ver-023；AC-09、AC-10 |
| 动作 | ① 在 UI「设置 → 模型」写入需求方给定的 DeepSeek API KEY（**完整值不得入库**；取证件只用脱敏 `sk-dc5……296c`）（或同源 `POST /api/auth/api-key/deepseek {apiKey}` 路由）；② 回读沙箱内 `pi-agent/auth.json` 确认存在该 provider/KEY —— **取证脱敏**（只留前后各 6 字符），**完整密钥永不落盘**；③ 在应用沙箱内测试目录创建 `pi-workspace-test` 并通过 pi-web 目录选择 / `default-cwd` 路由设为工作区；④ 应用域 `fs.statSync` + `ls -la` 验证目录真实存在、可写 |
| 完成判据 | 配置回读命中且输出已脱敏；工作区目录真实存在且被应用认作 cwd；**无完整密钥**落入任何取证文件或提交内容 |
| 产出 | `logs/20261015-1/T08-setup.txt`、`T08-credential.txt`（脱敏） |
| 风险 | C8（无鼠标注入能力）→ 走同源 API 兜底，须在报告中注明取证通道 |

### T09 — 基本功能：一次真实对话

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-024、FR-ver-025；AC-11 |
| 动作 | ① `POST /api/agent/new` 建会话（`cwd` = T08 工作区）；② 发提示词「介绍一下你自己」；③ 消费 SSE 至结束（**同一条命令内完成**）；④ 读回助手回复文本；⑤ 读沙箱内会话 JSONL 片段（只读、脱敏）；⑥ 若失败，按根因分层（网络 / 凭据 / 上游）记**缺陷** |
| 完成判据 | 助手回复文本非空且语义合理；会话 JSONL 落盘；必须使用**真实网络**（非 mock）——失败**不得改判为「通过」** |
| 产出 | `logs/20261015-1/T09-dialog-turns.txt`（**不得**落盘 API KEY 明文） |
| 风险 | R-d（设备无外网 / 凭据失效 → 按 FR-ver-025 记缺陷并分层） |

### T10 — 鸿蒙环境能力复测

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-026、FR-ver-027、FR-ver-029；AC-12 |
| 动作 | ① 完整阅读 `docs/鸿蒙环境能力清单-v0.11.1.md`（含 REV-1 / REV-2），提取能力项与测试方法；② 在 **0.12.1** 产物上**逐项重测**（不复制旧结论），每项记录设备**原样输出**；③ 覆盖本工程**独有差异项**：进程内宿主（无子进程）、`bash` 工具、PTY、Host 围栏天然放行、逐像素渲染、`find`/`grep` 纯 JS 扩展替代 |
| 完成判据 | 每项给出「能力 / 方法（可复现命令）/ 证据（设备原样输出）/ 结论（✅ 可用 / ⚠️ 降级 / ❌ 不可用 + 原因）」；与本版不一致处**显式标注为修订** |
| 产出 | `logs/20261015-1/` 下 `T10-*.txt`（设备原样输出；命名见 `test-cases.md` D 节证据列） |
| 风险 | Git-Bash 路径改写 → 全程 `MSYS_NO_PATHCONV=1`；`reboot`→`begetctl` 陷阱 → **禁止**以「裸名 `--help`」探测 `/system/bin` 条目 |

### T11 — 能力报告落盘

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-028、FR-ver-029；AC-12 |
| 动作 | 写 `docs/鸿蒙环境能力清单-v0.12.1.md`，与 `v0.11.1` 版**结构同构**（同章节、同「结论/方法/证据」组织方式），新增 `REV-3`（本版复测修订）；含本工程独有差异节 |
| 完成判据 | 文件存在；章节结构可与 `v0.11.1` 对齐；逐项结论齐备；与本版不一致处标为修订 |
| 产出 | `docs/鸿蒙环境能力清单-v0.12.1.md` |

### T12 — 代码评审

| 项 | 内容 |
|---|---|
| 回引 | AC-13 |
| 动作 | ① 按 `requesting-code-review` 技能，取 `base..head` SHA 派发 reviewer（产物按 `Critical / Important / Minor` 分级）；② 落盘 `logs/20261015-1/REVIEW_REPORT.md`；③ 按 `receiving-code-review` 技能逐条**验证 → 评估 → 处置**，Critical / Important 修完后复验 |
| 完成判据 | 无未决 Critical / Important |
| 产出 | `logs/20261015-1/REVIEW_REPORT.md` + 修复提交 |

### T13 — 提交 + tag `v0.12.1`

| 项 | 内容 |
|---|---|
| 回引 | FR-ver-030、FR-ver-031、FR-ver-032；AC-14、AC-15 |
| 动作 | ① 加载 `git-commit` 技能，按 **Conventional Commits** 前缀（`feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert`）分阶段提交，**禁用** `development:` / `testing:` / `code-review:` 等 devflow 阶段名；② **分文件 `git add`，永不 `git add -A`** —— `build-profile.json5` 的本地 debug 签名配置（含 `keyPassword` / `storePassword`）**不得入库**；③ 打 tag **`v0.12.1`** 指向本需求最后一次提交，**不改动任何分支** |
| 完成判据 | `git log` 中本需求提交前缀全部合规；`git status` 干净且 `build-profile.json5` 的签名配置未被提交、无密钥泄漏；`git tag -l` 含 `v0.12.1` 且指向最后提交 |
| 产出 | commits + tag `v0.12.1` |
| 风险 | R-e（误提交本地签名密钥）→ 分文件 `git add` + 提交前 `git show --stat` 复核 |

## 里程碑

| 里程碑 | 含任务 | 判定 |
|---|---|---|
| M1 静态收敛 | T01–T04 | AC-01…AC-05 全绿 |
| M2 构建可用 | T05–T07 | AC-06…AC-08 全绿 |
| M3 功能可用 | T08–T09 | AC-09…AC-11 全绿 |
| M4 交付完成 | T10–T13 | AC-12…AC-15 全绿 |
