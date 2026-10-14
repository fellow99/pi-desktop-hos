# 签名与应用身份（006-signing-identity）—— 规格

> **Module:** 006-signing-identity ｜ **Status:** Proposed ｜ **Last Updated:** 2026-10-14
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）· harmonypc-electron v37.2.3
> **需求编号:** 006-signing-identity ｜ **需求名称:** 应用签名
> **git 分支:** 不改动（沿用 101/102/103 的纪律：不新建、不切换、不重命名）
> **对标工程:** `dsh-desktop-hos`（ACL 声明面与申请口径逐项对标，基准文档 `dsh-desktop-hos/docs/ACL申请清单-v1.md`）
> **参考规格:** `oc-desktop-hos/specs/006-signing-identity/`（本模块文档结构参考其编写）

## 1. 模块概述

### 1.1 目的（Why this module exists）

定义并守护本应用的**身份**与**可分发资格**：

- 应用显示名 **Pi Desktop**、bundleName **`org.fellow99.pi.PiDesktop`**，并保证改名时「多处同步」不漏；
- 签名材料（`signing.debug.local.json` / `signing.release.local.json`）由 `hvigorfile.ts` 在 `afterNodeEvaluate` **仅内存注入**，不入库、不写回；
- ACL 归属：本包名需单独申请 **3 项**受限权限（`kernel.ALLOW_WRITABLE_CODE_MEMORY` / `READ_PASTEBOARD` / `READ_WRITE_DESKTOP_DIRECTORY`，清单对齐 `dsh-desktop-hos/docs/ACL申请清单-v1.md`），其中 `ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY` 是 Electron/V8 启用 JIT 的前提（决定整应用能否启动，而非某功能降级）；
- `versionCode` 规则与上架身份类合规项（图标、禁用词、调试开关）的构建期守卫。

### 1.2 解决的问题（What pain points it addresses）

- **改名不同步**：🔶 同型工程踩坑 —— 只改 `AppScope/` 时任务视图/系统界面仍显示旧名，必须同时改 `electron/src/main/resources/{base,en_US,zh_CN}/element/string.json` 的 `EntryAbility_label`（三套都要），以及 `web_engine` 内硬编码旧 bundle 的适配点。
- **共享签名不可用**：不能用 `com.huawei.ohos_electron` 的共享签名（bundleName 不同），必须为本包名重新生成证书；🔶 沿用 dsh 结论：自定义包名意味着受限权限需**按本包名重新申请**。
- **ACL 归属随包名走**：JIT 受限权限未获批时应用起不来或 JIT 被拒（`docs/工程规划.md` §11.1 R9、§10 P0-5）。
- **申请材料无落点**：`docs/工程规划.md` §0.1/§12.2 已把 `docs/ACL申请清单.md` 列为交付文档，但该文件此前**不存在** —— 申请时无「可直接照填」的文本与判定依据。
- **权限口径自相矛盾**：`docs/工程规划.md` §11.4 曾把 `READ_WRITE_DESKTOP_DIRECTORY` 列为「不需要申请」，与 `dsh-desktop-hos/docs/ACL申请清单-v1.md`（列为需 ACL 的 3 项之一）及本工程 `module.json5` 的**实际声明**冲突。
- **versionCode 规则**：上架要求严格递增，且改名等价于新建应用、需重新备案（🔶 上架整改口径）。
- **材料泄漏风险**：签名私钥若入库或写回文件，等于把分发能力交给仓库。
- **合规硬项**：图标纯色不透明（禁 Alpha）、首启无「内测/测试/预览版」、生产包移除调试开关 —— 都需要守卫而不是靠人记。

### 1.3 范围（Scope）

**包含**：

- 应用身份：bundleName 单一来源、显示名多处同步、命名禁用词与第三方声明；
- 版本：`versionCode` 规则、`versionName` 与上游基线的关联、release 档守卫；
- 签名：材料文件约定、`hvigorfile.ts` 注入点、仅内存注入纪律、debug/release 证书与 Profile 的差别；
- ACL 归属：受限权限判定规则、3 项 ACL 的声明落点与申请文案、明确「不申请」清单与提交纪律；
- 身份类上架合规守卫（图标、首启文案、调试开关）。

**不包含**：

