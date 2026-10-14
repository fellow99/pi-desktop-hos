# 插件·选择工作区目录（203-plugin-workspace-picker）—— 规格

> **Module:** 203-plugin-workspace-picker ｜ **Status:** Proposed ｜ **Last Updated:** 2026-10-14
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）· harmonypc-electron v37.2.3
> **需求编号:** 203-plugin-workspace-picker ｜ **需求名称:** 插件：选择工作区目录
> **git 分支:** 不改动（沿用 101/102/103/006 的纪律：不新建、不切换、不重命名）
> **参考模块:** `dsh-desktop-hos/specs/203-plugin-workspace-picker/`（文档结构参考其编写）
> **设计文档:** [`../docs/203-插件-选择工作区目录.md`](../docs/203-插件-选择工作区目录.md)
> **复现取证件:** `logs/20261014-2/T01-poc-permission.txt`

## 1. 模块概述

### 1.1 目的（Why this module exists）

把 Pi Web 的「选择工作区目录」对话框升级为**四主目录**选择器：

- 对话框顶部提供四个主目录 Tab：**沙箱 / 桌面 / 文档 / 下载**；
- 选定主目录后可在其**内部**逐级下钻、新建文件夹、选中并采纳为工作区；
- 浏览域被**锁定在该主目录内**（只向下、不上溯、无手动路径输入）；
- 主目录记忆（只记主目录 id，不记子路径）；
- 未授权时给出**准确归因**与「去系统设置」入口。

### 1.2 解决的问题（What pain points it addresses）

| # | 现状 | 证据 |
|---|---|---|
| 1 | 对话框起点落在沙箱：`getBrowseStartDirectory()` 返回 `homedir()`，而壳把 `HOME` 指向 `userData` | `pi-web/lib/directory-browser.ts`；`src-main/main.js#assembleSandboxEnv` |
| 2 | 已授权的用户目录（桌面/文档/下载）**无法从该入口被用作工作区**：用户必须自己知道并手输绝对路径 | ✅ 真机：`/storage/Users/currentUser/*` 存在（`logs/20261014-2/T01-poc-permission.txt`） |
| 3 | 对话框**没有**主目录概念，也没有面包屑围栏（`parentPath` 可一路点到 `/`） | `pi-web/components/DirectoryPicker.tsx` |
| 4 | 对话框有**自由文本路径输入**（可提交任意绝对路径），且不渲染 hidden 过滤 | 同上 |
| 5 | 新建文件夹的默认名为空，同级已存在时无去重 | 同上 |
| 6 | 用户目录读写在 OS 层是 `user_grant` 权限，未授权时表现为 `EPERM`，当前没有任何用户可见的解释 | ✅ 真机：`readdir('/storage/Users/currentUser/Desktop')` → `EPERM` |
| 7 | 参考工程 `dsh-desktop-hos` 用 dual-face 插件填两个 slot 洞即可替换对话框；**本工程的上游没有该机制** | 见 §7 假设 A1 |

### 1.3 范围（Scope）

**包含**：

- 四主目录（沙箱/桌面/文档/下载）的解析、切换、浏览、新建、采纳、记忆；
- 浏览域围栏（向下穿越、面包屑截断、无手输路径、hidden 不渲染、`truncated` 提示）；
- 授权预检、准确归因、「去系统设置」深链接；
- 壳侧主目录解析与桥（`src-main/main.js`）、PL1 自检扩展（`extensions/harmony-workspace-roots.js`）；
- **本工程第 1 条上游补丁**（`patches/v0.11.1/`）及其构建期幂等应用阶段；
- 本模块的 `spec.md` / `plan.md` / `tasks.md` / `test-cases.md` 与 `docs/203-插件-选择工作区目录.md`；
- 真机编译、部署与 `--inspect` + 交互测试。

**不包含**：

- 父工程 `specs/` 登记（本模块规格仅落 `pi-desktop-hos/specs/`）；
- ArkTS `PermissionManagerAdapter` 的改写（不改上游/运行时源码；FR-203-014 的主动申请以 ⬜ 登记）；
- 文件选择、多选、整盘浏览、显示隐藏文件开关；
- git 分支改动。

## 2. 用户故事

