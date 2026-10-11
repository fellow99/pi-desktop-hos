/**
 * harmony-runtime.js — 壳专用扩展（Pi Desktop / HarmonyOS）
 *
 * 本扩展是**根级单文件扩展**，由 pi 的扩展自动发现扫描拾取（落点
 * `<userData>/pi-agent/extensions/harmony-runtime.js`），无需在 settings.json 里声明。
 * 骨架刻意保持最小：它同时充当「PL1 插件机制是否生效」的自检探针 —— 导入即注册，
 * 不依赖任何原生模块或子进程（工程规划 §5.4）。
 *
 * 提供的能力：
 *   ① `/harmony-info` 命令 —— 打印本构建的运行时事实与能力边界，便于用户与模型自查。
 *   ② `session_start` 钩子 —— 校验 shell 绝对路径存在；缺失时只记一条清晰警告，
 *      **绝不抛错**（保活/环境类失败不应连带影响会话启动）。
 *
 * 刻意不做的事（与工程规划 §5.1 的权限模型一致）：不在工厂里启动进程、socket、watcher
 * 或定时器 —— pi 有不启会话就加载扩展的调用路径（`pi --help` 等），在工厂里起长驻资源
 * 会在那些路径上泄漏。
 *
 * 注意：本扩展运行在 pi 进程内，拥有与应用相同的操作系统权限。它只读环境变量，
 * 不读凭据、不改会话状态。
 */

import { existsSync } from "node:fs";

/** 设备上唯一保证存在的 POSIX shell（mksh R59）。与 config/settings.json 的 shellPath 一致。 */
const HARMONY_SHELL = "/system/bin/sh";

/** pi 内建工具的可用性（依据设备实测与 PI_OFFLINE=1 的下载禁令）。 */
const TOOL_FACTS = [
  { name: "read / write / edit", ok: true, why: "纯 Node.js" },
  { name: "ls", ok: true, why: "纯 Node.js（fs.readdir）" },
  {
    name: "bash",
    ok: true,
    why: `spawn ${HARMONY_SHELL}（mksh R59），无 PTY；命令不受文件围栏保护`,
  },
  { name: "find", ok: false, why: "需要 fd 外部二进制：设备没有，且 PI_OFFLINE=1 禁止下载" },
  { name: "grep", ok: false, why: "需要 ripgrep（rg）外部二进制：同上" },
  { name: "powershell", ok: false, why: "Windows 专用工具" },
  { name: "codemode", ok: null, why: "需 worker_threads + QuickJS wasm —— 未实测" },
];

function lines(...rows) {
  return rows.filter(Boolean).join("\n");
}

/**
 * 组装运行时事实报告。
 *
 * 只用 `process.env` 与 `ctx` —— pi 的 `ExtensionContext` 不暴露 agentDir，而 agent
 * 目录正是由本壳通过 `PI_CODING_AGENT_DIR` 注入的，从环境变量读是权威来源。
 */
function buildReport(ctx) {
  const env = process.env;
  const shellOk = existsSync(HARMONY_SHELL);

  const toolTable = TOOL_FACTS.map((tool) => {
    const mark = tool.ok === true ? "可用" : tool.ok === false ? "不可用" : "未实测";
    return `  · ${tool.name}：${mark} —— ${tool.why}`;
  }).join("\n");

  return lines(
    "Pi Desktop（HarmonyOS）运行时事实",
    "",
    "环境",
    `  · 平台标记：process.platform = ${process.platform}`,
    `  · Node：${process.versions.node} ｜ Electron 主进程内（无子进程）`,
    `  · PI_CODING_AGENT_DIR = ${env.PI_CODING_AGENT_DIR ?? "(未设置，回退 ~/.pi/agent)"}`,
    `  · HOME = ${env.HOME ?? "(未设置)"}`,
    `  · TMPDIR = ${env.TMPDIR ?? "(未设置)"}`,
    `  · PI_OFFLINE = ${env.PI_OFFLINE ?? "(未设置)"}（=1 时禁止包自动安装与 fd/rg 下载）`,
    `  · shellPath 目标 ${HARMONY_SHELL}：${shellOk ? "存在" : "不存在（bash 工具会失败）"}`,
    `  · 会话工作目录：${ctx.cwd}`,
    `  · project trust：${ctx.isProjectTrusted() ? "已信任（.pi/ 资源会加载）" : "未信任（.pi/ 资源不加载）"}`,
    "",
    "内建工具可用性",
    toolTable,
    "",
    "替代做法",
    "  · 找文件/搜内容用 bash 里的 toybox 命令，而不是 find/grep 工具：",
    "      bash(\"find . -name '*.ts'\")",
    "      bash(\"grep -rn 'pattern' src\")",
    "  · 子进程无法运行 Node 脚本（node -e / node x.js → Signal 31 SIGSYS）。",
    "    需要 JS 运行时的东西必须在 agent 进程内跑。",
    "",
    "详见技能 harmony-runtime-capabilities 与 docs/工程规划.md §9.3 / §11。",
  );
}

export default function harmonyRuntime(pi) {
  pi.registerCommand("harmony-info", {
    description: "显示本 HarmonyOS 构建的运行时事实与工具可用性",
    handler: async (args, ctx) => {
      const report = buildReport(ctx);
      // 命令结果的主要通道是 UI；没有 UI 的模式（json/print）下退化为控制台。
      if (ctx.hasUI) {
        ctx.ui.notify(report, "info");
      } else {
        console.log(report);
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    // 只校验、只警告：shell 缺失会让 bash 工具失败，但不应阻断会话启动。
    if (!existsSync(HARMONY_SHELL)) {
      const message = lines(
        `[pi-desktop] 警告：未找到 ${HARMONY_SHELL}，bash 工具将不可用。`,
        "  本扩展与 config/settings.json 的 shellPath 都指向该绝对路径；",
        "  若设备 shell 位置不同，请同步修改两者。",
      );
      console.error(message);
      if (ctx.hasUI) {
        ctx.ui.notify(message, "warning");
      }
    }
    return undefined;
  });
}
