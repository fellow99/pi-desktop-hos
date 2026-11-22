# 113-system-back — spec（系统级返回按钮行为改造 · HOS）

> **Module:** 113-system-back ｜ **Status:** 已实现（静态核对通过）· 真机 ⬜ 待验证 ｜ **Last Updated:** 2026-11-22
> **需求编号:** 113-system-back ｜ **需求名称:** 修改系统级返回按钮对应用的行为
> **git 分支:** 不改动 ｜ **测试:** 无鸿蒙真机，跳过测试（仅静态核对）
> **上游基线:** pi-web v0.17.0（tag `v0.17.0`）· Electron on HarmonyOS（web_engine 承载）
> **实现载体:** 上游幂等补丁 `patches/v0.17.0/0003-system-back.patch` + Electron 主进程 `src-main/main.js`（含投放副本 `web_engine/src/main/resources/resfile/resources/app/main.js`）；**ArkUI 侧不拦截**
> **注:** 该需求**不注册到父工程 specs**，仅落到各子工程 `specs/113-system-back/`。

---

## 1. 模块概述

### 1.1 目的

把系统级「返回」键行为改造为「按界面浮层收敛」：

- 设置页打开 → **关闭设置页**；
- 移动端抽屉打开 → **收回抽屉**；
- 首页 / 会话页 / 无浮层 → **不做任何操作**（不退出、不导航）。

### 1.2 解决的问题

| # | 痛点 | 结论 |
|---|---|---|
| 1 | HOS 主界面返回语义缺失（ArkUI 侧现行仅拦 ESC） | 返回键由 **Electron 主进程**捕获并派发 `pi-back`；Electron on HarmonyOS 下 **ArkUI 不做键拦截**（拦截会吞键） |
| 2 | Web 浮层状态在 React 内部 | 走幂等补丁改 pi-web（AppShell），壳负责捕获 + 派发 |
| 3 | 首页/会话页返回无意义 | no-op（不退出/不导航） |

**范围收敛（用户确认 ①）：** 不驱动 HTML 弹窗。
**范围收敛（用户确认 ②）：** 全自动执行流程；鸿蒙无真机 → **跳过测试阶段**。

### 1.3 范围

**包含**：web 补丁 `0003-system-back.patch`、Electron `main.js` 返回键派发、主进程投放副本、spec 四件套。
**不包含**：ArkUI 侧 `KEYCODE_BACK` 拦截（见 FR-HOS-113-008 的排除理由）、HTML 弹窗返回关闭、真机测试（无设备）、父工程 specs 登记。

## 2. 用户故事

- 作为用户，我在设置页按系统返回，设置页关闭。
- 作为用户，我拉出移动端抽屉后按系统返回，抽屉收回。
- 作为用户，我在首页或会话页按系统返回，应用保持现状、不退出。

## 3. 功能需求

### 3.1 协议（web ⇄ 壳）

- **FR-HOS-113-001** Electron 主进程捕获到返回语义输入时 MUST 经
  `win.webContents.executeJavaScript("window.dispatchEvent(new Event('pi-back'))")` 派发事件（`.catch` 兜底）。
- **FR-HOS-113-002** 事件协议名统一为 `'pi-back'`，三平台一致。
- **FR-HOS-113-003** Electron on HarmonyOS 下系统返回键在 Electron 中收为 Chromium 专用键位
  `BrowserBack`，**派发路径唯一由 Electron 主进程承担**；宿主 ArkUI 层不拦截该键（FR-HOS-113-008）。
  真机逐项确认 ⬜ 待验证（无设备）。

### 3.2 Web 补丁行为（pi-web AppShell，与 android/ark 同一份 diff）

- **FR-HOS-113-004** 收到 `pi-back` 且 `settingsSection !== null` ⇒ 关闭设置页。
- **FR-HOS-113-005** 设置页未开、`isMobile && sidebarOpen` ⇒ 收回抽屉。
- **FR-HOS-113-006** 其余（首页/会话页/无浮层）⇒ no-op。

### 3.3 宿主（Electron main.js + 投放副本）

- **FR-HOS-113-007** Electron `installWindowShortcuts` 的 `before-input-event`：识别 `input.code === 'BrowserBack'`
  （专用返回键位，避免与文本输入 Backspace 冲突）⇒ 派发 `pi-back`，不 preventDefault。
