# 101 — 版本更新：0.11.1（version）技术方案

> **Module:** version ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）
> **需求编号:** 101-version-0.11.1
> **规格依据:** [`spec.md`](./spec.md)（FR-ver-001 … FR-ver-025）
> **规划依据:** `docs/工程规划.md` §2.4c、§7、§8.1、§11.3、§11.5

## 1. 方案总览

本需求**不引入新架构**。它是一次「收敛 + 复现 + 验证」：

```
S0 锚定核对 → S1 清理 → S2 补丁评估 → S3 版本号 → S4 全流水线重建
                                                        ↓
              S7 能力报告 ← S6 能力复测 ← S5 真机部署 + 基本功能
```

与 `docs/工程规划.md` §8.1 的四阶段流水线关系：**S4 就是那条流水线的整体重跑**，
本方案不修改流水线本身；仅 S3 触碰 `AppScope/app.json5`（版本号），
S2 在「需要补丁」时才会触及 `scripts/prepare-next.mjs`。

## 2. 关键决策

### D1 — `versionCode` 编码规则（落实 FR-ver-009 / FR-ver-011）

采用 **SemVer 十进制编码**：

```
versionCode = major × 10_000 + minor × 100 + patch
```

| versionName | versionCode |
|---|---|
| `0.1.0`（骨架期占位值，工程内 `1000`） | 公式值 `100` |
| **`0.11.1`（本版）** | **`1101`** |

**为什么可用**：`1101 > 1000`，满足 FR-ver-011「严格递增」；且公式对
`(major, minor < 100, patch < 100)` 全序单调，未来 `0.12.0 → 1200`、`1.0.0 → 10000` 均不回退。

**为什么不用 1000 系**：骨架期把 `0.1.0` 写成 `1000` 是无公式的占位（该版本**从未上架**、
从未提交市场，故不存在「已发布 versionCode 不可回退」的外部约束）。既然公式化是低成本，
就一次性对齐，避免未来「1000 系」与 `versionName` 失联。

**留痕要求**：`AppScope/app.json5` 内以注释写明公式（json5 允许注释），使下一个改版本的人
不必反推。

### D2 — 不改动任何 git 分支（落实 FR-ver-002）

- 上游 `pi` / `pi-web`：**只读**（`git rev-parse` / `git status`），不 `checkout`、不 `switch`、
  不 `fetch` 出改动、不 commit。
- 本工程 `pi-desktop-hos`：在**当前分支 `main`** 上提交。**不新建 `Branch_v0.11.1`**。
- 说明：需求原文「Git分支：不改动」按字面执行。`pi`/`pi-web` 的 `Branch_v1.1.0` /
  `Branch_v0.11.1` 已由上游侧建好（U1/U2），本工程只引用。

### D3 — 补丁集：先评估、再决定是否建目录（落实 FR-ver-007 / FR-ver-008）

`patches/README.md` 已规定**空目录不建**。因此流程是：

1. 逐条复核 README 中「为什么 0 条就够」的 7 个候选（Node 门禁 / 插件闸门 /
   `node:sqlite` / zstd / 原生模块 / 网络绑定 Host·Origin / symlink·hardlink·chmod）；
2. 每条给出「上游文件路径」或「本工程实测证据」；
3. 若复核后仍全部为「不需要」→ 在 `patches/README.md` 追加一节
   **`## v0.11.1 基线复核（2026-10-12）`**，登记逐条结论与复核方式，**不建目录**；
4. 若出现「需要」→ 按 README 的 8 条纪律在 `patches/v0.11.1/` 生成，并在
   `prepare-next.mjs` 增加幂等应用阶段。

**预期结论**：全部「不需要」（基线未变：`pi` `v1.1.0` + `pi-web` `v0.11.1`，
与骨架期一致；骨架期的结论本身就是基于这两个 tag 得出的）。S2 的价值在于**复核留痕**，
而不是重复论证。

### D4 — 清理的边界（落实 FR-ver-004 / FR-ver-005 / FR-ver-006）

**删**（全部在 `.gitignore` 内，属构建期生成物）：

