# 签名与应用身份（006-signing-identity）—— 实现方案

> **Module:** 006-signing-identity ｜ **Status:** Proposed ｜ **Last Updated:** 2026-10-14
> **上游基线:** pi v1.1.0（Branch_v1.1.0）· pi-web v0.11.1（Branch_v0.11.1）· harmonypc-electron v37.2.3
> **需求编号:** 006-signing-identity ｜ **需求名称:** 应用签名
> **git 分支:** 不改动
> 对应规格：[spec.md](./spec.md)

## 1. 技术上下文

### 1.1 构建环境

- hvigor 构建在 host 侧 Windows 完成（DevEco 自带 JBR / Node / `hvigorw.bat`）；构建入口为 `scripts/build-hap.ps1`（通用）与 `scripts/build-release.ps1`（发布档，固定 `-BuildMode release -SignMode release`）。
- 身份与权限的落地文件（均为工程内源码文件，参与构建）：

| 文件 | 承载 |
|------|------|
| `AppScope/app.json5` | `bundleName`、`label`（`$string:app_name`）、`versionCode`、`versionName`、`icon`；`multiAppMode` |
| `AppScope/resources/base/element/string.json` | `app_name`（= 显示名真值） |
| `electron/src/main/resources/{base,en_US,zh_CN}/element/string.json` | `EntryAbility_label`（OS 桌面/任务视图显示名；三套） |
| `electron/src/main/module.json5` | entry 模块清单（`requestPermissions: [KEEP_BACKGROUND_RUNNING]` + EntryAbility `backgroundModes: ["taskKeeping"]`） |
| `web_engine/src/main/module.json5` | 权限声明面（`requestPermissions` 23 项 + `definePermissions` 2 项，含 3 项 ACL） |
| `runtime-overlays/`（两份 `module.json5` + 6 套 locale `string.json`） | 回盖源，与目标**同 md5**（`collect-runtime.mjs` 阶段 7.6 守卫） |
| `hvigorfile.ts` | 签名材料注入（`afterNodeEvaluate` → `setBuildProfileOpt`，仅内存） |
| `signing.{debug,release}.local.json.sample` | 材料模板（入库，无真实密钥） |

- 运行时侧与身份相关的参考机制：`runtime-manifest.json` 的 `bundleNameRewrite.adapters`（用于校验 `web_engine` 内是否残留旧 bundle 硬编码）；`scripts/collect-runtime.mjs` 的 `EXPECTED_BUNDLE` 是**派生校验点**（与 `AppScope/app.json5` 单一来源保持逐字节一致，FR-006-001）。

### 1.2 依赖

| 依赖 | 版本/来源 | 用途 |
|------|-----------|------|
| DevEco Studio | 本机安装 | 证书/Profile 生成、`hvigorw`、JBR |
| AGC 控制台 | 在线 | ACL 提交、发布 Profile 创建、备案信息 |
| `signing.debug.local.json` / `signing.release.local.json` | 本机（不入库） | 签名材料真值 |
| `signing.{debug,release}.local.json.sample` | 工程内 | 材料结构与字段名模板 |
| 本机 SDK `PermissionDefinitions.json` | DevEco SDK 23 `toolchains/lib/` | 受限权限判定的第一手数据源（FR-006-010） |
| `docs/ACL申请清单.md` | 工程文档（本次新增） | 申请文案与提交记录 |
| `dsh-desktop-hos/docs/ACL申请清单-v1.md` | 外部基准 | 申请口径与判定规则的对标来源 |
| `005-build-pipeline` | 本工程 | 调用注入点与 release 入口 |
| `101-version-0.11.1` | 本工程 | `versionCode` 编码规则（D1） |

## 2. 关键决策