- **FR-HOS-113-008** ArkUI `onKeyEvent` MUST NOT 拦截 `KeyCode.KEYCODE_BACK`，只保留 `KEYCODE_ESCAPE`。理由（Electron on HarmonyOS 特性）：
  1. 返回语义在该运行时下由 Electron 主进程经渲染进程 `BrowserBack` 收口（FR-HOS-113-007）；ArkUI 侧对 `KEYCODE_BACK`
     做 `stopPropagation` 会在宿主层把键吞掉，渲染进程收不到 `BrowserBack`，`pi-back` 永不派发；
  2. `electron/src/main/ets/pages/Index.ets` 是 `scripts/collect-runtime.mjs` 阶段 3 从
     `runtime-overlays/electron/src/main/ets/pages/Index.ets` **回盖**的派生副本（阶段 7.6 以 md5 守卫「源 = 目标」），
     定制只能写在 `runtime-overlays/**`；写进派生副本的改动下一次回盖即丢失，且会让守卫 7.6 不通过。
  `⬜ 待验证`：系统返回键在真机上的实际输入映射（是否另有 ArkUI 侧路径）无设备无法实测。
- **FR-HOS-113-009** 兜底异常：`executeJavaScript` 失败只 warn，不破坏返回键/主流程。
- **FR-HOS-113-010** 不引入文本输入歧义：绝不把 `Backspace`（文本删除键）当返回处理。
- **FR-HOS-113-011** 载荷副本 MUST 与 `src-main/main.js` 同步：`web_engine/src/main/resources/resfile/resources/app/main.js`
  由 `scripts/collect-app.mjs`（阶段 ④）从 `src-main/` 投放，改动主进程后 MUST 重跑投放并把副本一并入库，
  否则 HAP 内运行的是旧实现（主进程源码与 HAP 实跑代码脱节）。

## 4. 验收

| # | 判据 | 状态 |
|---|---|---|
| 1 | 3 条上游补丁（0001/0002/0003）幂等应用 | ✅（`patches/v0.17.0/`，0003 与 v0.15.0 同名补丁内容一致） |
| 2 | main.js `before-input-event` 分支静态核对（BrowserBack → 派发 `pi-back`、不 preventDefault、不映射 Backspace） | ✅ |
| 3 | 交付物一致：`src-main/main.js` ≡ `web_engine/.../app/main.js`（投放副本）、ArkUI 无 `KEYCODE_BACK` 拦截、`collect-runtime --verify-only` 守卫 7.6 通过 | ✅ |
| 4 | 协议名三平台一致 | ✅（android/ark/hos 均为 `'pi-back'`） |
| 5 | ~~真机用例~~（无鸿蒙真机，跳过） | — |
| 6 | 返回键真机输入映射 | ⬜ 待验证 |

## 5. 实现锚点

- `patches/v0.17.0/0003-system-back.patch`（pi-web `components/AppShell.tsx`；与 `patches/v0.15.0/0003-system-back.patch` 内容一致）
- `src-main/main.js`（`installWindowShortcuts` 的 `before-input-event`）
- `web_engine/src/main/resources/resfile/resources/app/main.js`（`collect-app.mjs` ④ 投放副本，MUST 与 `src-main/main.js` 一致）
- `runtime-overlays/electron/src/main/ets/pages/Index.ets`（ArkUI 源：仅 `KEYCODE_ESCAPE`，**不含** `KEYCODE_BACK`；派生副本 `electron/src/main/ets/pages/Index.ets` 由阶段 3 回盖）

## 6. 修订记录

| 日期 | 变更 |
|---|---|
| 2026-11-11 | 初版：双路径（ArkUI `KEYCODE_BACK` stopPropagation + Electron `BrowserBack` 派发），基线 pi-web v0.15.0 |
| 2026-11-22 | 按 Electron on HarmonyOS 实况修正：撤销 ArkUI 侧 `KEYCODE_BACK` 拦截（该定制当时落在派生副本上、overlay 源从未包含，故进不了 HAP 且守卫 7.6 不通过）；补齐投放副本的 `BrowserBack` 派发（FR-HOS-113-011）；基线更新为 pi-web v0.17.0；`collect-runtime --verify-only` 全部守卫通过 |
