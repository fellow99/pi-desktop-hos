# 规格文档索引 —— `pi-desktop-hos`

**项目名称：** `pi-desktop-hos`（Pi Desktop · Electron on HarmonyOS 版 / **Electron on HarmonyOS Edition**）
**应用名 / 包名：** Pi Desktop / `org.fellow99.pi.PiDesktop`
**版本：** `0.12.1` / `versionCode` `1201`
**技术栈：** Electron-on-鸿蒙（Electron **37.2.3** / Node **22.17.0** / ABI **v138**）+ ArkTS + HarmonyOS；
上游 **`pi` v1.2.0** + **`pi-web` v0.12.1**
**文档生成时间：** 2026-10-11 ｜ **最后更新：** 2026-10-31（编号按父工程规则统一）

> 事实权威：`../docs/工程规划.md`（唯一权威规划）与 `../docs/鸿蒙环境能力清单-v0.12.1.md`（as-built 能力）。
> 行为权威：本目录各模块 `spec.md` 与 [constitution.md](./constitution.md)。
> 本目录是父工程 [`../../specs/`](../../specs/) 的**子工程实现侧**：整体规划、跨工程公共需求写在父工程，
> 本目录只写本工程的具体技术实现与独立需求。

---

## 一、文档总览

| 层级 | 分类 | 文档数量 | 说明 |
|---|---|---|---|
| 整体 | 项目级顶层文档 | 8 | `README.md` · `constitution.md` · `ARCHITECTURE.md` · `TECH.md` · `STRUCTURE.md` · `overall-spec.md` · `overall-plan.md` · `overall-data-model.md` |
| 模块 | 公共模块（`011` / `013`） | 3 目录 / 12 文档 | 版本更新 0.11.1 / 0.12.1、品牌化 |
| 模块 | 基础模块（`1XX`） | 3 目录 / 8 文档 | 101 宿主、106 纯 JS 工具扩展、108 签名与应用身份 |
| 模块 | 插件模块（`2XX`） | 2 目录 / 8 文档 | 203 选择工作区目录、204 Git |
| **合计** | **9 个目录** | **36 份文档** | `specs/` 自身 + 8 模块 = 9 目录；项目级 8 + 模块 28 = 36 个 `.md` |

> **刻意不生成** `API.md` / `overall-api.md`：数据面由上游 `pi-web` 提供（约 90 条 HTTP 路由 + SSE），
> 本工程不自有 API。`overall-test-cases.md` 的用例分散在各模块 `test-cases.md` 与 `../docs/真机验证记录.md`。

---

## 二、项目级顶层文档

| 文档 | 状态 | 说明 |
|---|---|---|
| [README.md](./README.md) | ✅ | 本索引：文档总览 + 模块清单 + 编号规则 + 阅读顺序 |
| [constitution.md](./constitution.md) | ✅ | 项目宪法：零上游改动、进程内宿主、薄壳、失败可见、证据纪律 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | ✅ | 进程模型、electron / web_engine 分层、启动时序、数据流 |
| [TECH.md](./TECH.md) | ✅ | Electron-on-鸿蒙运行时、Node 22.17、ArkTS、构建工具链 |
| [STRUCTURE.md](./STRUCTURE.md) | ✅ | 目录结构、关键配置、resfile 落点 |
| [overall-spec.md](./overall-spec.md) | ✅ | 系统级功能规格（技术无关，`FR-HOS-*`） |
| [overall-plan.md](./overall-plan.md) | ✅ | 系统级技术方案（五阶段流水线、签名、真机验证） |
| [overall-data-model.md](./overall-data-model.md) | ✅ | 沙箱目录、会话、凭据、配置模板 |

> 项目级文档是本工程 `../docs/工程规划.md` 的**收敛版**：只压缩结论并回引 § 号，不复制论证过程。
> 技术事实以 `../docs/工程规划.md` 与源码为准；父工程 [`../../specs/ARCHITECTURE.md`](../../specs/ARCHITECTURE.md)
> 给出四版共同架构，本工程只补充 Electron-on-鸿蒙的差异。

---

## 三、公共模块（`011` / `013`）

> 编号 `0XX` 是父工程定义的**跨工程公共需求模块**。`012-building-workflow` 按父工程规则
> **不适用于鸿蒙工程**（本工程无 GitHub Actions 构建工作流，构建由本地 `scripts/*.mjs` + hvigor 完成）。

### 011 — 版本更新（version）

