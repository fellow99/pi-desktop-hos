# ACL 申请清单（Pi Desktop / `org.fellow99.pi.PiDesktop`）

> **版本**：v1 ｜ **日期**：2026-10-14 ｜ **适用工程**：`pi-desktop-hos`
> **用途**：**申请操作手册**。列出本工程必须申请的**受限权限（ACL）**、**开放权限（免 ACL）**、**明确不申请**的项与理由，以及 AGC 提交口径与上架前置复核。§3 的「申请原因 / 使用场景」为**可直接照填 AGC 表单**的文本。
> **基准**：本清单的**权限声明面与 `dsh-desktop-hos` 逐项对标** —— `web_engine/src/main/module.json5` 的 23 项 `requestPermissions`（含顺序）+ 2 项 `definePermissions`、`electron/src/main/module.json5` 的 `KEEP_BACKGROUND_RUNNING` + `backgroundModes: ["taskKeeping"]`、以及 8 条 `reason` 文案（3 套 locale）。判定口径沿用 `dsh-desktop-hos/docs/ACL申请清单-v2.md` §2（「需 ACL」判定规则只在该文件 §2；`-v1.md` §2 是申请原因文案）。
> **上游基线**：`pi` v1.1.0 · `pi-web` v0.11.1；运行期 Electron 37.2.3（Node 22.17.0 / Chromium / ABI v138）。
> **数据来源**：本机 DevEco SDK 权威权限目录 `Sdk/23/toolchains/lib/PermissionDefinitions.json`（**第一手，722 条**）＋ `dsh-desktop-hos` 实际声明 ＋ 本工程 `module.json5` 实际声明。
> **图例**：✅ **已声明/已实测** ｜ 🔶 **沿用** ｜ ⬜ **待申请/待验证** ｜ ❌ **不申请** ｜ ℹ️ **开放权限（仅需声明，无需 ACL）**。
> **配套**：能力边界见 `docs/鸿蒙环境能力清单-v0.11.1.md`；本模块规格见 `specs/006-signing-identity/`；规划结论见 `docs/工程规划.md` §11.4。

---

## 1. 摘要：要申请什么

申请路径：**AGC → 开发与服务 → 项目 → 应用（`org.fellow99.pi.PiDesktop`）→ 项目设置 → ACL权限 → 未获取权限 → 勾「我已知晓」→ 勾选目标权限 → 填申请原因与使用场景 → 提交申请**。

| # | 权限名 | level | grantMode | since | 是否需 ACL | 状态 | 服务的产品能力 |
|---|---|---|---|---|---|---|---|
| **A0** | `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` | `system_basic` | system_grant | 14 | ✅ **需要** | ⬜ 待申请 | 内置 V8/Node 引擎 JIT 即时编译（**决定应用能否启动**） |
| **A1** | `ohos.permission.READ_PASTEBOARD` | `system_basic` | user_grant | 11 | ✅ **需要** | ⬜ 待申请 | 剪贴板文本/HTML/图片粘贴到对话输入框 |
| **A2** | `ohos.permission.READ_WRITE_DESKTOP_DIRECTORY` | `system_basic` | user_grant | 11 | ✅ **需要** | ⬜ 待申请 | 工作目录位于桌面目录时的直写（agent 文件工具） |
| **B** | **21 项开放权限**（见 §4） | `normal` | — | — | ℹ️ **不需要** | ✅ 已声明 | 网络 / 目录访问 / 打印 / 传感器 / 后台保活 等 |
| ❌ | 二进制证书、`ALLOW_EXTERNAL_NATIVE_CODE`、`kernel.LOAD_INDEPENDENT_LIBRARY`、四个 `*PLUGIN*`、`CUSTOM_SANDBOX` 等（见 §5） | — | — | — | ❌ **不申请** | — | 无正当路线 / 无正当用途 / 上架障碍 |

