# 203-plugin-workspace-picker 技术方案

> **Module:** 203-plugin-workspace-picker ｜ **Status:** Proposed ｜ **Last Updated:** 2026-10-14
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）· harmonypc-electron v37.2.3
> **对应规格:** [spec.md](./spec.md)（本方案逐条回引 FR-203-xxx）
> **设计文档:** [`../docs/203-插件-选择工作区目录.md`](../docs/203-插件-选择工作区目录.md)

## 1. 技术上下文

### 1.1 运行时环境

- 构建期：Windows + Node（`--node` 显式指定 22.17.0）+ `npm ci` + `next build --webpack`；DevEco/command-line-tools-6（hvigor）+ OpenHarmony SDK（targetSdk 24）。
- 运行期：HarmonyOS 2in1 真机（`3QC0226526001227` / HUAWEI MateBook Pro / API 24），Electron-on-HarmonyOS（Electron 37.2.3 / Node 22.17.0）。
- 部署形态：`pi-dist.tar.gz` → resfile → 首次启动 SHA-256 marker 幂等解压到 `<userData>/pi-dist`。

### 1.2 关键前提（本方案成立的基础）

| # | 前提 | 证据 |
|---|---|---|
| P1 | **Next 服务器与 Electron 主进程同进程**，故壳侧可用环境变量把数据交给 pi-web 的 HTTP 路由 | `docs/工程规划.md` §4.2（主进程进程内嵌入 Next 服务器） |
| P2 | pi-web **无 UI 插槽/客户端面插件机制**，pi 扩展 UI 仅四种对话框 | `pi/packages/coding-agent/docs/rpc-extension-ui.md`（`custom()` 在 RPC 模式返回 `undefined`） |
| P3 | `/api/cwd/browse` 本身**无根限制**、可列全盘 | `pi-web/app/api/cwd/browse/route.ts`、`pi-web/lib/directory-browser.ts` |
| P4 | 采纳链路自带 `allowFileRoot(cwd)` | `pi-web/app/api/cwd/validate/route.ts`、`pi-web/app/api/agent/new/route.ts` |
| P5 | 用户目录挂载点与三项 `user_grant` 权限 | T01 取证 + `web_engine/src/main/module.json5` |
| P6 | `patches/` 当前 0 条；`prepare-next.mjs` 无补丁阶段 | `patches/README.md`、`scripts/prepare-next.mjs` |

### 1.3 依赖

| 依赖 | 来源 | 用途 |
|---|---|---|
| `GET/POST /api/cwd/browse` | pi-web（补丁扩展） | 列目录 / 建目录（业务数据面，不改语义） |
| `POST /api/cwd/validate`、会话创建 | pi-web（不改） | 采纳工作区 + `allowFileRoot` |
| `electron.systemPreferences.checkPermission` | harmonypc-electron 运行时 | 权限预检（同步 `boolean[]`） |
| `electron.systemPreferences.openApplicationInfoEntry` | 同上 | 「去系统设置」深链接 |
| `@earendil-works/*`（pi 扩展 API） | pi | PL1 扩展 `/roots` 自检命令 |
| hvigor + hdc | 本机工具链 | 编译、签名、安装 |

## 2. 命名约定与身份落点

| # | 落点 | 值 |
|---|---|---|
| 1 | 模块编号 / 目录 | `203` / `specs/203-plugin-workspace-picker/` |
| 2 | 环境变量 | `PI_HOS_ROOTS`（JSON 数组：`[{id,label,path,permType}]`） |
| 3 | 主进程桥全局 | `globalThis.__PI_HOS_PERMISSION__ = { available, check(permType), openAppInfo() }` |
| 4 | 补丁目录 / 编号 | `patches/v0.11.1/`，全局编号 `P203-1` |
| 5 | localStorage 键 | `pi-hos.workspacePicker.rootId` |
| 6 | 扩展文件 | `extensions/harmony-workspace-roots.js`（命令 `/roots`） |