| 决策 | 结论 | 依据 |
|------|------|------|
| 包名 | `org.fellow99.pi.PiDesktop`（沿用骨架期） | `AppScope/app.json5`；工程规划 §11.3-1 |
| 显示名 | `Pi Desktop`（4 处同步） | FR-006-002；工程规划 §10 P0-4 |
| 改名机制 | 多处同步 + 校验（不靠记忆） | 🔶 同型工程踩坑 |
| 签名材料注入 | `hvigorfile.ts#afterNodeEvaluate`，`setBuildProfileOpt` 仅内存注入、不写回 | FR-006-006 |
| `build-profile.json5` | `signingConfigs` 以 `[]` 入库（材料只来自本地文件/CI 环境变量） | FR-006-006 |
| `SIGN_MODE` | 只认 `debug` / `release`，非法值 hard fail | FR-006-007；`hvigorfile.ts#resolveSignMode` |
| 共享签名 | 不使用，必须自有证书 | bundleName 不同（FR-006-005） |
| ACL 归属 | 按本包名单独申请 **3 项**受限权限 | FR-006-011；对标 `ACL申请清单-v1.md` |
| ACL 判定规则 | `provisionEnable == true` 且 `availableLevel ∈ {system_basic, system_core}` | FR-006-010；SDK 23 复核 |
| 权限声明纪律 | 只声明实际使用项；与 `dsh-desktop-hos` **逐项对标**（23+2 / 1+backgroundModes / 8 条 `reason`） | FR-006-012 / 025 / 026 |
| JIT 权限 | `ALLOW_WRITABLE_CODE_MEMORY` 同时进 `requestPermissions` 与 `definePermissions` | 引擎必需，不可删（FR-006-011） |
| versionCode | `major*10000 + minor*100 + patch`（`0.11.1 → 1101`）+ release 入口 | FR-006-017；101 号 D1 |
| 图标守卫 | `scripts/brand-assets.mjs` 以 `format=rgb24` 生成，母版含非 255 像素即失败 | FR-006-021；103 号 |
| 调试开关 | release 档强制关闭（`CommandLineAdapter.ets` overlay 仅 debug 启用） | FR-006-023 |

## 3. 数据模型

### 3.1 实体定义

```js
appIdentity = {
  bundleName: 'org.fellow99.pi.PiDesktop',
  label: 'Pi Desktop',
  labelSources: [
    'AppScope/app.json5#label → AppScope/resources/base/element/string.json#app_name',
    'electron/src/main/resources/base/element/string.json#EntryAbility_label',
    'electron/src/main/resources/en_US/element/string.json#EntryAbility_label',
    'electron/src/main/resources/zh_CN/element/string.json#EntryAbility_label',
  ],
  derivedCheckPoints: ['scripts/collect-runtime.mjs#EXPECTED_BUNDLE'],
  synced: true,
}

// versionName = '0.11.1'（三段式，与上游 pi-web v0.11.1 可读关联）；
// versionCode = major*10000 + minor*100 + patch = 1101（规则见 specs/101-version-0.11.1/plan.md D1），
// 必须严格递增（工程规划 §11.5 G7）。
appVersion = { versionCode: 1101, versionName: '0.11.1', publishedBaseline: null /* ⬜ 待登记 */ }

signingMaterial = { debugFile, releaseFile, alias, signMode: 'debug'|'release', injectedAt, writeBack: false }

aclEntry = { name, availableLevel: 'system_basic', provisionEnable: true, since, grantMode, reason, basis }

permissionSurface = {
  requestPermissions: 23,   // web_engine/src/main/module.json5，含顺序
  definePermissions: 2,     // LOCK_WINDOW_CURSOR + kernel.ALLOW_WRITABLE_CODE_MEMORY
  reasonItems: 8,           // 每条含 usedScene: { abilities: ['EntryAbility'], when: 'inuse' }
  entryPermission: 'ohos.permission.KEEP_BACKGROUND_RUNNING',
  backgroundModes: ['taskKeeping'],
}

signingProfile = { type: 'debug'|'release', bundleName, rebuiltAfterAcl: true }
```

### 3.2 状态转换

```
identity-check（4 处 label 一致 + 包名单一来源）
→ version-check（release: versionCode > 基线）
→ sign-mode-check（debug | release，非法 hard fail）
→ sign-inject（afterNodeEvaluate → setBuildProfileOpt，仅内存）
→ hvigor build
→ post-build-verify（产物签名 / 包名 / 版本）
失败 → 中止构建并打印具体检查项（fail-visible）
```