- 构建流水线的阶段组织与门禁（见 `005-build-pipeline`；本模块提供注入点与守卫入口）；
- JIT 受限权限在设备上的实际授予行为（由真机探针验证，结论落 `docs/真机验证记录.md`）；
- 权限在运行时的使用方式（各模块自行消费；如剪贴板读取在 `web_engine` 的 `PasteBoardApadter.ets`）；
- 官网、更新策略、备案材料的准备。

## 2. 用户故事

- 作为用户，我希望应用在系统里叫「Pi Desktop」，任务视图、桌面图标与应用内名称一致。
- 作为研发，我希望改名时不会漏掉某一份 `string.json`，改动由检查而不是记忆保证。
- 作为安全负责人，我希望签名私钥永不入库、永不写回工作区。
- 作为上架负责人，我希望 `versionCode` 递增与图标合规在构建期就被拦住，而不是提审被拒后返工。
- 作为申请提交人，我希望拿到一份**可直接照填 AGC 表单**的申请原因与使用场景文本，以及「哪些要申请、哪些不要」的判定依据。

## 3. 功能需求

### 3.1 身份与命名

- FR-006-001 bundleName 的**唯一来源** MUST 为 `AppScope/app.json5`（当前值 `org.fellow99.pi.PiDesktop`）；本工程其它位置出现的同名字面量 MUST 为**派生校验点**（如 `scripts/collect-runtime.mjs` 的 `EXPECTED_BUNDLE`），MUST NOT 出现与之不一致的第二份真值来源。
- FR-006-002 应用显示名 `Pi Desktop` MUST 同步**四处**：① `AppScope/app.json5` 的 `label` 指向的 `AppScope/resources/base/element/string.json#app_name`；②③④ `electron/src/main/resources/{base,en_US,zh_CN}/element/string.json` 的 `EntryAbility_label`；并对 `web_engine` 内任何硬编码 bundle 的适配点做同步校验。
- FR-006-003 命名 MUST NOT 包含禁用词（如 `Harmony`、`DeepSeek`、`内测`、`测试版`、`预览版`），且 README 与应用内 MUST 给出 pi / pi-web 的第三方与非隶属声明。
- FR-006-004 应用主体 / 应用名 / 包名 MUST 三一致（与 APP 备案一致）；改名等价于新建应用，MUST 触发备案、ACL 与 Profile 的复核。

### 3.2 签名与 Profile

- FR-006-005 系统 MUST NOT 使用 `com.huawei.ohos_electron` 的共享签名；必须为本 bundleName 生成自有证书。
- FR-006-006 签名材料 MUST 从 `signing.debug.local.json` / `signing.release.local.json` 读取，由 `hvigorfile.ts` 在 `afterNodeEvaluate` 经 `setBuildProfileOpt` 注入，且**仅内存注入**：MUST NOT 写回任何文件；仓库 MUST 只保留 `.sample` 模板，且 `build-profile.json5` 的 `signingConfigs` MUST 以 `[]` 入库（✅ **已核实 HEAD 状态**：`git show HEAD:build-profile.json5` 为 `"signingConfigs": []`）。⬜ **本地偏离（非本次改动引入）**：当前工作树的 `build-profile.json5` 被填入了本地调试签名材料（`certpath` / `storePassword` 等），与上述 MUST 不符；本次提交**不含该文件**，建议在 DevEco 侧恢复为 `[]`。定论方式：`git show HEAD:build-profile.json5` 断言 `signingConfigs` 为空数组；结论落本文件与 `plan.md` §6.1。
- FR-006-007 `SIGN_MODE` MUST 只接受 `debug` / `release`（未设置/空 → `debug`）；其它取值 MUST hard fail 中止构建，MUST NOT 静默回退。
- FR-006-008 上架构建 MUST 走 `scripts/build-release.ps1`（固定 `-BuildMode release -SignMode release`，即**发布证书 + 发布 Profile**）；debug 自签产物 MUST NOT 进入上架流程。
- FR-006-009 签名材料**字段不全或无法解析**时构建 MUST fail-visible 中止（`hvigorfile.ts#loadMaterialFile` 抛错，打印缺失字段名，不打印材料内容）；材料与私钥内容 MUST NOT 出现在构建日志或诊断输出中（脱敏）。⬜ **缺口（现状与规格不一致，已实测确认）**：`hvigorfile.ts` 在 `signing.<mode>.local.json` **文件不存在**且 CI 环境变量四要素不齐时，`loadSigningConfig` 返回 `null`，调用方只 `console.warn`（「本次构建将产出未签名 / IDE 自动签名的包」）并 `return` —— **构建继续，release 档也不例外**，并不中止。规格期望的「文件缺失即中止、且不允许 release 档静默产出未签名包」**尚未实现**（落点：`hvigorfile.ts#afterNodeEvaluate` 的 `null` 分支改为按 `mode` 区分——`release` 抛错、`debug` 允许 warn）。定论方式：host 侧单测（`SIGN_MODE=release` 且无材料 → 期望非零退出）；结论落本文件与 `plan.md` §5.1/§5.3。

