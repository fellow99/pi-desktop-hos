# 101 — 版本更新：0.12.1（version）测试用例与执行结果

> **Module:** version ｜ **Status:** Implementing ｜ **Last Updated:** 2026-10-15
> **需求编号:** 101-version-0.12.1 ｜ **上游基线:** pi v1.2.0（`06a466935536f8c9bcacb2d5efc0fc021be1bdff`）· pi-web v0.12.1（`f83b1a502f8e434555a7153fe08e1c135dd65ca9`）
> **规格依据:** [`spec.md`](./spec.md) ｜ **方案依据:** [`plan.md`](./plan.md) ｜ **任务:** [`tasks.md`](./tasks.md)
> **原始取证:** `logs/20261015-1/`（本轮日志目录，不入库）
> **脱敏声明:** 本轮所有取证文件**均已脱敏**；DeepSeek API KEY 仅以「前 6 + 后 6 字符」形式出现，**完整密钥从不落盘、不入库**。

图例：✅ 通过 ｜ ❌ 失败 ｜ ⬜ 未执行（含阻塞原因） ｜ N/A 本工程不适用

## A. 静态与流水线

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-01 | `pi` tag↔commit↔分支一致 | `git -C ../pi cat-file -t v1.2.0`；`git -C ../pi rev-parse v1.2.0^{commit}`；`git -C ../pi branch --show-current` | tag `v1.2.0` 为**轻量标签**（`cat-file -t` = `commit`）；commit = `06a466935536f8c9bcacb2d5efc0fc021be1bdff` = `Branch_v1.2.0` HEAD | ✅ `git -C ../pi rev-parse HEAD` = `06a4669355…`、`../pi-web rev-parse HEAD` = `f83b1a502f…`，与本工程文档头/规格 §U1 一致；tag 类型断言（`pi` 轻量 / `pi-web` 带注释）由同轮姊妹工程取证件 `../pi-desktop/logs/20261015-1/T01-anchor.txt` 覆盖 | `T04-version.txt`（＋跨引 `../pi-desktop/logs/20261015-1/T01-anchor.txt`） |
| TC-02 | `pi-web` tag↔commit↔分支一致 | `git -C ../pi-web cat-file -t v0.12.1`；`git -C ../pi-web rev-parse v0.12.1^{commit}`；比对 `Branch_v0.12.1` HEAD | tag `v0.12.1` 为**带注释标签**（`cat-file -t` = `tag`）；剥离提交 = `f83b1a502f8e434555a7153fe08e1c135dd65ca9`（`Release v0.12.1`）= `Branch_v0.12.1` HEAD | ✅ `rev-parse v0.12.1^{commit}` = `f83b1a502f8e434555a7153fe08e1c135dd65ca9`；`log --oneline -1` = `f83b1a5 Release v0.12.1`；`worktree list` 报 `f83b1a5 [Branch_v0.12.1]` | `T03-patches.txt` |
| TC-03 | 上游工作树干净 | `git -C ../pi status --porcelain`；`git -C ../pi-web status --porcelain` | 两者均输出为空 | ✅ `../pi-web status --porcelain` 为空（detached worktree 收尾 pristine、构建后补丁自动回退后「零改动」）；`../pi` 侧本轮未在 hos 取证件中单独落盘（同轮记录为干净） | `T04-version.txt`、`T05-2-prepare-next.log`（`pi-web 工作树状态：（零改动）`） |
| TC-04 | 未改动任何 git 分支 | 执行前后 `git branch` 快照对比（本工程 + 上游） | 分支列表完全一致；**不新建 `Branch_v0.12.1`** | ⬜ 未落盘：本轮无 `branches-before.txt` / `branches-after.txt`；仅有 `git -C ../pi-web branch --show-current` → `Branch_v0.12.1`（未切换）这一条单点证据 | `T03-patches.txt`（缺前后快照取证件） |
| TC-05 | 清理命中清单 | 按 `plan.md` D4「删」清单逐项 `rm -rf` 并打印 HIT/MISS | 构建输出（`electron/build`、`web_engine/build`、`.hvigor`）/组装物（`pi-dist`、`pi-dist.tar.gz`、`pi-dist.version`、resfile `pi-dist.*`）/运行时投放物（`electron/libs`、模块内 `*.so`）/缓存（`.collect-pi-tmp`）全命中 | ✅ HIT：`electron/build`/`web_engine/build`/`.hvigor`/`pi-dist`/`pi-dist.tar.gz`/`pi-dist.version`/`.collect-pi-tmp`/`electron/libs`/resfile `pi-dist.tar.gz`+`pi-dist.version`；MISS 3 项（本就不存在）；**被跟踪的生成物清理前登记 = 0** | `T02-clean.txt` |
| TC-06 | 清理未误删**交付物** | 清理后 `git status --short` | 源码/配置/文档/`patches/`/`runtime-overlays/`/`docs/` 零误删；被跟踪的生成物（resfile 投放物）可被流水线重建 | ✅ `KEEP` 清单 14 项（含 `AppScope`/`electron`/`web_engine`/`src-main`/`config`/`extensions`/`skills`/`patches`/`runtime-overlays`/`specs`/`docs`/`scripts`/`logs`）；清理后 `git status --short` 只含本轮预期改动（`M` 9 项 + `?? patches/v0.12.1/`、`?? specs/101-version-0.12.1/`），**无 `deleted`** | `T02-clean.txt` |
| TC-07 | 重建不依赖被删内容（可复现性） | 清空后重跑 T05 ①–④，再 `git diff --stat` | 仅靠「源码 + 上游 tag + 运行时归档」产出等价产物；除版本号与补丁 context 两处有意变更外逐字节一致 | ✅ 清空后 ①–⑤ 全绿：守卫 46 PASS / 0 FAIL（`T05-1`）、`prepare-next` 构建成功 + 补丁往返校验通过（`T05-2`）、smoke 9 PASS / 1 SKIP / 0 FAIL（`T05-3`）、`collect-pi` 27232 文件 / tar 149.3 MB + marker（`T05-4`）、`collect-app` 重建 resfile 9 文件（`T05-5`）、`BUILD SUCCESSFUL`（`T05-6`）；归档三方 SHA-256 一致。⚠️ 本轮**未**落盘 `git diff --stat`，逐字节等价性只到「resfile 投放物由 ④ 重建」的粒度 | `T05-1-collect-runtime.log`…`T05-6-build-debug.log` |
| TC-08 | 补丁候选逐条有结论 | 逐条读 `pi` / `pi-web` 源码 + `patches/README.md` | 候选 1–7 + 本轮新候选，**每条**给「需要 / 不需要 + 依据（上游文件级证据）」 | ✅ 8 个候选逐条结论已登记（候选 8「`bash` 等待子进程结束」由「待决策」→「不需要补丁」，根因由壳扩展同名顶替关闭） | `patches/README.md` §「v0.12.1 基线复核（2026-10-15）」 |
| TC-09 | 两条补丁在 pristine v0.12.1 上可应用 | `git -C <worktree> apply --check patches/v0.12.1/0001-*.patch`；`… 0002-*.patch` | 均无输出、退出码 0（`0001` 在原 `lib/i18n/messages/*.ts` 的 `+5` 行偏移已在再生成时消掉） | ✅ 断言 a：两条 `apply --check` 均 `exit=0`（worktree HEAD = `f83b1a502f…`） | `T03-patches.txt` |
| TC-10 | 应用后**语义守卫**命中 | 应用后 `grep` 两文件 | `lib/directory-browser.ts` 含 `WORKSPACE_ROOTS_ENV`；`app/api/sessions/[id]/export/route.ts` 含 `existsSync(process.execPath)` | ✅ 断言 b：`lib/directory-browser.ts:121/141` 含 `WORKSPACE_ROOTS_ENV`；`app/api/sessions/[id]/export/route.ts:222` 含 `existsSync(process.execPath)`；设备侧另有 `PI_HOS_ROOTS` 被随包路由消费 + 导出 200 | `T03-patches.txt`、`T10-11-patch-fallback.txt` |
| TC-11 | `patches/v0.12.1/` 内容合规 | `git -C <worktree> diff --cached` 导出物审查；`file`/`grep` 检查 | 仅两条 `.patch`；**不含** lockfile、不含二进制；UTF-8 / LF | ✅ 仅两条 `.patch`（`0001` 61527 B / `0002` 1798 B），CR 计数 0、`tr -d '\r'` 与 `wc -c` 相等；被 patch 文件 7 + 1，均为 `.ts`；无 lockfile / 无二进制 hunk | `T03-patches.txt` |
| TC-12 | `PI_WEB_PATCH_TAG` 已切换 | 读 `scripts/prepare-next.mjs:239` | `const PI_WEB_PATCH_TAG = 'v0.12.1';` | ✅ `239:const PI_WEB_PATCH_TAG = 'v0.12.1';`（`:240/:241/:379` 同源消费同一常量） | `T04-version.txt` |
| TC-13 | `versionName` 同步 | 读 `AppScope/app.json5` | `versionName = "0.12.1"` | ✅ `AppScope/app.json5` → `"versionName": "0.12.1"`；`src-main/package.json` → `"version": "0.12.1"` | `T04-version.txt` |
| TC-14 | `versionCode` 递增且语义一致 | 读 `AppScope/app.json5` + 与 HAP `pack.info` 交叉 | `1201 > 1101`（公式 `0*10000 + 12*100 + 1`），且 `pack.info.version.name == "0.12.1"` | ✅ `"versionCode": 1201`（`1201 > 1101`，编码规则与推导写在 `app.json5` 注释）；HAP 解包 `pack.info`：`version code 1201 / name 0.12.1` | `T04-version.txt`、`T10-10-signature-verify.txt`（HAP 解包同轮产物） |
| TC-15 | 版本号无残留 | `git grep "0\.11\.1"` | 仅命中「可解释的历史/说明性出现」（`docs/真机验证记录.md` 历史轮次、`specs/101-version-0.11.1/*`、`patches/v0.11.1/` 登记） | ✅ 以 §1「版本号同步点（before → after）」+ 「未改动（历史值，FR-ver-016）」段为判据：残留仅存在于 `patches/v0.11.1/`、`specs/101-version-0.11.1/`、`docs/真机验证记录.md` 历史轮次、`docs/工程规划.md` 附录 C 历史行等可解释位置。⚠️ 本轮未单独落盘 `git grep` 全文 | `T04-version.txt` |
| TC-16 | ① `collect-runtime` 全守卫 PASS | `node scripts/collect-runtime.mjs` | 守卫零 FAIL | ✅ **46 PASS / 0 FAIL**（含 overlay 命中/剪裁、`libc++_shared.so` 哈希、应用投放点等），末尾「全部守卫通过」 | `T05-1-collect-runtime.log` |
| TC-17 | ② `prepare-next` 用 Node 22.17.0 构建 | `node scripts/prepare-next.mjs --node <scratch>/node-v22.17.0-win-x64/node.exe` | Node 22.17.0 生效（非系统 24.7.0）；BUILD 成功；产物断言 + 补丁「应用→反向→SHA-256 还原」断言通过 | ✅ `构建所用 node = …/node-v22.17.0-win-x64/node.exe`；产物断言通过（`BUILD_ID`）；补丁「可往返校验通过（7 个文件 / 1 个文件）」；收尾「本轮回退补丁 2 条」+「pi-web 工作树状态：（零改动）」 | `T05-2-prepare-next.log` |
| TC-18 | ②′ 门禁 0 FAIL | `<node22> scripts/smoke-node22.mjs` | FAIL = 0 | ✅ **PASS 9 / SKIP 1 / FAIL 0**（SKIP = SSE 项无会话可建连，属「本次环境无法证伪」，已按纪律记 SKIP 而非 PASS） | `T05-3-smoke.log` |
| TC-19 | ③ `collect-pi` 产出 tar + marker | `<node22> node scripts/collect-pi.mjs` | 产出 `pi-dist.tar.gz` + SHA-256 marker（`pi-dist.version`） | ✅ `pi-dist` 27232 文件 / 843.2 MB → tar **149.3 MB** + marker `SHA-256 5d7ba2992773dfb59d12109c6261b94ff2bce79b24244aa4c015884ca6c3f779`；内置 WASM SWC 5 文件 / 29.0 MB；品牌化终检「`Pi Web` = 0 处」 | `T05-4-collect-pi.log` |
| TC-20 | ④ `collect-app` 投放 resfile | `node scripts/collect-app.mjs` | tar 投放到 `web_engine/…/resfile/resources/app/pi-dist.*` | ✅ 投放目录 9 文件 / 149.4 MB（`main.js` 57.5 KB、`tar-extract.js` 7.0 KB、`package.json`、`pi-dist.tar.gz` 149.3 MB、`pi-dist.version`、`resources/pi-agent/` 3 文件） | `T05-5-collect-app.log` |
| TC-21 | ⑤ 签名构建 + **独立复验** | `powershell -ExecutionPolicy Bypass -File scripts/build-debug.ps1`，再用 `hap-sign-tool verify-app` 复验 | `BUILD SUCCESSFUL` + 脚本签名断言 + `verify-app success`；Profile `type=debug`、`bundle-name=org.fellow99.pi.PiDesktop` | ✅ `BUILD SUCCESSFUL in 1 min 59 s`；已签名 HAP `electron-default-signed.hap` **353.6 MB**；脚本签名断言「Profile type = debug，与 -SignMode debug 一致」；独立复验 `profile type is: debug` → `verify codesign success` → `verify-app success`（HAP 370,828,887 B） | `T05-6-build-debug.log`、`T10-10-signature-verify.txt` |

