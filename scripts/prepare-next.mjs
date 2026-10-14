#!/usr/bin/env node
/**
 * prepare-next.mjs — ② 构建 pi-web 的生产产物（设计文档 §8.1 阶段 ②）
 *
 * 流程：前置检查 →（node_modules 缺失时）npm ci → next build --webpack → 裁剪平台特定原生件
 *      → 轮换预览密钥 → 断言 .next/BUILD_ID。
 *
 * 前置：同级目录存在 ../pi-web（v0.11.1）与 ../pi（pi v1.1.0，npm 从它解析 @earendil-works/*）。
 *
 * 为什么必须裁剪：`.next` 必须在能完整安装依赖的宿主机上构建，产物里因此混入宿主平台的原生件；
 * 它们在 HarmonyOS aarch64 上永远加载不了，白占 HAP 体积（且 §8.2 已决定终端面板 v1 降级）。
 * 保留项：undici / web-push / @earendil-works/*（纯 JS，§8.2 明示不许删）。
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const piWebRoot = resolve(projectRoot, '../pi-web');
const piRoot = resolve(projectRoot, '../pi');

const EXPECTED_PI_WEB_VERSION = '0.11.1';
const LOG = '[prepare-next]';

const KEEP_PATH_MARKERS = ['linux-arm64', 'arm64', 'ohos'];
/** 平台特定原生件判定：*.node 文件；node-pty 另有 prebuilds/<platform>/ 目录形态。 */
const NATIVE_EXT = /\.node$/i;

function banner(text) {
  console.log(`\n${LOG} ==== ${text} ====`);
}

function fail(message) {
  console.error(`\n${LOG} ✗ ${message}`);
  process.exit(1);
}

/**
 * 执行外部命令。
 *
 * ⚠️ Windows 上 `shell: true` 是为了让 `npm`/`npx` 这类 `.cmd` 能被解析；但它同时意味着
 * 参数由 cmd.exe 再解析一次，**含空格的路径必须显式加引号**。本工程实际踩到过：
 * DevEco 自带的 node 在 `D:\oh-workspace\DevEco Studio\tools\node\`，路径里的空格会被
 * 拆成两段（`'D:\oh-workspace\DevEco' 不是内部或外部命令`），构建直接失败。
 * 因此这里统一按 cmd.exe 的规则给每个参数加引号并转义内部引号。
 */
function run(command, args, cwd) {
  console.log(`\n${LOG} > ${command} ${args.join(' ')}   (cwd=${cwd})`);
  const useShell = process.platform === 'win32';
  const quoteForCmd = (value) => (/[\s"&|<>^()]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const finalCommand = useShell ? quoteForCmd(command) : command;
  const finalArgs = useShell ? args.map(quoteForCmd) : args;
  execFileSync(finalCommand, finalArgs, { cwd, stdio: 'inherit', shell: useShell });
}


// ---------------------------------------------------------------- 构建所用 node

/**
 * 可选：显式指定构建所用的 node 可执行文件（`--node <path>`）。
 *
 * 为什么需要它：目标运行时是 Electron 37 内置的 **Node 22.17.0**，这个版本在常见开发机上
 * 不一定存在（本机 PATH 上是 Node 24，DevEco 自带的是 Node 18）。靠改 PATH 指定并不可靠 ——
 * Git Bash 的 `export PATH=…` 实测会被 Windows PATH 的排序压过（`command -v node` 仍指向
 * 系统 node）。因此提供一个显式开关。
 *
 * 更关键的是：**`npm ci` 与 `next build` 必须用同一个 node 跑**。本工程实际踩到过 —— 用
 * Node 18 装依赖时 `@tailwindcss/oxide` 的 optionalDependencies 平台解析没装全，随后用
 * Node 24 构建就报 `Cannot find native binding`。所以两者都从这里取。
 */
const nodeArgIndex = process.argv.indexOf('--node');
let NODE_BIN = process.execPath;
if (nodeArgIndex !== -1) {
  const value = process.argv[nodeArgIndex + 1];
  if (!value || value.startsWith('--')) fail('--node 需要一个可执行文件路径参数');
  if (!existsSync(value)) fail(`--node 指定的路径不存在：${value}`);
  NODE_BIN = value;
}
console.log(`${LOG} 构建所用 node = ${NODE_BIN}`);
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** 递归列出文件（不跟随目录符号链接）。 */
function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      yield full;
    }
  }
}

