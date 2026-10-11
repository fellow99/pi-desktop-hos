# runtime-overlays —— 运行时定制白名单（prune + overlay 机制的源）

## 0. 机制

`scripts/collect-runtime.mjs` 负责把 sibling 子工程 `../harmonypc-electron/ohos_hap` 的运行时外壳
（`electron/` entry 模块 + `web_engine/` HAR 模块）拷进本工程，而**本工程对这份外壳的全部定制都写在本目录**，
构建期由脚本回盖，避免任何一次「重新收集运行时」把定制冲掉。流水线与本目录的对应关系是：

1. **拷贝**：`ohos_hap/{electron,web_engine}` → 本工程同名目录（剔除 `build/`、`oh_modules/`、`node_modules/`、
   `.git/`、`.hvigor/`、`.idea/`、`.codegraph/`）。此步会把 `electron/src/`、`web_engine/src/`、
   `web_engine/Index.ets`、`web_engine/childProcess.ets` 等**产物**一并带进来——它们由本步生成，
   因此**不入库、也不出现在本 overlay**。
2. **剪裁（prune）**：删除 [§3](#3-prune_files候选清单) 的 `PRUNE_FILES`。删除前**断言文件存在**：
   缺失说明上游外壳结构已变化，必须重新评估（硬失败，不静默跳过）。
3. **回盖（overlay）**：把本目录白名单文件逐个**整文件覆盖**到第 1 步产出的目标（`md5` 一致性守卫，
   源或目标缺失即硬失败）。分三类：
   - `OVERLAY_FILES`：上游存在、本工程改写过的文件（17 个）；
   - `OVERLAY_PRE_REWRITE_FILES`：**必须保留上游「通用」bundleName 字面量**的副本（1 个，
     见 [§2](#2-新增文件上游不存在) 的说明），回盖后由阶段 4 再改写；
   - `OVERLAY_ADD_FILES`：上游**不存在**、由本工程新增的文件（5 个）。
4. **bundleName 字面量改写**：把上游通用 bundleName `com.huawei.ohos_electron` 改写为本应用
   bundleName（`AppScope/app.json5` 的 `bundleName`，即 `org.fellow99.pi.PiDesktop`）。
5. **守卫**：阶段 7 逐条校验「overlay 已命中（源/目标 md5 一致）」「剪裁文件确实不存在」
   「前置 overlay 源保留通用字面量、目标已无通用字面量且含 App bundleName」。

覆盖方式为**整文件替换**，所以本目录下每个文件都必须是**完整文件内容**（不是 patch、不是片段）。

## 1. 文件清单

「相对上游」= 与 `/d/pi-workspace/harmonypc-electron/ohos_hap/` 下同名文件的差异（行数为
`diff` 统计的改动行数；「新增」表示上游没有该文件）。

| 文件 | 定制内容 | 是否参与 bundleName 字面量改写 | 相对上游是否有差异 |
|---|---|---|---|
| `electron/src/main/module.json5` | 去浏览器语义（EntryAbility 的 `skills` 只留 `entity.system.home` + `action.system.home`，**不含** `entity.system.browsable` / `ohos.want.action.viewData`）；EntryAbility 保留 `backgroundModes: ["taskKeeping"]` + `KEEP_BACKGROUND_RUNNING` 权限；EntryAbility `icon` 由 `app_icon` 改 `window_icon`；BrowserAbility 保留 `viewData` 但 `exported: false`（不成为外链目标）；两处合规注释 | 否 | 是（21 行，另加 9 行本工程注释） |
| `electron/src/main/ets/entryability/EntryAbility.ets` | 上游基线 + 后台保活（`onBackground` 申请长时任务 / `onForeground` 释放，全程容错不抛）；`LOG_TAG = 'pi-desktop'` | 否 | 是（97 行） |
| `electron/src/main/ets/pages/ExternalWeb.ets` | **新增页**：ArkWeb（`@kit.ArkWeb` 的 `Web` 组件）承载全部**外部**网页（帮助/文档/隐私政策/用户协议/OAuth/导出），空 URL 兜底提示；主界面（进程内 pi-web 同源提供）不经此页 | 否 | **新增**（上游不存在） |
| `electron/src/main/ets/pages/Index.ets` | AI 生成合成内容常驻灰字标识（`Stack` 右下角、`HitTestMode.None`） | 否 | 是（35 行） |
| `electron/src/main/ets/pages/NodeHandleWindow.ets` | 同上的 AI 标识；`Stack` 布局取代原 `Row`，状态栏 padding 由外层移到内层 | 否 | 是（41 行） |
| `electron/src/main/resources/base/element/string.json` | `EntryAbility_label` = `Pi Desktop`（OS 桌面显示名），其余键保留 | 否 | 是（2 行） |
| `electron/src/main/resources/en_US/element/string.json` | 同上（en_US） | 否 | 是（2 行） |
| `electron/src/main/resources/zh_CN/element/string.json` | 同上（zh_CN，`确认`/`取消`/`应用状态栏`/`打开新窗口` 保留中文） | 否 | 是（2 行） |
| `electron/src/main/resources/base/profile/main_pages.json` | 登记 `pages/ExternalWeb` | 否 | 是（3 行） |
| `electron/src/main/resources/base/profile/shortcuts_config.json` | 快捷方式 `bundleName` = `org.fellow99.pi.PiDesktop`；`icon` = `$media:app_icon` | 否 | 是（3 行） |
| `web_engine/src/main/module.json5` | 权限表定制：删除相机/麦克风/定位（含后台）/蓝牙/分布式数据同步/Web Native Messaging 共 8 条；新增 3 条 App 级权限（`INHERIT_PARENT_PERMISSION`、`kernel.IGNORE_LIBRARY_VALIDATION`、`kernel.EXEMPT_ANONYMOUS_EXECUTABLE_MEMORY`）；`usedScene` 由上游示例写法 `FormAbility`/`always` 改为 `EntryAbility`/`inuse`；`definePermissions` 原样保留；文件内已标注「App 级新增」与「上游原有」 | 否 | 是（108 行，另加 18 行本工程注释） |
| `web_engine/src/main/resources/base/element/string.json` | 权限 reason 文案：删除 `camera`/`microphone`/`location`/`access_bluetooth` 条目，改写 `access_pasteboard`/`*_dir`/`screen_capture` 文案，新增 `inherit_parent_permission`/`ignore_library_validation`/`exempt_anonymous_executable_memory` | 否 | 是（38 行） |
| `web_engine/src/main/resources/en_US/element/string.json` | 同上（en_US） | 否 | 是（38 行） |
| `web_engine/src/main/resources/zh_CN/element/string.json` | 同上（zh_CN） | 否 | 是（38 行） |
| `web_engine/src/main/ets/adapter/PermissionManagerAdapter.ets` | 权限映射表删除 `location`/`microphone`/`camera`/`bluetooth` 四类。**文件内保留上游通用字面量 `com.huawei.ohos_electron`（第 69 行），不得硬编码 App bundleName** | **是**（唯一一个：回盖早于阶段 4，由阶段 4 改写；其正确性由「目标已无通用字面量且含 App bundleName」守卫保障） | 是（13 行） |
| `web_engine/src/main/ets/adapter/MediaAdapter.ets` | 仅删除 `import { camera } from '@kit.CameraKit';`（相机能力已剪裁） | 否 | 是（1 行） |
| `web_engine/src/main/ets/common/CommandLineAdapter.ets` | 收敛上游无条件的 `--inspect`（Node inspector 暴露 `require`，`hdc` 即可完全控制宿主进程）：仅在安装包为 debug 构建时追加，判定失败一律按非 debug 处理 | 否 | 是（35 行） |
| `web_engine/src/main/ets/jsbindings/JsBindingMethod.ets` | 去掉 2 个蓝牙 bind（对应文件已被剪裁），加入 `ImageAdapterBind` / `TrayAdapterBind` | 否 | 是（8 行） |
| `web_engine/src/main/ets/adapter/ImageAdapter.ets` | **新增**：`sharp` 在 aarch64 无 libvips 可用，图像解码/缩放/重编码改由平台图像框架实现，经通用 ArkTS 桥（`systemPreferences.callArkTSFunction`）以 JSON 字符串进出 | 否 | **新增** |
| `web_engine/src/main/ets/jsbindings/ImageAdapterBind.ets` | **新增**：`ImageAdapter` 的桥接绑定 | 否 | **新增** |
| `web_engine/src/main/ets/adapter/TrayAdapter.ets` | **新增**：状态栏图标/菜单/快捷操作（托盘）适配；`title` 默认值 `Pi Desktop` | 否 | **新增** |
| `web_engine/src/main/ets/jsbindings/TrayAdapterBind.ets` | **新增**：`TrayAdapter` 的桥接绑定 | 否 | **新增** |
| `web_engine/src/main/resources/resfile/resources/app/electron_white.png` | 状态栏（托盘）图标：替换为产品 LOGO，逐字节拷贝 | 否 | 是（二进制不同） |

上表共 23 个文件，即 `OVERLAY_FILES` 17 个 + `OVERLAY_PRE_REWRITE_FILES` 1 个 + `OVERLAY_ADD_FILES` 5 个。
**未列入本目录的文件一律视为「上游原样」**，
不经任何回盖（例如 `electron/src/main/resources/base/element/color.json`、`web_engine/.gitignore`、
`web_engine/Index.ets`、`web_engine/childProcess.ets`、`web_engine/oh-package-lock.json5`）。

## 2. 新增文件（上游不存在）

| 文件 | 引入原因 |
|---|---|
| `electron/src/main/ets/pages/ExternalWeb.ets` | 上架合规「外链 ArkWeb 化」（`docs/工程规划.md` §4.7）：外部网页必须由 ArkWeb 组件渲染 |
| `web_engine/src/main/ets/adapter/ImageAdapter.ets` | 上游无 aarch64 libvips，`sharp` 不可用；图像能力改走平台图像框架 |
| `web_engine/src/main/ets/jsbindings/ImageAdapterBind.ets` | 上者的桥接绑定 |
| `web_engine/src/main/ets/adapter/TrayAdapter.ets` | 桌面壳的状态栏（托盘）能力 |
| `web_engine/src/main/ets/jsbindings/TrayAdapterBind.ets` | 上者的桥接绑定 |

这 5 个文件由 stage 1 的拷贝**不会**产生，必须由 overlay 落地；因此守卫单独检查「新增文件已落地」，
并且**不**要求目标文件预先存在。

## 3. PRUNE_FILES（候选清单）

上游存在、本工程不需要、必须在拷贝后删除的 4 个蓝牙文件（路径已逐条核实存在）：

| 剪裁路径（相对工程根） | 上游实际路径 |
|---|---|
| `web_engine/src/main/ets/adapter/BluetoothAdapter.ets` | `harmonypc-electron/ohos_hap/web_engine/src/main/ets/adapter/BluetoothAdapter.ets` |
| `web_engine/src/main/ets/adapter/BluetoothLowEnergyAdapter.ets` | `harmonypc-electron/ohos_hap/web_engine/src/main/ets/adapter/BluetoothLowEnergyAdapter.ets` |
| `web_engine/src/main/ets/jsbindings/BluetoothAdapterBind.ets` | `harmonypc-electron/ohos_hap/web_engine/src/main/ets/jsbindings/BluetoothAdapterBind.ets` |
| `web_engine/src/main/ets/jsbindings/BluetoothLowEnergyAdapterBind.ets` | `harmonypc-electron/ohos_hap/web_engine/src/main/ets/jsbindings/BluetoothLowEnergyAdapterBind.ets` |

与 overlay 的耦合（**不可只做一半**）：`JsBindingMethod.ets` 上游会 `import` 并 `bind()` 这两个蓝牙 adapter，
所以「剪裁蓝牙文件」与「回盖 `JsBindingMethod.ets`（去掉对应 import/bind）」必须同时生效，
否则编译期即报模块缺失。同理，权限表中的蓝牙条目已在 `web_engine/src/main/module.json5` 与
`PermissionManagerAdapter.ets` 中删除。

## 4. 其他约定

- 本目录文件在仓库内统一为 **LF 行尾**（上游 `ohos_hap` 为 CRLF）；回盖后目标文件与本源 md5 一致，
  守卫按字节比对，不受行尾风格影响。
- 所有跨层身份字面量只在三处出现，改名时需同步：`AppScope/app.json5` 的 `bundleName`、
  `AppScope/resources/base/element/string.json` 的 `app_name`、以及各 locale 的 `EntryAbility_label`；
  代码内 hilog tag 为 `pi-desktop`。
- 上游通用 bundleName `com.huawei.ohos_electron` **只允许**出现在
  `web_engine/src/main/ets/adapter/PermissionManagerAdapter.ets`（作为待改写的占位字面量）。