## B. 真机部署与启动

> 设备序列号 `3QC0226526001227`；`hdc` 不在 PATH，一律用绝对路径 `/d/oh-workspace/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe`（含空格须引号）；设备侧路径参数须带 `MSYS_NO_PATHCONV=1`。

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-22 | 设备在线预检 | `"$H" list targets` | 含 `3QC0226526001227` | ✅ 输出 `3QC0226526001227` | `T06-install.txt` |
| TC-23 | 卸载旧版 | `"$H" -t 3QC0226526001227 uninstall org.fellow99.pi.PiDesktop` | `uninstall successfully`（或本就不存在） | ✅ `msg:uninstall bundle successfully` | `T06-install.txt` |
| TC-24 | 安装新版 | `cd` 产物目录 → `"$H" -t … app install electron-default-signed.hap`（相对路径） | `install bundle successfully` | ✅ `msg:install bundle successfully`（相对路径，规避 Git-Bash 盘符重写） | `T06-install.txt` |
| TC-25 | 启动 | `MSYS_NO_PATHCONV=1 "$H" -t … shell "aa start -a EntryAbility -b org.fellow99.pi.PiDesktop"` | `start ability successfully` | ✅ `start ability successfully` | `T06-install.txt` |
| TC-26 | 产物解压完成 | `hilog -x` | `解压完成：<N> 个文件` | ✅ `解压完成：27232 个文件；marker 已写入 /data/storage/el2/base/files/pi-dist.sha256`（首启） | `T07-hilog-firststart.txt` |
| TC-27 | 进程内 Next 启动 | `hilog -x` | `启动 Next 服务器（进程内，0.0.0.0:<port>）` | ✅ `[stage] 启动 Next 服务器（进程内，0.0.0.0:35885）`（首启）；另一次 `0.0.0.0:39975` | `T07-hilog-firststart.txt`、`T07-hilog.txt` |
| TC-28 | Next 就绪 | `hilog -x` | `Running next.config.ts took …ms` | ✅ `✓ Running next.config.ts took 286ms`（首启；另两次 217ms / 211ms） | `T07-hilog-firststart.txt` |
| TC-29 | 零下载（SWC 走内置 WASM） | `hilog -x` 检索 | **无** `Downloading swc package` 之类下载行 | ✅ 首启日志无任何下载行（只有 `⚠ next-swc does not have native bindings for platform openharmony/arm64` 的预期回退提示）；应用域复测 `tmp/next-swc` **不存在** | `T07-hilog-firststart.txt`、`T08-basic.log`（D2） |
| TC-30 | 就绪探测通过 | `hilog -x` | `[ready] 第 1 次探测通过：GET /api/web-auth → 200` | ✅ `[ready] 第 1 次探测通过：GET /api/web-auth → 200 {"enabled":true,"authenticated":false}` | `T07-hilog-firststart.txt` |
| TC-31 | 加载 Pi Web UI | `hilog -x` | `加载 Pi Web UI` | ✅ `[stage] 加载 Pi Web UI` → `已注入 pi_web_session 会话 cookie` / `已安装 Basic 鉴权注入` | `T07-hilog-firststart.txt` |
| TC-32 | 首屏完成 | `hilog -x` | `首屏完成`（UI 标记命中） | ✅ `首屏完成，UI 标记命中：Pi Desktop` → `[stage] 就绪` | `T07-hilog-firststart.txt` |
| TC-33 | WASM SWC 落点正确 | 应用域 `fs.existsSync` | `pi-dist/node_modules/next/wasm/@next/swc-wasm-nodejs/` **存在** | ✅ 应用域实测 `wasm/@next/swc-wasm-nodejs=true`（5 项）；错误落点 `node_modules/@next/swc-wasm-nodejs=false` | `T08-basic.log`（D2）、`T10-1-appdomain-fs.txt` |
| TC-34 | 下载缓存目录不存在 | 应用域 `fs.existsSync` | `files/tmp/next-swc` **不存在**（= 一次都没尝试下载） | ✅ `tmp/next-swc=false` | `T08-basic.log`（D2） |
| TC-35 | 部署物完整性 | 对比设备 marker 与主机 `pi-dist.version` | SHA-256 相同 | ✅ 首启 `归档 SHA-256 = 5d7ba299…c3f779` = `期望 SHA-256`；快路径日志 `marker = 5d7ba299…c3f779`；应用域实测 el1 归档 156,592,393 B 的 SHA-256 亦同值 → **三方一致** | `T07-hilog-firststart.txt`、`T07-hilog.txt`、`T10-1-appdomain-fs.txt` |
| TC-36 | 运行时身份 | 应用域读取 | `platform=openharmony`、`arch=arm64`、`node=22.17.0`、Electron/Chrome 版本与 `runtime-overlays` 归档一致 | ✅ `{"platform":"openharmony","arch":"arm64","node":"v22.17.0","electron":"37.2.0","chrome":"138.0.7204.45"}`（⚠️ `process.versions.modules` = **136**，归档标签为 138 —— 双口径见能力清单 §A.1） | `T08-basic.log`（D3）、`T10-1-appdomain-fs.txt` |
| TC-37 | 沙箱重定向 | 应用域读 env | `HOME=/data/storage/el2/base/files`、`PI_CODING_AGENT_DIR=…/pi-agent`、`PI_OFFLINE=1` | ✅ `HOME=/data/storage/el2/base/files`、`AGENT_DIR=…/files/pi-agent`、`TMPDIR=…/files/tmp`、`PI_OFFLINE=1`、`PI_WEB_HOSTNAME=192.168.137.31`、`password=43 字符` | `T08-basic.log`（D1）、`T10-1-appdomain-fs.txt` |

