# 101 — 版本更新：0.11.1（version）测试用例与执行结果

> **Module:** version ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-12
> **需求编号:** 101-version-0.11.1 ｜ **上游基线:** pi v1.1.0 · pi-web v0.11.1
> **规格依据:** [`spec.md`](./spec.md) ｜ **方案依据:** [`plan.md`](./plan.md) ｜ **任务:** [`tasks.md`](./tasks.md)
> **原始取证:** `logs/20261012-1/`（本轮日志目录，不入库）

图例：✅ 通过 ｜ ❌ 失败 ｜ ⬜ 未执行（含阻塞原因） ｜ N/A 本工程不适用

## A. 静态与流水线

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-01 | 上游 tag↔commit↔分支一致 | `git -C ../pi rev-parse v1.1.0` 等 | `pi` `v1.1.0`=`abe508e1b`=`Branch_v1.1.0` HEAD；`pi-web` `v0.11.1^{commit}`=`e78372193b`=`Branch_v0.11.1` HEAD | ✅ | `T01-anchor.txt` |
| TC-02 | 上游工作树干净 | `git status --porcelain` | 空 | ✅ | `T01-anchor.txt` |
| TC-03 | 未改动任何 git 分支 | 执行前后 `git branch` 快照对比 | 分支列表完全一致 | ✅ | `T01-anchor.txt`、`branches-before.txt` |
| TC-04 | 清理命中清单 | 逐项 `rm -rf` 并打印 HIT/MISS | 构建输出/组装物/投放物/缓存全命中；依赖目录保留 | ✅ 10 项 HIT，2 项 MISS（本就不存在） | `T02-clean.txt` |
| TC-05 | 清理未误删交付物 | 清理后 `git status` | 不出现被跟踪文件删除 | ✅ | `T02-clean.txt` |
| TC-06 | 重建不依赖被删内容（可复现性） | 清空后重跑 ①–④，再 `git diff --stat` | 被跟踪的 resfile 投放物**逐字节一致**（除版本号那一处有意变更） | ✅ **强证据** | `T05-*.log` + `git diff --stat` |
| TC-07 | 补丁集复核 | 逐条读 `pi`/`pi-web` 源码 | 候选 1–7「不需要补丁」各有文件级依据；候选 8 登记不补的理由 | ✅ 结论 0 条 | `patches/README.md` §v0.11.1 复核 |
| TC-08 | `versionName` 同步 | 读 `AppScope/app.json5` | `0.11.1` | ✅ | `git diff` |
| TC-09 | `versionCode` 递增且语义一致 | 读 + 与 HAP `pack.info` 交叉 | `1101 > 1000`，且 `pack.info.version.name == "0.11.1"` | ✅ | `T05-7-hap.txt` |
| TC-10 | 版本号无残留 | `git grep "0\.1\.0"` | 仅命中历史记录文档（`docs/真机验证记录.md` 轮次 0/1 的当时值），每处可解释 | ✅ | `git grep` |
| TC-11 | ① `collect-runtime` 全守卫 PASS | `node scripts/collect-runtime.mjs` | 守卫零 FAIL | ✅ 46 PASS | `T05-1-collect-runtime.log` |
| TC-12 | ② `prepare-next` 用 Node 22.17.0 构建 | `prepare-next.mjs --node <node22>` | BUILD 成功，产物断言通过 | ✅ | `T05-2-prepare-next.log` |
| TC-13 | ②′ 门禁 0 FAIL | `smoke-node22.mjs` | PASS≥9，FAIL=0 | ✅ 9 PASS / 1 SKIP / 0 FAIL | `T05-3-smoke.log` |
| TC-14 | ③ `collect-pi` 产出 tar + marker | `collect-pi.mjs` | tar + SHA-256 marker | ✅ 115.9 MB，27279 文件 | `T05-4-collect-pi.log` |
| TC-15 | ④ `collect-app` 投放 resfile | `collect-app.mjs` | 9 文件 / 116 MB | ✅ | `T05-5-collect-app.log` |
| TC-16 | ⑤ 签名构建 | `build-debug.ps1` | `BUILD SUCCESSFUL` + 签名断言（Profile `type=debug`）通过 | ✅ 320.3 MB | `T05-6-build-debug.log` |

