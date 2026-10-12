# 101 — 版本更新：0.11.1（version）功能规格

> **Module:** version ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）
> **需求编号:** 101-version-0.11.1 ｜ **需求名称:** 版本更新：0.11.1
> **Git 分支:** 不改动（在 pi-desktop-hos 当前分支 `main` 上直接产出，见 §6）
> **规划依据:** `docs/工程规划.md` §2.4c、§7、§8.1、§11.3、§11.5；`specs/001-host/`

## 1. 目的

把 `pi-desktop-hos` 从「工程骨架 + 一轮真机验证」的状态**收敛为可交付的 0.11.1 版本**：

1. 上游双基线（`pi` `v1.1.0` / `pi-web` `v0.11.1`）**固化**为 tag + 分支；
2. 本工程**清干净中间产物**，从零重跑四阶段流水线，证明「只有源码 + 上游 tag」就能复现产物；
3. 补丁集**重新评估并给出结论**（本条要求原文：「制作 patch（如有）」——「如有」是条件从句，
   前提是存在真实需要补丁的问题；本规格 §4.3 FR-ver-007 要求的是**评估动作 + 结论留痕**，而非强行造补丁）；
4. 版本号从 `0.1.0` 升到 **`0.11.1`**（与 `pi-web` 对齐，`versionCode` 严格递增）；
5. 构建 → 签名 → 真机侧载 → **三条基本功能路径**实测通过；
6. 复用参考工程的环境能力清单口径，对本工程做一次**逐项环境能力复测**，产出
   `docs/鸿蒙环境能力清单-v0.11.1.md`。

## 2. 范围

**In scope**

- 上游基线锚定核对（`pi` / `pi-web` 的 tag、分支、`HEAD` 与 tag 的一致性）。
- 本工程中间文件 / 临时文件清理与清理清单。
- 补丁集评估（是否需要 `patches/v0.11.1/`）与结论登记。
- 版本号三处同步（`AppScope/app.json5`、`README.md`、文档头）+ `versionCode` 递增。
- 四阶段流水线重跑（collect-runtime / prepare-next / smoke / collect-pi / collect-app）+ debug 签名构建。
- 真机：卸载 → 安装 → 启动 → 日志取证。
- 真机基本功能：设置 DeepSeek API KEY → 创建工作区（沙箱内测试目录）→ 一次真实对话。
- 真机环境能力复测（对照 `dsh-desktop-hos/docs/鸿蒙环境能力清单-v0.1.5.md` 与
  `toybox命令清单.md` 的能力项）。
- 环境能力报告落盘 `docs/鸿蒙环境能力清单-v0.11.1.md`。
- 代码评审（`requesting-code-review` → `receiving-code-review`）。

**Out of scope**

- 上架用发布证书 / 发布 Profile（`docs/工程规划.md` §11.5，本轮仍走 debug 签名侧载）。
- 图标替换（`docs/media-placeholder-icons.md`，上架阻塞但非本需求范围）。
- 上游 `pi` / `pi-web` 源码的任何改动（两者只做 tag/分支引用）。
- 本工程新增功能特性；本轮**只做版本收敛 + 验证**，不新增 FR。
- 终端面板 / PTY、`find`/`grep` 工具的设备侧实现（`docs/工程规划.md` §9.3 已知降级）。

## 3. 上游事实（本规格前提，已核实）

