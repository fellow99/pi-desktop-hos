# 113-system-back — plan（系统级返回按钮行为改造 · HOS）

> 方案。对应 specs/113-system-back/spec.md。

## 1. 方案概览

与 android/ark 同形，native 侧为 Electron + ArkUI 双路径：

1. **pi-web 补丁（与 android/ark 同一 diff）**：AppShell 加 `pi-back` 监听 effect。
2. **Electron 主进程 `main.js`**：`installWindowShortcuts` 的 `before-input-event` 增分支 ——
   `input.type==='keyDown' && input.code === 'BrowserBack'` ⇒
   `win.webContents.executeJavaScript("window.dispatchEvent(new Event('pi-back'))").catch(()=>{})`（不 preventDefault）。
3. **ArkUI `Index.ets`**：`onKeyEvent` 增 `KeyCode.KEYCODE_BACK` Down ⇒ `event.stopPropagation()`（防系统退出/导航）。
4. **spec 四件套 + 静态核对**（无真机）。

> 双路径设计的理由：系统返回在 Electron-on-鸿蒙的映射无真机不可知（可能是渲染进程 `BrowserBack`，
> 也可能被 ArkUI 以 `KEYCODE_BACK` 先拦截）。两条路都做兜底，覆盖「到渲染进程 / 被宿主拦截」两种情况；
> 语义「不退出 + 派发 pi-back」在两条路上都成立，代价小、风险低。

## 2. 关键设计决策（含决策链）

| # | 决策 | 依据 |
|---|---|---|
| D1 | **修改载荷，用补丁不用插件** | 同 android/ark（React 内部状态；既有先例均走幂等补丁） |
| D2 | **事件协议 `pi-back` 三平台一致** | 一份补丁三平台复用 |
| D3 | **只用 `BrowserBack`，绝不映射 `Backspace`** | `Backspace` 是文本删除键，映射即破坏输入（FR-110-010） |
| D4 | **ArkUI 对 `KEYCODE_BACK` 仅 stopPropagation** | 防系统退出/导航是无设备下最可辩护的语义；是否兼派发 ⬜ 待验证 |
| D5 | **范围：不驱动 HTML 弹窗** | 用户确认 ① |
| D6 | **跳过测试（无鸿蒙真机）** | 用户提供；仅静态核对 |

## 3. 实施落点（checklist）

- [ ] 安置 `0003-system-back.patch`（与 android/ark 同一 diff）到 `patches/v0.15.0/`
- [ ] `main.js` `installWindowShortcuts` 增 `BrowserBack → 派发 pi-back` 分支
- [ ] `Index.ets` `onKeyEvent` 增 `KEYCODE_BACK` stopPropagation
- [ ] `logs/20261111-1/DEV_CHECKLIST.md` 日志
- [ ] `git apply --check` 通过 + 静态核对

## 4. 评审计划（Phase 3.5）

- 用 requesting-code-review / receiving-code-review 技能评审补丁 + main.js + Index.ets 改动；
  Critical/Important 修复后回填 `REVIEW_REPORT.md`。

## 5. 测试计划（Phase 4）

- ⛔ 无鸿蒙真机 → **跳过**真机测试；执行静态核对（补丁应用、协议一致、代码路径走查）。

## 6. 风险与遗留

- **风险（⬜ 待验证）**：系统返回键在 Electron-on-鸿蒙的确切输入映射无法脱机确定；双路径兜底在语义上成立，
  具体哪条路径真机触发需后续验证。
- **遗留**：HTML 弹窗不关闭（用户确认 ① 排除）。
