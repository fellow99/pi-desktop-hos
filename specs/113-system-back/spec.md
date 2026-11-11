# 113-system-back — spec（系统级返回按钮行为改造 · HOS）

> **Module:** 113-system-back ｜ **Status:** 开发中 ｜ **Last Updated:** 2026-11-11
> **需求编号:** 113-system-back ｜ **需求名称:** 修改系统级返回按钮对应用的行为
> **git 分支:** 不改动 ｜ **测试:** 无鸿蒙真机，跳过测试（仅静态核对）
> **上游基线:** pi-web v0.15.0（tag `f130910`）· Electron on HarmonyOS（web_engine 承载）
> **实现载体:** 上游幂等补丁 `patches/v0.15.0/0003-system-back.patch` + Electron 主进程 `src-main/main.js` + ArkUI `electron/src/main/ets/pages/Index.ets`
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
| 1 | HOS 主界面返回语义缺失（现行仅拦 ESC） | 定义 BACK 双路径：ArkUI 防退出 + Electron 派发 `pi-back` |
| 2 | Web 浮层状态在 React 内部 | 走幂等补丁改 pi-web（AppShell），壳负责捕获 + 派发 |
| 3 | 首页/会话页返回无意义 | no-op（不退出/不导航） |

**范围收敛（用户确认 ①）：** 不驱动 HTML 弹窗。
**范围收敛（用户确认 ②）：** 全自动执行流程；鸿蒙无真机 → **跳过测试阶段**。

### 1.3 范围

**包含**：web 补丁 `0003-system-back.patch`、Electron `main.js` 返回键派发、ArkUI `Index.ets` BACK 键拦截、spec 四件套。
**不包含**：HTML 弹窗返回关闭、真机测试（无设备）、父工程 specs 登记。

## 2. 用户故事

- 作为用户，我在设置页按系统返回，设置页关闭。
- 作为用户，我拉出移动端抽屉后按系统返回，抽屉收回。
- 作为用户，我在首页或会话页按系统返回，应用保持现状、不退出。

## 3. 功能需求

### 3.1 协议（web ⇄ 壳）

- **FR-HOS-113-001** Electron 主进程捕获到返回语义输入时 MUST 经
  `win.webContents.executeJavaScript("window.dispatchEvent(new Event('pi-back'))")` 派发事件（`.catch` 兜底）。
- **FR-HOS-113-002** 事件协议名统一为 `'pi-back'`，三平台一致。
- **FR-HOS-113-003** `⬜ 待验证`：系统返回键在 Electron-on-鸿蒙渲染进程的输入映射（`BrowserBack`/`Backspace`/ArkUI `KEYCODE_BACK`）无真机无法实测 —— 实现采用双路径兜底，路径覆盖性待真机验证。

### 3.2 Web 补丁行为（pi-web AppShell，与 android/ark 同一份 diff）

- **FR-HOS-113-004** 收到 `pi-back` 且 `settingsSection !== null` ⇒ 关闭设置页。
- **FR-HOS-113-005** 设置页未开、`isMobile && sidebarOpen` ⇒ 收回抽屉。
- **FR-HOS-113-006** 其余（首页/会话页/无浮层）⇒ no-op。

### 3.3 宿主（Electron main.js + ArkUI）

- **FR-HOS-113-007** Electron `installWindowShortcuts` 的 `before-input-event`：识别 `input.code === 'BrowserBack'`（专用返回键位，避免与文本输入 Backspace 冲突）⇒ 派发 `pi-back`，不 preventDefault。
- **FR-HOS-113-008** ArkUI `Index.ets` 既有 `onKeyEvent`：新增 `KeyCode.KEYCODE_BACK` KeyDown ⇒ `event.stopPropagation()`（防系统退出/导航），`⬜ 待验证` 是否兼入派发路径。
- **FR-HOS-113-009** 兜底异常：`executeJavaScript`/`runJavaScript` 失败只 warn，不破坏返回键/主流程。
- **FR-HOS-113-010** 不引入文本输入歧义：绝不把 `Backspace`（文本删除键）当返回处理。

## 4. 验收

| # | 判据 | 状态 |
|---|---|---|
| 1 | 2 条既有补丁 + 0003 幂等应用 | ⬜ |
| 2 | main.js `before-input-event` 分支静态核对（BrowserBack → 派发 `pi-back`） | ⬜ |
| 3 | Index.ets `KEYCODE_BACK` stopPropagation 静态核对 | ⬜ |
| 4 | 协议名三平台一致 | ⬜ |
| 5 | ~~真机用例~~（无鸿蒙真机，跳过） | — |
| 6 | 返回键输入映射 | ⬜ 待验证 |

## 5. 实现锚点

- `patches/v0.15.0/0003-system-back.patch`（pi-web `components/AppShell.tsx`）
- `src-main/main.js`（`installWindowShortcuts` 的 `before-input-event`）
- `electron/src/main/ets/pages/Index.ets`（`onKeyEvent` 增 `KEYCODE_BACK`）
