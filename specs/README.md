# 规格文档索引

**项目名称：** pi-desktop-hos
**产品名：** Pi Desktop（HarmonyOS 版）
**技术栈：** Electron-on-鸿蒙（Electron 37.2.3 / Node 22.17.0 / ABI v138）+ ArkTS + HarmonyOS（封装 `pi` v1.1.0 + `pi-web` v0.11.1）
**文档生成时间：** 2026-10-11
**最后更新：** 2026-10-12

---

## 一、文档总览

| 层级 | 说明 |
|---|---|
| 项目级顶层文档 | 架构、技术、宪法、结构、数据模型等全局文档 + 能力清单 |
| 模块规格 `0NN-<name>/` | 主进程装配、构建与配置、运行时集成 |
| 扩展模块 `2NN-<name>/` | 编号从 201 起 |

每个模块目录下**必须成对**提供 `spec.md`（需求与验收）+ `plan.md`（设计与实现方案）；
复杂模块可再增加 `tasks.md`（任务拆解）、`test-cases.md`（测试用例）。

---

## 二、项目级顶层文档

| 文档 | 状态 | 说明 |
|---|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | ⬜ 待生成 | 系统整体架构（进程模型、分层、数据流、关键决策） |
| [constitution.md](./constitution.md) | ⬜ 待生成 | 项目开发原则、编码规范、治理规则 |
| [TECH.md](./TECH.md) | ⬜ 待生成 | 核心技术栈选型理由、版本、依赖说明 |
| [STRUCTURE.md](./STRUCTURE.md) | ⬜ 待生成 | 源码目录结构、模块清单、关键配置 |
| [overall-spec.md](./overall-spec.md) | ⬜ 待生成 | 系统级功能规格（技术无关） |
| [overall-plan.md](./overall-plan.md) | ⬜ 待生成 | 系统级技术方案（各模块 plan 总纲） |
| [overall-data-model.md](./overall-data-model.md) | ⬜ 待生成 | 全局数据实体、状态机、目录布局定义 |

> **当前唯一权威的规划文档是 [`../docs/工程规划.md`](../docs/工程规划.md)。** 上表的项目级
> 文档是它的**收敛/展开版**，在 Phase 1 开始时按需生成 —— 生成时**不要复制粘贴**，应当把
> 工程规划里已经论证过的结论压缩成条目并回引 § 号，避免两份文档漂移。
>
> 对齐参考工程 `dsh-desktop-hos` 的口径：本项目级规格集**不含** `API.md` /
> `overall-api.md` / `overall-test-cases.md` —— 数据面在 pi-web 侧（约 90 条 HTTP 路由 +
> SSE），本工程无自有 API 清单。

---

## 三、主进程装配模块（001-004）

> 这四个模块都在 `src-main/main.js` 里实现，拆分的意义是**规格级**的（一份需求、一份方案、
> 一段可变的职责），不是一个文件一个模块。

### 001 — Host 宿主（host）

> 环境装配（`HOME` / `PI_CODING_AGENT_DIR` / `TMPDIR` / `PI_OFFLINE`）、在主进程进程内拉起
> Next 服务器（含预览密钥轮换）、端口分配、HTTP 轮询就绪判定、随机密码与 Basic 凭据注入。

| 文档 | 状态 | 说明 |
|---|---|---|
| [001-host/spec.md](./001-host/spec.md) | ✅ 已生成 | Host 宿主功能规格 |
| [001-host/plan.md](./001-host/plan.md) | ✅ 已生成 | Host 宿主技术实现方案 |

### 002 — 窗口管理（window）

> BrowserWindow 创建、内联 loading 页（阶段文本可观测）、局域网 IP 同源加载、窗口状态记忆、
> `window.open` 拦截、`will-navigate` 限制、F11 全屏。

| 文档 | 状态 |
|---|---|
| `002-window/{spec.md,plan.md}` | ⬜ 待生成（Phase 1） |