## 3. 实现落点清单

### 3.1 本工程自有文件（新增/修改）

| # | 文件 | 动作 | 职责 | 回引 |
|---|---|---|---|---|
| 1 | `src-main/main.js` | 修改 | 新增 `installWorkspaceRoots()`（解析四根 + 沙箱根 `mkdir recursive` + 写 `PI_HOS_ROOTS`）与 `installPermissionBridge()`（挂 `__PI_HOS_PERMISSION__`）；在 `assembleSandboxEnv()` 之后、起 Next 之前调用 | FR-203-002/003/004/015/016/026 |
| 2 | `extensions/harmony-workspace-roots.js` | 新增 | PL1 扩展：注册 `/roots` 打印四根路径/存在性/可读性/授权状态 | FR-203-019 |
| 3 | `scripts/prepare-next.mjs` | 修改 | 在 `next build` 前插入**幂等补丁阶段**（`--reverse --check` → skip；否则 `git apply`；冲突硬失败） | FR-203-021 |
| 4 | `patches/v0.11.1/0001-workspace-picker-roots.patch` | 新增 | 7 个 pi-web 文件的统一 diff | FR-203-020/022 |
| 5 | `patches/README.md` | 修改 | 登记补丁三要素 + 全局编号 | FR-203-020 |
| 6 | `docs/工程规划.md` §7 | 修改 | 补丁集从「0 条」更新为「1 条」并回引本模块 | FR-203-020 |
| 7 | `specs/README.md` | 修改 | §六/§七 登记 203（扩展模块） | FR-203-024 |
| 8 | `docs/203-插件-选择工作区目录.md` | 新增 | 设计文档（体例对齐参考 doc） | — |
| 9 | `skills/harmony-runtime-capabilities/SKILL.md` | 修改 | 用户目录段落补「四主目录对话框」与授权归因 | 下游 |

### 3.2 上游补丁内容（`patches/v0.11.1/0001-workspace-picker-roots.patch`）

| # | 文件 | 改动 | 回引 |
|---|---|---|---|
| 1 | `lib/directory-browser.ts` | 新增 `getWorkspaceRoots()`（读 `PI_HOS_ROOTS`，非法/缺失 → 空数组）与 `resolveWorkspaceRoot(rootId)`；`getBrowseStartDirectory()` 缺省起点改为沙箱根（有 root 时）否则保持 `homedir()` 不变 | FR-203-001/002/003/004 |
| 2 | `app/api/cwd/browse/route.ts` | `GET` 接受 `root=<id>`：经 `resolveWorkspaceRoot` 定位后列出该根，响应增补 `rootId`、`roots[]`、`truncated`；条目**过滤** `hidden` 与非目录 | FR-203-006/009 |
| 3 | `components/DirectoryPicker.tsx` | 保持 export 名与 props 签名**不变**（`SessionSidebar.tsx` 零改动）；内部改为：顶部四 Tab；去掉路径输入表单与「上级」按钮，改为主目录根截断的面包屑；列表隐藏项过滤 + `truncated` 提示；新建 Modal 默认名去重；`localStorage` 主目录记忆；`EACCES/EPERM` → `__PI_HOS_PERMISSION__` 预检 + 「去系统设置」+ 重试 | FR-203-005/006/007/008/009/010/011/012/013/014/015/016/018 |

**不进的改动**：`app/api/cwd/validate/route.ts`、`app/api/agent/new/route.ts`、`lib/allowed-roots.ts`、`lib/file-access.ts`、`SessionSidebar.tsx`（FR-203-014 明确复用既有链路）。

### 3.3 复用（不改）

| 机制 | 文件 |
|---|---|
| 采纳工作区 + `allowFileRoot` | `pi-web/app/api/cwd/validate/route.ts`、`app/api/agent/new/route.ts` |
| 壳预置资源物化（`extensions/`） | `src-main/main.js#materializeBundledResources`、`scripts/collect-pi.mjs` |
| 沙箱环境装配（`HOME`→`userData`） | `src-main/main.js#assembleSandboxEnv` |