> ⚠️ **提交前必读**：按 SDK 23 权限定义，本工程真正走 ACL 的只有 **A0 / A1 / A2**（`system_basic` 跨级别，`provisionEnable == true`）；§4 的 21 项为 `normal` 开放权限，写进 `module.json5` 的 `requestPermissions` 即生效（`user_grant` 项首次访问时系统弹窗），**在 AGC ACL 列表中通常无法勾选，无需提交**。
>
> 三项 ACL 可**一次提交**（单次上限 30 项），审核结果一起返回；**上一批未审完不能提交新一批**。

**一句话**：本工程要做的是 **① 按本包名提交 3 项 ACL 的工单**（`kernel.ALLOW_WRITABLE_CODE_MEMORY` 是**关键路径**——未获批则应用的 JS 引擎 JIT 不可用，属**应用级失败**而非功能降级，应尽早在 AGC 开工单；`READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY` 同批提交），**② 保持声明面与 `dsh-desktop-hos` 一致**（✅ 已完成，见 §7），其余一律**不申请**。

---

## 2. 判定规则：什么才算「需要申请」

> **受限开放权限（需 ACL）** ⟺ `provisionEnable == true` **且** `availableLevel ∈ {system_basic, system_core}`。
>
> `provisionEnable == false` 的，无论 level 是什么，都是**开放权限** —— 写进 `requestPermissions` 即可在安装时授予（`user_grant` 的还需运行期弹窗）。**把它们提交 ACL 是浪费配额**。

两个易错点：

1. `availableLevel: normal` 但 `provisionEnable: false` 的权限（如 `INHERIT_PARENT_PERMISSION`、`kernel.IGNORE_LIBRARY_VALIDATION`、`kernel.EXEMPT_ANONYMOUS_EXECUTABLE_MEMORY`）**不需要 ACL**，尽管名字带 `kernel.` 前缀、看起来很像受限权限。
2. `grantMode: system_grant` **不等于**「不用申请」：受限权限绝大多数也是 `system_grant`（安装即授予，但**前提是 Profile 里有它**）。

> 判定依据：本机 DevEco SDK 23 的权威权限目录 `Sdk/23/toolchains/lib/PermissionDefinitions.json`（第一手）。✅ **2026-10-14 已用本机 SDK 对本工程全部 24 项声明逐条复核**，结论落在 §3（3 项需 ACL）与 §4（21 项开放）。

---

## 3. 必须申请（受限权限，共 3 项）

| # | 权限名 | availableLevel | since | grantMode | provisionEnable | 用途 |
|---|---|---|---|---|---|---|
| 1 | `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` | `system_basic` | **14** | `system_grant` | `true` | 分配**可写且可执行**内存 ⇒ 启用 Electron/V8 的 **JIT** |
| 2 | `ohos.permission.READ_PASTEBOARD` | `system_basic` | 11 | `user_grant` | `true` | 用户主动粘贴时读取剪贴板文本 / HTML / 图片 |
| 3 | `ohos.permission.READ_WRITE_DESKTOP_DIRECTORY` | `system_basic` | 11 | `user_grant` | `true` | 工作目录位于桌面目录时的直写（AI agent 文件工具读写） |

> 三项**一次提交**（单批上限 30 项），审核结果整批返回；上一批未审完不能提交下一批。
>
> **`usedScene` 口径**：本工程 8 个带 `reason` 的项统一为 `abilities: ["EntryAbility"]`（entry 模块中真实存在的 Ability）+ `when: "inuse"`，与 `dsh-desktop-hos` 完全一致。
>
> **`reason` 文案口径**：`module.json5` 的 `reason` 是**系统授权弹窗**文案，取自 `$string:access_pasteboard` / `$string:desktop_dir` / …，值落在 `web_engine/src/main/resources/<locale>/element/string.json`（已列入 `scripts/collect-runtime.mjs` 的 `OVERLAY_FILES`）。本节 §3.1–§3.3 的「申请原因」是 **AGC 表单文本**，与弹窗文案是两件事。

### 3.1 `kernel.ALLOW_WRITABLE_CODE_MEMORY`（关键路径）