### 003 — 生命周期与鸿蒙适配（lifecycle）

> 沙箱环境装配时机、`NO_PROXY` 并入、`--inspect` 生产移除（ArkTS 侧 overlay）、崩溃兜底与
> fail-visible 诊断落点、优雅关闭。

| 文档 | 状态 |
|---|---|
| `003-lifecycle/{spec.md,plan.md}` | ⬜ 待生成（Phase 1） |

### 004 — 产物解压引导（artifact-bootstrap）

> `pi-dist.tar.gz` 流式解压 + **SHA-256 marker** 幂等、临时目录 + 替换、失败回滚、
> 壳预置 `config/` 与 `extensions/` `skills/` 的 copy 物化（禁 symlink）、覆盖规则。

| 文档 | 状态 |
|---|---|
| `004-artifact-bootstrap/{spec.md,plan.md}` | ⬜ 待生成（Phase 1） |

---

## 四、构建与配置模块（005-006）

### 005 — 构建编排（build-pipeline）

> 四阶段流水线：`collect-runtime`（v37 归档 → electron/web_engine/SO/Chromium 资源 + prune + overlay）
> → `prepare-next`（pi-web 生产构建 + 原生件裁剪 + 预览密钥轮换）→ host 侧 Node 22.17 门禁
> → `collect-pi`（组装 pi-dist + tar.gz + SHA-256 marker）→ `collect-app`（投放 resfile）。

| 文档 | 状态 |
|---|---|
| `005-build-pipeline/{spec.md,plan.md}` | ⬜ 待生成（Phase 0 出口前） |

### 006 — 运行时配置（runtime-config）

> `config/` 预置模板（`settings.json` 的 `shellPath`/`defaultTools`/`defaultProjectTrust`、
> 空 `mcp.json`）、PL1 落地、project trust 策略。

| 文档 | 状态 |
|---|---|
| `006-runtime-config/{spec.md,plan.md}` | ⬜ 待生成（Phase 1） |

---

## 五、运行时集成模块（007-008）

> 这两个模块是 `collect-runtime` 从同级 `../harmonypc-electron` **copy** 进本工程的运行时，
> 因此规格定位是**集成面**（集成契约、prune 清单、overlay 白名单、守卫），不逐一深挖上游
> 的每个 Adapter/Binding。

### 007 — 运行时入口（runtime-entry）

> `electron` entry 模块：EntryAbility 启动 Electron-on-鸿蒙运行时、承载 3 个原生 SO +
> `libc++_shared.so` + Chromium 资源、**去浏览器语义**（`skills` 不声明 `browsable`/`viewData`）。

| 文档 | 状态 |
|---|---|
| `007-runtime-entry/{spec.md,plan.md}` | ⬜ 待生成（Phase 0 出口前） |

### 008 — Web 桥接层（web-bridge）

> `web_engine` HAR：ArkUI 组件承载窗口 + `*AdapterBind` 桥接系统能力 + `resfile` 承载应用产物
> + **ArkWeb 外链页 `pages/ExternalWeb.ets`**（合规用）。

| 文档 | 状态 |
|---|---|
| `008-web-bridge/{spec.md,plan.md}` | ⬜ 待生成（Phase 0 出口前） |

---

## 六、扩展模块（201+）

### 201 — 插件运行时（plugin-runtime）

> 插件机制三档（**PL0 全关 / PL1 仅本地源 / PL2 允许安装**）与 v1 默认档 PL1 的落地契约：
> 三个上游现成注入点（`DefaultPackageManager.resolve(onMissing)`、`PI_OFFLINE`、本地路径源）、
> 壳专用扩展与技能的落点与 copy 物化、覆盖规则、失败可见性纪律。

| 文档 | 状态 |
|---|---|
| `201-plugin-runtime/{spec.md,plan.md}` | ⬜ 待生成（Phase 1） |

