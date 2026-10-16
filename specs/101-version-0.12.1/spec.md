# 101 — 版本更新：0.12.1（version）功能规格

> **Module:** version ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-15
> **上游基线:** pi v1.2.0（Branch_v1.2.0）· pi-web v0.12.1（Branch_v0.12.1）
> **需求编号:** 101-version-0.12.1 ｜ **需求名称:** 版本更新：0.12.1
> **Git 分支:** 不改动（在 `pi-desktop-hos` 当前分支 `main` 上直接产出，见 §6）
> **规划依据:** `docs/工程规划.md` §2.4c、§7、§8.1、§11.3、§11.5；`specs/001-host/`
> **前序版本:** [`../101-version-0.11.1/`](../101-version-0.11.1/)（同型流程，本版沿用其结构）

## 1. 目的

把 `pi-desktop-hos` 从已交付的 `0.11.1` **收敛为 `0.12.1`**：

1. 上游双基线升级并固化：`pi` `v1.1.0` → **`v1.2.0`**、`pi-web` `v0.11.1` → **`v0.12.1`**（两者均已在
   上游侧打 tag + 建分支，本工程只引用，不新建分支）；
2. 本工程**清干净中间产物**，从零重跑流水线，证明「只有源码 + 上游 tag + 运行时归档」即可复现产物；
3. 对**既有 2 条补丁**（`P203-1`、`PFIX-1`）在 **v0.12.1** 上重新评估、重新生成并登记（`patches/v0.12.1/`）；
4. 版本号从 `0.11.1` 升到 **`0.12.1`**（`versionCode` `1101` → **`1201`**，严格递增）；
5. 构建 → 签名 → 真机侧载 → **三条基本功能路径**实测通过；
6. 对本工程做一次**逐项环境能力复测**（对照 `docs/鸿蒙环境能力清单-v0.11.1.md`），产出
   `docs/鸿蒙环境能力清单-v0.12.1.md`。

## 2. 范围

**In scope**

- 上游基线锚定核对（`pi` / `pi-web` 的 tag、分支、`HEAD` 一致性）。
- 本工程中间文件 / 临时文件清理与清理清单。
- 补丁集在 v0.12.1 上的**重新评估 + 重新生成 + 登记**。
- 版本号同步（`AppScope/app.json5`、`src-main/package.json`、`README.md` / `README_zh.md`、文档头）
  + `versionCode` 递增 + 新能力清单文档落盘。
- 四阶段流水线重跑（collect-runtime / prepare-next / smoke / collect-pi / collect-app）+ debug 签名构建。
- 真机：卸载 → 安装 → 启动 → 日志取证。
- 真机基本功能：设置 DeepSeek API KEY → 创建工作区（沙箱内测试目录）→ 一次真实对话。
- 真机环境能力复测（对照 `docs/鸿蒙环境能力清单-v0.11.1.md` 的能力项）。
- 代码评审（`requesting-code-review` → `receiving-code-review`）。
- 提交（Conventional Commits 前缀）+ 打 tag `v0.12.1`。

**Out of scope**

- 上架用发布证书 / 发布 Profile（`docs/工程规划.md` §11.5，本轮仍走 debug 签名侧载）。
- 图标替换（`docs/media-placeholder-icons.md`，上架阻塞但非本需求范围）。
- 上游 `pi` / `pi-web` 源码的任何改动（两者只做 tag/分支引用）。
- 本工程新增功能特性；本轮**只做版本收敛 + 验证**，不新增 FR。
- 终端面板 / PTY、`find`/`grep` 工具的设备侧实现（`docs/工程规划.md` §9.3 已知降级）。
- 父工程 `pi-workspace`（子模块指针与父 README）——**明确不动**。

## 3. 上游事实（本规格前提，已核实）