- **为什么不可缺**：本应用基于 Electron-on-鸿蒙运行时，`libelectron.so` 内的 V8 在运行期需为编译产物申请**可写可执行内存**；无该权限时 JIT 不可用 → Electron 引擎无法正常工作（**应用级失败**，不是「某功能降级」）。**该权限不可删除**。
- **声明落点（必须两处同时有）**：`web_engine/src/main/module.json5` → `requestPermissions` **与** `definePermissions`。
- **`申请原因`（≤256 字，可直接照填）**：

  > 因为本应用基于 Electron-on-鸿蒙运行时（Electron 37 / Node 22.17）构建，内置 Chromium V8 与 Node.js 引擎；用户进行 AI 对话与工具调用时，V8/Node 需要对 JavaScript 执行 JIT 即时编译以保证运行性能，所以需要 kernel.ALLOW_WRITABLE_CODE_MEMORY 权限。该权限仅用于引擎自身 JIT 代码缓存，不用于应用热更新，不下载或加载外部不可信代码。应用仅面向平板与 2in1 设备。

- **`使用场景`**：应用启动与日常使用过程中，由内置运行时引擎自行编译脚本代码；用户不感知该过程，也不触发任何代码下载。
- **🔶 沿用事实**：同型工程 `dsh-desktop-hos` 已把该权限同时写进其 `web_engine` 的 `requestPermissions` 与 `definePermissions` 并在真机正常运行；本工程照此落点，但**申请主体与包名必须换成本工程的**（ACL 与 bundleName + AGC 应用主体绑定，dsh 已获批的同类权限**不能转移**，⬜ 待工单确认口径）。
- **⬜ 待实测的已知风险**：全新安装时受限权限可能被设备策略拒绝 → 需确认规避手段（`dsh-desktop-hos` 的做法是日常用 `hdc app install -r` 覆盖安装），结论落 `docs/真机验证记录.md`（spec FR-006-015）。

### 3.2 `READ_PASTEBOARD`

- **为什么需要**：用户把剪贴板中的文本 / HTML / 图片粘贴到对话输入框时，由 `web_engine/src/main/ets/adapter/PasteBoardApadter.ets`（`readPasteBoardText` / `readPasteBoardHTML` / `readImageBuff`）读取；该权限为 `system_basic` + `user_grant`（**需 ACL**），运行期再由 `PermissionManagerAdapter`（`needPermissions.pasteboard`）弹窗申请。
- **声明落点**：`web_engine/src/main/module.json5` → `requestPermissions`（带 `reason: $string:access_pasteboard` + `usedScene`）。
- **`申请原因`（≤256 字，可直接照填）**：

  > 因为需要支持用户把剪贴板中的文本、HTML 或图片粘贴到对话输入框（仅在用户主动触发粘贴操作时读取），所以需要 ohos.permission.READ_PASTEBOARD 权限。仅在用户粘贴时读取剪贴板内容，不在后台读取、不上传剪贴板数据。

- **`使用场景`**：用户在应用内对话输入框主动执行粘贴时读取剪贴板；不执行粘贴则不读取。

### 3.3 `READ_WRITE_DESKTOP_DIRECTORY`

- **为什么需要**：用户在应用内选择的工作目录可能位于桌面目录，AI agent 的文件工具需要直接读写该目录；该权限为 `system_basic` + `user_grant`（**需 ACL**），运行期由 `PermissionManagerAdapter`（`needPermissions.directory_desktop`）申请。
- **声明落点**：`web_engine/src/main/module.json5` → `requestPermissions`（带 `reason: $string:desktop_dir` + `usedScene`）。
- **`申请原因`（≤256 字，可直接照填）**：

  > 因为用户在应用内选择的工作目录可能位于桌面目录，AI agent 的文件工具（读取/新建/编辑/保存文件）需要直接读写该目录，所以需要 ohos.permission.READ_WRITE_DESKTOP_DIRECTORY 权限。仅访问用户主动选择或授权的桌面目录，不批量扫描磁盘。