| # | 事实 | 出处 / 核实方式 |
|---|---|---|
| U1 | `pi` 仓库 tag `v1.1.0` = `abe508e1b89912adde45528136c3221eb69acdd7`，当前 checkout 在 `Branch_v1.1.0`，该分支 `HEAD` 即该 commit。 | `git rev-parse v1.1.0` / `git log -1` |
| U2 | `pi-web` 仓库 tag `v0.11.1` 是**带注释标签**（tag 对象 `80e006c528efb5679aefb9b6e4c25542fa34e560`），其剥离提交 `v0.11.1^{commit}` = `e78372193bcbf7a1986072704753550008554ead`（`Release v0.11.1`），**等于** `Branch_v0.11.1` 的 `HEAD`；工作树干净。 | `git rev-parse v0.11.1^{commit}` / `git log -1` |
| U3 | Electron-on-鸿蒙运行时为 `v37.2.3-20260825.1`（内含 `libelectron_138.tar.gz`），Node **22.17.0** / ABI **138**；上游声明 `engines.node >= 22.19.0`。 | `runtime-overlays/`、`docs/工程规划.md` §3 |
| U4 | 本工程当前 `versionName = "0.1.0"`、`versionCode = 1000`（`AppScope/app.json5`）。 | 读文件 |
| U5 | `patches/` 当前为空集（只有 `README.md`），且该 README 已逐条登记「为什么 0 条就够」，并规定**空目录不建**。 | `patches/README.md` |
| U6 | 设备为 HARMONYOS PC（`HAD-W32`，arm64-v8a，API 26），已侧载过 0.1.0 签名包，**设备可访问公网**（`toybox wget http://api.deepseek.com` → `response 401`，即已到服务端）。 | `hdc shell` 实测 |
| U7 | 参考能力清单 `dsh-desktop-hos/docs/鸿蒙环境能力清单-v0.1.5.md` 是**同型工程**在**同一类设备**上的能力复测报告；其口径可直接复用，但结论**必须重测**（不同应用的权限/沙箱/进程模型不同）。 | 见该文件 |

## 4. 需求条目

> 只追加不修订；MUST / MUST NOT / SHOULD / MAY。Plan 逐条回引。

### 4.1 上游固化与分支纪律

- **FR-ver-001**（MUST）：`pi` 与 `pi-web` 必须处于 tag `v1.1.0` / `v0.11.1` 对应的 commit，
  且各自在 `Branch_v1.1.0` / `Branch_v0.11.1` 分支上；本条为**核对项**（要求原文已声明已完成）。
- **FR-ver-002**（MUST NOT）：本需求**不得改动任何 git 分支**（不新建、不切换、不重命名），
  不执行 `git init`，不产生上游仓库改动；仅允许在 `pi-desktop-hos` 当前分支上提交本工程文件。
- **FR-ver-003**（MUST NOT）：`pi` / `pi-web` 工作树不得出现未提交改动（否则「基于 tag」不成立）。

### 4.2 清理

- **FR-ver-004**（MUST）：构建前必须清理本工程全部**中间文件与临时文件**：构建输出目录
  （`electron/build`、`web_engine/build`、`.hvigor`）、组装产物（`pi-dist/`、`pi-dist.tar.gz`、
  `pi-dist.version`、`web_engine/src/main/resources/resfile/resources/app/pi-dist.*`）、
  运行时投放物（`electron/libs/`、模块内 `*.so`）、脚本下载缓存（`.collect-pi-tmp/`、
  `.collect-runtime-tmp/`、`runtime/`）、阶段日志（`logs/`）。
- **FR-ver-005**（MUST）：清理必须是**可复现的**——即清理后仅靠「源码 + 上游 tag + 运行时归档」
  重跑流水线即可产出等价产物；不得依赖任何被删掉的中间态。
- **FR-ver-006**（MUST NOT）：不得删除源码、配置、文档、`patches/`、`runtime-overlays/`、
  `config/`、`extensions/`、`skills/`、`specs/`、`docs/`（这些是交付物，不是中间文件）。

### 4.3 补丁集

- **FR-ver-007**（MUST）：必须基于 `pi v1.1.0` / `pi-web v0.11.1` 重新评估补丁必要性，
  并对**每一个**「可能需要补丁」的候选给出「需要 / 不需要 + 依据（文件路径或实测证据）」的结论。
- **FR-ver-008**（MUST）：若某候选确需补丁，必须按 `patches/README.md` 的 8 条纪律生成
  `patches/v0.11.1/` 下的补丁（幂等 / 冲突即终止 / 无镜像噪声 / 可往返 / 独立 worktree / 登记三要素），
  并在 `prepare-next.mjs` 补丁应用阶段接入；若全部不需要，必须把评估结论写入 `patches/README.md`
  （空目录仍不建）。