| # | 事实 | 出处 / 核实方式 |
|---|---|---|
| U1 | `pi` 仓库 tag **`v1.2.0`** 是**轻量标签**（`cat-file -t` = `commit`），指向 `06a466935536f8c9bcacb2d5efc0fc021be1bdff`；`Branch_v1.2.0` 的 `HEAD` 即该 commit；工作树干净。 | `git -C pi cat-file -t v1.2.0` / `git rev-parse v1.2.0^{commit}` / `git status --porcelain` |
| U2 | `pi-web` 仓库 tag **`v0.12.1`** 是**带注释标签**（`cat-file -t` = `tag`），其剥离提交 `v0.12.1^{commit}` = `f83b1a502f8e434555a7153fe08e1c135dd65ca9`（`Release v0.12.1`），**等于** `Branch_v0.12.1` 的 `HEAD`；工作树干净。 | `git -C pi-web cat-file -t v0.12.1` / `git rev-parse v0.12.1^{commit}` |
| U3 | `pi-web` 的 `package.json.version` = **`0.12.1`**，其依赖已随 `35067b6 chore(deps): upgrade pi to 1.2.0 and pin every pi package` 升到 pi `1.2.0`。 | 读 `../pi-web/package.json` |
| U4 | 本工程当前（升级前）`versionName = "0.11.1"`、`versionCode = 1101`（`AppScope/app.json5`）。 | 读文件 |
| U5 | 已有 **2 条**上游补丁：`patches/v0.11.1/0001-workspace-picker-roots.patch`（`P203-1`）、`patches/v0.11.1/0002-session-export-in-process-fallback.patch`（`PFIX-1`）。 | `patches/README.md` §0 |
| U6 | 两条补丁在 **pi-web v0.12.1** 的 detached worktree 上 `git apply --check` **均通过**（`0001` 对三套 locale 有 `+5` 行偏移；`0002` 无偏移）。被 patch 的上游文件中，v0.11.1→v0.12.1 仅三套 `lib/i18n/messages/*.ts` 有上游改动。 | `git worktree add --detach <tmp> v0.12.1` + `git apply --check` |
| U7 | Electron-on-鸿蒙运行时为 `v37.2.3-20260825.1`（内含 `libelectron_138.tar.gz`），Node **22.17.0** / ABI **138**；上游声明 `engines.node >= 22.19.0`。 | `runtime-overlays/`、`docs/工程规划.md` §3 |
| U8 | 设备为 HARMONYOS PC（arm64-v8a，API 26），目标序列号 **`3QC0226526001227`**（`hdc list targets`）。`hdc` 不在 PATH，实际路径 `/d/oh-workspace/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe`（`Ver: 3.2.0d`）。 | `hdc list targets` 实测 |
| U9 | 本工程 `0.11.1` 已交付并在真机验证通过；其能力结论的权威文档是 `docs/鸿蒙环境能力清单-v0.11.1.md`（含 REV-1 / REV-2 修订节）。 | 读文件 |
| U10 | 构建必须用 **Node 22.17.0**（`prepare-next.mjs --node <path>`）；构建机系统 Node 为 `24.7.0`。 | `docs/工程规划.md` §11.5、`scripts/prepare-next.mjs` 用法 |

## 4. 需求条目

> 只追加不修订；MUST / MUST NOT / SHOULD / MAY。Plan 逐条回引。

### 4.1 上游固化与分支纪律

- **FR-ver-001**（MUST）：`pi` 必须处于 tag `v1.2.0` 对应 commit `06a4669355…` 且在 `Branch_v1.2.0` 上；
  `pi-web` 必须处于 tag `v0.12.1` 剥离 commit `f83b1a502f…` 且在 `Branch_v0.12.1` 上。本条为**核对项**。
- **FR-ver-002**（MUST NOT）：本需求**不得改动任何 git 分支**（不新建、不切换、不重命名），
  不执行 `git init`，不产生上游仓库改动；仅允许在 `pi-desktop-hos` 当前分支 `main` 上提交本工程文件。
