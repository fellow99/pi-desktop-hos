# 203-plugin-workspace-picker 任务清单

> **Module:** 203-plugin-workspace-picker ｜ **Last Updated:** 2026-10-14
> **对应规格:** [spec.md](./spec.md) ｜ **对应方案:** [plan.md](./plan.md)
> **日志目录:** `logs/20261014-2/`

## 1. 前置（PoC，已完成）

| ID | 任务 | 验收 | 状态 |
|---|---|---|---|
| T01 | 权限桥 PoC：`systemPreferences` 四接口签名 + 参数形状 | 四个签名探明；`checkPermission`/`openApplicationInfoEntry` 可用 | ✅ 完成（`T01-poc-permission.txt`） |
| T02 | 真机基线：`HOME`/`userData`/`process.cwd()`/四根存在性/可读写 | 四根路径与 `EPERM` 现状取证 | ✅ 完成 |
| T03 | 机制核实：pi-web 无 UI 插槽；pi 扩展 UI 仅四种对话框 | 证据落 spec §7 A1 | ✅ 完成 |

## 2. 规格与文档

| ID | 任务 | 落点 | 回引 | 状态 |
|---|---|---|---|---|
| T04 | 功能规格 | `specs/203-plugin-workspace-picker/spec.md` | FR-203-001…026 | ✅ |
| T05 | 技术方案 | `specs/203-plugin-workspace-picker/plan.md` | 逐条回引 FR | ✅ |
| T06 | 任务清单 | 本文件 | — | ✅ |
| T07 | 测试用例 | `specs/203-plugin-workspace-picker/test-cases.md` | 覆盖全部 FR | ✅ |
| T08 | 设计文档 | `docs/203-插件-选择工作区目录.md` | 体例对齐参考 doc | ⬜ |
| T09 | 模块登记 | `specs/README.md` §六/§七 | FR-203-024 | ⬜ |

## 3. 开发

| ID | 任务 | 落点 | 依赖 | 回引 | 状态 |
|---|---|---|---|---|---|
| T10 | 壳侧根解析：`installWorkspaceRoots()`（四根 + 沙箱 mkdir + `PI_HOS_ROOTS`） | `src-main/main.js` | — | FR-203-001/002/003/004 | ⬜ |
| T11 | 壳侧权限桥：`installPermissionBridge()`（`__PI_HOS_PERMISSION__`） | `src-main/main.js` | — | FR-203-015/016/026 | ⬜ |
| T12 | PL1 自检扩展 `/roots` | `extensions/harmony-workspace-roots.js` | T10 | FR-203-019 | ⬜ |
| T13 | 补丁生成：detached worktree 上改 3 个 pi-web 文件 → unified diff | `patches/v0.11.1/0001-*.patch` | — | FR-203-020/022 | ⬜ |
| T14 | 补丁应用阶段（幂等 + 往返校验 + 守卫） | `scripts/prepare-next.mjs` | T13 | FR-203-021 | ⬜ |
| T15 | 补丁登记 | `patches/README.md`、`docs/工程规划.md` §7 | T13 | FR-203-020 | ⬜ |
| T16 | 宿主侧断言脚本（本模块新增，不入库） | `$PI_SCRATCH_DIR` | T10–T15 | 全部 | ⬜ |

### 3.1 补丁内实现（T13 展开）

| ID | 单元 | 文件 | 回引 |
|---|---|---|---|
| T13a | `getWorkspaceRoots()` / `resolveWorkspaceRoot()` | `pi-web/lib/directory-browser.ts` | FR-203-001/002/003/004 |
| T13b | `GET ?root=` + `roots[]`/`truncated` + hidden/非目录过滤 | `pi-web/app/api/cwd/browse/route.ts` | FR-203-006/009 |
| T13c | `RootTabs` + 栈重置 | `pi-web/components/DirectoryPicker.tsx` | FR-203-005 |
| T13d | 去路径输入表单 → 面包屑（根截断） | 同上 | FR-203-007/008 |
| T13e | 单列列表 + hidden 过滤 + `truncated` 提示 | 同上 | FR-203-006/009/010 |
| T13f | 新建文件夹默认名去重 + 创建后选中 | 同上 | FR-203-011/012/013 |
| T13g | `localStorage` 主目录记忆 | 同上 | FR-203-018 |
| T13h | `EACCES/EPERM` → 权限预检 + 去设置 + 重试 | 同上 | FR-203-015/016 |
| T13i | `onSelect` 契约与 props 签名保持 | 同上 | FR-203-014 |

## 4. 构建与部署

| ID | 任务 | 命令 | 验收 |
|---|---|---|---|
| T17 | 补丁往返校验 | `git apply` 正/反向 + SHA-256 比较 | 还原一致（FR-203-022） |
| T18 | 构建 pi-web | `node scripts/prepare-next.mjs --node <node22>` | BUILD 通过；补丁已应用（守卫命中） |
| T19 | 组装产物 | `node scripts/collect-pi.mjs` | `pi-dist` 含 `extensions/harmony-workspace-roots.js`；tar 时间戳更新 |
| T20 | 投放 resfile | `node scripts/collect-app.mjs` | 9 文件/体积合理 |
| T21 | 编译签名 debug | `scripts/build-debug.ps1` | `electron-default-signed.hap` 产出 |
| T22 | 真机安装 | `hdc app install -r` | install success |
| T23 | 环境准备 | 重设 DeepSeek KEY + 重建测试工作区 | 会话可建（卸载会清空沙箱） |

## 5. 测试

| ID | 任务 | 覆盖 | 状态 |
|---|---|---|---|
| T24 | `--inspect`：四根解析、`PI_HOS_ROOTS`、桥可用性、权限预检 | FR-203-002/003/004/015/016 | ⬜ |
| T25 | 构建期用例 TC-B1…TC-B4 | FR-203-019/020/021/022 | ⬜ |
| T26 | 真机交互 TC-D1…TC-D9（四 Tab/下钻/面包屑/入口精简/新建/授权归因/采纳/记忆） | FR-203-005…018 | ⬜ |
| T27 | 回归 TC-R1/R2（两入口 + 采纳链路 + 一轮真实对话） | FR-203-014 | ⬜ |
| T28 | 测试报告 | `logs/20261014-2/TEST_REPORT.md` | ⬜ |

## 6. 代码评审

| ID | 任务 | 产出 |
|---|---|---|
| T29 | `requesting-code-review`：派 `code-reviewer` 子代理（只读） | `logs/20261014-2/REVIEW_REPORT.md` |
| T30 | `receiving-code-review`：逐条先验证再处理；Critical/Important 全关 | 修复提交 |

## 7. 提交

| ID | 任务 | 验收 |
|---|---|---|
| T31 | 按 `git-commit` 技能提交（**只用 Conventional Commits 前缀**） | 提交信息前缀合法（FR-203-025） |
| T32 | 提交前排除 `build-profile.json5` 与 `../pi-web` 残迹 | `git status` 核对 |

## 8. 执行顺序

1. T04 → T05 → T06 → T07 → T08 → T09
2. T10 → T11 → T12 → T13（T13a→T13i）→ T14 → T15 → T16
3. T17 → T18 → T19 → T20 → T21 → T22 → T23
4. T29 → T30（评审在测试前，按 specs-based-devflow 阶段序）
5. T24 → T25 → T26 → T27 → T28
6. T31 → T32

> 说明：`specs-based-devflow` 的阶段序为「开发 → 代码评审 → 测试」，故 T29/T30 排在 T24–T28 之前；
> 但 T13/T14（补丁往返与守卫）属开发阶段自验，先于评审执行。