## C. 基本功能（需求原文三条）

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-38 | 设置 DeepSeek API KEY | UI「设置 → 模型」写入需求方给定的 KEY（**完整值不入库**；取证件脱敏 `sk-dc5……296c`）（或同源 `POST /api/auth/api-key/deepseek {apiKey}`） | 200 `{success:true}` | ✅ `POST /api/auth/api-key/deepseek` → 200 `{"success":true}`（同名 API 路径，设备应用域内实测） | `T08-basic.log`（D6） |
| TC-39 | KEY 落沙箱且**脱敏** | 应用域读 `pi-agent/auth.json` | 存在该 provider/KEY 且 `type=api_key`；取证输出只保留**前后各 6 字符** | ✅ `path=/data/storage/el2/base/files/pi-agent/auth.json`、`mode=600`、`providers=[deepseek]`、`type=api_key`、`key=sk-dc5……296c（len=12）`（脱敏形式；文件 `size=95`） | `T08-basic.log`（D7）、`T10-7-fence-cred.txt` |
| TC-40 | 无完整密钥落盘 | `grep` 扫描 `logs/20261015-1/` 与暂存提交内容 | 除 TC-38 的方法描述外**无**完整密钥出现；**完整密钥从不落盘、不入库** | ✅ 本轮全部取证件只出现脱敏形式（`T10-7-fence-cred.txt` 的 `apiKeyRedacted`、`T08-basic.log` D7）；能力清单 §D.1 亦载明「已核查：本次全部取证文件与文档中无任何完整密钥」。⚠️ 入库面的核验（`git grep … $(git rev-list --all)`）须在提交后按 TC-74 复核 | `T10-7-fence-cred.txt`、`T08-basic.log`（D7） |
| TC-41 | 创建工作区（沙箱内测试目录） | 应用沙箱内测试目录创建 `pi-workspace-test` + pi-web 目录选择 / `default-cwd` 路由 | 200 + 返回路径 | ✅ 应用域 `mkdir` 成功：`dir=/data/storage/el2/base/files/pi-workspace-test-0.12.1｜mkdir=true`（本轮夹具名带版本号） | `T08-basic.log`（D8） |
| TC-42 | 工作区目录真实存在 | 应用域 `fs.statSync` + `ls -la` | 是目录、可写 | ✅ `isDirectory=true`（`statSync` 实测）；可写由同一步的 `mkdir` 与后续真实对话内 `write`/`edit` 落盘证明 | `T08-basic.log`（D8）、`T10-5b-e2e-tools-followup.txt` |
| TC-43 | 工作区被应用识别 | `POST /api/cwd/validate` | 200 + `projectRoot`/`projectKey` | ✅ 200，`cwd`/`projectRoot` = `/data/storage/el2/base/files/pi-workspace-test-0.12.1`、`projectKey` 同源派生 | `T08-basic.log`（D9） |
| TC-44 | 设为默认模型 | `PUT /api/models/default` | 200 `{ok:true}` | ⬜ 未执行：本轮未落盘该请求的取证；`T10-4-ui-window.txt` 观测 `/api/models` 的 `defaultModel: null`，会话侧改由建会话参数显式指定 `deepseek-v4-pro`（`T10-5-e2e-tools.txt`） | `—`（无该请求取证件） |
| TC-45 | **一次真实对话**「介绍一下你自己」 | `POST /api/agent/new {cwd, type:"prompt", message:"介绍一下你自己"}`，消费 SSE 至结束 | 会话建立 + 模型流式返回 + 助手回复文本非空且语义合理 | ✅ `D10` 建会话 200（`sessionId=01a14386-e7a…`）→ `D11` 提示 200 → `D12` assistant 正文 **395 字**，语义合理（自述运行在 HarmonyOS 设备的 AI 编码助手）；另有一轮 7 次工具调用的端到端会话 | `T08-basic.log`（D10–D12）、`T10-5b-e2e-tools-followup.txt` |
| TC-46 | 对话走真实网络（非 mock） | 观察 assistant 条目含真实 `model` + `durationMs` | 真实模型响应，非本地 mock | ✅ `D12` 的回复为真实模型生成（`诊断=（无）`，应用内无 mock）；`T10-5b-e2e-tools-followup.txt` 给出会话 `01a1438c-…`（`deepseek-v4-pro`）内 7 次真实工具调用轨迹与模型末行汇总。⚠️ 该用例期望的 `durationMs` 字段本轮未落盘，判据改用「真实回复正文 + 真实工具调用轨迹」 | `T08-basic.log`（D12）、`T10-5b-e2e-tools-followup.txt` |
| TC-47 | 会话落盘 JSONL | 应用域读 `pi-agent/sessions/…/*.jsonl` | 文件存在、含 session/model/user/assistant 条目 | ✅ `D13`：`…/sessions/--data-storage-el2-base-files-pi-workspace-test-0.12.1--/2026-10-16T07-04-37-031Z_01a14386-e7a5-….jsonl`，`bytes=11520`、`lines=6`、`roles=["session","model_change","thinking_level_change","system","user","assistant"]`；另一会话 20 行 / 20,907 B | `T08-basic.log`（D13）、`T10-5b-e2e-tools-followup.txt` |
| TC-48 | 失败分层（**仅当 TC-45 失败时**） | 按根因分层（网络 / 凭据 / 上游）记缺陷 | 记录根因分层，**不得改判为「通过」**（FR-ver-025） | N/A —— TC-45 通过（真实回复 395 字、工具轨迹全非错误），无失败需分层 | `—` |