- **`使用场景`**：用户把工作目录选到桌面目录后，agent 在该目录内读写文件；未选择或未授权时不访问。
- **⚠️ 上架风险项**：`system_basic` 是本工程当前唯一的 ACL 上架障碍，MUST 在上架前复核是否保留（见 §6）。

---

## 4. 免 ACL 的开放权限（21 项，均已声明）

以下均为**开放权限**（`provisionEnable == false`，或 `availableLevel == normal`），**不要提交 ACL**；列在此处是为了防止误申请。全部取自本工程 `module.json5` 的实际声明，取值来自 SDK 23。

| # | 权限名 | level | grantMode | since | 声明位置 | 用途 |
|---|---|---|---|---|---|---|
| 1 | `ohos.permission.INTERNET` | normal | system_grant | 9 | web_engine | 网络（Next 服务器、模型 API） |
| 2 | `ohos.permission.GET_NETWORK_INFO` | normal | system_grant | 8 | web_engine | 网络状态查询 |
| 3 | `ohos.permission.KEEP_BACKGROUND_RUNNING` | normal | system_grant | 8 | **electron** | 后台保活（配合 EntryAbility `backgroundModes: ["taskKeeping"]`） |
| 4 | `ohos.permission.ACCESS_CERT_MANAGER` | normal | system_grant | 9 | web_engine | 证书管理（网络信任链） |
| 5 | `ohos.permission.RUNNING_LOCK` | normal | system_grant | 7 | web_engine | 运行锁（长任务不被挂起） |
| 6 | `ohos.permission.PRINT` | normal | system_grant | 10 | web_engine | 打印 |
| 7 | `ohos.permission.PREPARE_APP_TERMINATE` | normal | system_grant | 10 | web_engine | 主动退出前的准备工作 |
| 8 | `ohos.permission.ACCESS_BIOMETRIC` | normal | system_grant | 6 | web_engine | 生物识别 |
| 9 | `ohos.permission.FILE_ACCESS_PERSIST` | normal | system_grant | 11 | web_engine | 文件选择器所选 URI 授权持久化（API 12 起可直接声明） |
| 10 | `ohos.permission.PRIVACY_WINDOW` | normal | system_grant | 9 | web_engine | 隐私窗口 |
| 11 | `ohos.permission.WINDOW_TOPMOST` | normal | system_grant | 13 | web_engine | 窗口置顶 |
| 12 | `ohos.permission.INHERIT_PARENT_PERMISSION` | normal | system_grant | 23 | web_engine | 随包 Node 运行时继承父进程权限（`provisionEnable: false`） |
| 13 | `ohos.permission.kernel.IGNORE_LIBRARY_VALIDATION` | normal | system_grant | 20 | web_engine | 加载随包签名的原生库时跳过库校验（`provisionEnable: false`） |
| 14 | `ohos.permission.kernel.EXEMPT_ANONYMOUS_EXECUTABLE_MEMORY` | normal | system_grant | 23 | web_engine | 随包运行时申请匿名可执行内存（JIT；`provisionEnable: false`） |
| 15 | `ohos.permission.GYROSCOPE` | normal | system_grant | 7 | web_engine | 陀螺仪 |
| 16 | `ohos.permission.ACCELEROMETER` | normal | system_grant | 7 | web_engine | 加速度计 |
| 17 | `ohos.permission.GET_FILE_ICON` | normal | system_grant | 17 | web_engine | 文件图标 |
| 18 | `ohos.permission.LOCK_WINDOW_CURSOR` | normal | system_grant | 22 | web_engine（另在 `definePermissions`） | 锁定窗口内光标 |
| 19 | `ohos.permission.READ_WRITE_DOWNLOAD_DIRECTORY` | normal | user_grant | 11 | web_engine | 读写下载目录（运行期弹窗） |
| 20 | `ohos.permission.READ_WRITE_DOCUMENTS_DIRECTORY` | normal | user_grant | 11 | web_engine | 读写文档目录（运行期弹窗） |
| 21 | `ohos.permission.CUSTOM_SCREEN_CAPTURE` | normal | user_grant | 14 | web_engine | 应用内截图（运行期弹窗） |

