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
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const piWebRoot = resolve(projectRoot, '../pi-web');
const piRoot = resolve(projectRoot, '../pi');

const EXPECTED_PI_WEB_VERSION = '0.11.1';
const LOG = '[prepare-next]';

/** 允许保留的平台标记：路径里带这些片段才算「可能加载得起来」。 */
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

function run(command, args, cwd) {
  console.log(`\n${LOG} > ${command} ${args.join(' ')}   (cwd=${cwd})`);
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
}

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
if (existsSync(nodeModules)) {
  console.log(`${LOG} node_modules 已存在，跳过 npm ci：${nodeModules}`);
  console.log(`${LOG}（需要重装时手动删除 node_modules 后重跑本脚本）`);
} else {
  run('npm', ['ci'], piWebRoot);
}

// ── 2. 生产构建 ───────────────────────────────────────────────────────
banner('2. next build --webpack');
const buildScript = piWebPkg.scripts && piWebPkg.scripts.build ? piWebPkg.scripts.build : null;
console.log(`${LOG} pi-web 的 build 脚本 = ${buildScript ?? '(无)'}`);
// 说明：本机没有 npx 缓存也不影响 —— next 已装在 pi-web/node_modules/.bin，
// 直接调用其 JS 入口可避免 .bin shim 在 Windows 下的引号问题。
const nextCli = join(nodeModules, 'next', 'dist', 'bin', 'next');
if (existsSync(nextCli)) {
  run(process.execPath, [nextCli, 'build', '--webpack'], piWebRoot);
} else {
  console.warn(`${LOG} ⚠ 未找到 ${nextCli}，回退 npm run build`);
  run('npm', ['run', 'build'], piWebRoot);
}

// ── 3. 裁剪平台特定原生件 ─────────────────────────────────────────────
banner('3. 裁剪平台特定原生件（HarmonyOS aarch64 上永远加载不了）');
let deletedCount = 0;
let deletedBytes = 0;
const deletedPaths = [];

function removeFile(file, reason) {
  let size = 0;
  try { size = statSync(file).size; } catch { /* 已被删或不可读 */ }
  try {
    unlinkSync(file);
    deletedCount += 1;
    deletedBytes += size;
    deletedPaths.push(`${file}  (${(size / 1024).toFixed(1)} KB) — ${reason}`);
  } catch (err) {
    console.warn(`${LOG} ⚠ 删除失败 ${file}: ${err.message}`);
  }
}

if (existsSync(nodeModules)) {
  for (const file of walkFiles(nodeModules)) {
    const rel = file.slice(nodeModules.length + 1).replaceAll('\\', '/');
    if (!NATIVE_EXT.test(file)) continue;
    if (KEEP_PATH_MARKERS.some((marker) => rel.toLowerCase().includes(marker))) continue;
    if (/(^|\/)(undici|web-push)(\/|$)/.test(rel)) continue;              // 明示保留
    if (/(^|\/)@earendil-works\//.test(rel)) continue;                    // 明示保留
    removeFile(file, '原生件路径不含 linux-arm64/arm64/ohos');
  }

  // node-pty：终端面板 v1 降级（§8.2 / §9），其余平台预编译产物整目录删除。
  const prebuilds = join(nodeModules, 'node-pty', 'prebuilds');
  if (existsSync(prebuilds)) {
    for (const entry of readdirSync(prebuilds, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (KEEP_PATH_MARKERS.some((marker) => entry.name.toLowerCase().includes(marker))) continue;
      const dir = join(prebuilds, entry.name);
      for (const file of walkFiles(dir)) removeFile(file, `node-pty 非 arm64 预编译产物（${entry.name}）`);
    }
  }
}

console.log(`${LOG} 已删除 ${deletedCount} 个文件，合计 ${(deletedBytes / 1024 / 1024).toFixed(2)} MB`);
if (deletedPaths.length > 0) {
  console.log(`${LOG} 删除清单：`);
  for (const line of deletedPaths) console.log(`  - ${line}`);
} else {
  console.log(`${LOG} （无可删除项：本平台产物的原生件本就是 arm64 或不存在）`);
}

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
