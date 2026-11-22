# 113-system-back — plan（系统级返回按钮行为改造 · HOS）

> 方案。对应 specs/113-system-back/spec.md。

## 1. 方案概览

与 android/ark 的「壳捕获返回 → 派发 `pi-back` → 页面按浮层收敛」同形，但 HOS 的 native 侧是
**Electron + ArkUI**，返回键只能有一个派发点：

1. **pi-web 补丁（与 android/ark 同一 diff）**：AppShell 加 `pi-back` 监听 effect。
2. **Electron 主进程 `src-main/main.js`**：`installWindowShortcuts` 的 `before-input-event` 增分支 ——
   `input.code === 'BrowserBack'` ⇒
   `win.webContents.executeJavaScript("window.dispatchEvent(new Event('pi-back'))").catch(()=>{})`（不 preventDefault）。
3. **投放副本**：`scripts/collect-app.mjs`（阶段 ④）把 `src-main/main.js` 投放到
   `web_engine/src/main/resources/resfile/resources/app/main.js`，副本随改动一并入库（FR-HOS-113-011）。
4. **ArkUI 侧不介入**：`runtime-overlays/electron/src/main/ets/pages/Index.ets` 的 `onKeyEvent` 只拦
   `KEYCODE_ESCAPE`，**不对 `KEYCODE_BACK` 做 stopPropagation**。
5. **spec 四件套 + 静态核对**（无真机）。

> **为什么不要「双路径」**（初版曾同时做 ArkUI stopPropagation + Electron 派发，现已撤销）：
> Electron on HarmonyOS 下返回键的派发语义由 Electron 主进程经渲染进程 `BrowserBack` 收口；
> ArkUI 侧对 `KEYCODE_BACK` 做 `stopPropagation` 会在宿主层把键吞掉，渲染进程收不到 `BrowserBack`，
> 两条路互相排斥而非互补。且 `electron/**` 是 `collect-runtime` 阶段 3 从 `runtime-overlays/**` 回盖的
> **派生副本**，定制写在派生副本上会被下一次回盖丢弃、并使阶段 7.6「overlay 命中」守卫不通过。

## 2. 关键设计决策（含决策链）

| # | 决策 | 依据 |
|---|---|---|
| D1 | **修改载荷，用补丁不用插件** | 同 android/ark（React 内部状态；既有先例均走幂等补丁） |
| D2 | **事件协议 `pi-back` 三平台一致** | 一份补丁三平台复用 |
| D3 | **只用 `BrowserBack`，绝不映射 `Backspace`** | `Backspace` 是文本删除键，映射即破坏输入（FR-HOS-113-010） |
| D4 | **返回键派发点唯一：Electron 主进程 `before-input-event`** | Electron on HarmonyOS 下返回键以 `BrowserBack` 到达渲染进程；主进程是唯一能同时满足「不退出 + 可派发」的层 |
| D5 | **ArkUI `onKeyEvent` 不拦 `KEYCODE_BACK`，只拦 `KEYCODE_ESCAPE`** | ArkUI 拦截会吞键、使 D4 的派发路径失效；ESC 拦截仍是本工程既有语义 |
| D6 | **ArkTS 定制只写 `runtime-overlays/**`，派生副本跟随** | `collect-runtime` 阶段 3 整目录回盖 + 阶段 7.6 md5 守卫（源 = 目标）；写派生副本无效且会让守卫失败 |
| D7 | **主进程改动必须重跑 `collect-app` 并入库投放副本** | HAP 跑的是 `web_engine/.../app/main.js` 副本，不是 `src-main/`（FR-HOS-113-011；0.17.x 轮曾漏投放，副本缺 113 派发分支） |
| D8 | **范围：不驱动 HTML 弹窗** | 用户确认 ① |
| D9 | **跳过测试（无鸿蒙真机）** | 用户提供；仅静态核对 + 运行时守卫复核 |

## 3. 实施落点（checklist）

- [x] 安置 `0003-system-back.patch`（与 android/ark 同一 diff）到 `patches/v0.17.0/`（v0.15.0 同名补丁内容一致）
- [x] `src-main/main.js` `installWindowShortcuts` 增 `BrowserBack → 派发 pi-back` 分支
- [x] 投放副本 `web_engine/.../app/main.js` 与 `src-main/main.js` 的 113 分支对齐
- [x] ArkUI 不拦截：`runtime-overlays/electron/src/main/ets/pages/Index.ets` 只拦 `KEYCODE_ESCAPE`
      （派生副本 `electron/src/main/ets/pages/Index.ets` 撤销曾被误加的 `KEYCODE_BACK` 分支）
- [x] 静态核对：补丁幂等 `git apply --check`、协议名三平台一致、代码路径走查
- [x] 运行时守卫：`node scripts/collect-runtime.mjs --verify-only` 全部守卫通过（含 7.6 overlay 命中 Index.ets）
- [ ] `logs/20261111-1/DEV_CHECKLIST.md` 日志（历史轮次，未入库）

## 4. 评审计划（Phase 3.5）

- 用 requesting-code-review / receiving-code-review 技能评审补丁 + main.js + 投放副本一致性；
  Critical/Important 修复后回填 `REVIEW_REPORT.md`。
- 2026-11-22 复评结论：初版的 ArkUI 定制落在派生副本上（D6 违反），已撤销并把落点收敛到
  「补丁 + 主进程 + 投放副本」，与 overlay 真源一致。

## 5. 测试计划（Phase 4）

- ⛔ 无鸿蒙真机 → **跳过**真机测试；执行静态核对（补丁应用、协议一致、代码路径走查）。
- 已执行：`node scripts/collect-runtime.mjs --verify-only` → 阶段 7 全部守卫 PASS（含 overlay 命中、
  剪裁、SO 哈希、新增 overlay 落地）。

## 6. 风险与遗留

- **风险（⬜ 待验证）**：Electron on HarmonyOS 上系统返回键的真机输入映射仍未实测（无设备）；
  若真机把返回键在 ArkUI 侧完全消费（不产生 `BrowserBack`），则派发路径不触发 —— 届时需回到
  ArkUI 侧派发（在 `runtime-overlays/` 内用 `runJavaScript` 派发 `pi-back`，仍不采用阻塞式 stopPropagation）。
- **遗留**：`collect-app.mjs` 目前只投放 `main.js / tar-extract.js / package.json`，**不含**
  `src-main/sync-runtime.js`（301 的进程内中枢同步运行时），故 301 相关主进程代码尚未随投放副本进 HAP ——
  与 113 无关，待 301 收尾时一并补投。
- **遗留**：HTML 弹窗不关闭（用户确认 ① 排除）。
