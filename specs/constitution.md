# constitution.md — pi-desktop-hos 项目宪法

> 本文件是 **Pi Desktop · Electron on HarmonyOS 版** 的不可协商原则，位于父工程
> [`../../specs/constitution.md`](../../specs/constitution.md) 之下。
> 技术事实以 `../docs/工程规划.md` 与源码为准；编号/分工以父工程宪法为准。

---

## 1. 架构原则

1. **零上游改动**：不 fork `pi` / `pi-web` / `harmonypc-electron`；补丁只允许按 tag 归档、幂等可逆。
2. **进程内宿主**：`pi-web` 的 Next 服务器跑在 Electron 主进程内（Node 22.17.0）；不引入子进程 Node。
3. **同源数据面**：渲染进程只通过 `http://<host>:<port>/` 访问 SPA 与 `/api/*`；无 CORS、无自定义协议、无 IPC 数据载体。
4. **薄壳**：壳只做启动编排、环境装配、窗口、平台能力、生命周期、错误可见；业务留在上游。
5. **失败可见**：启动阶段、错误页、日志、诊断入口至少有一个可观测；不允许静默降级/白屏。
6. **单实例 + 随机端口**：单实例是端口与数据目录唯一性的前提；端口先探后用并回传。

## 2. 安全原则

1. **随机密码 + 凭据注入**：服务绑定局域网随机端口时，必须生成随机强密码，并同时注入 Basic 与派生会话 Cookie（覆盖 `/api/*`、SSE 与页面导航）。
2. **密码不入日志**：日志只报长度/指纹；不得回显 `PI_WEB_PASSWORD`。
3. **生产无调试入口**：release HAP 不得带 `--inspect` / remote debugging；DevTools 仅 debug。
4. **导航加固**：主框架只允许同源；外链走系统浏览器/外链中转页；禁止内嵌任意网页。
5. **最小权限**：权限声明面必须有调用点；ACL 按包名申请，获批后写入发布 Profile。
6. **签名材料不入库**：证书/口令/Profile 只在本机或 CI secrets。

## 3. 兼容与形态

1. **运行时固定**：Electron-on-HarmonyOS 37.2.3 / Node 22.17.0 / ABI 138；升级必须走 `011` 并重跑门禁。
2. **系统能力如实呈现**：PTY、系统 git、托盘等缺口必须标注 `unsupported` 或文档说明，不伪造成功。
3. **纯 JS 顶替**：无系统 `bash`/`find`/`grep`/`git` 时，使用随包扩展同名顶替，并保留失败语义。
4. **平台差异显式化**：Windows/macOS/Linux 与鸿蒙的差异必须写入文档与测试用例。

## 4. 构建与版本

1. **五阶段流水线**：`collect-runtime → prepare-next → smoke-node22 → collect-pi → collect-app`，再 hvigor 构建/签名。
2. **上游钉住**：`pi` v1.2.0 / `pi-web` v0.12.1；补丁按 `patches/v0.12.1/`。
3. **版本号**：`0.12.1` / `versionCode` `1201`（`major*10000 + minor*100 + patch`），严格递增。
4. **门禁**：`smoke-node22` 0 FAIL；collect-runtime 守卫；补丁幂等可逆；品牌 0 残留；HAP 可签名安装。
5. **证据**：真机记录、日志、HAP 哈希、run id 必须可追溯；历史记录不回改。

## 5. 文档与提交

1. **父/子分工**：父工程写整体与公共需求；本工程写实现与独立需求。
2. **成对交付**：模块 `spec.md` + `plan.md` 必须成对；`plan.md` 回引 FR。
3. **源码即真理**：结论必须可追溯到源码/配置/真机证据；冲突时以源码为准并回改文档。
4. **提交前缀**：只允许 Conventional Commits（feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert）。
5. **评审**：按 `requesting-code-review` → `receiving-code-review` 流程；Critical 立即修，Important 合并前修。