## B. 真机部署与启动

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-17 | 卸载旧版 | `hdc uninstall` | uninstall successfully | ✅ | `T06-install.txt` |
| TC-18 | 安装新版 | `hdc app install`（相对路径） | install bundle successfully | ✅ | `T06-install.txt` |
| TC-19 | 启动 | `aa start -a EntryAbility` | start ability successfully | ✅ | `T06-install.txt` |
| TC-20 | 产物解压完成 | `hilog` | `解压完成：27279 个文件` | ✅ | `T07-hilog-raw.txt` |
| TC-21 | 进程内 Next 启动 | `hilog` | `启动 Next 服务器（进程内，0.0.0.0:<port>）` | ✅ 端口 38465 | `T07-hilog-raw.txt` |
| TC-22 | Next 就绪 | `hilog` | `✓ Ready in 0ms` + `✓ Running next.config.ts took 236ms` | ✅ | `T07-hilog-raw.txt` |
| TC-23 | 零下载（SWC 走内置 WASM） | `hilog` 无 `Downloading swc package` | 无下载行 | ✅ | `T07-hilog-raw.txt` |
| TC-24 | 就绪探测通过 | `hilog` | `[ready] 第 1 次探测通过：GET /api/web-auth → 200` | ✅ | `T07-hilog-raw.txt` |
| TC-25 | 首屏完成 | `hilog` | `首屏完成，UI 标记命中：Pi Web` + `[stage] 就绪` | ✅ | `T07-hilog-raw.txt` |
| TC-26 | WASM SWC 落点正确 | 应用域 `fs.existsSync` | `pi-dist/node_modules/next/wasm/@next/swc-wasm-nodejs/` 存在（5 文件） | ✅ | `T07-probe-sandbox.txt` |
| TC-27 | 旧错误落点不存在 | 同上 | `pi-dist/node_modules/@next/swc-wasm-nodejs` 不存在 | ✅ | `T07-probe-sandbox.txt` |
| TC-28 | 下载缓存目录不存在 | 同上 | `files/tmp/next-swc` 不存在（= 一次都没尝试下载） | ✅ | `T07-probe-sandbox.txt` |
| TC-29 | 部署物完整性 | 对比设备 marker 与主机 `pi-dist.version` | SHA-256 相同 | ✅ `98bc3f0a…33c42` | `T07-probe-sandbox.txt` |
| TC-30 | 运行时身份 | 应用域 | `platform=openharmony`、`arch=arm64`、`node=22.17.0`、`electron=37.2.0`、`chrome=138.0.7204.45` | ✅ | `T07-probe-sandbox.txt` |
| TC-31 | 沙箱重定向 | 应用域读 env | `HOME=/data/storage/el2/base/files`、`PI_CODING_AGENT_DIR=…/pi-agent`、`PI_OFFLINE=1` | ✅ | `T07-probe-sandbox.txt` |

## C. 基本功能（需求原文三条）

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-32 | 设置 DeepSeek API KEY | `POST /api/auth/api-key/deepseek {apiKey}`（UI「设置→模型」同路由） | 200 `{success:true}` | ✅ | `T08-setup.txt` |
| TC-33 | KEY 落沙箱且权限正确 | 应用域读 `pi-agent/auth.json` | 存在、`mode=0600`、含 `deepseek.api_key` | ✅ 脱敏记录 | `T09-dialog.txt` |
| TC-34 | 创建工作区（沙箱内测试目录） | `POST /api/cwd/browse {path:HOME, name:"pi-workspace-test"}` | 200 + 路径 | ✅ `/data/storage/el2/base/files/pi-workspace-test` | `T08-setup.txt` |
| TC-35 | 工作区目录真实存在 | 应用域 `fs.statSync` | 是目录、可写 | ✅ `mode=0777 uid=20020215` | `T08-setup.txt` |
| TC-36 | 工作区被应用识别 | `POST /api/cwd/validate` | 200 + `projectRoot/projectKey` | ✅ | `T08-setup.txt` |
| TC-37 | 设为默认模型 | `PUT /api/models/default` | 200 `{ok:true}` | ✅ `deepseek/deepseek-flash` | `T09-dialog.txt` |
| TC-38 | **一次真实对话**「介绍一下你自己」 | `POST /api/agent/new {cwd,type:"prompt",message}` | 会话建立 + 模型流式返回 + UI 文本 | ✅ **两轮**：先 `toolUse`（读技能文档）再 `stop`，回复为完整中文自我介绍 | `T09-dialog-turns.txt` |
| TC-39 | 对话走真实网络（非 mock） | 观察 assistant 条目 `model=deepseek-flash` + `durationMs` | 真实模型响应 | ✅ 1761 ms / 3319 ms | `T09-dialog-turns.txt` |
| TC-40 | 会话落盘 JSONL | 应用域读 `pi-agent/sessions/…/*.jsonl` | 文件存在、含 session/model_change/user/assistant 条目 | ✅ 8 行，18 952 B | `T09-dialog-turns.txt` |
| TC-41 | 工具调用可用（`read`） | 上条对话中模型自主调用 | `toolResult` 返回真实文件内容 | ✅ 12 ms 返回技能文档全文 | `T09-dialog-turns.txt` |