## 4. 组件设计（Client 面，均在补丁文件内）

| 单元 | 输入 | 职责 | 依赖 | 回引 |
|---|---|---|---|---|
| `RootTabs` | `roots[]`、`activeRootId` | 渲染四 Tab，切换时上抛 rootId | 无 | FR-203-005 |
| `useRoots()` | — | 首次挂载时取 `roots`（来自 browse 响应），缺省 `sandbox` | `/api/cwd/browse` | FR-203-004 |
| `BrowseStack` | `rootId`、`rootPath` | 维护 `currentPath`/`entries`/`truncated`/`loading`/`error`；下钻只接受条目路径 | `/api/cwd/browse` | FR-203-006/009 |
| `Breadcrumbs` | `rootPath`、`currentPath` | 相对主目录根生成、最高到根 | 无 | FR-203-008 |
| `NewFolderModal` | `currentPath`、`entries` | 默认名 + 同级去重 → `POST` → 刷新并选中 | `/api/cwd/browse` | FR-203-011/012/013 |
| `PermissionNotice` | `error.code`、`root.permType` | 归因文案 + 「去系统设置」+ 重试 | `__PI_HOS_PERMISSION__` | FR-203-015/016 |
| 主目录记忆 | — | `localStorage` 只存 rootId，非法回退 `sandbox` | 无 | FR-203-018 |

数据通道纪律：组件不读 `electron`、不读环境变量；所有数据来自 HTTP 路由或 `__PI_HOS_PERMISSION__`。

## 5. 数据流

```
启动期（主进程）
  assembleSandboxEnv()            HOME/USERPROFILE → userData；userData 解析
  installWorkspaceRoots()         ← 新增
    sandbox   = join(userData,'workspace')      mkdir recursive（FR-203-002）
    desktop   = /storage/Users/currentUser/Desktop
    documents = /storage/Users/currentUser/Documents
    download  = /storage/Users/currentUser/Download
    process.env.PI_HOS_ROOTS = JSON([...])      （FR-203-004）
  installPermissionBridge()       ← 新增
    globalThis.__PI_HOS_PERMISSION__ = { available, check, openAppInfo }
  起 Next 服务器 → client-modules 扫描 → extensions/harmony-workspace-roots.js 装载

交互期（渲染进程）
  打开「选择工作区目录」
    rootId ← localStorage（非法→sandbox）（FR-203-018）
    GET /api/cwd/browse?root=<id>
      → resolveWorkspaceRoot(id) 在**主进程**已解析的 PI_HOS_ROOTS 上取值
      → listDirectories 过滤 hidden/非目录 + truncated
    → RootTabs + Breadcrumbs + 列表渲染
    下钻：GET /api/cwd/browse?path=<条目 path>（只接受条目路径）
    EACCES/EPERM → __PI_HOS_PERMISSION__.check(permType)
      ├ true  → 视为瞬时错误，重试
      ├ false → PermissionNotice：归因 + 「去系统设置」(openAppInfo) + 重试
      └ 桥不可用 → 明确归因，不静默
    新建：POST /api/cwd/browse {path,name} → 刷新 → 选中
    选择：onSelect(absolutePath) → 上游 /api/cwd/validate → createWorkspace → allowFileRoot
```

## 6. 权限处理（FR-203-015/016/017）

| 动作 | 调用 | 返回 | 实测 |
|---|---|---|---|
| 预检 | `checkPermission(['ohos.permission.READ_WRITE_{DESKTOP,DOCUMENTS,DOWNLOAD}_DIRECTORY'])` | `boolean[]`（同步） | ✅ `[false,false,false]` |
| 去系统设置 | `openApplicationInfoEntry()` | `undefined`（同步） | ✅ 无异常 |
| 主动申请 | `requestDirectoryPermission(path, cb?)` | Promise | ⬜ 不 settle（FR-203-017） |