> 与 `dsh-desktop-hos/docs/ACL申请清单-v1.md` §1 的 6 项对照：**#9 `FILE_ACCESS_PERSIST`、#19 `READ_WRITE_DOWNLOAD_DIRECTORY`、#20 `READ_WRITE_DOCUMENTS_DIRECTORY` 三项完全对应且均为开放权限（✅ 已声明）**；`READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY` / `kernel.ALLOW_WRITABLE_CODE_MEMORY` 三项为本清单 §3 的 ACL 项。

---

## 5. 明确**不要**申请

| 项 | 类型 | 不申请的理由 |
|---|---|---|
| **二进制证书**（AGC `certType: 4`） | **非权限**（在线工单） | 仅用于「随包分发自有 ELF」；本工程**不随包分发自有 ELF**。且 🔶 沿用 dsh 结论：该证书要求**企业名称与资质**，个人主体不可得 |
| `ohos.permission.ALLOW_EXTERNAL_NATIVE_CODE` | ACL | 服务于自有 ELF 的 `executableBinaryPaths`；本工程无此路线 |
| `ohos.permission.kernel.LOAD_INDEPENDENT_LIBRARY` | ACL | 服务于加载「二进制证书签名的共享库」；本工程无此路线 |
| `ohos.permission.ACCESS_USER_FULL_DISK` / `READ_WRITE_USER_FILE` | ACL | 无需弹窗直写用户公共路径；本工程按目录授权（§3.3）已够用，且申请会扩大审核面 |
| `ohos.permission.kernel.SUPPORT_PLUGIN` / `INSTALL_PLUGIN_BUNDLE` / `UNINSTALL_PLUGIN_BUNDLE` / `PLUGIN_UPDATE` | ACL | 仅当插件是**鸿蒙插件包**时需要；本工程插件是写入 profile 目录的 **JS/Node 包** |
| `ohos.permission.CUSTOM_SANDBOX` | ACL | 变更应用沙箱类型属高风险变更，上架几乎不可能（🔶 沿用） |
| `ohos.permission.RUN_ANY_CODE` | ACL | 无第三方正当用途，申请会降低整批可信度 |
| `ohos.permission.SANDBOX_ACCESS_MANAGER`（含 `_EXT`） | ACL | `system_core`，仅系统应用 |
| `ohos.permission.GET_DEVICE_INDEPENDENT_BINARY_CERT` / `SET_DEVICE_INDEPENDENT_BINARY_CERT_STATUS` | ACL | `system_core` / 仅 2in1，不可得 |
| `CAMERA` / `MICROPHONE` / `LOCATION` / `APPROXIMATELY_LOCATION` / `LOCATION_IN_BACKGROUND` / `ACCESS_BLUETOOTH` / `DISTRIBUTED_DATASYNC` / `WEB_NATIVE_MESSAGING` | 已剪裁（**声明层**） | 上游默认带、本工程**已从两份 `module.json5` 删除**（相机/麦克风/定位/蓝牙对应的 adapter 与 jsbindings 同步剪裁；本桌面壳不提供这些能力）。⚠️ **`DISTRIBUTED_DATASYNC` 有残留**：`web_engine/src/main/ets/adapter/PermissionManagerAdapter.ets` 的 `needPermissions` 仍映射 `'distributed_datasync'`，且 `web_engine/src/main/ets/ability/ContinueAbility.ets` 仍有 `requestPermissionsFromUser` 调用点 —— 因**声明已删**，这些调用**失败关闭**（fail-closed，不会越权），但「依赖同步剪裁」的表述对该项不准确，登记为 ⬜ 待清理（属运行时集成范围，不影响本轮 ACL 声明与申请） |

