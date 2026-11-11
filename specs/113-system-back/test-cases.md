# 113-system-back — 测试用例（系统级返回按钮行为改造 · HOS）

> 无鸿蒙真机 → 真机用例全部 **SKIP**；仅执行「离线 / 静态核对」。

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
**期望**：确认 BACK 在渲染进程实际映射为 `BrowserBack` 还是被 ArkUI 以 `KEYCODE_BACK` 拦截（决定双路径中的实际生效路径）

## 二、离线 / 静态核对（可执行）

### TC-HOS-005：补丁幂等
**优先级** P1 ｜ **类型** Static
**步骤**：`git apply --check patches/v0.15.0/0003-system-back.patch`
**期望**：通过
**实际**：⬜ ｜ **状态**：⬜

### TC-HOS-006：补丁与 android 一致
**优先级** P1 ｜ **类型** Static
**步骤**：`diff <hos>/patches/v0.15.0/0003-system-back.patch <android>/patches/v0.15.0/0008-system-back.patch`
**期望**：无差异（内容一致，仅文件名编号不同）
**实际**：⬜ ｜ **状态**：⬜

### TC-HOS-007：main.js 分支走查
**优先级** P1 ｜ **类型** Static
**步骤**：核对 `installWindowShortcuts` 的 `before-input-event` —— `BrowserBack` 分支派发 `pi-back`、不 preventDefault、不映射 Backspace
**期望**：符合 FR-110-007 / FR-110-010
**实际**：⬜ ｜ **状态**：⬜

### TC-HOS-008：Index.ets 分支走查
**优先级** P1 ｜ **类型** Static
**步骤**：核对 `onKeyEvent` 增 `KEYCODE_BACK` Down ⇒ stopPropagation
**期望**：符合 FR-110-008
**实际**：⬜ ｜ **状态**：⬜

### TC-HOS-009：协议三平台一致
**优先级** P2 ｜ **类型** Static
**步骤**：grep `pi-back` 于 android/ark/hos 壳代码 + 补丁
**期望**：事件名全部 `'pi-back'`
**实际**：⬜ ｜ **状态**：⬜

## 三、验收对照

| AC# | 判据 | 结论 |
|---|---|---|
| 1 | 0003 幂等应用 | ⬜ |
| 2 | main.js 分支静态核对 | ⬜ |
| 3 | Index.ets 分支静态核对 | ⬜ |
| 4 | 协议三平台一致 | ⬜ |
| 5 | 真机用例 | SKIP（无设备） |
| 6 | 输入映射 | ⬜ 待验证 |