- **FR-ver-003**（MUST NOT）：`pi` / `pi-web` 工作树不得出现未提交改动（否则「基于 tag」不成立）。
- **FR-ver-004**（MUST）：允许在本工程通过 `git worktree add --detach <tmp> v0.12.1` 生成
  **临时工作树**用于补丁再生；该工作树必须在收尾前移除，且不得改变 `../pi-web` 的 checkout 状态。

### 4.2 清理

- **FR-ver-005**（MUST）：构建前必须清理本工程全部**中间文件与临时文件**：构建输出目录
  （`electron/build`、`web_engine/build`、`.hvigor`）、组装产物（`pi-dist/`、`pi-dist.tar.gz`、
  `pi-dist.version`、`web_engine/src/main/resources/resfile/resources/app/pi-dist.*`）、
  运行时投放物（`electron/libs/`、模块内 `*.so`）、脚本下载缓存（`.collect-pi-tmp/`）、
  本轮阶段日志（`logs/20261015-1/` 之外的旧轮次日志**保留**）。
- **FR-ver-006**（MUST）：清理必须是**可复现的**——即清理后仅靠「源码 + 上游 tag + 运行时归档」
  重跑流水线即可产出等价产物；不得依赖任何被删掉的中间态。
- **FR-ver-007**（MUST NOT）：不得删除源码、配置、文档、`patches/`、`runtime-overlays/`、
  `config/`、`extensions/`、`skills/`、`specs/`、`docs/`（这些是交付物，不是中间文件）。

### 4.3 补丁集

- **FR-ver-008**（MUST）：必须基于 `pi v1.2.0` / `pi-web v0.12.1` 重新评估补丁必要性，并对
  **每一个**候选（`patches/README.md` 已登记的候选 1–7 + 本轮新候选）给出「需要 / 不需要 + 依据」的结论。
- **FR-ver-009**（MUST）：对**确需保留**的补丁（当前为 `P203-1`、`PFIX-1` 两条），必须在
  `patches/v0.12.1/` 下**按 v0.12.1 重新生成**（独立 detached worktree 导出、不含 lockfile、
  不含二进制、UTF-8/LF），并保留 `patches/v0.11.1/` 目录可追溯。
- **FR-ver-010**（MUST）：必须在 `scripts/prepare-next.mjs` 把补丁应用目录切换到
  `patches/v0.12.1`，且既有「幂等应用 → 反向 → SHA-256 还原断言」流程不变。
- **FR-ver-011**（MUST）：补丁应用必须**语义可校验**——应用后 `lib/directory-browser.ts` 含
  `WORKSPACE_ROOTS_ENV`（既有守卫），且 `app/api/sessions/[id]/export/route.ts` 含 PFIX-1 的
  `existsSync(process.execPath)` 前置条件。
- **FR-ver-012**（MUST）：必须把本轮评估与再生成的结论写回 `patches/README.md`
  （新增 `## v0.12.1 基线复核（2026-10-15）` 节 + §0 登记两条补丁的新 tag 目录）。

### 4.4 版本号

- **FR-ver-013**（MUST）：`AppScope/app.json5` 的 `versionName` 必须为 **`0.12.1`**，
  `versionCode` = **`1201`**（公式 `major*10000 + minor*100 + patch`，见 plan D1），且
  **严格大于** 1101。
- **FR-ver-014**（MUST）：版本号必须在**所有对外可见处**同步，不得残留旧值：
  `AppScope/app.json5`、`src-main/package.json`、`README.md`、`README_zh.md`、
  `docs/工程规划.md` 文档头与版本表、`specs/README.md`。
- **FR-ver-015**（MUST）：`versionCode` 不得回退或与上一版相等（`docs/工程规划.md` §11.5 G7）。
- **FR-ver-016**（MUST）：历史记录类文档（`docs/真机验证记录.md` 的历史轮次、`specs/101-version-0.11.1/`）
  **保留**当时的版本号，并在 `docs/鸿蒙环境能力清单-v0.12.1.md` 或 plan 中显式说明「这些是历史值」。