> ⚠️ **禁止清单必须被守卫**（spec FR-006-013）：以上项 MUST NOT 出现在 `web_engine` 与 `electron` 两份 `module.json5` 中。

---

## 6. 上架前复核：`READ_WRITE_DESKTOP_DIRECTORY`

| 项 | 内容 |
|---|---|
| 事实 | `system_basic` + `user_grant` + `provisionEnable: true` → **需 ACL**，且是 `system_basic` 跨级别权限 |
| 已做的动作 | ✅ 已声明（与 `dsh-desktop-hos` 对标）；⬜ 待随本批次提交 ACL |
| 上架前 MUST 复核 | 该权限是否**必须保留**（若不保留：桌面目录的工作目录将不可直写，需回落为「经文件选择器授权」路径） |
| 复核时点 | 上架信息定稿时（`docs/工程规划.md` §11.3-2 决定是否上架 AppGallery） |
| 记录落点 | 本节 + §10 变更记录 + `docs/工程规划.md` §11.4 |

---

## 7. 声明现状（代码事实）

### 7.1 与 `dsh-desktop-hos/docs/ACL申请清单-v1.md` 及 `dsh-desktop-hos` 的逐项核对结论

核对日期 **2026-10-14**，方法：直接比对两份工程的 `module.json5` 与 6 套 locale `string.json`，并用本机 SDK 23 复核等级。结论 —— **本工程声明面已与 `dsh-desktop-hos` 完全一致，无待补项**：

| 核对项 | 本工程 | `dsh-desktop-hos` | 结论 |
|---|---|---|---|
| `web_engine` 的 `requestPermissions` | 23 项（含顺序） | 23 项（含顺序） | ✅ 一致 |
| `web_engine` 的 `definePermissions` | `LOCK_WINDOW_CURSOR`、`kernel.ALLOW_WRITABLE_CODE_MEMORY` | 同左 | ✅ 一致 |
| `electron` 的 `requestPermissions` | `KEEP_BACKGROUND_RUNNING` | 同左 | ✅ 一致 |
| `electron` 的 `backgroundModes` | `["taskKeeping"]` | 同左 | ✅ 一致 |
| 带 `reason` 的项（含 `usedScene`） | 8 项，均为 `EntryAbility` / `inuse` | 8 项，同左 | ✅ 一致（仅 `inherit_parent_permission` 的**文案措辞**为本工程自有表述） |
| `runtime-overlays/` 回盖源 md5 | 与目标同 md5（两份 `module.json5`） | — | ✅ 一致 |
| **`v1.md` §1 的 6 项权限** | 6 项**全部已声明** | 6 项已声明 | ✅ 一致（其中 3 项需 ACL → §3） |

> **唯一本工程特有差异**：`dsh-desktop-hos/docs/ACL申请清单-v1.md` §3 还列出一条「代码事实」——`src-main/main.js → installExtraWritableRoots()`（把已授权的 Desktop/Documents/Download 写入 `DSH_EXTRA_WRITABLE_ROOTS`，免去沙箱内逐次提权）。该项是 **dsh 沙箱（`DSH_*` 环境变量体系）的实现细节**，本工程的上游是 `pi`，**没有 `DSH_EXTRA_WRITABLE_ROOTS` 这个变量**，故**不适用**；本工程对应的能力路径是「用户目录在系统中授权 + 重启应用后由运行时直接读写」（见 `docs/鸿蒙环境能力清单-v0.11.1.md` #14、能力清单 §B 待办）。⬜ 该能力是否需要在 `pi` 侧补等价的「可写根」机制，属运行时集成范围，登记为待评估项，**不影响本轮 ACL 声明与申请**。

### 7.2 声明落点（本工程实际）