### 3.3 ACL 归属

- FR-006-010 受限权限判定 MUST 使用权威规则「`provisionEnable == true` 且 `availableLevel ∈ {system_basic, system_core}`」；MUST NOT 仅凭名称含 `kernel.` 就主张申请。判定数据源 MUST 为本机 DevEco SDK 的 `toolchains/lib/PermissionDefinitions.json`（第一手）。
- FR-006-011 **需 ACL 的受限权限恰为 3 项**（依 FR-006-010 对本机 SDK 23 逐条复核）：`ohos.permission.kernel.ALLOW_WRITABLE_CODE_MEMORY`（system_basic / system_grant / since 14）、`ohos.permission.READ_PASTEBOARD`（system_basic / user_grant / since 11）、`ohos.permission.READ_WRITE_DESKTOP_DIRECTORY`（system_basic / user_grant / since 11）。三项 MUST 在 `web_engine/src/main/module.json5` 的 `requestPermissions` 中声明；其中 `kernel.ALLOW_WRITABLE_CODE_MEMORY` MUST **同时**出现在 `definePermissions`（Electron/V8 启用 JIT 的前提，MUST NOT 删除）；三项 MUST 以本包名提交 AGC 的**同一批次**。
- FR-006-012 **权限声明面 MUST 与 `dsh-desktop-hos` 完全对标**：`web_engine/src/main/module.json5` 的 **23 项** `requestPermissions`（**含顺序**）+ **2 项** `definePermissions`；`electron/src/main/module.json5` 的 `KEEP_BACKGROUND_RUNNING` + EntryAbility `backgroundModes: ["taskKeeping"]`；带 `reason` 的 **8 项** MUST 同时带 `usedScene`（`abilities: ["EntryAbility"]` / `when: "inuse"`），其 `reason` 文案 MUST 落在已列入 `scripts/collect-runtime.mjs` 的 `OVERLAY_FILES` 的 `web_engine/src/main/resources/<locale>/element/string.json`（3 套 locale）。
- FR-006-013 系统 MUST NOT 申请：AGC 二进制证书（`certType: 4`，**非权限**）、`ALLOW_EXTERNAL_NATIVE_CODE`、`kernel.LOAD_INDEPENDENT_LIBRARY`、`ACCESS_USER_FULL_DISK` / `READ_WRITE_USER_FILE`、四个 `*PLUGIN*` 权限，以及 `CUSTOM_SANDBOX` / `RUN_ANY_CODE` / `SANDBOX_ACCESS_MANAGER` / `GET_DEVICE_INDEPENDENT_BINARY_CERT` / `SET_DEVICE_INDEPENDENT_BINARY_CERT_STATUS`；同时 MUST NOT 声明上游默认但本工程已剪裁的 8 项（`CAMERA` / `MICROPHONE` / `LOCATION` / `APPROXIMATELY_LOCATION` / `LOCATION_IN_BACKGROUND` / `ACCESS_BLUETOOTH` / `DISTRIBUTED_DATASYNC` / `WEB_NATIVE_MESSAGING`）。
- FR-006-014 ACL 提交纪律 MUST 被记录并遵守：单次最多 30 个权限、上一批未审完不得提交新批、ACL 变化后必须重建 Profile、试用调试 Profile 5 天有效期且每应用最多 5 个、海外账号仅支持亚太与欧洲（中国大陆账号支持）。
- FR-006-015 ⬜ 待验证：全新安装时 JIT 受限权限可能被设备策略拒绝 → 规避手段（日常使用 `hdc app install -r` 覆盖安装）MUST 经真机验证并把结论写入 `docs/真机验证记录.md`，MUST NOT 静默。
- FR-006-016 权限申请材料（`申请原因` ≤256 字、`使用场景`）MUST 在 `docs/ACL申请清单.md` 中维护为**可直接提交**的文本。
- FR-006-025 本工程权限声明面 MUST 与 `dsh-desktop-hos` 的**实际声明**逐项一致（`web_engine` 23 + 2、`electron` 1 + `backgroundModes`、8 条 `reason`），差异 MUST 以「补齐本工程声明」的方式消除，并同步：① `docs/ACL申请清单.md`（申请口径 + 声明现状 + 变更记录）；② `runtime-overlays/` 回盖源（两份 `module.json5` + 6 套 locale `string.json`，与目标**同 md5**，由 `scripts/collect-runtime.mjs` 阶段 7.6 守卫）。
- FR-006-026 带 `reason` 权限的 `usedScene.abilities` MUST 指向本工程**真实存在**的 Ability（当前为 entry 模块的 `EntryAbility`），MUST NOT 引用不存在的 Ability 名；`when` MUST 为 `inuse`。

