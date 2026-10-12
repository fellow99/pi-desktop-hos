# config/ — 运行时预置模板（PL1 落地）

本目录存放**首次启动时写入应用沙箱**的 pi 运行时配置模板。投放路径：

```
config/{settings.json,mcp.json}  →  pi-dist/resources/pi-agent/{settings.json,mcp.json}
                                 →  <userData>/pi-agent/{settings.json,mcp.json}
```

`collect-pi.mjs` 负责把它们打进 `pi-dist.tar.gz` 的 `resources/pi-agent/`；
`src-main/main.js` 的产物解压引导负责把它们**仅当目标不存在时**复制到真实的
`PI_CODING_AGENT_DIR`（`<userData>/pi-agent/`）。**绝不覆盖用户已修改的配置。**

## 为什么这些键是这样设的

| 键 | 值 | 理由 |
|---|---|---|
| `shellPath` | `/system/bin/sh` | **鸿蒙专属，必需。** pi 的 `upstream getShellConfig()` 在非 Windows 平台先探 `/bin/bash`、再在 `PATH` 上找 `bash`，两者在设备上都不存在，最终回退到裸名 `sh`（依赖 `PATH` 解析）。把 shell 钉成绝对路径 `/system/bin/sh`（mksh R59）可消除这层不确定性 —— 与 dsh 真机实测的「优先用绝对路径调用外部命令」结论一致。|
| `defaultTools` | `read,write,edit,ls,find,grep,bash` | **显式去掉 `powershell`**（Windows 专用工具，在设备上必然不可用），其余保持 pi 的默认集。注意 `find`/`grep` 需要 `fd`/`rg` 外部二进制，设备上没有且 `PI_OFFLINE=1` 禁止下载，因此它们会**明确报错**而不是静默返回空结果 —— 这是刻意的 fail-visible 行为；实际的查找/搜索走 `bash` 里的 toybox `find`/`grep`（见技能 `harmony-runtime-capabilities`）。|
| `defaultProjectTrust` | `"ask"` | 显式写死为上游默认值。**不要改成 `always`**：扩展与 `.pi/` 资源在 pi 进程内拥有与进程相同的操作系统权限，project trust 是唯一的门禁（工程规划 §5.1）。显式写出是为了让意图可审计，且在升级时不会被上游改默认值悄悄带走。|

## 刻意**没有**设置的键

- **`packages`**：**留空**。这是插件机制 PL1（仅本地源）的落地方式 —— 不放任何网络源
  （`npm:` / `git:` / URL），配合 `PI_OFFLINE=1`，任何包安装尝试都在上游
  `installMissing()` 的首行短路，不写盘、不联网。若将来要随壳投放**本地** package，
  在这里写相对路径（相对本文件所在目录解析），并把目录树放到
  `<userData>/pi-agent/packages/<name>/`。
- **`extensions`**：**不写**。壳专用扩展直接落 `<userData>/pi-agent/extensions/`，
  由 pi 的扩展自动发现扫描拾取。无需声明，也就不会因为声明漂移而失效。
- **终端 TUI 专有键**（`theme`、`tuiMode`、`hideThinkingBlock`、`treeFilterMode` …）：
  本应用的主界面是 Pi Desktop（浏览器 UI，基于上游 pi-web 构建），不渲染 TUI。写这些键只会造成"设了但没人读"
  的假象。留给用户按需自行添加。
- **`skills` / `prompts` / `themes` 的路径数组**：同上，靠自动发现即可。

## 与工程规划的对应

- 插件机制三档（PL0/PL1/PL2）与 PL1 的落地契约：`docs/工程规划.md` §5.2、§5.3
- 沙箱环境变量映射（`PI_CODING_AGENT_DIR` / `TMPDIR` / `PI_OFFLINE`）：§4.6
- 能力降级表（`find`/`grep` 为何不可用、用什么替代）：§9.3