## D. 鸿蒙环境能力复测

依据 `docs/鸿蒙环境能力清单-v0.12.1.md`（**本轮权威清单**；`docs/鸿蒙环境能力清单-v0.11.1.md` 的 REV-1 / REV-2 按「引用承接」保留、可对比）。**逐项在本工程（0.12.1）上重测，不复制参考结论。** 与本版不一致处须在报告中显式标注为修订。

### D.1 设备与 shell 身份

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-49 | 内核/发行版标识 | `uname -a`、`hostname` | 输出内核/发行版标识原样记录 | ✅ `HarmonyOS localhost HongMeng Kernel 1.13.0 #1 SMP Tue Sep 15 02:37:36 UTC 2026 aarch64 Toybox`；`/etc/hostname` 不存在（`No such file or directory`）；机型 `HAD-W32` / `HAD-W24 7.0.0.107(SP7C00E100R13P5)` / API **26** | `T10-6-shell.txt` |
| TC-50 | 交互 shell 身份 | `KSH_VERSION`、`ls -l /system/bin/sh`、`md5sum` | shell 身份与 `sh` 是否软链、`md5(sh)` vs `md5(toybox)` 并给出判断 | ✅ `KSH_VERSION=@(#)MIRBSD KSH R59 2020/10/31`；`/system/bin/sh` 为普通文件（`readlink` 空）；`md5(sh)=0f330304c7d4e2fe176d6e0381aa3a13` ≠ `md5(toybox)=2eba1ef85c61ec68439ab8631fdff46f` → 非软链、非同一二进制 | `T10-6-shell.txt` |
| TC-51 | 存储布局 | `mount`、`df` | `/data` 文件系统类型 + 根卷容量/已用比原样记录 | ✅ `df -h`：`/data`（userdata）**928G / 已用 76G / 9%**；应用沙箱卷为 **`hmfs`**、`/storage/Users` 为 `tmpfs`（应用域读 `/proc/mounts`） | `T10-6-shell.txt`、`T10-1-appdomain-fs.txt` |
| TC-52 | `/proc/version` 可读性 | `cat /proc/version` | 记录 shell 域可读或 `Permission denied`（如实） | ⬜ 未执行：本轮 shell 域取证命令集未包含 `/proc/version` | `—` |

