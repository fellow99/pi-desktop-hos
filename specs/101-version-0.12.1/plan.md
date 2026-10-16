# 101 — 版本更新：0.12.1（version）技术方案

> **Module:** version ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-15
> **上游基线:** pi v1.2.0（Branch_v1.2.0）· pi-web v0.12.1（Branch_v0.12.1）
> **需求编号:** 101-version-0.12.1
> **规格依据:** [`spec.md`](./spec.md)（FR-ver-001 … FR-ver-032）
> **前序方案:** [`../101-version-0.11.1/plan.md`](../101-version-0.11.1/plan.md)（D1–D7 仍有效，本方案只写差异）

## 1. 方案总览

本需求**不引入新架构**，是一次「上游升级 → 收敛 → 复现 → 验证」：

```
S0 锚定核对(pi v1.2.0 / pi-web v0.12.1) → S1 清理 → S2 补丁在 v0.12.1 上再生成 → S3 版本号 0.12.1/1201
                                                                               ↓
                              S7 能力清单 v0.12.1 ← S6 能力复测 ← S5 真机部署 + 基本功能 ← S4 全流水线重建
                                                                               ↓
                                                          S8 代码评审 → S9 提交 + tag v0.12.1
```

## 2. 与 0.11.1 方案的差异（本版只写变化）

| 项 | 0.11.1 | 0.12.1 | 依据 |
|---|---|---|---|
| 上游 `pi` | `v1.1.0` / `abe508e1…` | **`v1.2.0` / `06a4669355…`** | FR-ver-001 |
| 上游 `pi-web` | `v0.11.1` / `e78372193b…` | **`v0.12.1` / `f83b1a502f…`** | FR-ver-001 |
| 补丁 | **0 条**（新建目录结论为「不建」） | **2 条**，已在 `patches/v0.11.1/`；本轮**在新目录 `patches/v0.12.1/` 再生成** | FR-ver-009 |
| 补丁应用目录 | `prepare-next.mjs` 无补丁阶段 | `PI_WEB_PATCH_TAG = 'v0.12.1'` | FR-ver-010 |
| `versionName` / `versionCode` | `0.11.1` / `1101` | **`0.12.1` / `1201`** | FR-ver-013 |
| 能力清单文档 | 新建 `docs/鸿蒙环境能力清单-v0.11.1.md` | 新建 `docs/鸿蒙环境能力清单-v0.12.1.md`（结构同构） | FR-ver-028 |
| 结束动作 | 提交 | 提交 + **tag `v0.12.1`** | FR-ver-032 |

## 3. 关键决策

### D1 — `versionCode` 编码规则（沿用 0.11.1 D1，落实 FR-ver-013/015）

```
versionCode = major × 10_000 + minor × 100 + patch
```

| versionName | versionCode |
|---|---|
| `0.1.0`（骨架期占位） | `1000`（当时手写，无公式） |
| `0.11.1` | `1101` |
| **`0.12.1`（本版）** | **`1201`** ✅ `1201 > 1101` |

留痕要求：`AppScope/app.json5` 注释里更新公式与本次推导（`0.12.1 -> 0*10000 + 12*100 + 1 = 1201`）。

### D2 — 不改动任何 git 分支（落实 FR-ver-002）

- `pi` / `pi-web`：**只读**。为补丁再生允许 `git worktree add --detach <scratch> v0.12.1`（FR-ver-004）——
  它**新增**一个 detached worktree，不切换、不新建分支、不改动 `../pi-web` 主工作树；收尾 `git worktree remove --force`。
- `pi-desktop-hos`：在既有 `main` 上提交。**不新建 `Branch_v0.12.1`**。

### D3 — 补丁：为什么是「再生成」而不是「直接复用」

1. 仓库纪律（`patches/README.md`）规定补丁**按被 patch 的上游 tag 分目录**，上游升级即新建目录。
2. 实测（U6）：两条旧补丁在 v0.12.1 上 `git apply --check` 通过，但 `0001` 对三套 `lib/i18n/messages/*.ts`
   有 **+5 行上下文偏移**——context 行已与 v0.12.1 源码不一致。
3. 直接复用会留下「补丁 context 指向 v0.11.1 文本」的隐性错配，且未来偏移累积到超过 git 的模糊匹配阈值
   会突然失败。再生成可消掉偏移、并把 v0.12.1 的真实 context 固化进补丁。
4. 复用原有**语义**（不做功能改动）：`P203-1` = 四主目录工作区选择器；`PFIX-1` = 会话导出进程内回退。