### 3.3 校验规则

- 4 处显示名（`app_name` + 三套 `EntryAbility_label`）必须逐字节等于 `Pi Desktop`，且与 `AppScope/app.json5` 的 `label` 指向一致。
- 包名在构建脚本、ArkTS 源码中**只能作为派生校验点**出现；任何与 `AppScope/app.json5` 不一致的字面量即判失败。
- `signing.*.local.json` 必须含必需字段（`certpath`、`storeFile`、`profile`、`keyPassword`、`storePassword`；`keyAlias` 默认 `debugKey`，`signAlg` 默认 `SHA256withECDSA`）；字段缺失即中止。
- `SIGN_MODE` ∈ {空→debug, debug, release}；其它值即中止。
- `versionCode` 必须为整数且严格大于上一发布基线（release 档）。
- 图标 PNG：`IHDR` 的 color type ∈ {4, 6} 或含 `tRNS` 块，或母版含非 255 像素 → 判为带 Alpha，中止。

## 4. 接口契约

### 4.1 本模块提供

| 接口 | 说明 |
|------|------|
| `hvigorfile.ts#afterNodeEvaluate` | 读 `SIGN_MODE` 与签名材料（CI 环境变量 → `signing.<mode>.local.json`），以 `setBuildProfileOpt` 注入 `signingConfigs`（内存） |
| `hvigorfile.ts#resolveSignMode` | `SIGN_MODE` 白名单校验，非法值 hard fail（FR-006-007） |
| `hvigorfile.ts#loadMaterialFile` | 材料必填字段校验 + 相对路径解析（FR-006-009） |
| `AppScope/app.json5` | `bundleName` / `label` / `versionCode` / `versionName` 的单一来源 |
| `web_engine/src/main/module.json5` | 权限声明面（23 + 2，含 3 项 ACL） |
| `scripts/build-release.ps1` | 发布档入口（`-BuildMode release -SignMode release`） |
| `docs/ACL申请清单.md` | ACL 申请文案（申请原因 / 使用场景）、判定依据、提交记录 |

### 4.2 本模块消费

| 来源 | 契约 |
|------|------|
| `signing.debug.local.json` / `signing.release.local.json` | 签名材料（本机文件，不入库） |
| 环境变量 `CERTPATH` / `STORE_FILE` / `PROFILE` / `KEY_ALIAS` / `KEY_PASSWORD` / `STORE_PASSWORD` / `SIGN_ALG` | CI 侧签名材料（四要素齐全才生效） |
| 本机 SDK `PermissionDefinitions.json` | 受限权限判定（`availableLevel` / `provisionEnable` / `since` / `grantMode`） |
| `dsh-desktop-hos` 的 `module.json5` ×2 + locale `string.json` ×6 | 声明面对标基准 |
| `scripts/collect-runtime.mjs` | `OVERLAY_FILES`（6 套 locale `string.json` 在册）与阶段 7.6 md5 守卫 |
| `005-build-pipeline` | 构建入口与 release 档参数 |
| `101-version-0.11.1` | `versionCode` 编码规则与冻结纪律 |

## 5. 实现策略

### 5.1 关键算法

- **签名注入（`hvigorfile.ts`）**：取 `SIGN_MODE` → 优先 CI 环境变量（`CERTPATH && STORE_FILE && STORE_PASSWORD && KEY_PASSWORD` 四者齐全），否则读 `signing.<mode>.local.json`；组装 `signingConfigs` 并 `setBuildProfileOpt`；**不调用任何写文件 API**。**字段不全/无法解析 → `loadMaterialFile` 抛错中止（✅ 已实现）**；**材料文件整体缺失 → 当前只 `console.warn` 并继续（⬜ 未实现中止，见 spec FR-006-009 的 ⬜ 缺口；`debug`/`release` 无差别）**。
- **版本守卫（⬜ 未实现）**：规格要求 release 档比对「上一发布基线」（spec FR-006-018），但 `scripts/` 下 `versionCode` **零命中**，`scripts/build-release.ps1` 只固定构建/签名模式 → 本算法**尚无落点**；落点与定论方式见 spec FR-006-018。
- **身份检查**：读 `AppScope/app.json5`（JSON5 取值）→ 解析 `label` 指向的 `app_name` → 与三套 `EntryAbility_label` 逐一比对 → 扫 `web_engine/src/main/ets/**` 中与包名匹配的字面量并与 `EXPECTED_BUNDLE` 对齐 → 输出差异表。
- **ACL 判定**：按 FR-006-010 从 SDK `PermissionDefinitions.json` 过滤 `provisionEnable === true && ['system_basic','system_core'].includes(availableLevel)`；对本工程 23 项声明逐条分类（结论：3 项需 ACL / 20 项开放）。
- **图标守卫**：`scripts/brand-assets.mjs` 读 PNG 前 33 字节校验签名与 `IHDR` 的 color type、母版非 255 像素判定（已由 103 号实现）。
- **调试开关守卫**：release 档经 `CommandLineAdapter.ets` overlay 不启用 `--inspect`；release 入口不向运行时透传调试端口。