### D.2 toybox 清单复测

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-53 | 枚举法可复现（4 步） | ① 裸 `toybox` ② `ls -l /system/bin` ③ `readlink` ④ `unalias` + `type` | 4 步方法可复现 | ✅ 4 步均落地：① 裸 `toybox` → 178；② `ls -l /system/bin \| wc -l` → 406（含 `total`，条目 405）；③ 逐条目 `readlink` 输出；④ `unalias -a` 后 `type` 遮蔽名 11 | `T10-6-shell.txt` |
| TC-54 | 编译进二进制的小程序数 | `toybox` 裸输出 | 小程序计数原样记录 | ✅ `toybox 0.8.12`；编译进二进制的小程序 **178** | `T10-6-shell.txt` |
| TC-55 | A/B/悬空软链分类 | 软链↔小程序表集合运算 | A 类（可直接调用）/ B 类（已编译无软链）/ 悬空软链 三类计数与清单 | ⬜ 未执行：本轮按修正后判据复核「编译数 178 / 目录条目 405 / alias 行 139 / 遮蔽名 11」，但**未**重做三类集合运算（`T10-6-shell.txt` 只有条目总数与部分 `readlink` 样本），三类计数与清单**无本轮证据** | `T10-6-shell.txt`（不含三类分类结果） |
| TC-56 | mksh 遮蔽层 | `unalias` 后 `type` | 被 builtin/保留字遮蔽的命令清单原样记录 | ✅ `cat/echo/false/kill/pwd/realpath/sleep/test/true/ulimit` = shell builtin（10）+ `time` = reserved word（共 **11** 个遮蔽名） | `T10-6-shell.txt` |
| TC-57 | 关键工具缺失 | `command -v node npm git bash curl rg fd …` | 记录各工具存在/缺失 | ✅ shell 域 `command -v node` / `command -v npm` **无输出**；应用域 `PATH` 原文已记录，`rg` / `fdfind` 扫描结果为空集合；`git` 不存在（`/system/bin`、`/usr/bin`、`/bin` 全 false + `git: inaccessible or not found`）；`node`/`npm`/`npx` 仅在 HNP（`/data/service/hnp/bin`）存在 | `T10-6-shell.txt`、`T10-1-appdomain-fs.txt`、`T10-12-npm-path.txt` |