// ── 0. 前置检查 ───────────────────────────────────────────────────────
banner('0. 前置检查');
if (!existsSync(piWebRoot)) {
  fail(`pi-web 未找到：${piWebRoot}（期望与 pi-desktop-hos 同级；上游基线 pi-web v0.11.1）`);
}
if (!existsSync(piRoot)) {
  fail(`pi 未找到：${piRoot}（期望与 pi-desktop-hos 同级；上游基线 pi v1.1.0，pi-web 的 @earendil-works/* 由它解析）`);
}
const piWebPkgPath = join(piWebRoot, 'package.json');
if (!existsSync(piWebPkgPath)) fail(`pi-web/package.json 不存在：${piWebPkgPath}`);
const piWebPkg = readJson(piWebPkgPath);
if (piWebPkg.version !== EXPECTED_PI_WEB_VERSION) {
  console.warn(`${LOG} ⚠ pi-web 版本为 ${piWebPkg.version}，期望 ${EXPECTED_PI_WEB_VERSION}（继续，但产物与 baseline 不一致）`);
} else {
  console.log(`${LOG} pi-web 版本 = ${piWebPkg.version} ✔`);
}
console.log(`${LOG} pi-web = ${piWebRoot}`);
console.log(`${LOG} pi     = ${piRoot}`);

const nodeModules = join(piWebRoot, 'node_modules');
const nextDir = join(piWebRoot, '.next');

// ── 1. 依赖安装（仅缺失时）────────────────────────────────────────────
banner('1. 依赖安装');
/**
 * npm 必须与构建用**同一个** node 跑（见上方 `--node` 的说明）。
 *
 * 做法：直接执行 npm 自带的 `npm-cli.js` 入口，而不是 `npm`/`npm.cmd` 裸名 ——
 * 裸名会解析到 PATH 上的哪一份 npm 不可控，而它的 shebang 指向的 node 同样不可控。
 * npm-cli.js 相对 node 可执行文件的位置是固定的：`<nodeDir>/node_modules/npm/bin/npm-cli.js`。
 */