### 301 — 技能运行能力规范（skill-runtime-capabilities）

> 本壳内置技能 `harmony-runtime-capabilities` 的**规范源**：能力 × 状态 × 根因层
> （L1 平台硬约束 / L2 原生产物缺失 / L3 本工程配置 / L4 上游接口缺失）× 是否可修的完整边界表。
> 技能正文是随 HAP 分发的**运行期摘要**，由本规范派生。

| 文档 | 状态 |
|---|---|
| `301-skill-runtime-capabilities/{spec.md,plan.md}` | ⬜ 待生成（Phase 1） |

---

## 七、模块编号一览

| 编号 | 模块名 | 英文名 | 分类 |
|---|---|---|---|
| 001 | Host 宿主 | `host` | 主进程装配 |
| 002 | 窗口管理 | `window` | 主进程装配 |
| 003 | 生命周期与鸿蒙适配 | `lifecycle` | 主进程装配 |
| 004 | 产物解压引导 | `artifact-bootstrap` | 主进程装配 |
| 005 | 构建编排 | `build-pipeline` | 构建与配置 |
| 006 | 运行时配置 | `runtime-config` | 构建与配置 |
| 007 | 运行时入口 | `runtime-entry` | 运行时集成 |
| 008 | Web 桥接层 | `web-bridge` | 运行时集成 |
| 201 | 插件运行时 | `plugin-runtime` | 扩展模块 |
| 301 | 技能运行能力规范 | `skill-runtime-capabilities` | 扩展模块 |

编号分配依据：`docs/工程规划.md` §6.4。**编号只增不改、不复用。**

---

## 八、文档结构规范（硬规则）

沿用 `oc-desktop-hos` 的规格体系纪律：

1. **成对交付**：`spec.md` 与 `plan.md` **必须成对**；只交一半视为未完成。
2. **目录命名**：`<NNN>-<kebab-name>`；`0NN` 装配/构建/运行时，`2NN` 扩展（从 201 起）。
3. **统一文档头**：
   ```markdown
   > **Module:** <name> ｜ **Status:** Proposed ｜ **Last Updated:** YYYY-MM-DD
   > **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）
   ```
4. **状态流转**：Proposed → Accepted → Implementing → Implemented → Superseded。
5. **不留占位小节**：未定的事项写 ⬜ + 验证方式与决策时限，**不要**留空标题或 TBD。
6. **需求条目编号**：`FR-<module>-<三位数>`；动作用 **MUST / MUST NOT / SHOULD / MAY**；
   条目**只追加不修订**，作废改标 `[SUPERSEDED by FR-xxx-nnn]`。
7. **plan 必须回引 FR**：每个技术决定要指明它满足哪条 FR；每条 FR 都要有落点。
8. **证据标记**：沿用工程规划 §0.2 的四种标记（✅ 实测 / 🔶 沿用 / ⬜ 待验证 / ⚠️ 冲突），
   **必须给出处**（文件路径或 § 号，不要写行号）。
9. **反向闭合**：plan 里出现的每个可执行项（脚本、守卫、配置）都必须落到某条 FR 或其验收场景。

---

## 九、快速导航

| 目标读者 | 推荐阅读顺序 |
|---|---|
| 先看全貌 | [`../docs/工程规划.md`](../docs/工程规划.md) → 本文件 → 具体模块 `spec.md` |
| 桌面壳开发 | `STRUCTURE.md`（待生成）→ 001/002/003/004 的 `spec.md` + `plan.md` |
| 构建 / 发布 | 005-build-pipeline → 007/008 的 `spec.md` + `plan.md` |
| 插件机制 | `../docs/工程规划.md` §5 → 201-plugin-runtime |
| 能力边界 / 评审 | `../docs/工程规划.md` §9.3、§11 → 301-skill-runtime-capabilities |

---

**文档维护者：** pi-desktop-hos 开发团队