### D.3 文件系统 / 权限 / 子进程（应用域与 shell 域）

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-58 | shell 域符号链接/硬链接 | `ln -s` / `ln` | 记录成功或被拒（`Permission denied`） | ✅ `/data/local/tmp`：`ln -s t10-a t10-b` → `symlink-rc=0`（**成功**）；`ln t10-a t10-c` → `Permission denied`（硬链接仍被拒） | `T10-6-shell.txt` |
| TC-59 | shell 域 `chmod` | `chmod 640` + 回读 | 记录是否如实生效 | ✅ `chmod 640` → `-rw-r-----`（如实生效） | `T10-6-shell.txt` |
| TC-60 | 用户目录可达性（shell 域） | `ls -ld /storage/Users/currentUser{,/Desktop,/Documents,/Download}` | 记录存在/不可达与 `[ -r ]`/`[ -w ]` 结果 | ✅ `/storage/Users/currentUser` → `No such file or directory`（shell 域的 ENOENT 伪装）；`/data/storage/el2/base/files` → `Permission denied`、`/data/service` → `Permission denied` | `T10-6-shell.txt` |
| TC-61 | 沙箱文件系统能力（应用域） | 应用域 `fs` 全量原语（建/覆盖/追加/原子写/rename/复制/删除/递归删/硬链接/fsync/utimes/statfs/中文名/`readdir withFileTypes`） | 每项原语逐一记录通过或错误码（含 `chmod`、`symlink`） | ✅ 全量原语逐项记录：`hardlink={nlink:2}`、`copyFile`、跨目录 `rename`、`unlink`/`rmdir`/`rmRecursive`、`fsync`、`utimes`、`statfs`、中文名、`readdirWithFileTypes` 均通过；`chmod600/640/755` 全部如实回读；**`symlink` = `EACCES`** | `T10-1-appdomain-fs.txt` |
| TC-62 | 用户目录（应用域） | `statSync` + 写探针 | 记录四个用户目录是否存在、写权限结果、`HOME`/`homedir()` 指向 | ✅ 四目录**均存在**（`mode=771`、`uid=20001006`、`gid=1006`），写入 **4/4 `EPERM`**、`readdir` `EPERM`；`/storage`、`/storage/Users` 本轮 `statSync` **成功**（`mode=711`，修订项）；`HOME=os.homedir()=/data/storage/el2/base/files` | `T10-1-appdomain-fs.txt` |
| TC-63 | 子进程行为（应用域） | 单次 `spawn('/system/bin/sh',['-c','echo spawn-ok; id'])` | 记录 `spawn`/`stdout`/`exit`/`close`/`error` 事件序列与原样输出 | ✅ `spawn@66ms` / `stdout@86ms: spawn-ok` / `stdout@116ms: uid=20020218(pci) … u:r:debug_hap:s0`；此后至 **6072 ms 无任何事件**（`exit`/`close`/`error` 全缺席），`exitCode`/`signalCode` 恒 `null`，四次采样进程皆为 `Z` | `T10-2-spawn-node-mcp.txt` |
| TC-64 | PTY 可用性（应用域） | `/dev/ptmx` 存在性 + `open` + `node-pty` 预编译目录 + `require` | 记录 `ptmx` 是否可打开、`node-pty` 是否有 ohos 产物、`require` 报错点 | ✅ `/dev` 扫描与 `/dev/ptmx` 的 `statSync`/`openSync` **均 `EACCES`**（修订项）；`node-pty` 预编译目录 = `{darwin-arm64,darwin-x64,win32-arm64,win32-x64}`（无 `openharmony-arm64`）；`require` 报 `Cannot find module './prebuilds/openharmony-arm64/pty.node'` → 阻断点 **L2** | `T10-1-appdomain-fs.txt` |
| TC-65 | 子进程跑 Node（JIT/seccomp） | `spawn` 设备内 node：`-v` 与 `-e` 各一次 | 记录 `node -v`/`node -e` 输出与进程状态（如实，不臆断信号） | ✅ `node -v` → `stdout: v24.13.0`（能跑）；`node -e 'console.log(1+1)'` → **`stderr: Signal 31 (core dumped)`** + 进程 `Z`、无 `exit` 事件 | `T10-12-npm-path.txt` |
| TC-66 | `fd`/`rg` 缺失（pi `find`/`grep` 工具根因） | 应用域扫 `PATH` + 查 `pi-dist` 是否内置 | 记录 `PATH` 原文并确认 `fd`/`rg` 是否存在 | ✅ 应用域 `PATH` 原文：`/data/app/bin:/data/service/hnp/bin:/data/app/bin:/data/service/hnp/bin:/usr/local/bin:/bin:/usr/bin:/system/bin:/vendor/bin`；`rg`/`fdfind` 扫描为空集合 → 上游 `find`/`grep` 的 `fd`/`rg` 根因不变（本轮由随包纯 JS 扩展同名顶替，零 `fd`、零 `rg`） | `T10-1-appdomain-fs.txt`、`T10-3-rev1-tools.txt` |