const npmCli = join(dirname(NODE_BIN), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const installDeps = existsSync(npmCli)
  ? () => run(NODE_BIN, [npmCli, 'ci'], piWebRoot)
  : () => run('npm', ['ci'], piWebRoot);
if (!existsSync(npmCli)) {
  console.warn(`${LOG} ⚠ 未找到 ${npmCli}，回退到 PATH 上的 npm（可能与构建用 node 不一致）`);
}

if (existsSync(nodeModules)) {
  console.log(`${LOG} node_modules 已存在，跳过 npm ci：${nodeModules}`);
  console.log(`${LOG}（需要重装时手动删除 node_modules 后重跑本脚本）`);
} else {
  installDeps();
}

// ── 1b. 上游补丁（幂等；需求 203-plugin-workspace-picker）────────────────
/**
 * 按 `patches/<被 patch 的上游 tag>/` 目录幂等应用补丁（工程规划 §7 的补丁纪律）：
 *   ① `git apply --reverse --check` 成功 → 已应用，**跳过**（no-op）；
 *   ② 否则 `git apply --check` 成功 → 先在「应用 → 反向 → 断言 SHA-256 还原」上验一遍
 *      可往返性（FR-203-022），再正式应用；
 *   ③ 两者都失败 → **硬失败中止**。绝不 `--3way`、绝不覆盖上游 checkout 里的用户改动。
 *
 * 为什么在 `next build` 之前：补丁改的是 pi-web 的源码（组件/路由），必须参与编译。
 * 为什么不把改动直接留在工作树：pi-web 是 submodule，工作树必须保持零改动，
 * 否则「已部署产物」与上游 tag 的对应关系就断了。
 */
function tryRun(command, args, cwd) {
  try {
    execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch (err) {
    // 把 git 的 stderr 带出来：否则「补丁真的冲突」与「git 不在 PATH 上」会显示成同一句话，
    // 让人以为补丁有问题。
    const stderr = err && err.stderr ? String(err.stderr).trim() : '';
    console.log(`${LOG} git ${args.join(' ')} → 失败（cwd=${cwd}）${stderr ? '：' + stderr.split(String.fromCharCode(10)).join(' | ') : ''}`);
    return false;
  }
}

function sha256Of(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function applyUpstreamPatches(piWebDir, tag) {
  const dir = join(projectRoot, 'patches', tag);
  if (!existsSync(dir)) {
    console.log(`${LOG} 无补丁目录 ${dir}（0 条补丁）`);
    return 0;
  }
  const patches = readdirSync(dir).filter((name) => name.endsWith('.patch')).sort();
  if (patches.length === 0) {
    console.log(`${LOG} 补丁目录为空：${dir}`);
    return 0;
  }

  let applied = 0;
  for (const name of patches) {
    const patchPath = join(dir, name);
    if (tryRun('git', ['apply', '--reverse', '--check', patchPath], piWebDir)) {
      console.log(`${LOG} 补丁已应用，跳过：${name}`);
      continue;
    }
    if (!tryRun('git', ['apply', '--check', patchPath], piWebDir)) {
      fail(`补丁与当前 pi-web 工作树冲突，中止（不得 --3way 强行合并）：${patchPath}`);
    }

    // 可往返性断言（FR-203-022）：受影响文件在「应用 → 反向」后必须逐字节还原。
    const affected = readFileSync(patchPath, 'utf8')
      .split('\n')
      .map((line) => /^diff --git a\/(.+?) b\/(.+)$/.exec(line)?.[2])
      .filter(Boolean);
    const before = new Map();
    for (const rel of affected) {
      const abs = join(piWebDir, rel);
      before.set(rel, existsSync(abs) ? sha256Of(abs) : null); // null = 补丁新增的文件
    }

    if (!tryRun('git', ['apply', patchPath], piWebDir)) {
      fail(`补丁应用失败：${patchPath}`);
    }
    if (!tryRun('git', ['apply', '--reverse', patchPath], piWebDir)) {
      fail(`补丁反向应用失败（可往返性被破坏）：${patchPath}`);
    }
    for (const rel of affected) {
      const abs = join(piWebDir, rel);
      const original = before.get(rel);
      const now = existsSync(abs) ? sha256Of(abs) : null;
      if (now !== original) {
        fail(`补丁往返校验失败（${rel} 未还原，FR-203-022）：${patchPath}`);
      }
    }
    console.log(`${LOG} 可往返校验通过（${affected.length} 个文件）：${name}`);

    if (!tryRun('git', ['apply', patchPath], piWebDir)) {
      fail(`补丁正式应用失败：${patchPath}`);
    }
    // 守卫：应用后必须能命中补丁的关键符号，否则说明补丁语义已被上游改动破坏。
    const guardTarget = join(piWebDir, 'lib', 'directory-browser.ts');
    if (!readFileSync(guardTarget, 'utf8').includes('WORKSPACE_ROOTS_ENV')) {
      fail(`补丁守卫失败：${guardTarget} 缺少 WORKSPACE_ROOTS_ENV（补丁未真正生效）`);
    }
    console.log(`${LOG} 已应用补丁：${name}`);
    applied += 1;
  }
  return applied;
}

const PI_WEB_PATCH_TAG = 'v0.11.1';
const patchesApplied = applyUpstreamPatches(piWebRoot, PI_WEB_PATCH_TAG);
console.log(`${LOG} 本轮新应用补丁 ${patchesApplied} 条（目录 patches/${PI_WEB_PATCH_TAG}/）`);

// ── 2. 生产构建 ───────────────────────────────────────────────────────
banner('2. next build --webpack');
const buildScript = piWebPkg.scripts && piWebPkg.scripts.build ? piWebPkg.scripts.build : null;
console.log(`${LOG} pi-web 的 build 脚本 = ${buildScript ?? '(无)'}`);
// 说明：本机没有 npx 缓存也不影响 —— next 已装在 pi-web/node_modules/.bin，
// 直接调用其 JS 入口可避免 .bin shim 在 Windows 下的引号问题。
const nextCli = join(nodeModules, 'next', 'dist', 'bin', 'next');
if (existsSync(nextCli)) {
  run(NODE_BIN, [nextCli, 'build', '--webpack'], piWebRoot);
} else {
  console.warn(`${LOG} ⚠ 未找到 ${nextCli}，回退 npm run build`);
  run(NODE_BIN, [npmCli, 'run', 'build'], piWebRoot);
}

// ── 3. 裁剪平台特定原生件 ─────────────────────────────────────────────
banner('3. 平台原生件盘点（只统计，不删除）');
/**
 * ⚠️ 这里**刻意不做删除**，只统计。这是实测得出的结论，不是遗漏。
 *
 * 曾经的实现删除了 pi-web/node_modules 里所有非 arm64 的 `*.node`。实测发现两个后果：
 *   1. **Next 会在启动时按 package-lock 自动补装**：删掉 `@next/swc-win32-x64-msvc` 后，
 *      `next start` 首次运行打印 `Downloading swc package @next/swc-win32-x64-msvc... `，
 *      从 registry 拉 34 MB 到 `%LOCALAPPDATA%\next-swc`，启动从 ~2 s 变成 ~6 s。
 *      目标设备是**离线**的（`PI_OFFLINE=1`，且设备无 npm），这条下载会失败或超时。
 *   2. **下一次 `next build` 会把 4 个包原样装回**（`@img/sharp-*`、`@tailwindcss/oxide-*`、
 *      `@unrs/resolver-binding-*`、`lightningcss-*`）—— 即删除对该源目录是无效的。
 *
 * 因此裁剪的**正确位置是 `collect-pi.mjs`**：它把 node_modules 复制进 `pi-dist/` 之后，
 * 在**副本**上裁剪。源目录保持完整，运行/构建都不会触发补装。
 */
const nativeReport = [];
if (existsSync(nodeModules)) {
  for (const file of walkFiles(nodeModules)) {
    const rel = file.slice(nodeModules.length + 1).replaceAll('\\', '/');
    if (!NATIVE_EXT.test(file)) continue;
    if (KEEP_PATH_MARKERS.some((marker) => rel.toLowerCase().includes(marker))) continue;
    if (/(^|\/)(undici|web-push)(\/|$)/.test(rel)) continue;
    if (/(^|\/)@earendil-works\//.test(rel)) continue;
    let size = 0;
    try { size = statSync(file).size; } catch { /* 不可读则记 0 */ }
    nativeReport.push({ rel, size });
  }
}

const prebuildRun = join(nodeModules, 'node-pty', 'prebuilds');
if (existsSync(prebuildRun)) {
  for (const entry of readdirSync(prebuildRun, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (KEEP_PATH_MARKERS.some((marker) => entry.name.toLowerCase().includes(marker))) continue;
    for (const file of walkFiles(join(prebuildRun, entry.name))) {
      let size = 0;
      try { size = statSync(file).size; } catch { /* 不可读则记 0 */ }
      nativeReport.push({ rel: file.slice(nodeModules.length + 1).replaceAll('\\', '/'), size });
    }
  }
}

const nativeBytes = nativeReport.reduce((sum, item) => sum + item.size, 0);
console.log(`${LOG} 非 arm64 候选原生件：${nativeReport.length} 个，合计 ${(nativeBytes / 1024 / 1024).toFixed(2)} MB`);
for (const item of nativeReport) {
  console.log(`  - ${item.rel}  (${(item.size / 1024).toFixed(1)} KB)`);
}
console.log(`${LOG} 这些文件不会被删除 —— 裁剪在 collect-pi.mjs 对 pi-dist 副本执行（见上方注释）`);

// ── 4. 轮换预览密钥（必须在打包前做）──────────────────────────────────
banner('4. 轮换预览密钥（bin/rotate-preview-secrets.js）');
const rotatePath = join(piWebRoot, 'bin', 'rotate-preview-secrets.js');
if (!existsSync(rotatePath)) {
  fail(`密钥轮换脚本缺失：${rotatePath}`);
}
try {
  const rotate = require(rotatePath);
  const result = rotate.rotatePreviewSecrets(nextDir);
  if (result && result.ok) {
    console.log(`${LOG} .next/prerender-manifest.json 预览密钥已轮换`);
  } else {
    const warning = typeof rotate.getRotationWarning === 'function'
      ? rotate.getRotationWarning(result && result.reason)
      : `原因：${result && result.reason}`;
    console.warn(`${LOG} ⚠ 轮换失败：\n${warning}`);
  }
} catch (err) {
  console.warn(`${LOG} ⚠ 轮换异常（不阻断构建，主进程启动时会再轮换一次）：${err.message}`);
}

// ── 5. 产物断言 ───────────────────────────────────────────────────────
banner('5. 产物断言');
const buildIdPath = join(nextDir, 'BUILD_ID');
if (!existsSync(buildIdPath)) {
  fail(`构建产物不完整：缺少 ${buildIdPath}（next build 是否成功？）`);
}
const buildId = readFileSync(buildIdPath, 'utf8').trim();
const serverEntryCandidates = [
  join(nodeModules, 'next', 'dist', 'server', 'lib', 'start-server.js'),
  join(nodeModules, 'next', 'dist', 'server', 'next.js'),
  join(nodeModules, 'next', 'dist', 'bin', 'next'),
];
const serverEntry = serverEntryCandidates.find((p) => existsSync(p));
if (!serverEntry) {
  fail(`未找到任何 Next 服务入口（探测：${serverEntryCandidates.join(' | ')}）`);
}

console.log(`${LOG} ✔ .next/BUILD_ID = ${buildId}`);
console.log(`${LOG} ✔ Next 服务入口 = ${serverEntry}`);
console.log(`${LOG} 完成：pi-web 生产产物已就绪（下一步：node scripts/smoke-node22.mjs 门禁）`);

// ── 6. 回退上游补丁（保持 ../pi-web 工作树零改动，FR-203-023）─────────────
/**
 * `.next` 已经产出，补丁不再需要留在工作树上：镜像回退让 pi-web 回到 tag 的原样，
 * 「已部署产物 ↔ 上游 tag」的对应关系因此可核验。collect-pi 只消费 `.next` 与 node_modules，
 * 不读 pi-web 的源码目录，所以这一步不影响下游打包。
 *
 * 幂等：下一次 prepare-next 会因为 `--reverse --check` 失败而重新应用。
 * 若在 build 中途失败，则**不会**走到这里 —— 补丁保持已应用状态，下一次运行直接跳过（安全）。
 */
function revertUpstreamPatches(piWebDir, tag) {
  const dir = join(projectRoot, 'patches', tag);
  if (!existsSync(dir)) return 0;
  let reverted = 0;
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.patch')).sort()) {
    const patchPath = join(dir, name);
    if (tryRun('git', ['apply', '--reverse', '--check', patchPath], piWebDir)) {
      if (!tryRun('git', ['apply', '--reverse', patchPath], piWebDir)) {
        console.warn(`${LOG} ⚠ 补丁回退失败（工作树仍为已应用状态，不影响本地产物）：${name}`);
        continue;
      }
      console.log(`${LOG} 已回退补丁（pi-web 恢复 pristine）：${name}`);
      reverted += 1;
    } else {
      console.log(`${LOG} 补丁未应用，无需回退：${name}`);
    }
  }
  return reverted;
}

banner('6. 回退上游补丁（保持 pi-web pristine）');
const reverted = revertUpstreamPatches(piWebRoot, PI_WEB_PATCH_TAG);
console.log(`${LOG} 本轮回退补丁 ${reverted} 条`);
console.log(`${LOG} pi-web 工作树状态：${execFileSync('git', ['status', '--porcelain'], { cwd: piWebRoot, encoding: 'utf8' }).trim() || '（零改动）'}`);