`permType` 映射：`directory_desktop → READ_WRITE_DESKTOP_DIRECTORY`、`directory_document → READ_WRITE_DOCUMENTS_DIRECTORY`、`directory_download → READ_WRITE_DOWNLOAD_DIRECTORY`（`web_engine/src/main/ets/adapter/PermissionManagerAdapter.ets` 的 `needPermissions` 表）。

**明确不采用**：`systemPreferences.callArkTSFunction/callArkTSAsyncFunction` 作为权限通路 —— 实测调用 `PermissionManagerAdapter.CheckPermissions` 会**使应用进程消失**（T01 §E）。

## 7. 关键决策记录

| # | 决策 | 备选 | 理由 | 回引 |
|---|---|---|---|---|
| D1 | 引入本工程**第 1 条上游补丁** | 纯插件（降级 UI）/ 只改工作树 | P2：pi-web 无 UI 插件机制，四 Tab 对话框无法用插件实现；只改工作树违反「幂等补丁」纪律 | FR-203-020 |
| D2 | 根解析走**环境变量**而非 IPC | 主进程 IPC 桥 / 自定义协议 | P1：同进程，环境变量即可；避免新业务数据面与 CORS/协议改动 | FR-203-004 |
| D3 | 保留 pi-web **原生单列列表**，不重造 Miller 列 | 移植参考的 680×500 Miller | 重造会显著扩大补丁面；FR-203-005~009 已覆盖全部可验收行为（**有意偏离**） | FR-203-010 |
| D4 | 沙箱根 = `userData/workspace`，**自动创建** | `userData` 根 / `pi-cwd` | 与既有 `pi-cwd`（默认 cwd）区分，专用于用户登记的工作区；实测初始不存在 | FR-203-002 |
| D5 | 只记主目录、不记子路径 | 记完整路径 | 失效路径容错成本低 | FR-203-018 |
| D6 | 授权降级为「预检 + 去系统设置」 | 坚持对话框内主动申请 | 主动申请实测不 settle（FR-203-017），其定论需改 `web_engine` ArkTS 侧，超出本模块范围 | FR-203-015/016 |
| D7 | PL1 扩展只做 `/roots` 自检 | 另做「预置 `__piAdditionalAllowedRoots`」 | YAGNI：P4 表明采纳时上游已 `allowFileRoot(cwd)`，预置无实际消费者 | FR-203-019 |

## 8. 补丁工程化（FR-203-020/021/022）

1. **生成**：在 `../pi-web` 的 **detached worktree**（`git worktree add --detach <tmp> v0.11.1`）上改文件 → `git diff` 导出 unified diff（禁用 `--binary`，无 `package-lock.json`）。
2. **应用（`prepare-next.mjs`）**：
   ```
   for (patch of patches/v0.11.1/*.patch):
       if (git apply --reverse --check patch) -> 已应用，skip
       else if (git apply --check patch)       -> git apply patch          （硬失败即中止）
       else                                     -> 硬失败（冲突不得 --3way）
   ```
3. **往返校验**：`apply` → 记录受影响文件 SHA-256 → `apply --reverse` → 断言 SHA-256 还原；再 `apply` 恢复为「已应用」态（构建需要）。
4. **守卫**：应用后断言目标文件含补丁标记注释；`/api/cwd/browse` 与 `DirectoryPicker.tsx` 存在期望符号。
5. **登记**：`patches/README.md` 写「触发条件 / 实施时机 / 替代方案」+ 编号 `P203-1`；`docs/工程规划.md` §7 表格由「0 条」改为「1 条」。

## 9. 边界与失败可见性