### 4.5 构建与部署

- **FR-ver-017**（MUST）：必须从**清理后的工作树**跑完四阶段流水线，且
  ① `collect-runtime.mjs` 全守卫 PASS、② `prepare-next.mjs` 用 **Node 22.17.0** 构建、
  ②′ `smoke-node22.mjs` **0 FAIL**、③ `collect-pi.mjs` 产出 tar + SHA-256 marker、
  ④ `collect-app.mjs` 投放 resfile。
- **FR-ver-018**（MUST）：必须用 `scripts/build-debug.ps1` 产出 **debug 签名**的
  `electron-default-signed.hap`（release 签名包无法侧载），且脚本自带的签名断言通过。
- **FR-ver-019**（MUST）：必须在真机（`3QC0226526001227`）上 `hdc app install` 成功（先卸载旧版），
  并用 `aa start` 启动成功。
- **FR-ver-020**（MUST）：启动后必须在设备上取证到：产物解压完成（含文件数）、Next 就绪
  （`Running next.config.ts` 且**零下载**）、`[ready]` 探测通过、加载 Pi Web UI、首屏完成。
- **FR-ver-021**（MUST）：取证必须证明 SWC 走的是**内置 WASM**（`pi-dist` 内
  `node_modules/next/wasm/@next/swc-wasm-nodejs/` 存在），且 `tmp/next-swc` 缓存目录**不存在**。

### 4.6 基本功能

- **FR-ver-022**（MUST）：必须在真机上通过 UI（或同源 API）设置 DeepSeek 的 API KEY
  为**需求方给定的 DeepSeek API KEY（完整值不得入库；取证件里只出现脱敏形态 `sk-dc5……296c`）**，并证明该配置**落到沙箱**；**取证文件必须脱敏**，
  不得落盘完整密钥。
- **FR-ver-023**（MUST）：必须创建**一个工作区**，其目录位于**应用沙箱内**的测试目录，并证明该目录真实存在。
- **FR-ver-024**（MUST）：必须在该工作区**完成一次真实对话**（提示词「介绍一下你自己」），取证到：
  请求发出 → 模型流式返回 → 会话落盘（JSONL）→ UI 显示回复文本。
- **FR-ver-025**（MUST）：对话必须使用**真实网络**（非 mock）。若因网络/凭据不可用而失败，
  必须记录为**缺陷**并给出根因分层（网络 / 凭据 / 上游），不得改判为「通过」。

### 4.7 环境能力

- **FR-ver-026**（MUST）：必须完整阅读 `docs/鸿蒙环境能力清单-v0.11.1.md`（含 REV-1 / REV-2），
  提取其能力项与测试方法。
- **FR-ver-027**（MUST）：必须对提取出的能力项在**本工程（0.12.1）**上逐项重测（不复制旧结论），
  每项给出：能力 / 方法（可复现命令）/ 证据（设备原样输出）/ 结论（✅ 可用 / ⚠️ 降级 / ❌ 不可用 + 原因）。
- **FR-ver-028**（MUST）：报告必须落盘到 `docs/鸿蒙环境能力清单-v0.12.1.md`，且文档结构与
  `v0.11.1` 版**同构**，以便两份报告可比对；与本版不一致处必须**显式标注为修订**。
- **FR-ver-029**（MUST）：报告必须显式记录本工程**独有**的差异项（进程内宿主、`bash` 工具、
  PTY、Host 围栏、逐像素渲染等），不得只做旧清单的影子副本。

### 4.8 提交与发布

- **FR-ver-030**（MUST）：提交信息必须符合 `git-commit` 技能规定的 **Conventional Commits**
  前缀（`feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert`），**不得使用其它前缀**
  （例如 `development:`、`testing:`、`code-review:` 等 devflow 阶段名一律不用）。
