/**
 * scripts/test-harmony-tools.mjs — `extensions/harmony-search.js` 的宿主侧离线单测
 *
 * 为什么需要它（代码评审：UNSUPPORTED-CLAIM：「离线单测 20 PASS」不可复现）：
 * 需求 102 的两条扩展在真机上验证，但**回归保护**需要一份可在构建机上零设备运行的测试。
 * 本脚本只测**纯 JS 的搜索扩展**（`grep` / `find`）—— 执行扩展需要设备上的 `/system/bin/sh`，
 * 由 `docs/真机验证记录.md` 轮次 3 的真机用例覆盖。
 *
 * 做法：造一棵固定夹具树 → 用**假 `pi`** 捕获扩展注册的工具 → 直接调用它们的 `execute()` 并断言输出文本。
 * 扩展是 ESM 且必须是单文件，这里把源文件复制到临时 `.mjs` 再动态 import（不修改仓库文件）。
 *
 * 用法：node scripts/test-harmony-tools.mjs
 * 退出码：0 = 全部通过；1 = 有失败。
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(join(tmpdir(), "harmony-tools-test-"));
const fixture = join(workDir, "fixture");

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function write(relPath, content) {
  const abs = join(fixture, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function buildFixture() {
  mkdirSync(fixture, { recursive: true });
  write("hello.txt", "hello world\nHELLO upper\n");
  write("docs/readme.md", "# readme\n\nhello from md\n");
  write("src/app.js", "function hello(){ return 'hi'; }\nconsole.log(hello());\n");
  write("src/util.js", "export const util = 'no-match';\n");
  write("src/deep/nested/leaf.js", "const leaf = 'hello leaf';\n");
  write("src/README.MD", "uppercase-file-name\n");
  write("node_modules/skipme.txt", "hello should not be found\n");
  write(".hidden/secret.txt", "hello secret\n");
  // 单文件把配额吃满 → limit 提示必须可见（代码评审 I4）
  write("big/many.log", Array.from({ length: 50 }, (_, i) => `log line ${i}`).join("\n") + "\n");
  // 超长行 → 单行截断提示必须可见（代码评审 I5）
  write("long/one-line.txt", `${"x".repeat(500)}\nneedle\n`);
  // 深度：第 9 段目录不应被遍历（代码评审 M9）
  write("d1/d2/d3/d4/d5/d6/d7/d8/deep.txt", "too deep\n");
  write("d1/ok.txt", "shallow\n");
}

/** 用假 `pi` 载入扩展，返回按名字索引的工具。 */
async function loadSearchTools() {
  const copy = join(workDir, "harmony-search.mjs");
  copyFileSync(join(repoRoot, "extensions", "harmony-search.js"), copy);
  const tools = new Map();
  const fakePi = {
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    on() {},
    registerCommand() {},
  };
  const mod = await import(pathToFileURL(copy).href);
  mod.default(fakePi);
  return tools;
}

async function callTool(tool, params) {
  const result = await tool.execute("t", params, undefined, undefined, { cwd: fixture });
  return result.content.map((part) => part.text).join("\n");
}