## D. 鸿蒙环境能力复测

依据 `dsh-desktop-hos/docs/鸿蒙环境能力清单-v0.1.5.md`（A.2 主表 32 项）与
`toybox命令清单.md`（12 节）。**逐项在本工程上重测，不复制参考结论。**

### D.1 设备与 shell 身份

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-50 | 内核/发行版标识 | `uname -a`、`hostname` | ✅ `HarmonyOS localhost HongMeng Kernel 1.13.0 … aarch64 Toybox` | `T10-env-toybox.txt` |
| TC-51 | 交互 shell 身份 | `KSH_VERSION`、`ls -l /system/bin/sh`、两个 `md5sum` | ✅ mksh **R59**；`sh` 是普通文件（`readlink` 空）；`md5(sh)=0f3303…` ≠ `md5(toybox)=2eba1e…` | `T10-env-toybox.txt` |
| TC-52 | 假探针识别 | 与上条交叉 | ✅ `uname -a` 尾部 `Toybox` 是内核 utsname，与 shell 无关 | `T10-env-toybox.txt` |
| TC-53 | 存储布局 | `mount`、`df` | ✅ `/data` = `hmfs`；根卷 928 G / 已用 9 % | `T10-env-toybox.txt` |
| TC-54 | `/proc/version` 可读性 | `cat /proc/version` | ✅ 可读（shell 域） | `T10-env-toybox.txt` |

### D.2 toybox 清单复测

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-55 | 枚举法（4 步 + 功能实测） | ① 裸 `toybox` ② `ls -l /system/bin` ③ `readlink` ④ `unalias`+`type` | ✅ 方法可复现 | `probes/tbprobe.sh` |
| TC-56 | 编译进二进制的小程序数 | `toybox` 裸输出 | ✅ **178** | `T10-toybox-applets.txt` |
| TC-57 | A 类（可直接调用） | 软链→toybox ∩ 小程序表 | ✅ **177** = 166 裸名可调 + 11 被 mksh 遮蔽 | `T10-toybox-analysis.txt` |
| TC-58 | B 类（已编译但无软链） | 小程序表 − 软链名 | ✅ **1** = `nc`（须 `toybox nc`） | `T10-toybox-analysis.txt` |
| TC-59 | 悬空软链 | 软链→toybox − 小程序表 | ✅ **42**（与参考清单**同名同数**） | `T10-toybox-analysis.txt` |
| TC-60 | 非 toybox 软链 | `readlink` 目标 ≠ toybox | ✅ `reboot`→`begetctl`、`service_control`→`begetctl`、`f2fslabel`/`resize.f2fs`/`sload.f2fs`→`fsck.f2fs`；另 6 个目标不可读（域限制） | `T10-toybox-analysis.txt` |
| TC-61 | mksh 两层遮蔽 | `unalias` 后 `type` | ✅ **11**：`cat echo false kill pwd realpath sleep test true ulimit`（builtin）+ `time`（reserved）；`printf/ls/grep/sed` **未**被遮蔽（tracked alias） | `T10-env-toybox.txt` |
| TC-62 | `command -v` 陷阱 | `command -v cat` vs `which cat` | ✅ `alias cat=cat` vs `/bin/cat`（两者答案不同） | `T10-env-toybox.txt` |
| TC-63 | 恒等 alias 数 | `alias` | ✅ **139** | `T10-env-toybox.txt` |
| TC-64 | toybox 功能实测 | 建目录/写/读/压缩/校验/搜索/文本替换/删除 | ✅ `cat`/`md5sum`/`tar`/`gzip -t`/`grep -r`/`find`/`sed -i`/`awk`/`wc`/`df`/`id`/`date`/`rm` 全部正确 | `T10-env-toybox.txt` |
| TC-65 | 关键工具缺失 | `command -v` | ✅ `pnpm node npm git bash vi curl rg fd python busybox strace` 全 absent | `T10-env-toybox.txt` |