- **FR-ver-031**（MUST NOT）：不得把 `build-profile.json5` 的**本地签名配置**（含
  `keyPassword` / `storePassword`）提交入库。
- **FR-ver-032**（MUST）：测试通过后必须打 tag **`v0.12.1`**（不改动任何分支）。

## 5. 验收标准

| 编号 | 验收条件（必须全部满足） | 判定方式 |
|---|---|---|
| AC-01 | `pi` / `pi-web` 均在指定 tag 对应 commit 上，工作树干净 | `git rev-parse` / `git status` |
| AC-02 | 未改动任何 git 分支（执行前后分支列表一致） | 前后 `git branch` 对比 |
| AC-03 | 清理清单全部命中，且 `git status` 不出现被误删的交付物 | 清理脚本输出 + `git status` |
| AC-04 | 补丁候选逐条有结论；两条保留补丁在 `patches/v0.12.1/` 重新生成并登记 | 文档审阅 + `git apply --check` |
| AC-05 | `versionName == "0.12.1"` 且 `versionCode == 1201` | grep + 读文件 |
| AC-06 | 四阶段流水线全绿；门禁 0 FAIL | 脚本退出码 |
| AC-07 | 产出 debug 签名 HAP，签名复验通过 | 构建日志 |
| AC-08 | 真机安装成功且启动到「就绪」；FR-ver-020/021 各项事实齐备 | hilog / 应用域取证 |
| AC-09 | DeepSeek API KEY 设置成功且落沙箱（取证脱敏） | 设备侧读回 |
| AC-10 | 工作区创建成功且目录真实存在 | 应用域 `ls -la` |
| AC-11 | 一次对话成功且回复文本可取回 | SSE / 会话 JSONL |
| AC-12 | 能力清单逐项有结论；`docs/鸿蒙环境能力清单-v0.12.1.md` 落盘且结构同构 | 报告文件 |
| AC-13 | 代码评审完成：Critical / Important 全部关闭 | `REVIEW_REPORT.md` |
| AC-14 | 提交前缀全部符合 `git-commit` 技能；无密钥泄漏提交 | `git log` + `git show --stat` |
| AC-15 | tag `v0.12.1` 已创建，且指向本需求最后一次提交 | `git tag -l` / `git describe` |

## 6. 约束与风险

| # | 约束 / 风险 | 处置 |
|---|---|---|
| C1 | **不改动 git 分支** | 全程只读上游；`pi-desktop-hos` 在既有 `main` 上提交。**不新建 `Branch_v0.12.1`**。 |
| C2 | 构建机缺 Node 22.17.0 | 需先在 scratch 投放 `node-v22.17.0-win-x64`；`prepare-next --node` 显式指定。 |
| C3 | `hdc` 不在 PATH | 一律使用绝对路径 `/d/oh-workspace/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe`（含空格，必须引号）。 |
| C4 | 设备可能离线 / 需 `connect-key` | 每步先 `hdc list targets` 确认；失败按 `README.md` 的 `hdc` 重试口径处置。 |
| C5 | 首启解压 2.7 万文件约 13 s | 取证超时按 ≥60 s 计。 |
| C6 | 上游 v0.12.1 改动面大（194 文件 / 4916+ / 7287-） | 补丁已 `--check` 通过；仍须跑「应用 → 反向 → SHA-256 还原」断言 + 语义守卫。 |
| C7 | `build-profile.json5` 含本地 debug 签名密钥 | **保留不提交**（`.gitignore` / 分文件 `git add`）。 |
| C8 | 无鼠标注入能力 | 基本功能走同源 API 兜底，须在测试报告中注明取证通道。 |

## 7. 不做（明确排除）

- 不新增功能、不改 UI、不改上游代码。
- 不申请发布证书、不提交应用市场。
- 不替换占位图标。
- 不修复 `bash` 工具 / PTY / `find`·`grep` 工具的设备侧缺口（只登记）。
- 不动父工程 `pi-workspace` 的子模块指针与父 README。