### 5.2 错误处理

- 任守卫失败 → 打印「检查项 / 期望 / 实际 / 修复提示」并以非零码退出。
- 签名材料**字段不全/无法解析** → 打印缺失字段名并以非零码退出（MUST NOT 打印材料内容，FR-006-009）。
- 签名材料**文件缺失** → ⬜ **现状为 `console.warn` 后继续构建**（不中止），与规格期望不符（见 spec FR-006-009 的 ⬜ 缺口）。
- Profile `type` 非 release 而走 release 档构建 → 标记并中止（上架资格问题，FR-006-008）。
- ACL 相关失败不在构建期处理（属外部审批），但 `docs/ACL申请清单.md` MUST 记录当前状态，便于人工判断。

### 5.3 降级

- **构建期 fail-visible 已实现**：`SIGN_MODE` 非法（`resolveSignMode` 抛错）、签名材料字段不全/无法解析（`loadMaterialFile` 抛错）、图标带 Alpha（`brand-assets.mjs`）、生产包带调试开关（`CommandLineAdapter.ets` overlay）。⬜ **身份同步检查本身尚未落为脚本**（计划新增身份检查脚本，当前不存在）。
- ⬜ **未实现（不属降级、属缺口）**：签名材料**文件缺失时中止**（现状为 warn + 继续）与 `versionCode` 基线守卫（见 spec FR-006-009 / FR-006-018）。二者 MUST NOT 被描述为已生效的降级门槛。

## 6. 测试与验证

### 6.1 host 侧

- **声明面比对**：脚本化比对本工程与 `dsh-desktop-hos` 的 `web_engine` / `electron` 两份 `module.json5` 的权限名**集合与顺序**、`definePermissions`、8 条 `reason` 的 `usedScene`（`EntryAbility` / `inuse`），以及 `runtime-overlays/` 镜像的 md5（FR-006-012/025/026）。
- **ACL 判定复核**：用本机 SDK `PermissionDefinitions.json` 重新导出 23 项声明的 `availableLevel` / `provisionEnable` / `since` / `grantMode`，断言「需 ACL 恰 3 项」且与 `docs/ACL申请清单.md` 一致（FR-006-010/011）。
- **禁用项断言**：断言 `FR-006-013` 的禁止清单在两份 `module.json5` 中**零命中**。
- **身份同步断言**：4 处显示名与 `AppScope/app.json5` 的 `bundleName`/`label` 逐字节一致（FR-006-001/002）。
- **签名注入单测**：以 `.sample` 为模板构造临时材料，调用注入函数后断言「内存对象含 `signingConfigs`」且「工作区文件哈希未变」（零写回，FR-006-006）。
- **`SIGN_MODE` 单测**：`''` / `debug` / `release` / `production` 四组输入，断言前三组通过、`production` 抛错（FR-006-007）。
- **release 档无材料单测（⬜ 待补，当前为红）**：`SIGN_MODE=release` 且无 `signing.release.local.json`、无 CI 环境变量 → 断言构建**非零退出**（FR-006-009 期望）；现状为 warn + 继续，故该断言当前失败，作为缺口复现用例。
- **`versionCode` 基线守卫单测（⬜ 待补，当前无落点）**：基线 `N` 与取值 `N-1` / `N` / `N+1` 三组断言（release 档仅 `N+1` 通过，FR-006-018）；需先建 `docs/上架合规清单.md` 并补守卫。
- **`signingConfigs` 零入库断言**：`git show HEAD:build-profile.json5` 的 `signingConfigs` 为空数组（FR-006-006，✅ 已核实）。