| 文档 | 链接 | 说明 |
|---|---|---|
| 0.12.1 功能规格 | [011-version-0.12.1/spec.md](./011-version-0.12.1/spec.md) | 上游 v1.2.0 / v0.12.1、版本号 0.12.1 / 1201、两条补丁再生、五阶段重建 |
| 0.12.1 技术方案 | [011-version-0.12.1/plan.md](./011-version-0.12.1/plan.md) | 版本收敛步骤、补丁评估、构建与真机验证 |
| 0.12.1 任务 / 用例 | [tasks.md](./011-version-0.12.1/tasks.md) · [test-cases.md](./011-version-0.12.1/test-cases.md) | 任务拆解与验收用例 |
| 0.11.1 历史版本 | [011-version-0.11.1/](./011-version-0.11.1/) | 历史版本目录，保留当时结论，不重编号 |

### 013 — 品牌化（branding）

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [013-branding/spec.md](./013-branding/spec.md) | `Pi Web` → `Pi Desktop`、Logo/图标统一、禁用新版本检测 |
| 技术方案 | [013-branding/plan.md](./013-branding/plan.md) | 构建期品牌化、`runtime-overlays/`、物料校验 |
| 任务 / 用例 | [tasks.md](./013-branding/tasks.md) · [test-cases.md](./013-branding/test-cases.md) | 品牌化任务与真机验收 |

---

## 四、基础模块（`1XX`）

> `1XX` 是本工程自己的基础功能模块；101–104 尽量与 `pi-desktop-android` 基线对齐，
> 平台特有职责从 108 起。未生成的模块不占号，生成时再按父工程规则分配。

### 101 — Host 宿主（host）

> 环境装配（`HOME` / `PI_CODING_AGENT_DIR` / `TMPDIR` / `PI_OFFLINE`）、主进程进程内拉起 Next 服务器
> （含预览密钥轮换）、端口分配、HTTP 轮询就绪判定、随机密码与 Basic 凭据注入。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [101-host/spec.md](./101-host/spec.md) | `FR-host-*` / 验收场景 |
| 技术方案 | [101-host/plan.md](./101-host/plan.md) | `src-main/main.js` 启动编排与凭据注入 |

### 106 — 纯 JS 工具扩展（harmony-js-tools）

> 用随包纯 JS 扩展同名顶替 `bash` / `find` / `grep`：常驻 `mksh` + 哨兵、纯 JS 搜索、零 `fd`/`rg`/子进程；
> 上游与补丁零改动。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [106-harmony-js-tools/spec.md](./106-harmony-js-tools/spec.md) | 顶替范围、哨兵协议、限制 |
| 技术方案 | [106-harmony-js-tools/plan.md](./106-harmony-js-tools/plan.md) | 扩展实现与装配 |
| 任务 / 用例 | [tasks.md](./106-harmony-js-tools/tasks.md) · [test-cases.md](./106-harmony-js-tools/test-cases.md) | 任务拆解与真机用例 |

### 108 — 签名与应用身份（signing-identity）

> bundleName / 显示名同步、签名材料仅内存注入（`hvigorfile.ts`）、ACL 归属、
> `versionCode` 规则与上架身份类合规守卫。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [108-signing-identity/spec.md](./108-signing-identity/spec.md) | `FR-108-*`、ACL 与签名约束 |
| 技术方案 | [108-signing-identity/plan.md](./108-signing-identity/plan.md) | 签名注入、版本号规则、合规守卫 |

### 未生成的基础模块（不占号）

以下职责已在 `src-main/main.js` / `src-main/tar-extract.js` / `hvigorfile.ts` 中实现，但尚未拆成独立 `spec.md` / `plan.md`；
生成时按父工程规则分配编号（预计落在 `102` 载荷、`103` 渲染壳、`109` 生命周期、`110` 运行时配置、`111` 运行时入口、`112` Web 桥接）：

- 窗口管理（BrowserWindow、loading 页、导航加固）
- 生命周期与鸿蒙适配（沙箱环境、`NO_PROXY`、崩溃兜底、优雅关闭）
- 产物解压引导（`pi-dist.tar.gz` 流式解压 + SHA-256 marker 幂等）
- 构建编排（`collect-runtime` / `prepare-next` / `collect-pi` / `collect-app`）
- 运行时配置（`config/` 预置模板、project trust）
- 运行时入口（`electron` entry 模块）与 Web 桥接层（`web_engine` HAR）

---

## 五、插件模块（`2XX`）

### 203 — 插件：选择工作区目录（plugin-workspace-picker）

> 四主目录（沙箱/桌面/文档/下载）Tab、只向下的浏览围栏、授权归因、主目录记忆；
> 壳侧解析四根并经 `PI_HOS_ROOTS` 交给同进程 pi-web；补丁 `P203-1`。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [203-plugin-workspace-picker/spec.md](./203-plugin-workspace-picker/spec.md) | 26 条 `FR-203-*` + 10 个验收场景 |
| 技术方案 | [203-plugin-workspace-picker/plan.md](./203-plugin-workspace-picker/plan.md) | D1–D7 决策、补丁工程化、风险 |
| 任务 / 用例 | [tasks.md](./203-plugin-workspace-picker/tasks.md) · [test-cases.md](./203-plugin-workspace-picker/test-cases.md) | T01–T32 与 TC-B/D/R 用例 |

