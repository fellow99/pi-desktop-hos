# 113-system-back — 测试用例（系统级返回按钮行为改造 · HOS）

> 无鸿蒙真机 → 真机用例全部 **SKIP**；仅执行「离线 / 静态核对」。
> 2026-11-22 复核：按 Electron on HarmonyOS 实况修正 —— 派发点唯一为 Electron 主进程 `BrowserBack`，
> ArkUI 侧不再拦 `KEYCODE_BACK`。

## 一、真机交互（⛔ 无设备，全部 SKIP）

### TC-HOS-001：设置页关闭
**优先级** P1 ｜ **类型** Functional ｜ **状态**：SKIP（无真机）
**期望**：READY 设置页按系统返回 → 设置页关闭、应用不退出

### TC-HOS-002：移动端抽屉收回
**优先级** P1 ｜ **类型** Functional ｜ **状态**：SKIP（无真机）
**期望**：READY 抽屉打开按系统返回 → 抽屉收回、应用不退出

### TC-HOS-003：首页 / 会话页 no-op
**优先级** P1 ｜ **类型** Functional ｜ **状态**：SKIP（无真机）
**期望**：READY 首页或会话页按系统返回 → 界面不变、应用不退出

### TC-HOS-004：系统返回键输入映射确认
**优先级** P1 ｜ **类型** Edge Case ｜ **状态**：SKIP（无真机）· ⬜ 待验证
**期望**：确认系统返回键在 Electron on HarmonyOS 下确实以 Chromium 专用键位 `BrowserBack` 到达渲染进程
（FR-HOS-113-003），且不被宿主 ArkUI 层消费；并确认 ArkUI 侧只拦 `KEYCODE_ESCAPE` 不妨碍该键透传。

## 二、离线 / 静态核对（可执行）

### TC-HOS-005：补丁幂等
**优先级** P1 ｜ **类型** Static
**步骤**：`git -C ../pi-web apply --check <hos>/patches/v0.17.0/000{1,2,3}-*.patch`
**期望**：三条全部通过
**实际**：`git apply --check` 0001 / 0002 / 0003 均 rc=0（pi-web v0.17.0 工作树） ｜ **状态**：✅ PASS

### TC-HOS-006：补丁与 android / ark 一致
**优先级** P1 ｜ **类型** Static
**步骤**：`diff <hos>/patches/v0.17.0/0003-system-back.patch <android|ark>/patches/v0.17.0/0008-system-back.patch`
**期望**：无差异（内容一致，仅文件名编号不同）
**实际**：与 android 0008、ark 0008 逐字节一致（diff 无输出） ｜ **状态**：✅ PASS

### TC-HOS-007：main.js 分支走查
**优先级** P1 ｜ **类型** Static
**步骤**：核对 `src-main/main.js` 的 `installWindowShortcuts` → `before-input-event` ——
`input.code === 'BrowserBack'` 分支派发 `pi-back`、不 preventDefault、不映射 Backspace
**期望**：符合 FR-HOS-113-007 / FR-HOS-113-010
**实际**：派发 `window.dispatchEvent(new Event('pi-back'))`（`.catch` 兜底）、无 preventDefault、无 Backspace 映射 ｜ **状态**：✅ PASS

### TC-HOS-008：投放副本一致性（原「Index.ets 分支走查」已废弃）
**优先级** P1 ｜ **类型** Static
**步骤**：
1. `diff <(tr -d '\r' < src-main/main.js) <(tr -d '\r' < web_engine/src/main/resources/resfile/resources/app/main.js)` —— 113 分支须一致；
2. `grep KEYCODE_BACK runtime-overlays/electron/src/main/ets/pages/Index.ets` —— 应无命中；
3. `node scripts/collect-runtime.mjs --verify-only` —— 阶段 7 全部守卫通过（含 7.6 overlay 命中）
**期望**：符合 FR-HOS-113-008 / FR-HOS-113-011
**实际**：113 派发分支两侧一致；overlay 源与派生副本均无 `KEYCODE_BACK`；`--verify-only` 全部守卫 PASS ｜ **状态**：✅ PASS

### TC-HOS-009：协议三平台一致
**优先级** P2 ｜ **类型** Static
**步骤**：grep `pi-back` 于 android/ark/hos 壳代码 + 补丁
**期望**：事件名全部 `'pi-back'`
**实际**：HOS `src-main/main.js` + 0003 补丁、Ark `entry/src/main/ets/pages/Index.ets` + 0008 补丁、
Android `MainActivity.kt` + 0008 补丁 —— 均为 `pi-back` ｜ **状态**：✅ PASS

## 三、验收对照

| AC# | 判据 | 结论 |
|---|---|---|
| 1 | 0001/0002/0003 幂等应用 | ✅ PASS（TC-005） |
| 2 | main.js 分支静态核对 | ✅ PASS（TC-007） |
| 3 | 投放副本一致 + ArkUI 无 `KEYCODE_BACK` 拦截 + `--verify-only` 守卫通过 | ✅ PASS（TC-008） |
| 4 | 协议三平台一致 | ✅ PASS（TC-009） |
| 5 | 真机用例 | SKIP（无设备） |
| 6 | 返回键真机输入映射 | ⬜ 待验证（TC-004） |
