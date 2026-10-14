# 203-plugin-workspace-picker 测试用例

> **Module:** 203-plugin-workspace-picker ｜ **Last Updated:** 2026-10-14
> **对应规格:** [spec.md](./spec.md) ｜ **对应方案:** [plan.md](./plan.md)
> **执行记录目录:** `logs/20261014-2/`

## 0. 测试环境与前置

| 项 | 值 |
|---|---|
| 设备 | 真机 `3QC0226526001227`（2in1 / HUAWEI MateBook Pro / API 24） |
| 应用 | `org.fellow99.pi.PiDesktop`，debug 签名 HAP（`electron-default-signed.hap`） |
| 调试通道 | `hdc fport tcp:19229 tcp:9229` → CDP；工具 `$PI_SCRATCH_DIR/cdp.mjs`（不入库） |
| 脚本工具 | `hdc`（`/d/oh-workspace/command-line-tools/sdk/default/openharmony/toolchains`） |
| 关键路径 | 沙箱 `<userData>/workspace` = `/data/storage/el2/base/files/workspace`；`/storage/Users/currentUser/{Desktop,Documents,Download}` |
| 前置 | 部署后重设 DeepSeek API KEY（`auth.json` `mode=0600`）并重建测试工作区（**卸载会清空沙箱**） |
| 授权前置 | 用户目录需在「设置 → 应用 → Pi Desktop → 允许访问」授权；**未授权时** TC-D4/D5/D6/D9 走未授权分支 |

## 1. 构建期与宿主侧用例

### TC-B1 — 补丁幂等

| 项 | 内容 |
|---|---|
| 目的 | 确认补丁应用阶段可重复执行 | 
| 步骤 | 连续两次运行补丁阶段 |
| 期望 | 第二次 `git apply --reverse --check` 命中 → skip（no-op），不重复改动 |
| 覆盖 | FR-203-021 |

### TC-B2 — 补丁可往返

| 项 | 内容 |
|---|---|
| 目的 | 确认补丁可无损回退 |
| 步骤 | 记录 3 个受影响文件 SHA-256 → `git apply` 正向 → 断言变更 → `git apply --reverse` → 重新计算 SHA-256 |
| 期望 | 反向应用后 SHA-256 **完全还原**；`../pi-web` 工作树随后恢复为「已应用」态 |
| 覆盖 | FR-203-022、场景 9 |

### TC-B3 — 上游工作树零改动

| 项 | 内容 |
|---|---|
| 目的 | 确认纪律 |
| 步骤 | `git -C ../pi status --porcelain`；`git -C ../harmonypc-electron status --porcelain`；`git -C ../pi-web diff --stat`（补丁应用态不计入提交） |
| 期望 | `../pi` 与 `../harmonypc-electron` **零改动**；`../pi-web` 的改动**只**来自本补丁 |
| 覆盖 | FR-203-023 |

### TC-B4 — 扩展物化与语法

| 项 | 内容 |
|---|---|
| 目的 | 确认 PL1 扩展进入产物 |
| 步骤 | `node scripts/collect-pi.mjs` → 检查 `pi-dist/resources/pi-agent/extensions/harmony-workspace-roots.js`；对源文件跑 `node --check` |
| 期望 | 文件存在且与源**逐字节相同**；语法检查通过 |
| 覆盖 | FR-203-019 |

## 2. 真机用例（`--inspect` / CDP）

### TC-D1 — 四根解析与环境变量

| 项 | 内容 |
|---|---|
| 目的 | 确认主进程解析正确 |
| 步骤 | CDP 读 `process.env.PI_HOS_ROOTS`、`process.env.HOME`、`app.getPath('userData')`、`fs.existsSync` 四根 |
| 期望 | 4 条、id 恰为 `sandbox/desktop/documents/download`；`sandbox` 路径 = `<userData>/workspace` 且**已存在**；三条用户目录路径与真机一致 |
| 覆盖 | FR-203-001/002/003/004、AC-1 |

### TC-D2 — 沙箱根自动创建

| 项 | 内容 |
|---|---|
| 目的 | 确认幂等自动创建 |
| 步骤 | 删除 `<userData>/workspace` → 重启应用 → CDP 检查存在性与可写性 |
| 期望 | 目录被自动创建（可 `mkdir`/写入探针文件），列表正常 |
| 覆盖 | FR-203-002、场景 2 |

### TC-D3 — 权限桥可用性

| 项 | 内容 |
|---|---|
| 目的 | 确认桥的两个动作可用 |
| 步骤 | CDP 调 `globalThis.__PI_HOS_PERMISSION__.check('directory_desktop')` 与 `.openAppInfo()` |
| 期望 | `check` 返回 boolean（真机当前应为 `false`）；`openAppInfo` 无异常且跳转本应用信息页；三项 `permType` 映射正确 |
| 覆盖 | FR-203-015/016/026 |

### TC-D4 — `/roots` 自检命令

| 项 | 内容 |
|---|---|
| 目的 | 确认 PL1 扩展装载并可用 |
| 步骤 | 新建会话后执行 `/roots` |
| 期望 | 打印四个主目录绝对路径 + 存在性 + 可读性 + 三项授权状态；与 TC-D1 一致 |
| 覆盖 | FR-203-019 |

