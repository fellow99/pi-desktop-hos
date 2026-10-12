# extensions/ — 壳专用扩展（PL1 本地源）

本目录存放 **Pi Desktop 壳专用**的 pi 扩展源码。构建期由 `scripts/collect-pi.mjs`
打进 `pi-dist/resources/pi-agent/extensions/`；运行期由 `src-main/main.js` 的产物解压
引导把它们 **copy 物化**（**禁用 symlink**，应用域 `EACCES`）到

```
<userData>/pi-agent/extensions/
```

pi 会**自动扫描**该目录（直接 `*.ts` / `*.js` 文件，以及一层子目录里的 `index.ts` /
`index.js`），因此**不需要**在 `settings.json` 里声明 `extensions` 数组。少一处声明，
就少一处升级时可能漂移的地方。

## 目录内容

| 文件 | 作用 |
|---|---|
| `harmony-exec.js` | **顶替内建 `bash`**。常驻非 PTY `/system/bin/sh`（mksh R59）+ **随机哨兵行协议** —— 结束判定只看 stdout 的哨兵行，不依赖本平台永不送达的 `exit`/`close` 事件。默认 120 s 超时（**超时仍返回已产出的输出**）、stderr 合并、命令 stdin 为 `/dev/null`、输出 256 KiB 截断、常驻 shell 死亡后自动重启；重置时杀**整个进程组**（被超时/中止的命令的子进程不会污染后续结果）。详见 `specs/102-harmony-js-tools/`。 |
| `harmony-search.js` | **顶替内建 `grep` 与 `find`**。纯 JS 迭代式 BFS 遍历（零子进程、零外部二进制），因为内建版本分别需要设备上不存在的 `rg` / `fd`。输出形如 `<path>:<行号>: <内容>`；支持 `*` / `?` / `**` / `{a,b}` / `[0-9]`；`find` 用智能大小写（与 fd 默认一致）；所有上限（结果数/文件数/单文件字节/深度/单行字符数）**触顶时都在输出里显式说明**。 |
| `harmony-runtime.js` | 壳专用扩展。提供 `/harmony-info` 命令（打印运行时事实与工具可用性），并在 `session_start` 校验 `/system/bin/sh` 存在性（只警告、不抛错）。同时充当「PL1 扩展通道是否生效」的自检探针。 |

宿主侧回归测试：`node scripts/test-harmony-tools.mjs`（33 条断言，零设备运行，只覆盖纯 JS 的搜索扩展；
执行扩展需要设备上的 `/system/bin/sh`，由 `docs/真机验证记录.md` 轮次 3/3b 的真机用例覆盖）。

## 与 dsh / oc 的分工对照

参考工程 `dsh-desktop-hos` 把「壳专用插件」放在工程内 `plugins/harmony-plugin-*/`，
并在**两处**（`src-main/main.js` 与 `scripts/collect-dsh.mjs`）各维护一份 preset 行表，
漏改一处就会出现「编译期毫无反应、只有会话创建失败」的隐蔽故障。

**pi 不需要那张表。** pi 的扩展发现是纯粹的目录扫描，没有 preset 挂载这一层，因此：

- 新增一个壳专用扩展 = **本目录加一个文件** + 重跑 `collect-pi.mjs`。
- 没有需要镜像维护的第二张表，也就没有「两处不一致」这类故障模式。

这是本工程相对参考工程的一处**结构性简化**，不要为了"对齐参考工程"而重新引入声明表。

## 编写新扩展

最小形态是一个导出默认工厂的单文件：

```js
export default function myExtension(pi) {
  pi.registerCommand("my-command", {
    description: "一句话说明",
    handler: async (args, ctx) => {
      if (ctx.hasUI) ctx.ui.notify("hello", "info");
    },
  });
}
```

要点（均来自 pi 的扩展契约，见上游 `packages/coding-agent/docs/extensions.md`）：

1. **工厂可以为 async**；pi 会等它返回后才继续启动。
2. **不要在工厂里启动进程、socket、watcher 或定时器。** pi 有不启会话就加载扩展的
   调用路径（`pi --help` 等），在工厂里起长驻资源会在那些路径上泄漏。长驻资源请在
   `session_start` 里起、在幂等的 `session_shutdown` 里释放。
3. 本扩展运行在 **pi 进程内**，拥有与应用相同的操作系统权限。只做需要做的事。
4. 需要新增**模型可调用**的工具时用 `pi.registerTool()`；需要给模型看的指令性内容
   应该写成**技能**（`skills/`）而不是扩展。

## 可用性硬约束（设备侧）

写扩展时**不要依赖**以下能力，它们在设备上不可用：

- 启动子进程跑 JS（`node -e` / `node script.js` → `Signal 31` SIGSYS）
- `npm` / `npx` / `git` / `python` / `curl`（设备上没有，也不在应用 `PATH` 上）
- 原生 `.node` 模块（无 aarch64-ohos 产物；`electron/libs/arm64-v8a/` 的既有做法不适用于本工程）
- PTY（SELinux 拒绝 `forkpty`/`openpty`）

纯 JavaScript、`node:fs`、`node:worker_threads`、WebAssembly 都可用。

## 与工程规划的对应

- 插件机制三档（PL0/PL1/PL2）与 v1 默认档：`docs/工程规划.md` §5.2、§5.3
- 壳专用扩展/技能/子 agent 的落点表：§5.4
- 扩展的权限模型（project trust 是唯一门禁）：§5.1