### 6.2 真机命令

```bash
# 安装与启动（bundleName 即身份真值）
hdc app install -r electron/build/default/outputs/default/electron-default-signed.hap
hdc shell aa start -a EntryAbility -b org.fellow99.pi.PiDesktop
hdc uninstall org.fellow99.pi.PiDesktop        # 对照实验：清空后重装观察 JIT 权限首装行为

# 身份与状态取证
hdc shell aa dump -a                              # Ability 状态与所属包名
hdc shell "bm dump -n org.fellow99.pi.PiDesktop"  # 包信息（命令可用性 ⬜ 待验证）
hdc shell "hilog -x | grep -i pi-desktop"
```

- 真机 MUST 记录：桌面/任务视图显示名、安装是否被权限策略拒绝、JIT 可用性探针结果，落 `docs/真机验证记录.md`；ACL 状态变化落 `docs/ACL申请清单.md`。

### 6.3 验收口径

- spec §5 八个场景中，**已可复现为绿**：场景 1（身份同步，人工/脚本比对）、场景 2（零写回）、场景 4（`SIGN_MODE` 非法 hard fail）、场景 5（图标 Alpha 守卫）、场景 6（ACL 声明面与 dsh 一致）、场景 8（debug 自签不可上架）；
- **当前为红（缺口，见 spec §FR-006-009 / FR-006-018）**：场景 3（release 无材料应中止 —— 现状 warn + 继续）、场景 7（JIT 真机可用性 ⬜ 待真机）；
- 已完成 debug 构建后 `git status --porcelain` 无签名材料相关改动（FR-006-006）；`git show HEAD:build-profile.json5` 的 `signingConfigs` 为空数组；
- 声明面断言：`web_engine` 23 项 `requestPermissions`（顺序与 dsh 一致）+ 2 项 `definePermissions`；`electron` 1 项 + `backgroundModes`；8 条 `reason` 均为 `EntryAbility`/`inuse`；`runtime-overlays/` 镜像与目标同 md5（✅ 均已实测通过）；
- ACL 申请材料（3 项）在 `docs/ACL申请清单.md` 中可直接照填（✅ 已核对 ≤256 字）。

## 7. 文件清单

| 文件（相对工程根） | 用途 |
|--------------------|------|
| `AppScope/app.json5` | `bundleName` / `label` / `versionCode` / `versionName` 单一来源 |
| `AppScope/resources/base/element/string.json` | `app_name`（显示名真值） |
| `electron/src/main/resources/{base,en_US,zh_CN}/element/string.json` | `EntryAbility_label`（三套） |
| `electron/src/main/module.json5` | entry 模块清单（`KEEP_BACKGROUND_RUNNING` + `backgroundModes: ["taskKeeping"]`） |
| `web_engine/src/main/module.json5` | 权限声明面（23 项 `requestPermissions` + 2 项 `definePermissions`） |
| `runtime-overlays/`（同上两份 `module.json5` + 6 套 locale `string.json`） | 回盖源（与目标同 md5） |
| `hvigorfile.ts` | 签名材料注入（`afterNodeEvaluate`，仅内存）+ `SIGN_MODE` 校验 |
| `signing.debug.local.json.sample` / `signing.release.local.json.sample` | 材料模板（入库，无真实密钥） |
| `scripts/build-release.ps1` / `scripts/build-hap.ps1` | 发布档 / 通用构建入口 |
| `scripts/brand-assets.mjs` | 图标生成与纯色不透明守卫（与 103 号共用） |
| `scripts/collect-runtime.mjs` | 身份/权限声明面的 `OVERLAY_FILES` 与 md5 守卫 |
| `docs/ACL申请清单.md` | **本次新增**：ACL 申请文案 + 判定依据 + 声明现状 + 提交记录 |
| `specs/006-signing-identity/{spec.md,plan.md}` | **本次新增**：本模块规格与方案 |