- 作为用户，我希望在「选择工作区目录」里直接切到桌面/文档/下载，把这些已授权目录中的文件夹注册为工作区。
- 作为用户，我希望选定主目录后能进入子文件夹、新建文件夹并选中，以便精确指定位置。
- 作为用户，我希望在沙箱里也有一个稳定的默认工作区根，不必手工创建。
- 作为用户，当我切到某个用户目录读不了时，我希望看到**为什么**读不了，并有一键去系统设置的入口。
- 作为用户，我希望下次打开对话框还停在上次用的主目录，少一次切换。
- 作为排障者，我希望 `--inspect` 与 `/roots` 命令能直接给出四个主目录的解析结果与授权状态。

## 3. 功能需求

### 3.1 主目录与解析

- **FR-203-001** 系统 MUST 恰好提供**四个**主目录，id 分别为 `sandbox` / `desktop` / `documents` / `download`，对应标签「沙箱 / 桌面 / 文档 / 下载」。MUST NOT 提供第五个主目录，MUST NOT 提供整盘浏览。
- **FR-203-002** 沙箱主目录 MUST 为 `join(app.getPath('userData'), 'workspace')`；主进程解析时若不存在 MUST `mkdir { recursive: true }` **自动创建**后返回。✅ 真机实测该目录**初始不存在**且父目录可写（`process.cwd()` 为 `/`，`userData` 为 `/data/storage/el2/base/files`），故自动创建是必需行为而非可选优化。
- **FR-203-003** 桌面/文档/下载主目录 MUST 为 `/storage/Users/currentUser/{Desktop,Documents,Download}`（✅ 真机实测三者均为已存在的目录；`Downloads` 复数与 `Document` 单数**均不存在**）。MUST NOT 按「是否可读」过滤掉条目——不可读时按 FR-203-015 呈现，MUST NOT 静默换根。
- **FR-203-004** 主目录解析 MUST 在**主进程**完成，并经环境变量 `PI_HOS_ROOTS`（JSON）传给同进程的 Next 服务器。MUST NOT 为此新增 IPC 通道、自定义协议或新的业务数据面（pi-web 的 HTTP 路由与主进程同进程，见 `docs/工程规划.md` §4.2）。MUST NOT 在渲染进程读 `electron`。

### 3.2 浏览与围栏

- **FR-203-005** 对话框顶部 MUST 渲染四个主目录 Tab，显示当前选中的主目录；点击 MUST 切换并**重置浏览栈**到该主目录根、清空选中态、重新列目录。
- **FR-203-006** 目录浏览 MUST 复用 pi-web 既有 `/api/cwd/browse`（`GET` 列目录 / `POST` 建目录），MUST NOT 自实现文件系统访问。列目录 MUST 只返回目录、按名称排序；`hidden`（以 `.` 开头）条目 MUST NOT 渲染；MUST NOT 提供「显示隐藏文件」开关。
- **FR-203-007** 对话框 MUST NOT 存在自由文本路径输入（无路径编辑框、无「跳转」提交入口）。UI 层 MUST NOT 存在提交任意绝对路径的可能性。**安全属性，不是待修的缺陷。**
- **FR-203-008** 面包屑 MUST 由当前路径相对**主目录根**生成，最高可点击到主目录根；主目录根之上的层级 MUST NOT 渲染。**安全属性。**
- **FR-203-009** 下钻 MUST 只接受当前列目录返回的条目路径；切换主目录 MUST 重置整栈。`entries` 触顶（后端上限 1000）时 MUST 给出 `truncated` 提示文案，MUST NOT 静默截断。
- **FR-203-010** 布局 MUST 保留 pi-web 原生**单列列表**面板版式（不重造参考文档的 Miller 多列视图）。**有意偏离**：pi-web 无 Miller 布局，重造会把补丁面从「新增一行 Tab」扩大到整套布局代码，而 FR-203-005~009 已完整覆盖可验收行为（决策记录见 `plan.md` §7 D3）。

### 3.3 新建与采纳

