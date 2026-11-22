# 113-system-back — tasks（系统级返回按钮行为改造 · HOS）

> 依赖有序任务清单。对应 specs/113-system-back/{spec,plan}.md。
> 2026-11-22 按 Electron on HarmonyOS 实况复核：T2.3 / T3.2 原「ArkUI 拦 `KEYCODE_BACK`」一条已废弃。

## T1 设置（Setup）
- [x] T1.1 确认 pi-web 工作树 v0.17.0 就绪（3 条补丁 `git apply --check` 全通过）
- [ ] T1.2 建日志目录 `logs/20261111-1/` + `DEV_CHECKLIST.md`（日志不入库，历史轮次）

## T2 补丁 + 宿主（Foundational）
- [x] T2.1 安置 `0003-system-back.patch`（与 android/ark 的 0008 同一 diff）到 `patches/v0.17.0/`
- [x] T2.2 `src-main/main.js`：`installWindowShortcuts` 增 `BrowserBack → 派发 pi-back` 分支
- [x] T2.3 ~~`electron/src/main/ets/pages/Index.ets`：`onKeyEvent` 增 `KEYCODE_BACK` stopPropagation~~
      → 废弃：ArkUI 拦截会吞键、使 `BrowserBack` 派发失效；`electron/**` 又是 `collect-runtime` 阶段 3
      从 `runtime-overlays/**` 回盖的派生副本（阶段 7.6 md5 守卫），该定制进不了 HAP。现 ArkUI 只拦
      `KEYCODE_ESCAPE`，派生副本与 overlay 源逐字节一致（见 FR-HOS-113-008 / 决策 D5·D6）
- [x] T2.4 投放副本 `web_engine/src/main/resources/resfile/resources/app/main.js` 与 `src-main/main.js`
      的 113 派发分支对齐（`collect-app.mjs` 阶段 ④ 的入库快照；FR-HOS-113-011）
- [x] T2.5 补丁幂等 `git -C ../pi-web apply --check <patch>` × 0001/0002/0003 → rc=0

## T3 验证（User Story）
- [x] T3.1 静态核对：`pi-back` 协议名三平台一致（HOS `src-main/main.js` / Ark `entry/.../pages/Index.ets` /
      Android `MainActivity.kt`）；补丁与 android·ark 的 0008 逐字节一致
- [x] T3.2 代码路径走查（main.js `BrowserBack` 分支：派发 `pi-back`、不 preventDefault、不映射 Backspace）
- [x] T3.3 运行时守卫：`node scripts/collect-runtime.mjs --verify-only` → 阶段 7 全部 PASS（含 7.6 overlay 命中
      `electron/src/main/ets/pages/Index.ets`）

## T4 Code Review（Phase 3.5 门禁）
- [ ] T4.1 requesting-code-review 分派评审（Critical/Important/Minor）
- [x] T4.2 复核结论：初版把 ArkUI 定制写进派生副本（违反 D6），已撤销并收敛落点 → fix 提交
- [ ] T4.3 `REVIEW_REPORT.md` 回填

## T5 测试（Phase 4）
- [x] T5.1 ⛔ 无鸿蒙真机 → 跳过真机用例（test-cases.md 标注 SKIP）
- [x] T5.2 静态核对项逐条记录 PASS/FAIL（见 test-cases.md 二、三节）
- [ ] T5.3 `TEST_REPORT.md` 产出 + `test:` 提交

## T6 Bugfix / Regression（Phase 5/6）
- [x] T6.1 修静态核对提出的问题：投放副本缺 113 分支（`6f2fbf2`）、派生副本多出 ArkUI 拦截（`d7b7add`）
- [ ] T6.2 最终 `TEST_REPORT.md` + 提交