### 4.4 版本号

- **FR-ver-009**（MUST）：`AppScope/app.json5` 的 `versionName` 必须为 **`0.11.1`**，
  `versionCode` 必须**严格大于** 1000 且与 `versionName` 语义一致（映射规则须在 plan 中写明并留痕）。
- **FR-ver-010**（MUST）：版本号必须在**所有对外可见处**同步，不得残留 `0.1.0`：
  `AppScope/app.json5`、`README.md`（「版本」行）、`docs/工程规划.md` 文档头、本 specs 目录文档头。
- **FR-ver-011**（MUST）：`versionCode` 不得回退或与上一版相等（`docs/工程规划.md` §11.5 G7
  「`versionCode` 严格递增」）。

### 4.5 构建与部署

- **FR-ver-012**（MUST）：必须从**清理后的工作树**跑完四阶段流水线，且
  ① `collect-runtime.mjs` 全守卫 PASS、② `prepare-next.mjs` 用 **Node 22.17.0** 构建、
  ②′ `smoke-node22.mjs` **0 FAIL**、③ `collect-pi.mjs` 产出 tar + SHA-256 marker、
  ④ `collect-app.mjs` 投放 resfile。
- **FR-ver-013**（MUST）：必须用 `scripts/build-debug.ps1` 产出 **debug 签名**的
  `electron-default-signed.hap`（release 签名包无法侧载），且脚本自带的签名断言（Profile `type=debug`）通过。
- **FR-ver-014**（MUST）：必须在真机上 `hdc app install -r` 成功（先卸载旧版以保证不是增量替换），
  并用 `aa start` 启动成功。
- **FR-ver-015**（MUST）：启动后必须**在设备上**取证到以下全部事实：产物解压完成（含文件数）、
  Next 就绪（`Running next.config.ts` 且**零下载**）、`[ready]` 探测通过、加载 Pi Web UI、
  首屏完成。任一缺失即视为部署失败。
- **FR-ver-016**（MUST）：取证必须证明 SWC 走的是**内置 WASM**（`pi-dist` 内
  `node_modules/next/wasm/@next/swc-wasm-nodejs/`，且 `tmp/next-swc` 缓存目录**不存在**）。

### 4.6 基本功能

- **FR-ver-017**（MUST）：必须在真机上通过 UI（或同源 API）设置 DeepSeek 的 API KEY
  为需求给定的值，并证明该配置**落到沙箱**（设备侧可读回，无明文外泄到日志）。
- **FR-ver-018**（MUST）：必须创建**一个工作区**，其目录位于**应用沙箱内**的测试目录
  （不得使用 `/data/storage/el2/base/files` 之外的宿主可见路径），并证明该目录在设备上真实存在。
- **FR-ver-019**（MUST）：必须在该工作区**完成一次真实对话**（提示词「介绍一下你自己」），
  取证到：请求发出 → 模型流式返回 → 会话落盘（JSONL）→ UI 显示回复文本。
- **FR-ver-020**（MUST）：对话必须使用**真实网络**（非 mock）。若因网络/凭据不可用而失败，
  必须记录为**缺陷**并给出根因分层（网络 / 凭据 / 上游），不得改判为「通过」。

### 4.7 环境能力

- **FR-ver-021**（MUST）：必须完整阅读 `dsh-desktop-hos/docs/鸿蒙环境能力清单-v0.1.5.md` 与
  `dsh-desktop-hos/docs/toybox命令清单.md`，提取其能力项与测试方法。
- **FR-ver-022**（MUST）：必须对提取出的能力项在**本工程**上逐项重测（不复制参考工程结论），
  每项给出：能力 / 方法（可复现命令）/ 证据（设备原样输出）/ 结论（✅ 可用 / ⚠️ 降级 / ❌ 不可用 + 原因）。
- **FR-ver-023**（MUST）：`toybox命令清单.md` 记录的 toybox 命令集必须在设备上**逐项**给出
  可用性判定（含不可用项与报错原文）。