---

## 十、版本需求与验证记录（101+）

> 与 §三–§六 的「模块规格」不同，这一节是**按版本需求**组织的收敛记录：一次版本冻结会产生
> 一份 `NNN-<version>/` 目录（spec / plan / tasks / test-cases 四件套），外加一份环境能力清单。

### 101 — 版本更新：0.11.1（version）

> 上游基线 `pi` v1.1.0 + `pi-web` v0.11.1；**零改动 git 分支**；补丁集复核为 **0 条**。

| 文档 | 状态 | 说明 |
|---|---|---|
| [101-version-0.11.1/spec.md](./101-version-0.11.1/spec.md) | ✅ 已生成 | 25 条 `FR-ver-*` + 14 条 `AC-*`（含「不得改动任何 git 分支」的分支纪律） |
| [101-version-0.11.1/plan.md](./101-version-0.11.1/plan.md) | ✅ 已生成 | `versionCode` 编码规则、补丁评估流程、清理边界、构建用 Node 处置、真机取证通道 |
| [101-version-0.11.1/tasks.md](./101-version-0.11.1/tasks.md) | ✅ 已生成 | T01–T13 + 四个里程碑 |
| [101-version-0.11.1/test-cases.md](./101-version-0.11.1/test-cases.md) | ✅ 已生成 | 60+ 用例的设计与执行结果（含一次真实阻塞的发生与解除记录） |
| [102-harmony-js-tools/spec.md](./102-harmony-js-tools/spec.md) | ✅ 已生成 | 27 条 `FR-tool-*` + 15 条 `AC-*`（同名顶替 `bash`/`grep`/`find`；`U1–U12` 上游事实带 `file:line`） |
| [102-harmony-js-tools/plan.md](./102-harmony-js-tools/plan.md) | ✅ 已生成 | D1–D10：哨兵行协议、帧构造、串行/超时/截断、纯 JS BFS 与上限、生命周期、与内建差异表 |
| [102-harmony-js-tools/tasks.md](./102-harmony-js-tools/tasks.md) | ✅ 已生成 | T01–T10 + 四个里程碑 + 执行记录（含评审修复轮） |
| [102-harmony-js-tools/test-cases.md](./102-harmony-js-tools/test-cases.md) | ✅ 已生成 | 前置验证 / 静态单测 / 投放 / 端到端（两轮真实对话）/ 不回归 / 未测，及评审修复轮用例 |
| [103-branding/spec.md](./103-branding/spec.md) | ✅ 已生成 | 15 条 `FR-brand-*` + 13 条 `AC-*`（文案、Logo/图标物料、禁用版本检测、上游零改动） |
| [103-branding/plan.md](./103-branding/plan.md) | ✅ 已生成 | D1–D7：文案替换边界、Logo/图标生成策略、上游开关用法、幂等与物料前置、流水线接线 |
| [103-branding/tasks.md](./103-branding/tasks.md) | ✅ 已生成 | T01–T09 + 四个里程碑 + 执行记录 |
| [103-branding/test-cases.md](./103-branding/test-cases.md) | ✅ 已生成 | 构建期/包内/真机/负向/不回归用例与结果 |
| [../docs/鸿蒙环境能力清单-v0.11.1.md](../docs/鸿蒙环境能力清单-v0.11.1.md) | ✅ 已生成 | **环境能力结论的权威文档**（与参考工程 `dsh-desktop-hos` 的 `v0.1.5` 清单结构同构） |
| [../docs/真机验证记录.md](../docs/真机验证记录.md) | ✅ 已更新 | 追加「轮次 2」：全流水线重建 + 可复现性 + 基本功能 + 能力复测（发现 15–27） |
| [../patches/README.md](../patches/README.md) | ✅ 已更新 | 追加 `## v0.11.1 基线复核（2026-10-12）`：8 个候选逐条源码核实，结论 0 条 |