| 类别 | 路径 |
|---|---|
| hvigor 构建输出 | `electron/build/`、`web_engine/build/`、`.hvigor/`、`web_engine/BuildProfile.ets` |
| 应用产物 / 组装物 | `pi-dist/`、`pi-dist.tar.gz`、`pi-dist.version`、`runtime/` |
| resfile 投放物 | `web_engine/src/main/resources/resfile/resources/app/{pi-dist.tar.gz,pi-dist.version}`（`main.js`/`tar-extract.js`/`package.json`/`resources/` 由 collect-app 重建，一并清） |
| 运行时投放物 | `electron/libs/`、模块内 `**/*.so`、`web_engine/src/main/resources/resfile/` 下由 collect-runtime 投放的 Chromium 资源 |
| 脚本缓存 | `.collect-pi-tmp/`、`.collect-runtime-tmp/` |
| 阶段日志 | `logs/` |

**不删**（交付物）：`AppScope/`、`src-main/`、`scripts/`、`config/`、`extensions/`、`skills/`、
`specs/`、`docs/`、`patches/`、`runtime-overlays/`、`hvigor/`、`hvigorfile.ts`、
`build-profile.json5`、`oh-package*.json5`、`code-linter.json5`、`README.md`、`LICENSE`、
`signing.*.sample`。

**依赖目录的处置**：`node_modules/`（根与 `electron/`）、`oh_modules/` 属依赖安装产物，
不属「中间文件」，**保留**（避免无谓重装 `ohpm install`）；若流水线报依赖缺失再重装。

**可复现性验证**（FR-ver-005）：清理后必须**不依赖任何被删内容**即可跑完 S4——
`collect-runtime` 从 `harmonypc-electron-versions/v37.2.3-20260825.1-release.zip` 重建，
`prepare-next` 从 `pi-web` 源码重建，`collect-pi` 从 `pi` + `pi-web` 重建。
**唯一的成本是时间**（首次解压 ~27k 文件、`npm ci` + `next build` 数分钟）。

### D5 — 构建用 Node（落实 spec §6 C4）

宿主默认 Node 是 v24.7.0，不符合工程要求。方案：

- 在**会话 scratch**（`$PI_SCRATCH_DIR`）投放官方 **Node v22.17.0 win-x64**（与 Electron 37
  内置 Node 同版本），供 `prepare-next.mjs --node <path>` 与 `smoke-node22.mjs` 使用；
- 不写入系统 PATH、不装进工程（scratch 随会话回收，工程保持干净）。
- 已知坑：`npm ci` 与 `next build` 必须用**同一个** node（`docs/真机验证记录.md` 发现 3），
  故全程只用一个 `--node` 路径。

### D6 — 真机取证的通道（落实 FR-ver-015 / FR-ver-016 / FR-ver-019）

| 目标 | 通道 |
|---|---|
| 启动阶段事实 | `hdc shell hilog -x`（tag `pi-desktop`）+ 应用原样日志 |
| 沙箱 / 落盘事实 | `hdc shell ls -la /data/storage/el2/base/files/...`（含 `MSYS_NO_PATHCONV=1`） |
| 会话 JSONL | 设备侧读 `pi-agent/sessions/*.jsonl`（只读、脱敏） |
| 进程内断言 / DOM | CDP：`hdc fport tcp:19229 tcp:9229` **与**消费（curl）**必须在同一条命令内**（发现 13） |
| 视觉 | `webContents.capturePage()`（**不用** `snapshot_display`，发现 12） |

### D7 — 基本功能的执行路径（落实 FR-ver-017 … FR-ver-020）

三条路径都走**真实链路**，UI 优先、API 兜底：

1. **API KEY**：优先在 UI「设置 → 模型」写入；若 UI 交互不便（无鼠标注入能力），
   改为同源 `fetch` 调用 pi-web 的设置保存路由，**写入后必须回读** config 文件确认落沙箱。
2. **工作区**：调用 pi-web 的「选择工作区目录」同源路由（参考工程
   `203-插件-选择工作区目录.md` 记录的机制），把工作区指到
   `/data/storage/el2/base/files/pi-workspace-test`（**沙箱内**），并用 `hdc shell ls` 验证存在。
3. **对话**：`POST /api/agent/new` 建会话 → 发提示词「介绍一下你自己」→ 等 SSE 结束 →
   读回助手文本 + 会话 JSONL。

> 任一环节失败即按 FR-ver-020 记缺陷（根因分层：设备网络 / 凭据 / 上游适配 / 本工程平台缺口），
> **不降级为通过**。

## 3. 步骤与产出