### D.3 文件系统 / 权限（**应用域**，参考清单第 1–10、25 项）

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-70 | shell 域符号链接 | `ln -s` | ✅ 被拒（`Permission denied`）——**与参考设备相反**，本机 shell 域也拒绝 | `T10-env-toybox.txt` |
| TC-71 | shell 域硬链接 | `ln` | ✅ 被拒（`Permission denied`） | `T10-env-toybox.txt` |
| TC-72 | shell 域 chmod | `chmod 640` + 回读 | ✅ `rc=0`，回读 `-rw-r-----`（**如实生效**） | `T10-env-toybox.txt` |
| TC-73 | 用户目录可达性（shell 域） | `ls -ld`、`[ -r ]`/`[ -w ]` | ⚠️ `/storage/Users/currentUser{,/Desktop,/Documents,/Download}` 在本机 shell 域**不存在**（`No such file or directory`） | `T10-env-toybox.txt` |
| TC-74 | 单条目的 `lstat` 在 shell 域 | `ls -l /system/bin/cat`、`[ -L ]`、`readlink` | ⚠️ `ls -l` 单条目 `Permission denied`、`[ -L ]` **恒假**（会误导分类），但 `readlink` 可读、目录列表可读 → **不能靠 `[ -L ]` 分类** | `T10-env-toybox.txt` |
| TC-75 | 沙箱文件系统能力（应用域） | 应用域 `fs` 全量原语（`T10-appdomain-fs.txt` 4.1–4.17） | ✅ 建/覆盖/追加/原子写(临时文件+rename)/跨目录 rename/复制/删除/递归删/**硬链接**/fsync/utimes/statfs/中文名/`readdir withFileTypes` 全通过；**`chmod` 600/640/755 如实回读**；**symlink `EACCES`** | ✅ | `T10-appdomain-fs.txt` |
| TC-76 | 用户目录（应用域） | `statSync` + 写探针（5.x） | ✅ 四个目录**存在**（`mode=02771`、`uid=20001006(file_manager)`）；写入一律 **`EPERM`**；`/storage` 读 `EACCES`、`/storage/Users` 读 `EPERM`；`HOME`/`homedir()` 均指向沙箱 | ✅（结论为「拒绝」） | `T10-appdomain-fs.txt` |
| TC-77 | 子进程行为（应用域） | 单次 `spawn('/system/bin/sh',['-c','echo spawn-ok; id'])`（复刻 pi `bash` 形状） | ✅ 命令执行 + stdout 正确（`uid=20020215(pci) … u:r:debug_hap:s0`）；⚠️ **6 s 内 `exit`/`close`/`error` 全部缺席**，`exitCode`/`signalCode` 恒 `null`，`/proc/<pid>/stat` = `Z` | ✅（结论为「事件缺失」） | `T10-spawn.txt` |
| TC-78 | PTY 可用性（应用域） | `/dev/ptmx` 存在性 + `open` + `node-pty` 预编译目录 + `require` | ✅ `/dev/ptmx` **存在且可打开**；`/dev` 扫描 `EACCES`；`node-pty/prebuilds` 只有 `darwin-arm64,win32-arm64`；`require` 报 `Cannot find module './prebuilds/openharmony-arm64/pty.node'` → **根因是 L2 缺产物，不是 L1 内核拒绝** | ✅ | `T10-appdomain-fs.txt` |
| TC-79 | 子进程跑 Node（JIT/seccomp） | `spawn` `/data/service/hnp/bin/node`（8.2/8.3） | ✅ `node -v` → `v24.13.0`；❌ `node -e 'console.log(1+1)'` → **stdout/stderr 皆空** + `Z`（第 4 次复现参考工程记录，仍未定位） | ✅ | `T10-node-subprocess.txt` |
| TC-80 | `fd`/`rg` 缺失（pi `find`/`grep` 工具根因） | 应用域扫 `PATH` + 查 `pi-dist` 是否内置 | ✅ `PATH=/data/app/bin:/data/service/hnp/bin:/usr/local/bin:/bin:/usr/bin:/system/bin:/vendor/bin`；`fd`/`fdfind`/`rg` **均不存在**；`pi-dist` 内无 `@vscode/ripgrep`/`ripgrep`/`fd-find` → 工具不可用的根因确认 | ✅ | `T10-appdomain-fs.txt` |

### D.4 平台级复现发现（本轮新增）