| 文件 | 相关声明 |
|---|---|
| `web_engine/src/main/module.json5` → `requestPermissions` | 23 项（含 §3 的 3 项 ACL 与 §4 的 20 项开放权限）；8 项带 `reason` + `usedScene`（`EntryAbility` / `inuse`） |
| 同文件 → `definePermissions` | `LOCK_WINDOW_CURSOR`、`kernel.ALLOW_WRITABLE_CODE_MEMORY` |
| `electron/src/main/module.json5` → `requestPermissions` | `KEEP_BACKGROUND_RUNNING`；EntryAbility 带 `backgroundModes: ["taskKeeping"]` |
| `web_engine/src/main/resources/{base,en_US,zh_CN}/element/string.json` | 8 条 `reason` 文案（3 套 locale，已列入 `collect-runtime.mjs` 的 `OVERLAY_FILES`） |
| `runtime-overlays/web_engine/src/main/module.json5`、`runtime-overlays/electron/src/main/module.json5`、6 套 locale `string.json` | 回盖源，与目标**同 md5**（`collect-runtime.mjs` 阶段 7.6 守卫） |
| `web_engine/.../adapter/PasteBoardApadter.ets` | `readPasteBoardText` / `readPasteBoardHTML` / `readImageBuff`：由渲染进程粘贴动作触发读取 |
| `web_engine/.../adapter/PermissionManagerAdapter.ets` | `needPermissions` 的 `pasteboard` / `directory_desktop` / `directory_download`；`fileAccessPersist` / `activateFileAccessPersist`：文件选择器所选 URI 授权持久化 |
| `hvigorfile.ts` → `afterNodeEvaluate` | 签名材料**仅内存注入**（与 ACL 无关，但同属本模块的身份纪律） |

---

## 8. 提交操作步骤与硬约束

1. 路径：**AGC → 开发与服务 → 你的项目 → 你的应用 → `项目设置` → `ACL权限`**。
2. 在「未获取权限」区勾选 **我已知晓**，勾选 §3 的 **3 项**，逐一填写 `申请原因`（≤256 字）与 `使用场景`（文本见 §3.1–§3.3），提交**申请**。
3. **配额与节奏**：单次最多 **30 个权限**；**审核结果一起返回**；**上一批未审完不能提交新一批**。
4. **获批落点**：获批权限在**创建发布 Profile 时自动写入**。
   > ⚠️ **若 ACL 权限在 Profile 创建之后发生变化，必须重建 Profile** —— Profile 与权限集合绑定。
5. **区域**：海外账号仅支持**亚太和欧洲**；中国大陆账号正常支持。
6. **试用调试 Profile**：5 天有效期、每应用最多 5 个 —— 可用于在正式 ACL 下来之前先做可行性验证（尤其 A0 的 JIT）。
7. **构建侧配合**：release 档构建经 `scripts/build-release.ps1`（`-BuildMode release -SignMode release`），签名材料来自 `signing.release.local.json`（gitignored）。

---

## 9. 提交记录

| 批次 | 提交日期 | 权限 | 提交人 | 审批结果 | 结果日期 | 备注 |
|---|---|---|---|---|---|---|
| 1 | ⬜ 待提交 | #A0 `kernel.ALLOW_WRITABLE_CODE_MEMORY`、#A1 `READ_PASTEBOARD`、#A2 `READ_WRITE_DESKTOP_DIRECTORY` | — | ⬜ 待审批 | — | §4 的 21 项为开放权限，已声明、不占 ACL 批次 |

> 回填规则：提交后把「提交日期 / 提交人」补齐；审批结果返回后把 §1 的状态列与本节结果列一并更新，并在 §10 记一条变更。

---

## 10. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-10-14 | 首版落盘（需求 `006-signing-identity`）。依据本机 SDK 23 `PermissionDefinitions.json` 对全部 24 项声明逐条复核，确认**需 ACL 恰为 3 项**（`kernel.ALLOW_WRITABLE_CODE_MEMORY` / `READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY`）与 **21 项开放权限**；给出可直接照填 AGC 表单的申请原因与使用场景；核对声明面与 `dsh-desktop-hos` 逐项一致（§7.1）；修正 `docs/工程规划.md` §11.4 中「`READ_WRITE_DESKTOP_DIRECTORY` 不需要申请」的口径矛盾 |