### 3.4 versionCode 与版本纪律

- FR-006-017 `versionCode` MUST 严格递增，且在正式提审前仅通过版本冻结递增；其**单一来源** MUST 为 `AppScope/app.json5`，编码规则 MUST 为 `major*10000 + minor*100 + patch`（`0.11.1 → 1101`）。
- FR-006-018 release 档构建 MUST 经 `scripts/build-release.ps1` 入口（该入口已实现：固定 `-BuildMode release -SignMode release`）。⬜ **缺口（未实现）**：`versionCode` 的「上一发布基线」比对守卫**尚未落地** —— `scripts/` 下 `versionCode` **零命中**（已实测 grep），基线文档 `docs/上架合规清单.md` 也待建（FR-006-024）。规格期望的「`versionCode` 未大于基线即中止」**尚无可执行落点**。定论方式：`docs/上架合规清单.md` 建好后补守卫并在 release 入口调用；结论落本文件与 `plan.md` §5.1/§6.1。
- FR-006-019 `versionName` SHOULD 表达上游基线（本版 `0.11.1` ↔ pi-web `v0.11.1`），并与 `versionCode` 职责分离。
- FR-006-020 包名或应用名变更 MUST 同步更新 README、应用内「关于」与 `docs/` 相关清单，并触发 ACL / Profile / 备案的复核记录。

### 3.5 身份类上架合规守卫

- FR-006-021 应用图标 MUST 为纯色不透明（1024×1024，禁止 Alpha 通道），且构建期 MUST 有守卫：`scripts/brand-assets.mjs` 以 `format=rgb24` 生成应用级图标，母版含非 255 像素即失败（见 `specs/103-branding/`）。
- FR-006-022 首启路径 MUST NOT 出现「内测 / 测试 / 预览版」字样。
- FR-006-023 生产构建 MUST 移除调试开关（运行时的 `--inspect`、remote-debugging 端口），MUST 由 `web_engine/src/main/ets/common/CommandLineAdapter.ets` 的 overlay（仅 debug 构建启用）+ release 档共同保证。
- FR-006-024 上架前置清单（图标纯色、首启文案、隐私链接可达、AI 生成内容标识、测试 Key、PoC 资产清理）MUST 落地为可执行检查项（`docs/工程规划.md` §11.5 G1–G10），并 SHOULD 收敛为 `docs/上架合规清单.md`（⬜ 待建）。

## 4. 关键实体