- **FR-203-011** 「新建文件夹」 MUST 弹出嵌套 Modal 输入**单个目录段名称**（不得含路径分隔符），经 `POST /api/cwd/browse` 创建。
- **FR-203-012** 新建文件夹输入框的**默认名** MUST 为 `未命名文件夹`（zh）/ `Untitled folder`（en/其它），当同级已存在同名目录时 MUST 自动追加序号（`未命名文件夹 2`、`未命名文件夹 3`…）。
- **FR-203-013** 创建成功后 MUST 重新列目录并**选中**新文件夹；同级重名 MUST 在 Modal 内提示并保留输入态，MUST NOT 关闭对话框。
- **FR-203-014** 「选择此文件夹」 MUST 经既有的 `onSelect(path)` 契约回传**绝对路径**，复用 pi-web 既有采纳链路（`/api/cwd/validate` → `createWorkspace`）；采纳成功后 `allowFileRoot(cwd)` 由上游既有逻辑自动完成（`pi-web/app/api/agent/new/route.ts`、`app/api/cwd/validate/route.ts`），本模块 MUST NOT 重复实现。采纳失败 MUST 复用既有错误 Modal（含重试），MUST NOT 新增错误链路。

### 3.4 授权

- **FR-203-015** 列目录返回 `EACCES`/`EPERM` 时，对话框 MUST 先经主进程桥做权限**预检**：`systemPreferences.checkPermission([...])`（✅ 实测：同步返回 `boolean[]`）。未授权时 MUST 在对话框内展示归因说明（该目录需要在系统设置中授权）+「去系统设置」按钮，MUST NOT 把原始 `EPERM` 直接抛给用户，MUST NOT 静默失败。⚠️ **该桥有假阴性**（✅ 实测：授予权限后四根实际可读写，`checkPermission` 仍返回 `false`）—— 故它 MUST NOT 被用作「是否可用」的门禁：MUST 只在**列目录已经失败**之后调用，MUST 只用于选择归因话术，且 MUST 在任何返回值下都保留「重试」出口。已授权时 MUST 改为说明「更像是一次临时失败」并隐去「去系统设置」；`permType` 为 null（沙箱）时 MUST 使用通用「无法读取」话术。
- **FR-203-016** 「去系统设置」 MUST 经 `systemPreferences.openApplicationInfoEntry()` 深链到本应用信息页（✅ 实测：无参、同步、无异常）。返回后 MUST 提供手动「重试」入口。授权桥不可用时 MUST 明确归因，MUST NOT 假装成功。
- **FR-203-017** ⬜ **待验证（未通过）**：对话框内**主动弹出**系统授权窗。现状：`systemPreferences.requestDirectoryPermission(path, cb?)` 的参数形状已探明（**裸路径字符串**通过参数校验；`Array`/对象形状一律抛 `Invalid path`），但主进程调用后 Promise **不 settle**（观测窗口 2 min），与「同进程无 ArkTS UIAbility active context」的既有结论一致。**定论方式**：在 `web_engine` ArkTS 侧以 `PermissionManagerAdapter.requestPermissions` 暴露一个带 active context 的桥后复测，或改用 `FilePickerAdapter` 系统选择器 + `fileAccessPersist`；**结论落** `docs/203-插件-选择工作区目录.md` §16 与 `docs/真机验证记录.md`。v1 按 FR-203-015/016 降级落地。

### 3.5 记忆与自检

- **FR-203-018** 主目录选择 MUST 持久化到浏览器 `localStorage`（插件私有键）。MUST 只记主目录 id，MUST NOT 记子路径；再次打开 MUST 停留在该主目录**根**。存储值非法（不属于四个 id）时 MUST 回退 `sandbox`。
- **FR-203-019** 壳侧 MUST 以 PL1 扩展形式提供自检入口：`extensions/harmony-workspace-roots.js` 注册 `/roots` 命令，打印四个主目录的绝对路径、存在性、可读性与三项目录权限的授权状态。该扩展 MUST NOT 在工厂函数里启动长驻资源。

### 3.6 机制与纪律