| ID | 用例 | 方法 | 结果 | 证据 |
|---|---|---|---|---|
| TC-85 | **`reboot`→`begetctl` 陷阱复现** | 一个第三方脚本以「裸名 `--help`」探测全部 `/system/bin` 条目 | ❌ **设备被重启**（`uptime` 归零至 `up 0 min`）——**文档记载的陷阱在本机 100% 复现**。本工程自己的脚本用 `toybox <n> --help`（`reboot` 不在小程序表 → `Unknown command`），**未**触发 | `T10-0-reboot.txt` |
| TC-86 | 重启后是否自动启动 | 重启后 `pidof` | ✅ **未自动启动** → 印证参考清单「开机自启 ❌（只有只读接口）」 | `T10-0-reboot.txt` |
| TC-87 | `/data/local/tmp` 持久性 | 重启后读文件 | ✅ 文件仍在 | `T10-0-reboot.txt` |
| TC-88 | 锁屏是否可远程解锁 | `aa start` / `power-shell wakeup` / `uitest uiInput` | ❌ **不可**：`10106102 The device screen is locked … the screen cannot be unlocked automatically`；`uitest dumpLayout` 显示锁屏文案「请输入密码」→ 需**人工解锁** | `T10-0-reboot.txt` |
| TC-89 | 视觉取证（截图通道可用性） | `uitest dumpLayout`、`snapshot_display` | ✅ 均可用（3120×2080 jpeg）；`dumpLayout` 能取到锁屏文本，**是比截图更可靠的判据** | `T10-0-reboot.txt` |

## E. 明确不适用（N/A）的参考清单条目

| 参考项 | 为什么 N/A |
|---|---|
| 子 agent / `todo_write` / `present` / `ask_user_question` / `skill` / `workflow` / `job_*` | 这些是 **dsh 的插件工具**；本工程消费的是 `pi` 的工具集，工具名不同（`read`/`write`/`edit`/`ls`/`bash`…），不能用 dsh 的结论替代。本工程相关结论见 `skills/harmony-runtime-capabilities/SKILL.md` 与"真机验证记录"。 |
| `read_image` / 图片缩略图 | dsh 侧特有（ArkTS 图像桥 + `read_image` 工具）。本工程壳内**有** `ImageAdapter` overlay，但 pi 侧无对应工具调用链 → 不作为本轮验收项。 |
| HNP 发布 / `executableBinaryPaths` / 二进制证书 | `docs/工程规划.md` §11.5 与 `README.md`「权限」节已给出本工程决策（**不随包分发自有 ELF、不用 HNP**）；发布证书/Profile 属上架范围，本需求排除。 |
| 托盘 / 无边框窗口 / 更新检查 / 开机自启 | 壳侧能力，参考清单里多为「API 就绪但决定不实现」。本工程 `StatusBarEntryAbility` 在包内（`pack.hap` 的 `extensionAbilities`），本轮只做**存在性**核验，不做交互验收（超出本需求）。 |
| 后台常驻 | 已测（后补）：注入 Home 键 → 窗口 `WINDOW_OCCLUDED(5)`、运行时 `SetProcessPriority … priority: 1`，但 `aa dump -a` 仍报 `state #FOREGROUND` / `app state #FOREGROUND`、`isKeepAlive: false`、hilog 无 `onBackground`/`onSceneMinimize` → ⚠️ **未确立为真实后台驻留** | `T10-background.txt` |

## F. 阻塞与解除记录

1. **阻塞发生**：T10 期间为对照参考清单枚举 `/system/bin` 时，一个**第三方脚本**以「裸名 `--help`」模式逐个探测 —— `/system/bin/reboot` 是指向 `begetctl` 的软链，`--help` 被 `begetctl` 当作重启命令执行，**设备于 ~15:09 重启**（本工程自己的脚本用 `toybox <n> --help`，而 `reboot` **不在**裸 `toybox` 的小程序表内 → `Unknown command`，安全）。→ 已写成硬约束，见报告 §C.4 #1。
2. **阻塞**：设备重启后锁屏为**密码锁**，`aa start` 报 `10106102 The device screen is locked during the application launch, unlock screen failed`；`power-shell wakeup` 在 shell 域被拒、`uitest uiInput` 也无法越过密码。应用域用例（TC-75…TC-80）因此一度无法取证。
3. **解除**：屏幕由**人工解锁**后 `aa start` 成功（新 pid `26601`），TC-75…TC-80 **全部补齐**（见 D.3），并**顺带完成第二轮冷启动复验**：`产物已就位（marker 一致），跳过解压` → `✓ Running next.config.ts took 228ms`（仍**零下载**）→ `[ready] 第 1 次探测通过` → `首屏完成`（见 `T10-0-hilog-second-start.txt`）。
4. **遗留未测**（不属本需求验收项，已登记在 `docs/鸿蒙环境能力清单-v0.11.1.md` §B 与「未测项一览」）：托盘/状态栏**交互**验收、后台「真实驻留」形态验证、MCP stdio 实测、`web_search`/`web_fetch` 单独调用、release 签名包与上架路径、`node -e` 无输出的根因。