| 实体 | 说明 | 关键属性 |
|------|------|----------|
| 应用身份（AppIdentity） | 包名与显示名 | `bundleName`、`label`、`labelSources[]`（4 处路径）、`synced`（是否全部一致） |
| 版本（AppVersion） | 版本号 | `versionCode`、`versionName`、`publishedBaseline` |
| 签名材料（SigningMaterial） | 本地不入库的证书材料 | `debugFile`、`releaseFile`、`alias`、`signMode`、`injectedAt`、`writeBack`（恒为 `false`） |
| ACL 条目（AclEntry） | 受限权限申请项 | `name`、`availableLevel`、`provisionEnable`、`since`、`grantMode`、`reason`（AGC 申请原因文本）、`basis`（判定依据） |
| 声明面（PermissionSurface） | 权限声明集合 | `requestPermissions[23]`、`definePermissions[2]`、`reasonItems[8]`、`backgroundModes[]` |
| Profile（SigningProfile） | 签名 Profile | `type`(`debug`/`release`)、`bundleName`、`rebuiltAfterAcl` |

## 5. 验收场景

### 场景 1：改名多处同步

- Given 将显示名改为 `Pi Desktop` 并只改了一处
- When 执行身份检查（比对 `AppScope/resources/base/element/string.json#app_name` 与三套 `EntryAbility_label`）
- Then 报告不一致的路径与当前值；修正后检查通过；真机桌面/任务视图与应用内名称一致

### 场景 2：签名注入不落盘

- Given `signing.debug.local.json` 存在且合法
- When 执行 debug 构建（`SIGN_MODE=debug`）
- Then 构建成功；`git status --porcelain` 在签名材料与 `build-profile.json5` 上无新增改动（零写回）

### 场景 3：材料缺失 fail-visible

- Given `signing.release.local.json` 不存在且未提供 `CERTPATH/STORE_FILE/STORE_PASSWORD/KEY_PASSWORD`
- When 执行 release 构建
- Then **规格期望**：`hvigorfile.ts` 打印缺失文件的绝对路径与必需字段清单并**中止**，MUST NOT 产出未签名产物被误当作 release 包。
- ⚠️ **现状（已实测）**：仅 `console.warn` 后继续构建（见 FR-006-009 的 ⬜ 缺口）→ **本场景当前为红**。判定方式：host 侧以 `SIGN_MODE=release` 且无材料执行，断言退出码非 0；修好 FR-006-009 缺口后本场景转绿。

### 场景 4：SIGN_MODE 非法值 hard fail

- Given `SIGN_MODE=production`
- When 执行构建
- Then 构建中止并提示只允许 `debug` / `release`，MUST NOT 回退为 debug 签名

### 场景 5：图标 Alpha 守卫

- Given 图标母版 PNG 含非 255 像素（带 Alpha）
- When 执行 `scripts/brand-assets.mjs`
- Then 中止并提示「图标必须纯色不透明」

### 场景 6：ACL 声明面与 dsh 一致

- Given 本工程与 `dsh-desktop-hos` 的两份 `module.json5` 及 6 套 locale `string.json`
- When 逐项比对权限名集合（**含顺序**）、`reason`/`usedScene` 条目与 `runtime-overlays/` 镜像的 md5
- Then 全部一致；`web_engine` 为 23 项 `requestPermissions` + 2 项 `definePermissions`，8 项带 `reason` 且 `usedScene` = `EntryAbility`/`inuse`；镜像同 md5

### 场景 7：ACL 与 JIT

- Given 本包名已获得 `ALLOW_WRITABLE_CODE_MEMORY` 的 ACL 授权并**重建了发布 Profile**
- When 真机安装并启动应用
- Then 应用可启动且 V8 JIT 可用（结论写 `docs/真机验证记录.md`）
- 反例：权限未获批时 JIT 不可用（现象与结论必须登记，不得静默）

### 场景 8：debug 自签不可上架

- Given 使用 debug 自签材料构建的产物
- When 执行上架前检查
- Then 被标记为非上架产物（未走 `build-release.ps1` 的 release 材料），MUST NOT 进入上架流程

## 6. 非功能需求

- **可维护性**：身份与版本为单一来源（`AppScope/`），其它位置由检查/同步脚本保证一致；ACL 与合规文本集中在 `docs/` 清单。
- **安全性**：签名材料不入库、不写回、不出现在日志；`.sample` 中 MUST NOT 含真实私钥或口令。
- **可靠性**：下列问题逐条 fail-visible —— `SIGN_MODE` 非法（✅ 已实现）、图标不合规（✅ 已实现）、生产包带调试开关（✅ 已实现）、签名材料**字段不全/无法解析**（✅ 已实现）；**签名材料文件缺失/版本未递增（⬜ 均未实现，见 FR-006-009 与 FR-006-018 的 ⬜ 缺口）**。已实现的三类与未实现的两类 MUST NOT 混为一谈。
- **合规性**：上架身份类要求（命名禁用词、图标、首启文案、三一致、Profile 类型）可被检查项覆盖。
- **幂等性**：身份检查与合规守卫可重复执行，结果稳定、无副作用。