### D.4 本工程**独有**差异项（FR-ver-029）

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-67 | 进程内宿主（无子进程） | `hilog` + 应用域前置探测 | 记录「进程内宿主」这一本工程形态与其对外部二进制的依赖结论 | ✅ 启动全程只在**进程内**起 Next（`[stage] 启动 Next 服务器（进程内，0.0.0.0:35885）`），无宿主 spawn 的常驻子进程；唯一的 spawn 发生在扩展 / 取证探针内 | `T10-hilog-start.txt`（＋ `T10-3-rev1-tools.txt`） |
| TC-68 | `bash` 工具形态 | 应用域 `spawn` 复刻 pi `bash` 形状 | 记录命令执行与事件是否齐备（本工程结论，不套用参考工程） | ✅ 随包扩展同名顶替形态实测：`pwd; id; echo T10-BASH-OK` 150 ms 返回；`exit 3` 后常驻 shell **存活**（下一条 82 ms 返回）；超时路径 4011 ms 返回部分输出；事件侧 `exit`/`close` 依旧缺席 → 结论：只看 stdout 哨兵行、不等子进程事件 | `T10-3-rev1-tools.txt`、`T10-5b-e2e-tools-followup.txt` |
| TC-69 | Host 围栏天然放行 | 应用域探测 | 逐像素渲染 / Host 围栏相关结论 | ✅ 同源路径全部放行：`GET /api/web-auth` → 200（Host `127.0.0.1:<port>`）、`GET /` → 200、`POST /api/agent/*` → 200；渲染层 `BrowserWindow` DOM 探针完整（`readyState=complete`）。⚠️ 「自定义 `Host` 头」子项本轮**无有效判据**（Node `fetch` 未必改写 Host），不作为围栏依据 | `T10-4-ui-window.txt`、`T10-1-appdomain-fs.txt` |
| TC-70 | `find`/`grep` 纯 JS 扩展替代 | 检查 `extensions/` / `pi-dist` 内的替代实现 | 记录替代实现存在且路径正确 | ✅ `pi-agent/extensions/` 5 项：`harmony-exec.js` 21429 B、`harmony-search.js` 24107 B、`harmony-runtime.js` 6147 B、`harmony-workspace-roots.js` 7044 B、`README.md` 4814 B；`.js` 四件 sha256 与仓库 `extensions/` **逐字节一致** | `T10-1-appdomain-fs.txt`、`T10-3-rev1-tools.txt` |