async function expectThrows(name, promise) {
  try {
    await promise;
    check(name, false, "预期抛错但没有抛");
  } catch {
    check(name, true);
  }
}
async function main() {
  buildFixture();
  const tools = await loadSearchTools();
  const grep = tools.get("grep");
  const find = tools.get("find");

  check("注册名与内建一致（grep / find）", Boolean(grep) && Boolean(find));

  // ---------------- grep ----------------
  console.log("\n== grep ==");
  let out = await callTool(grep, { pattern: "hello" });
  check("输出形如 <path>:<行号>: <内容>", /hello\.txt:1: hello world/.test(out), out);
  check("命中多文件（含深层）", /src\/deep\/nested\/leaf\.js:1: /.test(out), out);
  check("跳过 node_modules", !out.includes("skipme"), out);
  check("跳过点目录", !out.includes(".hidden"), out);
  check("默认大小写敏感（不命中 HELLO）", !out.includes("HELLO upper"), out);

  out = await callTool(grep, { pattern: "HELLO", ignoreCase: true });
  check("ignoreCase 命中大写行", out.includes("hello.txt:2: HELLO upper"), out);

  out = await callTool(grep, { pattern: "h.llo", literal: true });
  check("literal 关掉正则（h.llo 不命中 hello）", out.includes("No matches found."), out);

  out = await callTool(grep, { pattern: "hello", glob: "**/*.js" });
  check("glob 过滤文件 + 说明", out.includes("已按 glob") && !out.includes("hello.txt:"), out);
  check("grep 汇总为「N files read」", /files read\)/.test(out), out);

  out = await callTool(grep, { pattern: "readme", context: 1 });
  check("context 行用 '-' 分隔", /docs\/readme\.md-2- /.test(out), out);

  out = await callTool(grep, { pattern: "hello", limit: 1 });
  check("目录内 limit 触顶可见", out.includes("已达匹配上限 limit=1"), out);

  out = await callTool(grep, { pattern: "log line", path: "big/many.log", limit: 5 });
  check("单文件 limit 触顶可见（代码评审 I4）", out.includes("已达匹配上限 limit=5"), out);
  check("单文件 limit 只回 5 条", (out.match(/log line \d+: /g) || out.match(/big\/many\.log:\d+:/g) || []).length === 5, out);

  out = await callTool(grep, { pattern: "xxx", path: "long/one-line.txt" });
  check("单行截断提示可见（代码评审 I5）", /1 行超过 300 字符已截断/.test(out), out);

  await expectThrows("非法 glob 抛错（不再静默退化为不过滤）", callTool(grep, { pattern: "hello", glob: "/" }));

  write("huge/big.txt", `${"y".repeat(600 * 1024)}\nz\n`);
  out = await callTool(grep, { pattern: "z", path: "huge" });
  check("超大文件跳过并计数", out.includes("跳过 1 个超过") || out.includes("No matches found."), out);

  await expectThrows("非法正则抛错", callTool(grep, { pattern: "([" }));
  await expectThrows("不存在的路径抛错", callTool(grep, { pattern: "x", path: "nope" }));

  // ---------------- find ----------------
  console.log("\n== find ==");
  out = await callTool(find, { pattern: "*.txt" });
  check("无 '/' 的模式按 basename 任意深度匹配", out.includes("hello.txt") && out.includes("d1/ok.txt"), out);
  check("find 跳过 node_modules 与点目录", !out.includes("skipme") && !out.includes(".hidden"), out);
  check("find 汇总为「N files scanned」", /files scanned\)/.test(out), out);

  out = await callTool(find, { pattern: "**/*.js" });
  check("'**' 跨段匹配", out.includes("src/deep/nested/leaf.js"), out);

  out = await callTool(find, { pattern: "**/*.{js,txt}" });
  check("'{a,b}' 花括号枚举（代码评审 M7）", out.includes("src/app.js") && out.includes("hello.txt"), out);

  out = await callTool(find, { pattern: "d[0-9]/*.txt" });
  check("'[0-9]' 字符类（代码评审 M7）", out.includes("d1/ok.txt"), out);

  out = await callTool(find, { pattern: "readme*" });
  check("全小写模式智能大小写（匹配 README.MD）", out.includes("src/README.MD"), out);

  out = await callTool(find, { pattern: "READ*" });
  check("含大写模式大小写敏感（不匹配 readme.md）", !out.includes("docs/readme.md"), out);

  out = await callTool(find, { pattern: "deep.txt" });
  check("深度上限：第 9 段目录不遍历（代码评审 M9）", out.includes("No files found."), out);
  check("深度提示与实际一致", !out.includes("已匹配"), out);

  out = await callTool(find, { pattern: "*.js", limit: 1 });
  check("find limit 触顶可见", out.includes("已达结果上限 limit=1"), out);

  out = await callTool(find, { pattern: "*.nomatch" });
  check("无命中给出 No files found.", out.includes("No files found."), out);

  await expectThrows("find 路径不存在抛错", callTool(find, { pattern: "*", path: "nope" }));
  await expectThrows("find 路径是文件时给出准确错误", callTool(find, { pattern: "*", path: "hello.txt" }));

  // ---------------- 汇总 ----------------
  console.log(`\n== 结果：${passed} PASS / ${failures.length} FAIL ==`);
  for (const failure of failures) console.log(`  - ${failure}`);
  return failures.length === 0 ? 0 : 1;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error("测试脚本自身抛错：", error);
  code = 1;
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
process.exit(code);
