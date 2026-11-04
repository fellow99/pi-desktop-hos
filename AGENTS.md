# AGENTS.md — pi-desktop-hos（Pi Desktop · Electron on HarmonyOS 版）

> 本文件是本工程（`pi-desktop-hos`）的 AI Agent 工作规范与导航入口。
> 事实权威：`docs/工程规划.md` ＋ `docs/鸿蒙环境能力清单-v0.12.1.md`；行为权威：`specs/constitution.md`。本文档只做收敛与回引。

---

## 一、项目定位

**Pi Desktop · Electron on HarmonyOS 版**（`pi-desktop-hos`）—— 基于 **Electron-on-鸿蒙** 运行时
（`harmonypc-electron`，Electron **37.2.3** / Node **22.17.0** / ABI **v138**）的鸿蒙原生桌面壳，
打包为**可签名、可分发的 HAP**。它在 Electron 主进程内承载 `pi-web` 的 Next 服务器（含 agent 与 `/api/*`），
渲染层同源加载该服务的 UI。**UI 100% 复用上游，补丁 2 条**，不 fork 前端。

- 应用名 / 包名：`Pi Desktop` / `org.fellow99.pi.PiDesktop`
- 版本：`0.15.0` / `versionCode` `1500`（**已签名真机部署验证** v0.15.0）
- 上游基线：`pi` **v1.5.0** + `pi-web` **v0.15.0**
- 与 `pi-desktop-ark` 的关系：同为鸿蒙版别；本版**保留 Electron 运行时**（桌面 API 面更全）；ark 版是纯 ArkWeb + 进程内 Node。

## 二、关键目录

| 路径 | 作用 |
|---|---|
| `electron/` | Electron 入口（`main.js`：环境装配 → 解压 pi-dist → 进程内 Next 服务器 → 建窗） |
| `web_engine/` | ArkTS 桥接层（HAR）+ resfile 承载应用载荷 |
| `extensions/` | 纯 JS 工具扩展（`bash`/`find`/`grep` 同名顶替，见 106 模块） |
| `src-main/` | 主侧源码 |
| `scripts/` | 装配/构建脚本（`collect-pi.mjs`、`collect-runtime.mjs`、`prepare-next.mjs`、`brand-assets.mjs`、`smoke-node22.mjs`） |
| `specs/` | 规格文档集（`011` 版本 / `013` 品牌化 / `1XX` 基础 / `2XX` 插件） |
| `docs/` | 工程规划、鸿蒙环境能力清单、真机验证记录 |
| `patches/` | 上游补丁（当前 2 条登记补丁） |

**构建前提**：依赖兄弟目录 `../harmonypc-electron`（运行时）、`../harmonypc-electron-versions`（v37 归档）、
`../pi`、`../pi-web`、`../assets`；脱离 `pi-workspace` 单独 clone 会构建失败。

## 三、常用命令

```bash
# 构建 HAP（本地 hvigor，无 GitHub Actions —— 本工程不适用父工程 012 构建工作流）
# 需先 ohpm install 依赖，再设 DEVECO_SDK_HOME，经 hvigorw 构建；产物为签名/未签名 HAP
```

> 具体命令与 `DEVECO_SDK_HOME`/`hvigorw` 的设参见 README「构建」节与 `docs/工程规划.md`。

## 四、规格文档（specs）

- 编号：`0XX` 公共模块（011 版本 / 013 品牌化；`012-building-workflow` **不适用于鸿蒙工程**）·
  `1XX` 基础模块（101 宿主、106 纯 JS 工具扩展、108 签名与应用身份）· `2XX` 插件模块（203 目录选择、204 Git）。
- 每个模块目录成对提供 `spec.md`（需求/验收）＋ `plan.md`（方案）＋ `tasks.md` / `test-cases.md`。
- 证据纪律：`✅ 已核实` · `🔶 沿用` · `⬜ 待验证` · `⚠️ 风险`；`🔶` 不得当作本工程实测事实。
- 2026-10 状态：`203`/`204` 代码已装配，正式 spec 头部仍标 "Proposed"，后续文档轮次对齐。

## 五、CodeGraph 代码地图规范

> 本工程已建立 CodeGraph 语义索引，AI 探索**优先走 CodeGraph**。

- 索引位置：`.codegraph/`（不入库，已 `.gitignore`）。
- **自动更新**：git `post-commit` 钩子（`.git/modules/pi-desktop-hos/hooks/post-commit`）在每次提交后自动 `codegraph sync`，非阻塞、不破坏提交。
- 常用命令：`codegraph status` / `codegraph context "<任务>"` / `codegraph query|callers|callees|impact <符号>` / `codegraph affected <文件>`。
- 改动大量源码后查不到符号，先 `codegraph sync` 再查。

## 六、提交纪律

- Conventional Commits（`feat`/`fix`/`docs`/`style`/`refactor`/`perf`/`test`/`build`/`ci`/`chore`/`revert`）。
- **严禁** `git add -A` / `git add .`：只暂存本会话改动的文件。
- **运行时不入库**：`/pi-dist/`、`*.so`、`/electron/libs/`、`/runtime/`、`*.hap` 为构建产物，绝不提交。
- **签名材料绝不提交**：`signing.*.local.json`、`.p12`、`.p7b`、`.cer`（样例 `.sample` 才入库）。
- 严禁提交密钥 / Token / 口令。

## 七、安全红线

- 严禁 `as any` / `@ts-ignore` / `@ts-expect-error` 压制类型错误。
- 严禁空的 `catch(e) {}`。
- 修复 Bug 只做最小改动，禁止顺手重构；禁止臆测未读取的代码。