| 场景 | 表现 | 回引 |
|---|---|---|
| 用户目录不可读（未授权） | 对话框内归因 + 去设置 + 重试，不关对话框 | FR-203-015/016 |
| 主目录解析失败（`PI_HOS_ROOTS` 缺项） | 该 Tab 可见但内容区显示不可用说明 + 重试；**不回退其它主目录** | FR-203-003 |
| 沙箱根创建失败 | 内容区显示失败原因 + 重试；不静默 | FR-203-002 |
| 新建重名 | Modal 内提示，保留输入态 | FR-203-013 |
| `entries` 触顶 | 展示 `truncated` 文案 | FR-203-009 |
| 采纳失败 | 复用既有错误 Modal（含重试） | FR-203-014 |
| 权限桥不可用 | 明确归因（`available:false`），不假装成功 | FR-203-016 |

## 10. 文件清单（提交范围）

**新增**：`specs/203-plugin-workspace-picker/{spec,plan,tasks,test-cases}.md`、`docs/203-插件-选择工作区目录.md`、`extensions/harmony-workspace-roots.js`、`patches/v0.11.1/0001-workspace-picker-roots.patch`、`logs/20261014-2/*`。

**修改**：`src-main/main.js`、`scripts/prepare-next.mjs`、`patches/README.md`、`docs/工程规划.md`、`specs/README.md`、`skills/harmony-runtime-capabilities/SKILL.md`、`docs/真机验证记录.md`、`docs/鸿蒙环境能力清单-v0.11.1.md`（如需）、`README.md`/`README_zh.md`（如需）。

**明确排除**：`build-profile.json5`（工作树含本地调试签名材料，见 `specs/006-signing-identity/spec.md` FR-006-006）；`../pi-web`（只经补丁）、`../pi`、`../harmonypc-electron`。

## 11. 验证策略

| 层 | 手段 | 覆盖 |
|---|---|---|
| 宿主侧单测（**已实现**） | `node scripts/test-workspace-picker.mjs` — 44 断言：把补丁后的 `lib/directory-browser.ts` 在临时 git 仓库里重建 + 转译 + 真实 `import()`，断言根围栏（含同前缀兄弟、`../` 穿越、根外绝对路径）、`getWorkspaceRoots` 六种输入、补丁文件集合/无二进制/无 lockfile/幂等判定语义/上游零改动、扩展语法与「工厂内不起长驻资源」；另有 `node scripts/test-harmony-tools.mjs`（33 断言，不回归） | FR-203-019/021/022 |
| 补丁往返 | apply/reverse/SHA-256 还原断言 | FR-203-020/022 |
| 构建期 | `collect-pi` 物化 `extensions/harmony-workspace-roots.js`；`--strict` 断言 | FR-203-019 |
| 真机 `--inspect` | 四根解析、`PI_HOS_ROOTS`、权限预检、桥可用性 | FR-203-002/003/004/015/016 |
| 真机交互 | 四 Tab 切换/下钻/面包屑/新建/授权归因/采纳/记忆 | FR-203-005~014/018 |
| 回归 | 两处入口（侧栏 + composer「打开其它项目」）、采纳链路、会话创建与一轮对话 | FR-203-014 |

## 12. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 用户目录在真机上未授权 | 桌面/文档/下载 Tab 不可列 | 对话框内归因 + 去设置入口；沙箱 Tab 始终可用；上架前按 `docs/ACL申请清单.md` 复核（A4） |
| R2 | 补丁与上游升级冲突 | 构建中止（**预期行为**，不静默） | 补丁集中在 7 个文件、以只增为主；升级时按 `docs/工程规划.md` §11.3 复核并重生成 |
| R3 | `DirectoryPicker.tsx` 是共享组件，替换后影响既有交互 | 侧栏/composer 两入口行为变化 | 保持 export 名与 props 签名不变（`SessionSidebar.tsx` 零改动）；回归用例覆盖两入口 |
| R4 | 主动申请不可用（FR-203-017） | 用户需手动去设置并重启 | D6 降级 + 明确文案；定论方式已登记 |
| R5 | `PI_HOS_ROOTS` 被 pi-web 误当作真值来源 | 主目录集合漂移 | 单一来源为主进程；pi-web 只读不写；缺失即空数组 |