## 3. 真机交互用例

### TC-D5 — 四 Tab 切换与栈重置

| 项 | 内容 |
|---|---|
| 步骤 | 依次点击沙箱/桌面/文档/下载；在某一 Tab 下钻一层后切走再切回 |
| 期望 | 每次列出对应主目录根；切回后停在根、无子级残留；选中态清空；顶部 Tab 高亮当前主目录 |
| 覆盖 | FR-203-005、场景 1 |

### TC-D6 — 用户目录列举与围栏

| 项 | 内容 |
|---|---|
| 前置 | 用户目录已授权 |
| 步骤 | 切到桌面/文档/下载，读取首列条目与当前路径；连续下钻多层；逐级点面包屑 |
| 期望 | 仅目录、名称排序；路径前缀 `/storage/Users/currentUser/...`；面包屑首项即主目录根、**无更上层级可点** |
| 覆盖 | FR-203-003/006/008/009、场景 3 |

### TC-D6b — 未授权归因分支

| 项 | 内容 |
|---|---|
| 前置 | 用户目录**未**授权（真机当前状态） |
| 步骤 | 切到该 Tab |
| 期望 | 对话框内显示归因说明 +「去系统设置」；不出现原始 `EPERM`；点击「去系统设置」跳本应用信息页；返回后「重试」可再次尝试；**沙箱 Tab 不受影响** |
| 覆盖 | FR-203-015/016、场景 6 |

### TC-D7 — 入口精简

| 项 | 内容 |
|---|---|
| 步骤 | 检查对话框 header/footer 控件；在含 `.` 开头目录的位置观察列表 |
| 期望 | **无**路径输入框、**无**「跳转」按钮、**无**「显示隐藏文件」；hidden 条目不渲染 |
| 覆盖 | FR-203-006/007、场景 4 |

### TC-D8 — 新建文件夹与默认名去重

| 项 | 内容 |
|---|---|
| 步骤 | 在沙箱根连续新建两次（不改名）；再测试同级重名场景 |
| 期望 | 第一次 `未命名文件夹`、第二次 `未命名文件夹 2`；创建后列表刷新且新目录被选中；重名时在 Modal 内提示且不关闭对话框 |
| 覆盖 | FR-203-011/012/013、场景 5 |

### TC-D9 — 采纳工作区与文件访问

| 项 | 内容 |
|---|---|
| 步骤 | 选中一个文件夹 → 「选择此文件夹」；确认侧栏出现该工作区；再分别从**侧栏入口**与 **composer「打开其它项目」入口**各做一次；最后走一次失败场景（不可读路径） |
| 期望 | 工作区创建成功并切换；会话 `cwd` 为该绝对路径；文件面板可列出内容（`allowFileRoot` 生效）；采衲失败复用既有错误 Modal（含重试） |
| 覆盖 | FR-203-014、场景 7 |

### TC-D10 — 主目录记忆

| 项 | 内容 |
|---|---|
| 步骤 | 选桌面并下钻一层 → 关闭对话框重开；用 CDP 把 `localStorage` 的 rootId 改成非法值再重开 |
| 期望 | 重开停在**桌面根**（不恢复子路径）；非法值回退**沙箱** |
| 覆盖 | FR-203-018、场景 8 |

## 4. 回归用例

### TC-R1 — 两入口与一轮真实对话

| 项 | 内容 |
|---|---|
| 目的 | 确认核心链路不回归 |
| 步骤 | ① 侧栏「添加工作区」；② composer「打开其它项目」；③ 在沙箱中新建的测试工作区里进行**一轮真实对话**（`介绍一下你自己`，DeepSeek KEY 已设置） |
| 期望 | 两入口均打开同一对话框；对话完成且工具调用即时返回、零挂起 |
| 覆盖 | FR-203-014、场景 7 |

### TC-R2 — 宿主侧工具回归

| 项 | 内容 |
|---|---|
| 步骤 | `node scripts/test-harmony-tools.mjs` |
| 期望 | 33 PASS / 0 FAIL（不被本模块破坏） |
| 覆盖 | 非回归 |

## 5. 用例与验收标准对照

| 验收标准 | 覆盖用例 |
|---|---|
| AC-1 四主目录 Tab 可切换且栈重置 | TC-D5、TC-R1 |
| AC-2 沙箱根自动创建 | TC-D1、TC-D2 |
| AC-3 用户目录可列举且路径正确 | TC-D6 |
| AC-4 下钻与面包屑围栏 | TC-D6 |
| AC-5 无手输路径、无隐藏开关、hidden 不渲染 | TC-D7 |
| AC-6 未授权归因 + 去设置 + 重试 | TC-D3、TC-D6b |
| AC-7 新建文件夹、默认名去重、创建后选中 | TC-D8 |
| AC-8 采纳回传绝对路径、失败可重试 | TC-D9、TC-R1 |
| AC-9 主目录记忆与非法值回退 | TC-D10 |
| AC-10 自检与零异常 | TC-D1、TC-D3、TC-D4 |
| AC-11 补丁幂等、可往返、物化与上游零改动 | TC-B1–TC-B4 |
