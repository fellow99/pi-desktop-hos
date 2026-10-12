#!/usr/bin/env node
/**
 * brand-assets.mjs — 品牌化（需求 103：Pi Desktop 文案 / Logo / 图标 / 禁用更新检查）
 *
 * ## 为什么需要它
 *
 * 交付包里有两处「别人的品牌」必须换成我们自己的（`specs/103-branding/spec.md`）：
 *
 * 1. **应用图标**：`AppScope/resources/base/media/*` 与状态栏字形
 *    `runtime-overlays/web_engine/.../electron_white.png` 之前是参考工程拷贝来的**占位图**；
 * 2. **Web UI**：pi-web 的构建产物里 `Pi Web` 文案与自带图标（favicon / PWA 图标 / 页面 Logo）。
 *
 * 上游三个仓（`../pi`、`../pi-web`、`../harmonypc-electron`）**一个字节都不能改**（零补丁纪律），
 * 所以品牌化只能在**本工程自己的产物**上施加：本工程自有的 `AppScope/`、overlay 源目录，
 * 以及 `pi-dist/`（`collect-pi` 复制出来的副本）。
 *
 * ## 物料（唯一来源 = 父工程 assets/）
 *
 * | 文件 | 属性（**硬校验**） | 用途 |
 * |---|---|---|
 * | `logo-1024-with-bg.png` | 1024²、**真不透明**（解出的 minAlpha 必须 = 255） | 应用级图标（要求 1024² 且无 alpha）、512² PWA 图标 |
 * | `logo.png` | 200²、**真的含透明像素**（minAlpha < 255） | 窗口图标、状态栏字形、192/180² 图标、favicon |
 * | `logo.svg` | 可解析的矢量（含 `<svg` 与 `viewBox`） | 页面 Logo（hero / 登录页），任意尺寸清晰 |
 *
 * 物料缺失/尺寸不足/透明度不符/`ffmpeg` 不可用 → **一律硬失败**（绝不静默产出无品牌包）。
 *
 * ## 三个入口（幂等）
 *
 * - `applyRepoBranding()`：写本工程自有的图标位：`AppScope/.../*.png` + overlay 源
 *   `runtime-overlays/web_engine/.../electron_white.png`；**若已被 `collect-runtime` 回盖过**，
 *   同时把**生效副本** `web_engine/.../electron_white.png` 一起写掉 —— 否则「只重刷品牌物料」会让
 *   overlay 源与生效副本不一致：包内发的是旧字形，而下一次 `collect-runtime --verify-only` 会因
 *   阶段 7.6 的 md5 守卫（源 ≠ 目标）直接失败。
 * - `applyWebBranding(piDistDir)`：只写 `pi-dist/` 副本（web 图标 + favicon 路由体 + `logo.svg` +
 *   文案/Logo 路径替换 + 后置断言）。只由 `collect-pi` 调用（pi-dist 由它创建）。
 * - `assertNoBrandLeftovers(piDistDir)`：全树终检（排除 `node_modules`）—— `Pi Web` 必须为 0 处。
 *   由 `collect-pi` 在**壳预置资源投放之后**调用，覆盖 `resources/pi-agent/` 等后写目录。
 *
 * CLI：`node scripts/brand-assets.mjs [--assets <dir>]` —— 三件事都做（pi-dist 不存在时跳过 web 部分）。
 *
 * 前置：`ffmpeg` 在 PATH（图标生成）；物料目录默认 `../assets`，可用 `--assets`/`PI_ASSETS_DIR` 覆盖。
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LOG = '[brand]';

/** 文案：pi-web 的显示名 → 本工程显示名。**只替换带空格的字面量**（技术标识符是 `pi-web`/`PiWeb*`/`PI_WEB_*`）。 */
const BRAND_FROM = 'Pi Web';
const BRAND_TO = 'Pi Desktop';
/**
 * 页面 Logo 的路径替换：只改**真正渲染 Logo 的 `<img src>`**（hero / 登录页），
 * **不动**元数据里的 `href="/icons/apple-touch-icon.png"`（`rel="apple-touch-icon"` 声明的仍是 PNG）
 * 与 `public/sw.js` 的预缓存列表 —— 所以 `apple-touch-icon.png` 仍被引用、也仍然生成。
 *
 * 三种编译形态都要覆盖（实测上游产物）：
 * - 客户端 chunk（JSX 编译）：`src:"/icons/apple-touch-icon.png"`
 * - SSR HTML：`src="/icons/apple-touch-icon.png"`
 * - RSC/JSON 负载：`"src":"/icons/apple-touch-icon.png"`
 */
