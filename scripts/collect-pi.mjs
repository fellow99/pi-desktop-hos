#!/usr/bin/env node
/**
 * collect-pi.mjs — ③ 组装运行时载荷 pi-dist/ + tar.gz(ustar) + SHA-256 marker（设计文档 §8.1 阶段 ③）
 *
 * 产物：
 *   <project>/pi-dist/                 pi-web 生产产物 + 运行期 node_modules + resources/pi-agent/
 *   <project>/pi-dist.tar.gz           ustar 格式归档（HAP 不能直接塞数万小文件：会拖死 hvigor）
 *   <project>/pi-dist.version          内容 = tar 包的 SHA-256 hex（主进程据此做幂等解压）
 *
 * 依赖：准备先跑过 scripts/prepare-next.mjs（pi-web 的 .next 与 node_modules 必须已就绪）。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const piWebRoot = resolve(projectRoot, '../pi-web');
const piDistDir = join(projectRoot, 'pi-dist');
const archivePath = join(projectRoot, 'pi-dist.tar.gz');
const versionPath = join(projectRoot, 'pi-dist.version');
const LOG = '[collect-pi]';
const STRICT = process.argv.includes('--strict');

/** 必须存在的运行期入口（主进程断言 / 冒烟门禁都读它们）。 */
const REQUIRED_SERVER_ENTRIES = [
  join('node_modules', 'next', 'dist', 'server', 'lib', 'start-server.js'),
  join('node_modules', 'next', 'dist', 'server', 'next.js'),
  join('node_modules', 'next', 'dist', 'bin', 'next'),
];
const REQUIRED_PI_ENTRY = join('node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'index.js');

/** pi-web 运行期必需包（顶层目录名；未列出的按 npm 依赖树裁剪时同样保留）。 */
const EXPLICIT_RUNTIME_PACKAGES = [
  'next', 'react', 'react-dom', 'js-yaml', 'proper-lockfile', 'semver', 'undici', 'web-push',
];

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
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/** 统计文件数与总字节（符号链接不计，tar 解压器会跳过它们）。 */
function measureTree(dir) {
  let files = 0;
  let bytes = 0;
  for (const file of walkFiles(dir)) {
    files += 1;
    try { bytes += statSync(file).size; } catch { /* 忽略消失的文件 */ }
  }
  return { files, bytes };
}

function human(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ── 0. 前置检查 ───────────────────────────────────────────────────────
banner('0. 前置检查');
if (!existsSync(piWebRoot)) fail(`pi-web 未找到：${piWebRoot}`);
const piWebNext = join(piWebRoot, '.next');
const piWebNodeModules = join(piWebRoot, 'node_modules');
if (!existsSync(piWebNext)) {
  fail(`pi-web 生产产物缺失：${piWebNext}\n    → 先运行：node scripts/prepare-next.mjs`);
}
if (!existsSync(join(piWebNext, 'BUILD_ID'))) {
  fail(`pi-web .next 不完整（缺 BUILD_ID）：${piWebNext}\n    → 先运行：node scripts/prepare-next.mjs`);
}
if (!existsSync(piWebNodeModules)) {
  fail(`pi-web 依赖缺失：${piWebNodeModules}\n    → 先运行：node scripts/prepare-next.mjs（它会执行 npm ci）`);
}
const piWebPkg = JSON.parse(readFileSync(join(piWebRoot, 'package.json'), 'utf8'));
console.log(`${LOG} pi-web ${piWebPkg.version}｜.next BUILD_ID = ${readFileSync(join(piWebNext, 'BUILD_ID'), 'utf8').trim()}`);

// ── 1. 计算运行期依赖闭包 ─────────────────────────────────────────────
banner('1. 解析运行期依赖闭包（npm ls --omit=dev --json）');
let runtimeTopLevel = new Set(EXPLICIT_RUNTIME_PACKAGES);
let usedNpmLs = false;
try {
  const raw = execFileSync('npm', ['ls', '--omit=dev', '--json', '--all'], {
    cwd: piWebRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: process.platform === 'win32',
  });
  const tree = JSON.parse(raw);
  const names = new Set();
  const visit = (deps) => {
    if (!deps || typeof deps !== 'object') return;
    for (const [name, info] of Object.entries(deps)) {
      names.add(name);
      if (info && typeof info === 'object') visit(info.dependencies);
    }
  };
  visit(tree.dependencies);
  if (names.size > 0) {
    runtimeTopLevel = names;
    usedNpmLs = true;
    console.log(`${LOG} npm 报告 ${names.size} 个运行期包（含传递依赖）`);
  } else {
    warn('npm ls 输出里没有 dependencies 字段，改用显式清单');
  }
} catch (err) {
  warn(`npm ls 失败（${err.message.split('\n')[0]}），改用显式清单 + 保留全部 @scope 目录`);
}
if (!usedNpmLs) {
  // 兜底：显式清单 + 所有 @scope 包（@earendil-works/* 与 @xterm/* 在这类场景必然需要）。
  for (const entry of readdirSync(piWebNodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(join(piWebNodeModules, entry.name), { withFileTypes: true })) {
        if (scoped.isDirectory()) runtimeTopLevel.add(`${entry.name}/${scoped.name}`);
      }
    }
  }
}
for (const required of ['next', 'react', 'react-dom', 'js-yaml', 'proper-lockfile', 'semver', 'undici', 'web-push',
  '@xterm/xterm', '@xterm/addon-fit', '@earendil-works/pi-coding-agent', '@earendil-works/pi-agent-core',
  '@earendil-works/pi-ai', '@earendil-works/pi-tui']) {
  runtimeTopLevel.add(required);
}

// ── 2. 组装 pi-dist/ ──────────────────────────────────────────────────
banner('2. 组装 pi-dist/（pi-web 产物 + 裁剪后的 node_modules）');
if (existsSync(piDistDir)) {
  console.log(`${LOG} 清理旧的 pi-dist/：${piDistDir}`);
  rmSync(piDistDir, { recursive: true, force: true });
}
mkdirSync(piDistDir, { recursive: true });

const webArtifacts = ['.next', 'public', 'next.config.ts', 'package.json', 'bin'];
for (const name of webArtifacts) {
  const src = join(piWebRoot, name);
  if (!existsSync(src)) {
    warn(`pi-web 缺少条目，跳过：${name}`);
    continue;
  }
  const dest = join(piDistDir, name);
  console.log(`${LOG} 复制 ${name} …`);
  cpSync(src, dest, {
    recursive: true,
    force: true,
    dereference: true, // symlink 在设备侧 EACCES → 一律复制实体
    // .next/cache 是构建缓存，运行不需要（pi-web 的 files 字段也显式剔除）。
    filter: (p) => !p.includes(`${sep}.next${sep}cache`),
  });
}
// .next/cache 是构建缓存，运行不需要（pi-web 的 files 字段也显式剔除）。
rmSync(join(piDistDir, '.next', 'cache'), { recursive: true, force: true });

console.log(`${LOG} 复制 node_modules（按运行期闭包裁剪）…`);
const destNodeModules = join(piDistDir, 'node_modules');
mkdirSync(destNodeModules, { recursive: true });
let copied = 0;
let skipped = 0;
for (const entry of readdirSync(piWebNodeModules, { withFileTypes: true })) {
  if (entry.name === '.bin' || entry.name === '.package-lock.json') continue; // .bin 全是符号链接，设备侧无用
  if (!entry.isDirectory()) continue;
  if (entry.name.startsWith('@')) {
    const scopeSrc = join(piWebNodeModules, entry.name);
    const scopeDest = join(destNodeModules, entry.name);
    mkdirSync(scopeDest, { recursive: true });
    for (const scoped of readdirSync(scopeSrc, { withFileTypes: true })) {
      if (!scoped.isDirectory()) continue;
      const name = `${entry.name}/${scoped.name}`;
      if (!runtimeTopLevel.has(name)) { skipped += 1; continue; }
      cpSync(join(scopeSrc, scoped.name), join(scopeDest, scoped.name), { recursive: true, force: true, dereference: true });
      copied += 1;
    }
    if (readdirSync(scopeDest).length === 0) rmSync(scopeDest, { recursive: true, force: true });
    continue;
  }
  if (!runtimeTopLevel.has(entry.name)) { skipped += 1; continue; }
  cpSync(join(piWebNodeModules, entry.name), join(destNodeModules, entry.name), {
    recursive: true, force: true, dereference: true,
  });
  copied += 1;
}
console.log(`${LOG} node_modules：复制 ${copied} 个顶层包，跳过 ${skipped} 个（devDependency / 非运行期依赖）`);

/**
 * ⚠️ 裁剪规则按**包名**判断，不靠路径子串。
 *
 * 为什么改：初版按「路径里含 arm64/linux-arm64/ohos 才保留」判断，会把
 * `next/next-swc-fallback/@next/swc-win32-x64-msvc/…` 一并删掉。实测两次后果：
 *   1. 删掉它之后 `next start` 首次运行会打印
 *      `Downloading swc package @next/swc-win32-x64-msvc... `，从 registry 拉 34 MB 到
 *      `%LOCALAPPDATA%\next-swc`，就绪时间从 **1.5 s 变成 5.8 s**。
 *   2. 目标设备**离线**（`PI_OFFLINE=1`，且设备无 npm），这条下载会失败或长时间超时。
 *
 * 例外：`@earendil-works/pi-tui` 的原生件是**平台专用**的（darwin / linux-x11 / win32），
 * 设备侧永远用不到，可以安全删掉，省下无谓体积。
 */
const PRUNE_KEEP_PACKAGES = new Set(['@next/swc-win32-x64-msvc']);
let prunedNative = 0;
let prunedNativeBytes = 0;

function pruneNativeTree(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      pruneNativeTree(full);
      if (existsSync(full) && readdirSync(full).length === 0) rmSync(full, { recursive: true, force: true });
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.node$/i.test(entry.name)) continue;
    // 包名 = 目标树里的首个路径段（scoped 时为 `@scope/name` 两段）
    const rel = full.slice(destNodeModules.length + 1).replaceAll('\\', '/');
    const segs = rel.split('/');
    const pkgName = segs[0].startsWith('@') ? `${segs[0]}/${segs[1]}` : segs[0];
    if (PRUNE_KEEP_PACKAGES.has(pkgName)) continue;
    let size = 0;
    try { size = statSync(full).size; } catch { /* 不可读则记 0 */ }
    try {
      rmSync(full, { force: true });
      prunedNative += 1;
      prunedNativeBytes += size;
      console.log(`${LOG}   裁剪 node_modules/${rel}  (${(size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      warn(`裁剪失败 ${full}: ${err.message}`);
    }
  }
}

pruneNativeTree(destNodeModules);
console.log(`${LOG} 副本内裁剪平台专用原生件：${prunedNative} 项，合计 ${(prunedNativeBytes / 1024 / 1024).toFixed(2)} MB`);

/**
 * SWC 的 aarch64-ohos 缺口（⬜ 设备侧待验证，工程规划 §11.1）。
 *
 * Next 在运行期用 SWC 编译 `next.config.ts`（本工程实测：没有可用 SWC 时会走 fallback 并
 * 试图联网补下载）。npm 上 `@next/swc` 只有两种 linux-arm64 变体：
 *   - `@next/swc-linux-arm64-musl`  ← **ohos 是 musl，优先试它**
 *   - `@next/swc-linux-arm64-gnu`
 * **没有 `@next/swc-linux-arm64-ohos`**（已核对 registry）。
 *
/**
 * SWC 的 aarch64-ohos 缺口 —— 用**WASM 版 SWC** 彻底解决（✅ 已真机复验）。
 *
 * 背景：Next 在运行期用 SWC 编译 `next.config.ts`。npm 上 `@next/swc` 只有两种
 * linux-arm64 变体（`musl` / `gnu`），**没有 `ohos`**（已核对 registry）。缺原生绑定时
 * Next 的 `tryLoadWasmWithFallback`（`dist/build/swc/index.js`）分两步走：
 *   ① `loadWasm('')` —— 这一步对**裸包名也先做 `pathToFileURL()`**，得到的是
 *      `<cwd>/@next/swc-wasm-nodejs` 这种不存在的路径，因此**必然失败**；
 *   ② 回退到 `downloadWasmSwc(nextVersion, wasmDirectory)`，其中
 *      `wasmDirectory = join(dirname(require.resolve('next/package.json')), 'wasm')`
 *      即 `node_modules/next/wasm/`；该函数**先看 `node_modules/next/wasm/@next/swc-wasm-nodejs/`
 *      是否存在，存在就直接 return（既不联网也不读 npm 缓存）**；随后
 *      `loadWasm(wasmDirectory)` 以**绝对路径** import 该目录下的 `wasm.js`。
 *
 * ⚠️ v1.1 的落点（`node_modules/@next/swc-wasm-nodejs`）是错的 —— 那正是第 ① 步的死路。
 * 当时“内置后零下载”的结论是**假阳性**：宿主机早先一次联网下载把 `node_modules/next/wasm/@next/…`
 * 留在了产物副本里，掩盖了真实机制。真机（全新安装、无外网）首次启动即卡在补下载上：
 *   `Downloading swc package @next/swc-wasm-nodejs... to /data/storage/el2/base/files/tmp/next-swc`
 * 之后既无成功也无失败日志，页面永久停在启动闪屏。
 *
 * A/B 复现（本机 Node 22.17，删掉 `node_modules/next/wasm/` 前后各跑一次 `loadBindings()`）：
 *   - 无 `next/wasm/`：`Downloading swc package @next/swc-wasm-nodejs...` ← 与真机日志逐字一致
 *   - 有 `next/wasm/`：**0 次下载**，`BINDINGS OK, transform=function`
 *
 * 因此把 `@next/swc-wasm-nodejs@<next 版本>` 内置到 **`node_modules/next/wasm/@next/`**。
 * WASM 是**平台无关**的 —— 同一份字节在 aarch64-ohos 上同样可用，不需要交叉编译。
 */
const WASM_SWC_PKG = '@next/swc-wasm-nodejs';
/**
 * Next 探测 WASM SWC 的**唯一生效落点**：`<next 包目录>/wasm/@next/swc-wasm-nodejs/`。
 * 与 `downloadWasmSwc` 的提前返回条件、`loadWasm(wasmDirectory)` 的 import 路径三者必须一致；
 * 改动此处必须同步核对 `dist/build/swc/index.js` 的 `tryLoadWasmWithFallback`。
 */
const WASM_SWC_DEST = ['next', 'wasm', '@next', 'swc-wasm-nodejs'];
function provisionWasmSwc() {
  const nextVersion = JSON.parse(
    readFileSync(join(piWebNodeModules, 'next', 'package.json'), 'utf8'),
  ).version;
  const spec = `${WASM_SWC_PKG}@${nextVersion}`;
  const dest = join(destNodeModules, ...WASM_SWC_DEST);
  if (existsSync(join(dest, 'wasm_bg.wasm')) && existsSync(join(dest, 'wasm.js'))) {
    console.log(`${LOG} ✔ WASM SWC 已就位（${spec}）`);
    return;
  }
  console.log(`${LOG} 内置 WASM SWC：${spec}`);
  // 先在 npm 缓存里找，避免每次重新下载；找不到再 pack。
  let tgz = null;
  try {
    const packDir = join(projectRoot, '.collect-pi-tmp');
    mkdirSync(packDir, { recursive: true });
    const expected = join(packDir, `next-swc-wasm-nodejs-${nextVersion}.tgz`);
    if (existsSync(expected)) {
      tgz = expected;
      console.log(`${LOG} 复用已下载的 ${expected.split(/[\\/]/).pop()}`);
    } else {
      const out = execFileSync('npm', ['pack', spec, '--silent'], {
        cwd: packDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
        shell: process.platform === 'win32',
      }).trim().split('\n').pop();
      tgz = join(packDir, out);
      if (!existsSync(tgz)) fail(`npm pack ${spec} 未产出归档（期望 ${tgz}）`);
    }
  } catch (err) {
    fail(
      `下载 ${spec} 失败：${err.message.split('\n')[0]}\n` +
        '  该包是离线的关键：缺了它，设备侧 Next 会尝试联网补下载 SWC 而失败/超时。',
    );
  }
  // 用 Python tarfile 解压（避免 Git-Bash tar 的盘符路径问题），取 package/ 下所有文件
  const py = `
import os, sys, tarfile
arch, dest = sys.argv[1], sys.argv[2]
os.makedirs(dest, exist_ok=True)
with tarfile.open(arch, 'r:gz') as t:
    for m in t.getmembers():
        parts = m.name.split('/')
        if len(parts) <= 1 or parts[0] != 'package':
            continue
        rel = '/'.join(parts[1:])
        if not rel:
            continue
        target = os.path.join(dest, rel)
        if m.isdir():
            os.makedirs(target, exist_ok=True)
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        src = t.extractfile(m)
        with open(target, 'wb') as out:
            while True:
                chunk = src.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
print('ok')
`;
  try {
    execFileSync('python', ['-c', py, tgz, dest], { stdio: ['ignore', 'pipe', 'inherit'] });
  } catch (err) {
    fail(`解压 ${spec} 失败：${err.message.split('\n')[0]}（需要系统 PATH 上有 python）`);
  }
  if (!existsSync(join(dest, 'wasm_bg.wasm'))) fail(`解压后缺 wasm_bg.wasm：${dest}`);
  const { files, bytes } = measureTree(dest);
  console.log(`${LOG} ✔ WASM SWC 已内置 → node_modules/${WASM_SWC_DEST.join('/')}（${files} 个文件，${human(bytes)}）`);
}

// 顶层 package.json 仍是 pi-web 的（Next 读它解析版本与依赖），node_modules 已按闭包裁剪：
// Next 不会在运行期校验 node_modules 完整性（它只 require 需要的包），故无需改写依赖清单。
console.log(`${LOG} 保留 pi-dist/package.json 原样（${piWebPkg.name}@${piWebPkg.version}）`);
provisionWasmSwc();

// ── 3. 壳预置资源（投放源，不是生效位置）──────────────────────────────
banner('3. 壳预置资源 → pi-dist/resources/pi-agent/');
const resourceRoot = join(piDistDir, 'resources', 'pi-agent');
mkdirSync(join(resourceRoot, 'extensions'), { recursive: true });
mkdirSync(join(resourceRoot, 'skills'), { recursive: true });

const resourceSources = [
  { label: 'config/（settings.json / mcp.json 模板）', src: join(projectRoot, 'config'), dest: resourceRoot,
    required: ['settings.json', 'mcp.json'] },
  { label: 'extensions/（壳专用扩展）', src: join(projectRoot, 'extensions'), dest: join(resourceRoot, 'extensions') },
  { label: 'skills/（壳专用技能）', src: join(projectRoot, 'skills'), dest: join(resourceRoot, 'skills') },
];
const missingSources = [];
for (const source of resourceSources) {
  if (!existsSync(source.src)) {
    missingSources.push(source.src);
    warn(`壳资源源目录缺失：${source.src}（${source.label}）`);
    continue;
  }
  cpSync(source.src, source.dest, { recursive: true, force: true, dereference: true });
  const { files, bytes } = measureTree(source.dest);
  console.log(`${LOG} ✔ ${source.label} → ${source.dest}（${files} 个文件，${human(bytes)}）`);
  for (const required of source.required ?? []) {
    if (!existsSync(join(source.dest, required))) warn(`预置文件缺失：${join(source.dest, required)}`);
  }
}
if (missingSources.length > 0) {
  if (STRICT) fail(`--strict：壳资源源目录缺失 → ${missingSources.join(' | ')}`);
  warn('壳资源不完整（主进程首次启动时会自行写默认 settings.json / mcp.json），加 --strict 可将其视为致命错误');
}

// ── 4. 断言 + 统计 ────────────────────────────────────────────────────
banner('4. 产物断言与统计');
const serverEntry = REQUIRED_SERVER_ENTRIES.find((rel) => existsSync(join(piDistDir, rel)));
if (!serverEntry) {
  fail(`pi-dist 缺少 Next 服务入口（探测：${REQUIRED_SERVER_ENTRIES.join(' | ')}）`);
}
if (!existsSync(join(piDistDir, REQUIRED_PI_ENTRY))) {
  fail(`pi-dist 缺少 pi SDK 入口：${join(piDistDir, REQUIRED_PI_ENTRY)}\n    → pi-web 的 @earendil-works/* 必须由同级 ${resolve(projectRoot, '../pi')} 解析`);
}
console.log(`${LOG} ✔ Next 服务入口 = pi-dist/${serverEntry.replaceAll('\\', '/')}`);
console.log(`${LOG} ✔ pi SDK 入口    = pi-dist/${REQUIRED_PI_ENTRY.replaceAll('\\', '/')}`);

const distStats = measureTree(piDistDir);
console.log(`${LOG} pi-dist：${distStats.files} 个文件，${human(distStats.bytes)}`);

// ── 5. 打包 ustar tar.gz ──────────────────────────────────────────────
banner('5. 打包 pi-dist.tar.gz（--format=ustar）');
try {
  execFileSync('tar', ['--version'], { stdio: 'ignore' });
} catch {
  fail('未找到 tar（Windows Git Bash 自带）。请安装 tar 或改用 GNU tar —— ustar 格式是本产物的硬要求。');
}
if (existsSync(archivePath)) rmSync(archivePath, { force: true });
try {
  /**
   * ⚠️ 路径必须用**相对路径**。这是踩了两次之后定下的规则。
   *
   * Git-Bash 的 `tar` 把任何以盘符开头的路径（`D:\x\y` 与 `D:/x/y` **都**）当成
   * **远程主机**来解析，报 `tar (child): Cannot connect to D: resolve failed`
   * （正斜杠形式也一样失败，实测）。相对路径不受影响：把 `cwd` 设为工程根，
   * 归档名与源目录都用相对名即可。
   */
  execFileSync('tar', ['-czf', 'pi-dist.tar.gz', '--format=ustar', '-C', '.', 'pi-dist'], {
    cwd: projectRoot, stdio: 'inherit', shell: process.platform === 'win32',
  });
} catch (err) {
  fail(`tar 打包失败：${err.message.split('\n')[0]}`);
}
if (!existsSync(archivePath)) fail(`tar 打包后未找到归档：${archivePath}`);

// ── 6. 写 SHA-256 marker ──────────────────────────────────────────────
banner('6. 计算 SHA-256 并写 pi-dist.version');
const hash = await new Promise((resolvePromise, reject) => {
  const h = createHash('sha256');
  const stream = createReadStream(archivePath);
  stream.on('error', reject);
  stream.on('data', (chunk) => h.update(chunk));
  stream.on('end', () => resolvePromise(h.digest('hex')));
});
writeFileSync(versionPath, `${hash}\n`, 'utf8');

const tarStats = statSync(archivePath);
console.log(`${LOG} 归档：${archivePath}`);
console.log(`${LOG} 归档大小：${human(tarStats.size)}（未压缩 pi-dist 为 ${human(distStats.bytes)}，${distStats.files} 个文件）`);
console.log(`${LOG} SHA-256：${hash}`);
console.log(`${LOG} marker：${versionPath}`);
console.log(`\n${LOG} 完成。下一步：node scripts/collect-app.mjs`);