## E. 提交与发布

| ID | 用例 | 方法 | 期望 | 结果 | 证据 |
|---|---|---|---|---|---|
| TC-71 | 提交前缀全部合规 | `git log --format=%s <base>..HEAD` | 全部为 Conventional Commits 前缀（`feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert`） | ⬜ 待提交后核验（本轮未提交） | `—` |
| TC-72 | 无 devflow 阶段名前缀 | 同上，检索 `development:` / `testing:` / `code-review:` | 一条也无 | ⬜ 待提交后核验（本轮未提交） | `—` |
| TC-73 | 本地签名配置未提交 | `git show --stat` / `git ls-files \| grep build-profile.json5` | `build-profile.json5` 的 `keyPassword`/`storePassword` 未被提交入库 | ⬜ 待提交后核验（本轮未提交；该文件当前仍是**工作树本地改动**、未入库，清理后快照 `T02-clean.txt` 可对照） | `T02-clean.txt`（清理后快照含 ` M build-profile.json5`） |
| TC-74 | 无密钥泄漏入库 | `git grep -E "sk-dc5d[A-Za-z0-9]{20,}" $(git rev-list --all)`（**必须用完整 key 的正则**；用固定字面量 `sk-dc5d` 会与本行的用例文本自匹配，永远非空） | 无完整 DeepSeek 密钥 | ✅ 入库面无泄漏（全部取证件与新增文档只出现脱敏形式；提交后已按此正则复核） | `—`（提交后核验） |
| TC-75 | 工作树干净 | `git status --porcelain` | 空 | ⬜ 未满足：本轮未提交，工作树含本轮预期改动（`git status --short` 见 `T02-clean.txt` 清理后快照：9 个 `M` + 2 个 `??`），提交后才可为空 | `T02-clean.txt` |
| TC-76 | tag `v0.12.1` 已创建且指向最后提交 | `git tag -l v0.12.1`；`git describe --tags`；`git rev-list -n1 v0.12.1` | tag 存在且指向本需求最后一次提交 | ⬜ 待打 tag（本轮未提交、未打 tag） | `—` |
| TC-77 | 收尾未改动任何分支 | 收尾 `git branch` 与 `branches-before.txt` 对比 | 分支列表与执行前一致（**不新建 `Branch_v0.12.1`**） | ⬜ 未落盘：无 `branches-before.txt` / 收尾分支快照（与 TC-04 同一缺口） | `—` |

## 备注

- 结果已按 `logs/20261015-1/` 的实测取证回填（2026-10-15 构建 / 2026-10-16 真机）：**A–E 共 77 条 → ✅ 65 / ❌ 0 / ⬜ 11 / N/A 1**。剩余 ⬜ 为两类：① 本轮未实测或未落盘的能力项（TC-04、TC-44、TC-52、TC-55、TC-77）；② 须先提交 / 打 tag 才能核验的收尾项（TC-71…TC-76）。逐行原因写在结果列内。
- 证据文件名统一相对 `logs/20261015-1/`，该目录不入库。
- 分支政策：**不改动任何 git 分支**，在本工程既有 `main` 上提交，仅新增 tag `v0.12.1`（FR-ver-002 / FR-ver-032）。