const LOGO_SRC_REPLACEMENTS = [
  ['"src":"/icons/apple-touch-icon.png"', '"src":"/icons/logo.svg"'],
  ['src:"/icons/apple-touch-icon.png"', 'src:"/icons/logo.svg"'],
  ['src="/icons/apple-touch-icon.png"', 'src="/icons/logo.svg"'],
];
/**
 * 必须**逐字不变**的技术标识符（spec R1）：替换后逐项比对总出现次数。
 *
 * 为什么需要：`BRAND_FROM`（带空格）与这些标识符（带连字符/下划线/驼峰）本不可能互相包含，
 * 但一旦有人把 `BRAND_FROM` 改成 `pi-web` 或把替换做成大小写不敏感，这里会立刻失败 ——
 * 它是**给未来改动准备的回归断言**，而不是「当前这次替换」的证明。
 */
const TECH_IDENTIFIERS = ['pi-web', '@agegr/pi-web', 'pi_web_session', 'PI_WEB_', 'PiWeb'];
/** 替换上限（防御：单个文本文件超过此大小不处理，避免把巨型 sourcemap 读进内存）。 */
const MAX_TEXT_BYTES = 32 * 1024 * 1024;

// ---------------------------------------------------------------- 工具

function fail(message) {
  console.error(`\n${LOG} ✖ ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`${LOG} ⚠ ${message}`);
}

function* walkFiles(dir, { skipDirs = new Set() } = {}) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full, { skipDirs });
    else if (entry.isFile()) yield full;
  }
}

/** 读 PNG 头（IHDR）。返回 null 表示不是 PNG。 */
function pngInfo(file) {
  const buf = readFileSync(file);
  if (buf.length < 26 || buf.slice(1, 4).toString('latin1') !== 'PNG') return null;
  const colorType = buf[25];
  return {
    bytes: buf.length,
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType,
    // colorType: 0=灰度 2=RGB 3=调色板 4=灰度+alpha 6=RGBA。
    // 只有 4/6 一定带 alpha；3 可能带 tRNS（因此 `scaleTo()` 对「不透明」的判定不看这里，而是要求 colorType === 2）。
    hasAlphaChannel: colorType === 4 || colorType === 6,
  };
}

function ensureFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    fail('未找到 ffmpeg（图标生成必需）。安装：Windows `scoop install ffmpeg` / `choco install ffmpeg`，或把 ffmpeg 加入 PATH。');
  }
}

/**
 * 用 ffmpeg 把图解码成 rawvideo，扫描真正的最小 alpha。
 *
 * 走**临时文件**而不是 stdout 管道：1024² RGBA = 4 MB，实测经 `execFileSync` 的 stdout 管道传输会
 * 偶发失败（子进程异常退出、父进程拿到 `E06D7363`）；写文件再读稳得多。
 */
function minAlpha(file) {
  ensureFfmpeg();
  const raw = join(tmpdir(), `pi-brand-alpha-${process.pid}-${Date.now()}.raw`);
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', raw], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const buf = readFileSync(raw);
    let min = 255;
    for (let i = 3; i < buf.length; i += 4) {
      if (buf[i] < min) {
        min = buf[i];
        if (min === 0) break;
      }
    }
    return min;
  } catch (error) {
    fail(`无法解析 PNG 的 alpha 通道：${file}\n  ${String(error.stderr ?? error.message).trim()}`);
  } finally {
    rmSync(raw, { force: true });
  }
}

/**
 * 缩放并落盘。`alpha:false` 时输出 `rgb24` → PNG `colorType=2`（无 alpha 通道且**不是**带 tRNS 的调色板图）。
 * 参数固定 → 同物料得同字节（幂等，重建不产生 git diff）。
 *
 * 两个「必须显式」的坑（都实测踩过）：
 * - `-f image2`：favicon 的目标文件名是 `.body`（Next 的路由体），能推断出的容器格式不确定；
 * - `-c:v png`：**编解码器也要显式指定** —— 否则面对 `.body` 这种未知扩展名，ffmpeg 会默认落成
 *   **JPEG**（实测 `FF D8 FF FE … Lavc61`），浏览器把它当图片仍能显示，但「图标是 PNG」的前提就悄悄破了。
 *
 * 写完**回读 IHDR** 复核（不看命令退出码）：必须是 PNG、尺寸一致、不透明时必须是 `colorType=2`。
 */
function scaleTo(src, dst, { width, height, alpha }) {
  mkdirSync(dirname(dst), { recursive: true });
  try {
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-i', src,
      '-vf', `scale=${width}:${height}:flags=lanczos,format=${alpha ? 'rgba' : 'rgb24'}`,
      '-frames:v', '1', '-c:v', 'png', '-f', 'image2', dst,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) {
    fail(`ffmpeg 生成失败：${dst}\n  源：${src}（${width}×${height}，${alpha ? 'rgba' : 'rgb24'}）\n  ${String(error.stderr ?? error.message).trim()}`);
  }
  const info = pngInfo(dst);
  if (!info) fail(`生成结果不是 PNG：${dst}`);
  if (info.width !== width || info.height !== height) fail(`生成尺寸不符：${dst} → ${info.width}×${info.height}（期望 ${width}×${height}）`);
  if (!alpha && info.colorType !== 2) {
    fail(`应用级图标必须是不带 alpha 的 RGB PNG（colorType=2）：${dst} → colorType=${info.colorType}（调色板 3 也可能带 tRNS 透明，同样不接受）`);
  }
  return dst;
}

// ---------------------------------------------------------------- 物料校验

/**
 * 解析并校验物料目录。
 *
 * 优先级：`--assets <dir>` > `$PI_ASSETS_DIR` > `../assets`（父工程）。
 */
export function loadMaterial(argv = []) {
  ensureFfmpeg();
  const flagIndex = argv.indexOf('--assets');
  const assetsDir = flagIndex >= 0 && argv[flagIndex + 1]
    ? resolve(argv[flagIndex + 1])
    : process.env.PI_ASSETS_DIR
      ? resolve(process.env.PI_ASSETS_DIR)
      : resolve(projectRoot, '..', 'assets');

  if (!existsSync(assetsDir)) {
    fail(`物料目录不存在：${assetsDir}\n  品牌化依赖**父工程** assets/（见 specs/103-branding/spec.md）。\n  可用 --assets <dir> 或 PI_ASSETS_DIR 指定。`);
  }

  const markSrc = join(assetsDir, 'logo.png');
  const masterSrc = join(assetsDir, 'logo-1024-with-bg.png');
  const svgSrc = join(assetsDir, 'logo.svg');

  for (const [label, file] of [['透明标记 logo.png', markSrc], ['不透明母版 logo-1024-with-bg.png', masterSrc], ['矢量 logo.svg', svgSrc]]) {
    if (!existsSync(file)) fail(`物料缺失：${label} → ${file}`);
  }

  const mark = pngInfo(markSrc);
  const master = pngInfo(masterSrc);
  if (!mark) fail(`物料不是 PNG：${markSrc}`);
  if (!master) fail(`物料不是 PNG：${masterSrc}`);
  if (!mark.hasAlphaChannel) fail(`logo.png 必须带透明通道（作为透明标记/字形用）：${markSrc}（colorType=${mark.colorType}）`);
  if (master.width !== 1024 || master.height !== 1024) {
    fail(`不透明母版必须是 1024×1024：${masterSrc}（实际 ${master.width}×${master.height}）`);
  }
  if (mark.width < 200 || mark.height < 200) {
    fail(`透明标记尺寸不足（至少 200×200，供 192/180² 图标下采样）：${markSrc}（实际 ${mark.width}×${mark.height}）`);
  }

  // 母版必须**真的**不透明：应用级图标要求无 alpha；若母版本身带透明，压平后透明区会变成黑/白边。
  const masterMinAlpha = minAlpha(masterSrc);
  if (masterMinAlpha !== 255) {
    fail(`不透明母版含透明像素（minAlpha=${masterMinAlpha}）：${masterSrc}\n  应用级图标要求 1024×1024 且不透明；请改用不带透明的母版。`);
  }
  // 透明标记必须**真的**有透明像素：否则 200² 窗口图标/状态栏字形会变成一整块实心方块
  // （透明通道存在但全 255，最容易发生的误配置）。
  const markMinAlpha = minAlpha(markSrc);
  if (markMinAlpha === 255) {
    fail(`透明标记不含任何透明像素（minAlpha=255）：${markSrc}\n  窗口图标与状态栏字形依赖它的透明底；请提供带透明背景的 logo.png。`);
  }

  const svgText = readFileSync(svgSrc, 'utf8');
  if (!/<svg[\s>]/i.test(svgText) || !/viewBox\s*=/.test(svgText)) {
    fail(`矢量物料不像合法 SVG（需要 <svg …> 与 viewBox）：${svgSrc}\n  若这是被截断/错误保存的文件，请重新导出。`);
  }

  console.log(`${LOG} 物料：${assetsDir}`);
  console.log(`${LOG}   透明标记 ${mark.width}×${mark.height}（含 alpha，minAlpha=${markMinAlpha}）｜不透明母版 ${master.width}×${master.height}（minAlpha=255）｜矢量 svg（viewBox 已校验）`);
  return { assetsDir, markSrc, masterSrc, svgSrc, mark, master, markMinAlpha, masterMinAlpha };
}

// ---------------------------------------------------------------- 本工程自有图标位

/** 应用级不透明图标（1024²，无 alpha）：被 app.json5 / module.json5 / shortcuts 引用。 */
const REPO_OPAQUE_ICONS = ['app_icon.png', 'startIcon.png', 'icon.png', 'product_logo_32.png'];
/** 允许透明的小图标：EntryEntryAbility 窗口图标 + 状态栏（托盘）字形（后者同时是 overlay 源）。 */
const REPO_ALPHA_ICONS = [
  'AppScope/resources/base/media/window_icon.png',
  'runtime-overlays/web_engine/src/main/resources/resfile/resources/app/electron_white.png',
];

/**
 * 写本工程自有的图标位（AppScope + overlay 状态栏字形，以及它的**生效副本**）。幂等。
 *
 * 注意：这里**只换文件内容**，不改 `app.json5` / `module.json5`（图标名与引用保持原样），
 * 因此不存在配置漂移风险。
 */
export function applyRepoBranding({ material, log = true } = {}) {
  const m = material ?? loadMaterial();
  const results = [];

  for (const name of REPO_OPAQUE_ICONS) {
    const dst = join(projectRoot, 'AppScope/resources/base/media', name);
    scaleTo(m.masterSrc, dst, { width: 1024, height: 1024, alpha: false });
    results.push(dst);
  }
  for (const rel of REPO_ALPHA_ICONS) {
    const dst = join(projectRoot, rel);
    scaleTo(m.markSrc, dst, { width: 200, height: 200, alpha: true });
    results.push(dst);
    // overlay 源写完后，若**生效副本**已存在（即 collect-runtime 已回盖过），同步写一份：
    // 否则「只重刷品牌物料」会留下「源已换、包内还是旧字形」的不一致，且下一次阶段 7.6 守卫会失败。
    if (rel.startsWith('runtime-overlays/')) {
      const applied = join(projectRoot, rel.slice('runtime-overlays/'.length));
      if (existsSync(applied)) {
        cpSync(dst, applied, { force: true });
        results.push(applied);
      }
    }
  }

  if (log) {
    console.log(`${LOG} ✔ 本工程图标 ${results.length} 项已按物料生成（应用级 1024²/无 alpha，窗口与状态栏 200²/允许 alpha，含生效副本）`);
    for (const file of results) {
      const info = pngInfo(file);
      console.log(`${LOG}   ${relative(projectRoot, file).replaceAll('\\', '/')}  ${info.width}×${info.height}  ${info.hasAlphaChannel ? 'alpha' : '不透明'}`);
    }
  }
  return results;
}

// ---------------------------------------------------------------- Web 产物（pi-dist 副本）

/** 二进制判定：前 8 KiB 有 NUL 或非 UTF-8 → 不做文本替换。 */
function isProbablyText(buf) {
  const head = buf.subarray(0, Math.min(buf.length, 8192));
  for (const byte of head) if (byte === 0) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

function countOccurrences(text, needle) {
  let count = 0;
  let index = text.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * 品牌文案 + Logo `<img src>` 路径替换（只在 pi-dist 副本上）。
 *
 * 同时统计**技术标识符**集合的出现次数：替换前后必须逐项不变（spec R1 的回归断言）。
 */
function replaceBrandInTree(roots) {
  const stats = {
    scanned: 0, changed: 0, skippedLarge: 0, skippedBinary: 0,
    brand: 0, logoPath: 0, techBefore: 0, techAfter: 0, changedFiles: [],
  };

  for (const root of roots) {
    for (const file of walkFiles(root)) {
      let size = 0;
      try {
        size = statSync(file).size;
      } catch {
        continue;
      }
      if (size === 0 || size > MAX_TEXT_BYTES) {
        if (size > MAX_TEXT_BYTES) stats.skippedLarge += 1;
        continue;
      }
      const buf = readFileSync(file);
      if (!isProbablyText(buf)) {
        stats.skippedBinary += 1;
        continue;
      }
      stats.scanned += 1;
      const text = buf.toString('utf8');
      for (const id of TECH_IDENTIFIERS) stats.techBefore += countOccurrences(text, id);

      let next = text;
      let brandHits = 0;
      let logoHits = 0;
      if (next.includes(BRAND_FROM)) {
        brandHits = countOccurrences(next, BRAND_FROM);
        next = next.split(BRAND_FROM).join(BRAND_TO);
      }
      for (const [from, to] of LOGO_SRC_REPLACEMENTS) {
        if (!next.includes(from)) continue;
        logoHits += countOccurrences(next, from);
        next = next.split(from).join(to);
      }

      for (const id of TECH_IDENTIFIERS) stats.techAfter += countOccurrences(next, id);
      if (brandHits === 0 && logoHits === 0) continue;

      writeFileSync(file, next, 'utf8');
      stats.brand += brandHits;
      stats.logoPath += logoHits;
      stats.changed += 1;
      stats.changedFiles.push({ file: relative(join(projectRoot, 'pi-dist'), file).replaceAll('\\', '/'), brandHits, logoHits });
    }
  }
  return stats;
}

/**
 * 写 pi-dist 副本的 web 品牌：图标 + favicon + `logo.svg` + 文案/Logo 路径替换，最后做**后置断言**。
 *
 * 断言（spec R2/AC-01）：预渲染 HTML 里不得残留 `Pi Web`、必须出现 `Pi Desktop`；
 * 技术标识符集合的出现次数不变。任一不满足 → 失败（构建失败比发一个无品牌包好）。
 */
export function applyWebBranding(piDistDir, { material } = {}) {
  const m = material ?? loadMaterial();
  if (!existsSync(piDistDir)) fail(`pi-dist 不存在：${piDistDir}（先跑 collect-pi 的组装阶段）`);

  const publicIcons = join(piDistDir, 'public', 'icons');
  // ① 页面 Logo（矢量，任意尺寸清晰）—— 与物料**逐字节一致**（`cpSync`，不经 ffmpeg）
  cpSync(m.svgSrc, join(publicIcons, 'logo.svg'), { force: true });
  // ② 小位图：透明标记下采样（200 → 192/180，不放大）
  scaleTo(m.markSrc, join(publicIcons, 'icon-192.png'), { width: 192, height: 192, alpha: true });
  scaleTo(m.markSrc, join(publicIcons, 'apple-touch-icon.png'), { width: 180, height: 180, alpha: true });
  // ③ 大位图：不透明母版下采样（512²；PWA/launcher 用，带底更像应用图标；不允许把 200² 放大）
  scaleTo(m.masterSrc, join(publicIcons, 'icon-512.png'), { width: 512, height: 512, alpha: false });
  // ④ favicon：上游把它编译成路由体（内容是 PNG 字节），此处同样写 PNG 字节（文件名保持 .ico，内容 192² 透明标记）
  const faviconBody = join(piDistDir, '.next', 'server', 'app', 'favicon.ico.body');
  if (!existsSync(faviconBody)) {
    fail(`未找到 favicon 路由体：${faviconBody}\n  pi-web 构建产物结构可能已变（favicon 现在可能走别的路径）；请更新 brand-assets.mjs 后再构建 —— 不得静默沿用上游图标。`);
  }
  scaleTo(m.markSrc, faviconBody, { width: 192, height: 192, alpha: true });

  // ⑤ 文案与 Logo `<img src>` 路径替换
  const stats = replaceBrandInTree([join(piDistDir, '.next'), join(piDistDir, 'public'), join(piDistDir, 'bin')]);
  console.log(`${LOG} ✔ web 品牌替换：扫描 ${stats.scanned} 个文本文件，改写 ${stats.changed} 个（文案 ${stats.brand} 处、Logo 路径 ${stats.logoPath} 处）`);
  if (stats.skippedBinary > 0) console.log(`${LOG}   跳过二进制 ${stats.skippedBinary} 个${stats.skippedLarge > 0 ? `、超大文本 ${stats.skippedLarge} 个` : ''}`);

  // ⑥ 后置断言
  if (stats.brand === 0) warn(`本次未改写任何 "${BRAND_FROM}"（重复运行或 pi-web 已自行改名）`);
  for (const rel of ['.next/server/app/index.html', '.next/server/app/login.html']) {
    const file = join(piDistDir, rel);
    if (!existsSync(file)) {
      fail(`品牌化断言失败：缺少预渲染文档 ${rel}（pi-web 构建产物结构已变，请更新 brand-assets.mjs 的断言）`);
    }
    const html = readFileSync(file, 'utf8');
    const remaining = countOccurrences(html, BRAND_FROM);
    if (remaining > 0) {
      fail(`品牌化断言失败：${rel} 仍含 ${remaining} 处 "${BRAND_FROM}"（替换规则需更新：pi-web 可能改了文案写法）`);
    }
    if (!html.includes(BRAND_TO)) {
      fail(`品牌化断言失败：${rel} 未出现 "${BRAND_TO}"`);
    }
  }
  if (stats.techBefore !== stats.techAfter) {
    fail(`品牌化断言失败：技术标识符出现次数被改变（${stats.techBefore} → ${stats.techAfter}）—— 替换规则误伤，请检查 brand-assets.mjs 的 BRAND_FROM/LOGO_SRC_REPLACEMENTS`);
  }
  console.log(`${LOG} ✔ 断言通过：index.html/login.html 无 "${BRAND_FROM}"、含 "${BRAND_TO}"；技术标识符集合计数未变（${stats.techAfter}）`);

  return { stats, favicon: faviconBody };
}

/**
 * 全树终检：pi-dist（排除 `node_modules`）内**不得**再出现 `Pi Web`。
 *
 * 为什么需要单独一步：`applyWebBranding()` 只扫 `.next`/`public`/`bin`，而 `collect-pi` 在它**之后**
 * 才投放 `resources/pi-agent/`（config/ + extensions/ + skills/）—— 那些目录里的旧品牌文案只能靠
 * 这一步兜住（本工程自己的文件已在源码侧改好，这里是机器断言，防止将来回退）。
 */
export function assertNoBrandLeftovers(piDistDir) {
  const hits = [];
  for (const file of walkFiles(piDistDir, { skipDirs: new Set(['node_modules']) })) {
    let buf;
    try {
      buf = readFileSync(file);
    } catch {
      continue;
    }
    if (buf.length === 0 || buf.length > MAX_TEXT_BYTES) continue;
    if (!isProbablyText(buf)) continue;
    const count = countOccurrences(buf.toString('utf8'), BRAND_FROM);
    if (count > 0) hits.push(`${relative(piDistDir, file).replaceAll('\\', '/')}（${count} 处）`);
  }
  if (hits.length > 0) {
    fail(`品牌化终检失败：pi-dist 内仍有 "${BRAND_FROM}" ——\n  ${hits.slice(0, 20).join('\n  ')}${hits.length > 20 ? `\n  …共 ${hits.length} 个文件` : ''}`);
  }
  console.log(`${LOG} ✔ 终检通过：pi-dist（排除 node_modules）内 "${BRAND_FROM}" = 0 处`);
  return { hits: 0 };
}

// ---------------------------------------------------------------- CLI

function main() {
  const argv = process.argv.slice(2);
  const material = loadMaterial(argv);
  console.log(`${LOG} ── ① 本工程自有图标位（AppScope + overlay 状态栏字形 + 生效副本）`);
  applyRepoBranding({ material });
  const piDistDir = join(projectRoot, 'pi-dist');
  if (existsSync(piDistDir)) {
    console.log(`${LOG} ── ② pi-dist 副本（web 图标 + 文案 + Logo 路径）`);
    applyWebBranding(piDistDir, { material });
    console.log(`${LOG} ── ③ pi-dist 终检（排除 node_modules）`);
    assertNoBrandLeftovers(piDistDir);
  } else {
    console.log(`${LOG} 跳过 pi-dist（尚未生成；collect-pi 会自行调用本模块）`);
  }
  console.log(`${LOG} 完成。`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