- **FR-203-020** 上游改动 MUST 只以**幂等补丁**形式落在 `patches/v0.11.1/`，MUST NOT 直接改 `../pi-web` 工作树。补丁集 MUST 在 `patches/README.md` 登记「触发条件 / 实施时机 / 替代方案」并占用全局唯一编号。
- **FR-203-021** `scripts/prepare-next.mjs` MUST 在 `next build` **之前**幂等应用补丁：先 `git apply --reverse --check`（成功即视为已应用→跳过），失败再 `git apply`；冲突 MUST 硬失败，MUST NOT 使用 `--3way`。
- **FR-203-022** 补丁 MUST 满足「可往返」：正向应用后再反向应用，受影响文件的 SHA-256 MUST 完全还原。MUST NOT 把 `package-lock.json` 等由 `npm install` 重新生成的文件打进补丁。
- **FR-203-023** 本模块 MUST 只改**本工程自有文件**（`src-main/`、`extensions/`、`scripts/`、`patches/`、`specs/`、`docs/`）+ 上述补丁；MUST NOT 改动 `../pi` 与 `../harmonypc-electron`。`../pi-web` MUST 保持工作树零改动（补丁按需应用/回退，不留残迹）。
- **FR-203-024** 本模块的父工程（`pi-workspace`）侧 MUST NOT 新增规范文档；仅 MUST 按需更新本工程 `specs/README.md` 的模块登记。
- **FR-203-025** 提交信息 MUST 遵循 Conventional Commits 前缀（`feat` / `docs` / `chore` / `fix` / `test` / `build` 等），MUST NOT 使用其它前缀。
- **FR-203-026** 生产安全：`PI_HOS_ROOTS` 只承载**路径**，MUST NOT 承载凭据或任何业务数据；权限桥 MUST 只暴露「预检 / 去设置」两个动作。

## 4. 关键实体

| 实体 | 说明 | 关键属性 |
|---|---|---|
| 主目录（WorkspaceRoot） | 一个隔离浏览域 | `id`(`sandbox`/`desktop`/`documents`/`download`)、`label`、`path`、`permType`、`available` |
| 根解析结果（RootsSnapshot） | 主进程一次解析的产物 | `roots[4]`、`userData`、`createdSandbox`(bool) |
| 浏览栈（BrowseStack） | 单列列表的当前态 | `rootId`、`currentPath`、`entries[]`、`truncated`、`loading`、`error{code}` |
| 权限桥（PermissionBridge） | 主进程能力，非业务数据 | `check(permType) -> boolean/undefined`、`openAppInfo()`、`available` |
| 补丁（UpstreamPatch） | 幂等上游改动 | `tag`(`v0.11.1`)、`files[]`、`id`、`applied`、`reverseCheckOk` |

## 5. 验收场景

### 场景 1：四个 Tab 与栈重置
- Given 对话框已打开且主目录为沙箱
- When 依次点击桌面/文档/下载/沙箱，并在某一 Tab 下钻一层后切走再切回
- Then 每次列出的都是对应主目录根；切回后停在根、无子级残留；选中态被清空

### 场景 2：沙箱根自动创建
- Given `<userData>/workspace` 不存在
- When 打开对话框并停在沙箱 Tab
- Then 该目录被自动创建（`recursive`），列表渲染成功且不报错

### 场景 3：用户目录列举与围栏
- Given 桌面/文档/下载已授权
- When 切到任一用户目录并连续下钻多层
- Then 列出其下文件夹、路径前缀为 `/storage/Users/currentUser/...`；面包屑首项即该主目录根、无更上层级可点

### 场景 4：入口精简
- When 检查对话框 header/footer 控件与列表条目
- Then 无路径输入框、无「跳转」按钮、无「显示隐藏文件」开关；以 `.` 开头的条目不渲染

### 场景 5：新建文件夹
- Given 当前主目录内已有名为 `未命名文件夹` 的目录
- When 点击「新建文件夹」并直接确认
- Then 创建出 `未命名文件夹 2`，列表刷新且新文件夹被选中

### 场景 6：未授权归因
- Given 某用户目录未授权（`checkPermission` 返回 `false`）
- When 切到该 Tab
- Then 对话框内显示归因说明 +「去系统设置」；点击后深链到本应用信息页；返回后「重试」可再次尝试

### 场景 7：采纳与文件访问
- Given 选中桌面下某个已有文件夹
- When 点击「选择此文件夹」
- Then 工作区被创建并切换；该路径出现在会话 `cwd`；文件面板可列出其内容（`allowFileRoot` 由上游既有链路完成）

### 场景 8：主目录记忆
- Given 上次停在桌面
- When 关闭并重开对话框
- Then 停在**桌面根**（不恢复子路径）；把存储值改成非法 id 后重开则回退沙箱

### 场景 9：补丁幂等与可往返
- When 连续两次执行补丁应用阶段，并对补丁做正向+反向应用
- Then 第二次为 no-op；反向应用后受影响文件 SHA-256 与打补丁前一致；`../pi-web` 与 `../harmonypc-electron` 工作树零改动