### 204 — 插件：Git 操作（plugin-git）

> 纯 JS `harmony-git` 扩展（isomorphic-git 1.44.2）：21 个 `git_*` 工具 + `git_credentials`；
> 无系统 git 二进制；本工程是 hos / ark 的单一事实源。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [204-plugin-git/spec.md](./204-plugin-git/spec.md) | 工具面、凭据、围栏、缺口 |
| 技术方案 | [204-plugin-git/plan.md](./204-plugin-git/plan.md) | 扩展装配、bundle、权限桥 |
| 任务 / 用例 | [tasks.md](./204-plugin-git/tasks.md) · [test-cases.md](./204-plugin-git/test-cases.md) | 任务与端到端用例 |

---

## 六、编号规则与迁移

### 6.1 编号规则（与父工程 `../../specs/constitution.md` 一致）

1. `0XX` —— 各子工程公共、共同的需求模块：
   - `011-version-<VERSION>`：版本更新（历史版本目录保留，不重编号）；
   - `012-building-workflow`：构建工作流（**鸿蒙工程暂无**，本工程不使用该编号）；
   - `013-branding`：品牌化。
2. `1XX` —— 本工程自己的基础功能模块；尽量与 `pi-desktop-android` 基线对齐
   （101 运行时接入、102 载荷流水线、103 渲染壳、104 宿主能力桥），平台特有职责从 108 起。
3. `2XX` —— 补丁、插件模块；共通插件尽量对齐（203 目录选择器、204 Git、205 pnpm、206 PTY）。
4. 编号只增不改、不复用；未生成模块不占号。模块编号 ⇄ 目录 ⇄ `FR-<module>-*` 三处必须一致。

### 6.2 编号迁移对照（2026-10-31）

| 旧编号 | 新编号 | 说明 |
|---|---|---|
| `001-host` | `101-host` | 对齐 android 101 运行时接入 |
| `006-signing-identity` | `108-signing-identity` | 平台特有职责落到 108 |
| `106-harmony-js-tools` | `106-harmony-js-tools` | 对齐 android 106 工具扩展 |
| `011-version-0.11.1` | `011-version-0.11.1` | 版本模块统一为 011 |
| `011-version-0.12.1` | `011-version-0.12.1` | 版本模块统一为 011 |
| `013-branding` | `013-branding` | 公共模块统一为 013 |

> 迁移只改编号与引用，不改模块职责；`git mv` 保留文件历史。

---

## 七、文档结构规范（硬规则）

1. **成对交付**：`spec.md` 与 `plan.md` **必须成对**；只交一半视为未完成。
2. **目录命名**：`<NNN>-<kebab-name>`；公共模块 `0NN`、基础模块 `1NN`、插件模块 `2NN`。
3. **统一文档头**：`Module` / `Status` / `Last Updated` / `上游基线`。
4. **状态流转**：Proposed → Accepted → Implementing → Implemented → Superseded。
5. **不留占位小节**：未定事项写 `⬜` + 验证方式与决策时限，不写 TBD。
6. **需求条目**：`FR-<module>-<三位数>`；MUST / MUST NOT / SHOULD / MAY；只追加不修订。
7. **plan 回引 FR**：每个技术决定指明满足哪条 FR；每条 FR 都要有落点。
8. **证据标记**：✅ 实测 / 🔶 沿用 / ⬜ 待验证 / ⚠️ 冲突；必须给出处。
9. **源码即真理**：文档与源码冲突时以源码为准，并回改文档。

---

## 八、快速导航

| 目标读者 | 推荐阅读顺序 |
|---|---|
| 先看全貌 | [`../../specs/`](../../specs/) → 本文件 → [`../docs/工程规划.md`](../docs/工程规划.md) |
| 新加入开发者 | [`../../specs/constitution.md`](../../specs/constitution.md) → 本文件 → `101-host` → `106-harmony-js-tools` |
| 构建 / 发布 | [`../docs/工程规划.md`](../docs/工程规划.md) §8 → `011-version-0.12.1` → `108-signing-identity` |
| 品牌 / 物料 | `013-branding` → `../docs/media-placeholder-icons.md` → 父工程 `assets/` |
| 真机 / 取证 | `011-version-0.12.1/test-cases.md` → `../docs/真机验证记录.md` → `../docs/鸿蒙环境能力清单-v0.12.1.md` |
| 插件 / 扩展 | `204-plugin-git` → `203-plugin-workspace-picker` → `106-harmony-js-tools` |