## 8. 与规格的交叉引用

| 规格需求 | 落点 |
|----------|------|
| FR-006-001 | `AppScope/app.json5`（`bundleName` 单一来源）＋ `scripts/collect-runtime.mjs#EXPECTED_BUNDLE`（派生校验点） |
| FR-006-002 | `AppScope/resources/base/element/string.json#app_name` ＋ `electron/src/main/resources/{base,en_US,zh_CN}/element/string.json#EntryAbility_label` |
| FR-006-003 | `README.md` / `README_zh.md`（第三方与非隶属声明、命名禁用词口径）；⬜ 应用内「关于」待建 |
| FR-006-004 | `docs/工程规划.md` §11.3-1（主体/备案口径）＋ 本文件 §2「ACL 归属」决策 |
| FR-006-005 | `signing.*.local.json.sample`（无共享签名材料）；`hvigorfile.ts` 只读本工程材料 |
| FR-006-006 | `hvigorfile.ts#afterNodeEvaluate`（`setBuildProfileOpt` 仅内存）＋ `build-profile.json5` 入库 `signingConfigs: []` |
| FR-006-007 | `hvigorfile.ts#resolveSignMode`（非法值 hard fail） |
| FR-006-008 | `scripts/build-release.ps1`（`-BuildMode release -SignMode release`） |
| FR-006-009 | `hvigorfile.ts#loadMaterialFile`（字段不全/无法解析抛错）＋ ⬜ 文件缺失分支待改为按 `mode` 中止 |
| FR-006-010 | 本文件 §1.2（SDK `PermissionDefinitions.json` 第一手）＋ `docs/ACL申请清单.md` §2 |
| FR-006-011 | `web_engine/src/main/module.json5`（3 项 ACL 的声明落点）＋ `docs/ACL申请清单.md` §3 |
| FR-006-012 | `web_engine` / `electron` 两份 `module.json5` ＋ 6 套 locale `string.json`；`scripts/collect-runtime.mjs#OVERLAY_FILES` |
| FR-006-013 | 同上两份 `module.json5`（禁止清单零命中）＋ `docs/ACL申请清单.md` §5 |
| FR-006-014 | `docs/ACL申请清单.md` §8（提交纪律与硬约束） |
| FR-006-015 | `docs/真机验证记录.md`（⬜ 待真机；`hdc app install -r` 规避手段） |
| FR-006-016 | `docs/ACL申请清单.md` §3（`申请原因` / `使用场景` 可直接照填文本） |
| FR-006-017 | `AppScope/app.json5`（`versionCode` 单一来源）＋ `specs/101-version-0.11.1/plan.md` D1（编码规则） |
| FR-006-018 | `scripts/build-release.ps1`（release 入口已实现）＋ ⬜ `versionCode` 基线守卫待补 |
| FR-006-019 | `AppScope/app.json5`（`versionName = 0.11.1` ↔ pi-web `v0.11.1`） |
| FR-006-020 | `README.md` / `README_zh.md` ＋ `docs/工程规划.md` §11.3；⬜ 应用内「关于」待建 |
| FR-006-021 | `scripts/brand-assets.mjs`（`format=rgb24`；母版含非 255 像素即失败） |
| FR-006-022 | ⬜ 首启文案扫描守卫待补（口径见 `specs/103-branding/`） |
| FR-006-023 | `web_engine/src/main/ets/common/CommandLineAdapter.ets`（overlay：`--inspect` 仅 debug 启用） |
| FR-006-024 | `docs/工程规划.md` §11.5 G1–G10 ＋ ⬜ `docs/上架合规清单.md` 待建 |
| FR-006-025 | `runtime-overlays/`（两份 `module.json5` + 6 套 locale `string.json`，与目标同 md5）＋ `scripts/collect-runtime.mjs` 阶段 7.6 |
| FR-006-026 | 两份 `module.json5` 中 8 条 `reason` 的 `usedScene`（`EntryAbility` / `inuse`） |