## 7. 假设与约束

- 假设 🔶：改名必须同步多处（`AppScope/` + 三套 `EntryAbility_label` + `web_engine` 内适配点），否则系统界面显示旧名。
- 假设 🔶：受限权限判定规则为「`provisionEnable == true` 且 `availableLevel ∈ {system_basic, system_core}`」；开放权限写进 `requestPermissions` 即生效（`user_grant` 项运行期弹窗）。
- 约束：MUST NOT 使用共享签名；MUST NOT 以 `CUSTOM_SANDBOX` 替代进程沙箱；本批次 ACL **只申请 3 项**（FR-006-011），其余受限项一律不申请（FR-006-013）。
- 约束：本工程**不随包分发自有 ELF**，故 MUST NOT 申请二进制证书（`certType: 4`）与 `ALLOW_EXTERNAL_NATIVE_CODE` / `kernel.LOAD_INDEPENDENT_LIBRARY`（🔶 沿用 dsh 结论：个人主体不可得，且本工程无此路线）。
- 约束：`READ_WRITE_DESKTOP_DIRECTORY` 为 `system_basic`，是当前唯一的上架风险项，MUST 在上架前复核（`docs/ACL申请清单.md` §6）。
- ⬜ 待验证：`org.fellow99.pi.PiDesktop` 是否与已注册的应用主体一致（影响签名、ACL 归属与备案三一致）。**定论方式**：人工核对 AGC/备案信息（`docs/工程规划.md` §11.3-1、O9）；**结论落** `docs/工程规划.md` §11.3 与 `docs/ACL申请清单.md` §10。
- ⬜ 待验证：ACL 审批的前置条件与节奏（是否要求应用已创建/已提交、试用调试 Profile 的实际可用性）。**定论方式**：AGC 实际提交一次并观察返回（`docs/ACL申请清单.md` §8/§9）；**结论落** `docs/ACL申请清单.md` §9 提交记录与 §10 变更记录。
- ⬜ 待验证：JIT 受限权限在目标 API 版本上的实际授予与拒绝行为。**定论方式**：真机探针（安装/启动 + JIT 示性），对照 `hdc app install -r` 覆盖安装；**结论落** `docs/真机验证记录.md`。
- ⬜ 待验证：release Profile 的 `type` 字段判定方式与「ACL 变化后重建 Profile」的时机。**定论方式**：拿到 release Profile 后 `hap-sign-tool verify-app` 打印其 `type`/`acls`，并对比 ACL 变更前后；**结论落** `docs/ACL申请清单.md` §6/§8。

## 8. 依赖

**上游 / 外部（被本模块消费）**：

- AGC（ACL 权限提交、发布 Profile、备案信息）；
- DevEco Studio（证书与 Profile 生成、`signing.*.local.json` 的本机构造）；
- 本机 DevEco SDK 的 `toolchains/lib/PermissionDefinitions.json`（受限权限判定的第一手数据源，FR-006-010）；
- `dsh-desktop-hos/docs/ACL申请清单-v1.md`（申请口径与声明面基准）。

**本工程（被本模块消费）**：

- `005-build-pipeline`：构建阶段调用 `hvigorfile.ts` 注入点与 release 入口；
- `007-runtime-entry`：`KEEP_BACKGROUND_RUNNING` / `backgroundModes` 声明必须与权限声明一致；
- `103-branding`：图标物料与 `scripts/brand-assets.mjs` 的纯色不透明守卫（FR-006-021）；
- `101-version-0.11.1`：`versionCode` 编码规则与版本冻结纪律（FR-006-017）。

**下游（消费本模块）**：

- `005-build-pipeline`（签名材料注入与 release 入口）、`007-runtime-entry`（权限声明一致性）、`docs/ACL申请清单.md`（申请与执行）。
