#!/usr/bin/env node
/**
 * collect-app.mjs — ④ 把主进程与预置模板投放到 HAP 载荷目录（设计文档 §8.1 阶段 ④）
 *
 * 投放点：<project>/web_engine/src/main/resources/resfile/resources/app/
 *   main.js / tar-extract.js / package.json   ← src-main/
 *   pi-dist.tar.gz / pi-dist.version          ← 工程根（③ 的产物）
 *   resources/pi-agent/                       ← config/（settings.json / mcp.json 模板，
 *                                               也是主进程首次启动时的解压投放源）
 *
 * 前置：必须先跑 scripts/collect-runtime.mjs（目标目录由它创建）。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appDestDir = join(projectRoot, 'web_engine', 'src', 'main', 'resources', 'resfile', 'resources', 'app');
const srcMain = join(projectRoot, 'src-main');
const LOG = '[collect-app]';

function banner(text) {
  console.log(`\n${LOG} ==== ${text} ====`);
}

function fail(message) {
  console.error(`\n${LOG} ✗ ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`${LOG} ⚠ ${message}`);
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

function measure(dir) {
  let files = 0;
  let bytes = 0;
  for (const file of walkFiles(dir)) {
    files += 1;
    try { bytes += statSync(file).size; } catch { /* ignore */ }
  }
  return { files, bytes };
}

// ── 0. 目标目录断言（由 collect-runtime.mjs 创建）──────────────────────
banner('0. 目标目录断言');
if (!existsSync(appDestDir)) {
  fail(
    `投放目标目录不存在：${appDestDir}\n` +
    '    → 该目录由 scripts/collect-runtime.mjs 创建（它会投放 electron/ 与 web_engine/ 骨架）。\n' +
    '    → 请先运行：node scripts/collect-runtime.mjs',
  );
}
console.log(`${LOG} 目标目录：${appDestDir}`);

// ── 1. 主进程文件 ─────────────────────────────────────────────────────
banner('1. 投放主进程（src-main/）');
if (!existsSync(srcMain)) fail(`src-main/ 不存在：${srcMain}`);
const mainFiles = ['main.js', 'tar-extract.js', 'package.json'];
for (const name of mainFiles) {
  const src = join(srcMain, name);
  if (!existsSync(src)) fail(`缺少主进程文件：${src}`);
  cpSync(src, join(appDestDir, name), { force: true });
  const size = statSync(src).size;
  console.log(`${LOG} ✔ ${name} → ${name}（${(size / 1024).toFixed(1)} KB）`);
}

// ── 2. 产物归档 + SHA-256 marker ──────────────────────────────────────
banner('2. 投放 pi-dist.tar.gz + pi-dist.version');
for (const name of ['pi-dist.tar.gz', 'pi-dist.version']) {
  const src = join(projectRoot, name);
  if (!existsSync(src)) {
    fail(`缺少产物：${src}\n    → 请先运行：node scripts/collect-pi.mjs`);
  }
  cpSync(src, join(appDestDir, name), { force: true });
  const size = statSync(src).size;
  console.log(`${LOG} ✔ ${name} → ${name}（${(size / 1024 / 1024).toFixed(1)} MB）`);
}

// ── 3. 预置模板（config/）─────────────────────────────────────────────
banner('3. 投放预置模板（config/ → resources/pi-agent/）');
const configSrc = join(projectRoot, 'config');
const agentResourceDest = join(appDestDir, 'resources', 'pi-agent');
if (!existsSync(configSrc)) {
  warn(`config/ 不存在，跳过预置模板投放：${configSrc}`);
} else {
  mkdirSync(agentResourceDest, { recursive: true });
  cpSync(configSrc, agentResourceDest, { recursive: true, force: true, dereference: true });
  const { files, bytes } = measure(agentResourceDest);
  console.log(`${LOG} ✔ config/ → resources/pi-agent/（${files} 个文件，${(bytes / 1024).toFixed(1)} KB）`);
  for (const name of ['settings.json', 'mcp.json']) {
    if (!existsSync(join(agentResourceDest, name))) {
      warn(`预置模板里缺少 ${name}：${join(agentResourceDest, name)}（主进程首次启动时会自行写默认值）`);
    }
  }
}

// ── 4. 汇总 ───────────────────────────────────────────────────────────
banner('4. 汇总');
const total = measure(appDestDir);
console.log(`${LOG} 投放目录内容：${total.files} 个文件，${(total.bytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`${LOG} app 目录 = ${appDestDir}`);
console.log(`\n${LOG} 完成。下一步：powershell -ExecutionPolicy Bypass -File scripts\\build-debug.ps1`);