### 场景 10：零重复与自检
- When 启动后读 `--inspect` 与 `/roots`
- Then 四个主目录路径与授权状态与真机一致；无 `EPERM` 静默失败；应用启动无异常

## 6. 非功能需求

- **安全性**：无手输路径入口（FR-203-007）、面包屑截断（FR-203-008）、下钻只接受列目录返回项（FR-203-009）构成根围栏。桥只暴露两个只读/跳转动作（FR-203-026）。
- **可维护性**：主目录集合单一来源为主进程（FR-203-004）；pi-web 仅通过一个环境变量契约消费，补丁面集中在 3 个文件。
- **可靠性**：不可读、未授权、`truncated`、重名、采纳失败逐条 fail-visible，MUST NOT 静默（FR-203-009/013/015/016）。
- **幂等性**：沙箱根创建、补丁应用、物化与镜像均可重复执行（FR-203-002/021/022）。
- **纪律**：上游零直接改动（FR-203-020/023）、父工程零新增规范（FR-203-024）。

## 7. 假设与约束

- **A1（✅ 实测）**：pi-web **没有** UI 插槽/客户端面插件机制。pi 扩展的 UI 仅 `select` / `confirm` / `input` / `editor` 四种对话框，`custom()` 在 RPC 模式返回 `undefined`（`pi/packages/coding-agent/docs/rpc-extension-ui.md`）。故「四主目录 Tab 对话框」**只能**改 pi-web 源码 → 触发 FR-203-020 的补丁机制。
- **A2（🔶 沿用 + ✅ 实测）**：`/storage/Users/currentUser/{Desktop,Documents,Download}` 是鸿蒙 2in1 的用户目录挂载点；应用侧访问需 `user_grant` 权限，未授权表现为 `EPERM`（`docs/鸿蒙环境能力清单-v0.11.1.md` + T01 取证）。
- **A3（✅ 实测）**：`electron.systemPreferences` 提供 `checkPermission(string[]) -> boolean[]`（同步）与 `openApplicationInfoEntry()`（同步无参）；`requestDirectoryPermission(path, cb?)` 存在但主进程调用不 settle。
- **A4（⚠️ 风险）**：`READ_WRITE_DESKTOP_DIRECTORY` 为 `system_basic`（需 ACL），上架前 MUST 按 `docs/ACL申请清单.md` 复核；发布 Profile 缺失时桌面 Tab 将不可用，但不影响沙箱/文档/下载。
- **A5（约束）**：沙箱 `HOME` 仍指向 `userData`（`docs/工程规划.md` §4.6），本模块 MUST NOT 改变该装配。
- ⬜ **待验证**：用户目录在「系统设置授权并重启应用」后的实际可读/可写行为。**定论方式**：真机在设置中授权 → 重启 → `/roots` + 对话框列举；**结论落** `logs/20261014-2/TEST_REPORT.md` 与 `docs/真机验证记录.md`。

## 8. 依赖

**上游 / 外部（被本模块消费）**：

- `pi-web`：`components/DirectoryPicker.tsx`（被补丁替换实现）、`lib/directory-browser.ts`（被补丁扩展）、`app/api/cwd/browse/route.ts`（被补丁扩展）、`app/api/cwd/validate/route.ts` + `app/api/agent/new/route.ts`（采纳链路，**不改**）、`lib/allowed-roots.ts`（`allowFileRoot`，**不改**）。
- `harmonypc-electron` 运行时：`electron.systemPreferences` 的四个原生接口（A3）。
- HarmonyOS：`/storage/Users/currentUser/*` 挂载点与三项目录权限。

**本工程（被本模块消费）**：

- `001-host`：沙箱环境装配（`HOME`/`userData`）、进程内 Next 服务器（FR-203-004 的同进程前提）。
- `005-build-pipeline`：`scripts/prepare-next.mjs` 的补丁阶段（FR-203-021）、`collect-pi.mjs`（`extensions/` 物化）。
- `006-signing-identity`：三项目录权限的声明与 ACL 归属（A4）。

**下游（消费本模块）**：

- `docs/203-插件-选择工作区目录.md`（设计文档）、`docs/真机验证记录.md`（验证记录）、`skills/harmony-runtime-capabilities`（用户目录能力描述）、`patches/README.md`（补丁登记）。