| 步骤 | 做什么 | 产出 | 回引 |
|---|---|---|---|
| S0 锚定核对 | 核对 `pi`/`pi-web` 的 tag↔commit↔分支；记录分支列表快照 | `git rev-parse` 输出、分支快照 | FR-ver-001/002/003 |
| S1 清理 | 按 D4 删中间物；输出命中清单 | 清理日志 | FR-ver-004/005/006 |
| S2 补丁评估 | 按 D3 复核 7 个候选 | `patches/README.md` 追加复核节 | FR-ver-007/008 |
| S3 版本号 | `AppScope/app.json5` → `0.11.1`/`1101` + 注释；README、文档头同步 | 改动文件 | FR-ver-009/010/011 |
| S4 流水线 | collect-runtime → prepare-next → smoke → collect-pi → collect-app → build-debug | 日志 + `electron-default-signed.hap` | FR-ver-012/013 |
| S5 真机 | 卸载 → 安装 → 启动 → hilog 取证（含 SWC 落点） | 取证输出 | FR-ver-014/015/016 |
| S5b 基本功能 | API KEY → 工作区 → 一次对话 | 回读证据 + 会话 JSONL 片段 | FR-ver-017…020 |
| S6 能力复测 | 按参考清单逐项在设备上重测 | 原始输出 | FR-ver-021/022/023 |
| S7 报告 | 落盘 `docs/鸿蒙环境能力清单-v0.11.1.md` | 报告文件 | FR-ver-024/025 |
| S8 评审 | `requesting-code-review` 派审 → `receiving-code-review` 处置 | `REVIEW_REPORT.md` | AC-13 |
| S9 提交 | 按 `git-commit` 技能规范提交 | commit | AC-14 |

**日志目录**：`logs/20261012-1/`（当天序号 1）。含 `DEV_CHECKLIST.md`、`REVIEW_REPORT.md`、
`TEST_CHECKLIST.md`、`TEST_REPORT.md` 与原始取证文本。

## 4. 验证矩阵

| 层 | 验证 | 手段 | 门槛 |
|---|---|---|---|
| L1 静态 | 版本号三处一致、无 `0.1.0` 残留 | grep + 读文件 | 全部命中 |
| L2 流水线 | 四阶段 + 门禁 | 脚本退出码 | 0 FAIL |
| L3 构建 | HAP 签名有效、Profile 可侧载 | `hap-sign-tool verify-app` + 脚本断言 | 通过 |
| L4 部署 | 安装 + 启动到就绪 | hilog 关键行 | 全部出现 |
| L5 功能 | API KEY / 工作区 / 对话 | 回读 + JSONL | 3/3 通过 |
| L6 能力 | 清单逐项 | 设备原样输出 | 每项有结论 |
| L7 评审 | Critical/Important | `REVIEW_REPORT.md` | 0 未决 |

## 5. 风险与回滚

| 风险 | 触发条件 | 处置 |
|---|---|---|
| R-a 运行时归档缺失 | `harmonypc-electron-versions/v37.2.3-*.zip` 不存在 | S4 阶段 ① 立即失败；改为从 `harmonypc-electron` 重新导出，或报告阻塞 |
| R-b `npm ci` 失败（网络） | 构建机无外网 | 报告阻塞；不清空 `pi-web/node_modules` 作为回退（但会破坏「从零复现」结论，须显式说明） |
| R-c 设备无外网 | 对话不可达 `api.deepseek.com` | 按 FR-ver-020 记缺陷，不伪造通过 |
| R-d 首启解压超时 | 取证窗口过短 | 取证窗口 ≥60 s；必要时重试 |
| R-e hdc 偶发 `need connect-key` | 随机 | 统一重试封装（发现 13） |
| R-f 清理过度删除交付物 | 人工失误 | S1 后立刻 `git status`；出现未预期删除即 `git checkout -- <path>` |

**回滚**：本需求不改上游、不改分支，回滚 = `git revert` 本工程的提交 + 重跑 S4。
无不可逆操作（清理删掉的全部是可由流水线重建的产物）。

## 6. 不做的设计（避免过度工程）

- **不**引入补丁应用框架（补丁集为空，YAGNI）。
- **不**新增 CI 脚本或版本号单一来源工具（一处 json5 + 两处文档，手工同步成本低于抽象成本；
  若未来版本号出现在 >3 处再抽象）。
- **不**改 `scripts/` 下任何脚本（除非 S2 判定需要补丁）。
- **不**修 `bash` 工具 / PTY（R14 待决策，超出本需求）。