- **FR-ver-024**（MUST）：报告必须落盘到 `docs/鸿蒙环境能力清单-v0.11.1.md`，且文档结构
  与 `v0.1.5` 版**同构**（同章节口径、同「结论/方法/证据」组织方式），以便两份报告可比对。
- **FR-ver-025**（MUST）：报告必须显式记录本工程**独有**的差异项（如进程内宿主无子进程、
  `bash` 工具因 `exit` 事件缺失不可用、无 PTY、Host 围栏天然放行等），不得只做参考工程的影子副本。

## 5. 验收标准

| 编号 | 验收条件（必须全部满足） | 判定方式 |
|---|---|---|
| AC-01 | `pi` / `pi-web` 均在指定 tag 对应 commit 上，工作树干净 | `git rev-parse` / `git status` |
| AC-02 | 未改动任何 git 分支（本需求执行前后分支列表一致） | 前后 `git branch` 对比 |
| AC-03 | 清理清单全部命中，且 `git status` 不出现被误删的交付物 | 清理脚本输出 + `git status` |
| AC-04 | 补丁候选逐条有结论；结论与 `patches/README.md` 一致 | 文档审阅 |
| AC-05 | `versionName == "0.11.1"` 且 `versionCode > 1000`；`grep -rn "0.1.0"` 无残留（历史记录类文档除外，需显式说明） | grep + 读文件 |
| AC-06 | 四阶段流水线全绿；门禁 0 FAIL | 脚本退出码 |
| AC-07 | 产出 debug 签名 HAP，`hap-sign-tool verify-app` 通过 | 构建日志 |
| AC-08 | 真机安装成功且启动到「就绪」；FR-ver-015 各项事实齐备 | hilog / CDP 取证 |
| AC-09 | DeepSeek API KEY 设置成功且落沙箱 | 设备侧读回 |
| AC-10 | 工作区创建成功且目录真实存在 | `ls -la` 设备侧 |
| AC-11 | 一次对话成功且回复文本可取回 | CDP / 会话 JSONL |
| AC-12 | 能力清单逐项有结论；报告落盘且结构同构 | 报告文件 |
| AC-13 | 代码评审完成：Critical / Important 全部关闭 | `REVIEW_REPORT.md` |
| AC-14 | 提交信息符合 `git-commit` 技能的规范前缀，无其它前缀 | `git log` |

## 6. 约束与风险

| # | 约束 / 风险 | 处置 |
|---|---|---|
| C1 | **不改动 git 分支** | 全程只读上游；`pi-desktop-hos` 在既有 `main` 上提交。**不新建 `Branch_v0.11.1`**。 |
| C2 | 设备**可能无外网**（轮次 0 记录为「设备离线」） | 本轮实测设备可访问公网（U6）；若对话过程中外网不可达，按 FR-ver-020 记为缺陷。 |
| C3 | `bash` 工具真机不可用（`docs/真机验证记录.md` 发现 11） | 能力报告中登记为 ⚠️/❌，**本轮不修**（超出本需求范围，属工程规划 R14 待决策）。 |
| C4 | 构建机 Node 版本 | 必须用 **22.17.0**（已投放到 scratch）；`prepare-next` 用 `--node` 显式指定。 |
| C5 | Git-Bash 路径改写 | 传设备路径参数一律 `MSYS_NO_PATHCONV=1`（发现 14）。 |
| C6 | `hdc fport` 生命周期 | 建转发 + 消费必须在同一条命令内（发现 13）。 |
| C7 | 首启解压 27k 文件约 13 s | 取证超时按 ≥60 s 计。 |
| C8 | 无 `--inspect` 则无法 CDP 取证 | debug 构建保留 `--inspect`；release 前必须移除（R7，非本需求）。 |

## 7. 不做（明确排除）

- 不新增功能、不改 UI、不改上游代码。
- 不申请发布证书、不提交应用市场。
- 不替换占位图标。
- 不修复 `bash` 工具 / PTY / `find`·`grep` 工具的设备侧缺口（只登记）。