**生成方法（对每条补丁，逐条执行）**

```
git -C ../pi-web worktree add --detach <scratch>/pw-v0.12.1 v0.12.1
git -C <scratch>/pw-v0.12.1 apply <patches/v0.11.1/000N-*.patch>      # 旧补丁先落到 v0.12.1 树上
git -C <scratch>/pw-v0.12.1 add -A -- <受影响的文件列表>
git -C <scratch>/pw-v0.12.1 diff --cached > patches/v0.12.1/000N-*.patch   # 新 context，无 lockfile/二进制
git -C <scratch>/pw-v0.12.1 reset --hard            # 回到 pristine
```
收尾：`git -C ../pi-web worktree remove --force <scratch>/pw-v0.12.1`。

**验收三断言**（FR-ver-009/011）
1. pristine v0.12.1 上 `git apply --check` 通过；
2. 应用后语义守卫命中：`lib/directory-browser.ts` 含 `WORKSPACE_ROOTS_ENV`、
   `app/api/sessions/[id]/export/route.ts` 含 `existsSync(process.execPath)`；
3. 应用 → 反向 → 受影响的每个文件 SHA-256 逐字节还原（由 `prepare-next.mjs` 既有断言执行）。

### D4 — 清理清单（落实 FR-ver-005/006/007）

**删（中间/临时产物）**：`electron/build/`、`web_engine/build/`、`.hvigor/`、`pi-dist/`、
`pi-dist.tar.gz`、`pi-dist.version`、`.collect-pi-tmp/`、`.collect-runtime-tmp/`、`runtime/`、
`electron/libs/`、`web_engine/src/main/resources/resfile/resources/app/pi-dist.*`。

**不删（交付物）**：`src-main/`、`electron/`(源码部分)、`web_engine/`(源码部分)、`AppScope/`、`config/`、
`extensions/`、`skills/`、`patches/`、`runtime-overlays/`、`specs/`、`docs/`、`scripts/`、`logs/`（历史轮次）。

### D5 — 版本号同步点（落实 FR-ver-014）

| # | 文件 | 动作 |
|---|---|---|
| 1 | `AppScope/app.json5` | `versionName 0.12.1` / `versionCode 1201` + 注释更新 |
| 2 | `src-main/package.json` | `version: 0.12.1` |
| 3 | `README.md` / `README_zh.md` | 版本行 + 上游基线行（`pi v1.2.0` / `pi-web v0.12.1`）+ specs 表新增 101 行 + 能力清单链接改指 `v0.12.1` |
| 4 | `docs/工程规划.md` | 文档头（版本/状态/上游基线/产物字节数待回填）+ §11 相关行 |
| 5 | `specs/README.md` | 技术栈行 + §六/§七编号一览增行 |

**保留历史值**（FR-ver-016）：`docs/真机验证记录.md`（历史轮次表）、`specs/101-version-0.11.1/*`、
`specs/203-plugin-workspace-picker/*` 的历史叙述。

### D6 — 本工程能力清单（落实 FR-ver-026/027/028/029）

- 来源：`docs/鸿蒙环境能力清单-v0.11.1.md`（含 REV-1 / REV-2）。
- 方法：提取能力项 → 在 0.12.1 产物上逐项重跑 → 原样落盘输出 → 给结论（✅/⚠️/❌ + 原因）。
- 结构：与 `v0.11.1` **同章节、同「结论/方法/证据」组织方式**；新增 `REV-3`（本版复测修订）。
- 必录差异项（FR-ver-029）：进程内宿主无子进程、`bash` 工具、PTY、Host 围栏天然放行、
  逐像素渲染、`find`/`grep` 纯 JS 扩展替代。

## 4. 风险与处置

| # | 风险 | 处置 |
|---|---|---|
| R-a | 构建机无 Node 22.17.0 | 先投放 `node-v22.17.0-win-x64` 到 scratch（C2） |
| R-b | v0.12.1 上游大改（194 文件）导致补丁语义失效 | 三断言 + 既有语义守卫（D3） |
| R-c | 设备不在线 / 需 `connect-key` | 每步 `hdc list targets` 预检；失败重试（C4） |
| R-d | 设备无外网 → 对话失败 | 按 FR-ver-025 记缺陷并分层，不改判通过 |
| R-e | 误提交本地签名密钥 | 分文件 `git add`，永不 `git add -A`（C7 / FR-ver-031） |
| R-f | 清理过度删掉交付物 | 清理后立即 `git status` 复核（FR-ver-007） |
