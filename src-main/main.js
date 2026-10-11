/**
 * pi-desktop-hos — Electron 主进程（Electron-on-鸿蒙 运行时）
 *
 * 职责（对应设计文档 §4.2 / §4.8 / §4.9）：环境装配 → 产物就位 → 进程内拉起 Next 服务器
 * → HTTP 轮询就绪 → 建窗加载 Pi Web UI → 生命周期收尾。全部日志带 [pi-desktop] 前缀，
 * 每一步都失败可见（窗口标题 + loading 页文本 + globalThis.__*Error，禁止静默空白窗）。
 *
 * 部署形态：pi 部署产物（pi-dist/）先打成 ustar tar.gz 与 main.js 同目录放入 resfile
 * （HAP 内数万小文件会拖死 hvigor、也易令 Electron 启动 CHECK 崩溃），首次启动解压到
 * <userData>/pi-dist 后加载；幂等判据是 **SHA-256 marker**（pi-dist.version 里的 tar 哈希），
 * 不是「目录存在」——后者会导致就地升级不生效。
 *
 * 平台事实（真机实测结论，勿「优化」掉）：
 *   - homedir() = /storage/Users/currentUser 不可写 → HOME/USERPROFILE 指向 userData；
 *   - TMPDIR 环境变量对 Node 无效 → 必须 monkey-patch os.tmpdir()；
 *   - symlink 在应用域 EACCES → 壳资源一律 copy 物化，绝不 symlink；
 *   - 渲染进程访问 127.0.0.1 被 loopback 隔离 → 服务端绑 0.0.0.0、页面用局域网 IP 加载；
 *   - 子进程 SIGSYS / 僵尸泄漏 → 服务端跑在本进程内（§4.2 候选 A），仅在 A 失败时退候选 B。
 */
'use strict';

const electron = require('electron');
const { app, BrowserWindow, Menu, screen, shell } = electron;
const nodeFs = require('node:fs');
const {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync,
} = nodeFs;
const crypto = require('node:crypto');
const nodeOs = require('node:os');
const nodeHttp = require('node:http');
const nodeNet = require('node:net');
const { join, dirname } = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { extractTarGz } = require('./tar-extract.js');

// ── 常量 ──────────────────────────────────────────────────────────────
const LOG = '[pi-desktop]';

const APP_DIR = __dirname;
/** pi 产物归档与它的 SHA-256 marker 文件（由 scripts/collect-pi.mjs 在构建期生成）。 */
const ARCHIVE_PATH = join(APP_DIR, 'pi-dist.tar.gz');
const VERSION_PATH = join(APP_DIR, 'pi-dist.version');
/** 幂等 marker：内容 = 已解压归档的 SHA-256，写在 <userData>/ 下（不污染 pi-dist 内容）。 */
const MARKER_NAME = 'pi-dist.sha256';

/** 就绪探测：HTTP 轮询（**不**监听 stdout 的 "Ready" —— 那是子进程方案的做法）。 */
const READY_TIMEOUT_MS = 30_000;
const READY_INTERVAL_MS = 400;
const READY_PROBE_PATH = '/api/web-auth';
/** pi-web UI 标记（app/layout.tsx 的 metadata.title = "Pi Web"）。 */
const UI_HTML_MARKERS = ['Pi Web'];

/** pi-web 会话 cookie / Basic 用户名，镜像 pi-web/lib/web-auth.ts（改动需同步）。 */
const PI_WEB_SESSION_COOKIE = 'pi_web_session';
const PI_WEB_AUTH_USERNAME = 'pi';
const PI_WEB_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/** ArkTS 外链桥：web_engine HAR 提供，签名约定见 openExternalUrl()。 */
const EXTERNAL_WEB_BRIDGE = 'ExternalWeb.Open';

/** 打包进归档的壳预置资源在 pi-dist 内的落点（投放源，不是生效位置，§5.3b 规则 3）。 */
const BUNDLED_RESOURCES_REL = join('resources', 'pi-agent');

// ── 启动 loading 页 ───────────────────────────────────────────────────
// 首装要解压数百 MB 的 pi-dist.tar.gz（数十秒量级）+ 起 Next 服务，直接加载真实 URL 会长时间白屏。
// 页面自带 __piSetStage(stage, isError)，主进程用 executeJavaScript 逐阶段更新文本。
const LOADING_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pi Desktop</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #0f1115; color: #e6e8ec; font-family: system-ui, -apple-system, sans-serif;
      gap: 18px; padding: 24px; text-align: center;
    }
    .spinner {
      width: 40px; height: 40px; border-radius: 50%;
      border: 3px solid rgba(255,255,255,0.15); border-top-color: #4c9aff;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .title { font-size: 18px; font-weight: 600; }
    .stage { font-size: 13px; color: #8a9099; max-width: 720px; line-height: 1.5; white-space: pre-wrap; }
    .stage.error { color: #ff7b72; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="spinner" id="spinner"></div>
  <div class="title">Pi Desktop</div>
  <div class="stage" id="stage">应用初始化中，请稍候…</div>
  <script>
    window.__piSetStage = function (text, isError) {
      try {
        var el = document.getElementById('stage');
        if (el) { el.textContent = text; el.className = 'stage' + (isError ? ' error' : ''); }
        var sp = document.getElementById('spinner');
        if (sp && isError) { sp.style.display = 'none'; }
      } catch (e) { /* 页面注入失败时忽略：标题栏仍有阶段文本 */ }
    };
  </script>
</body>
</html>`;
const LOADING_URL = 'data:text/html;charset=utf-8,' + encodeURIComponent(LOADING_HTML);

// ── 进程级状态 ────────────────────────────────────────────────────────
const state = {
  userData: null,
  piAgentDir: null,
  tmpDir: null,
  piDistRoot: null,
  lanIp: null,
  port: null,
  password: null,
  server: null, // { port, url, password, mode, close }
  win: null,
  stage: 'boot',
};

function logInfo(msg) { console.log(`${LOG} ${msg}`); }
function logWarn(msg) { console.warn(`${LOG} ${msg}`); }
function logError(msg) { console.error(`${LOG} ${msg}`); }

/** 扁平化提取错误链（含 AggregateError.errors 与 cause）上的首行消息。 */
function describeError(err) {
  if (!err) return String(err);
  const { inspect } = require('node:util');
  const parts = [];
  const seen = new Set();
  const visit = (e, depth) => {
    if (!e || depth > 6 || seen.has(e)) return;
    seen.add(e);
    if (e.message) parts.push(String(e.message).split('\n')[0]);
    if (Array.isArray(e.errors)) for (const sub of e.errors) visit(sub, depth + 1);
    if (e.cause) visit(e.cause, depth + 1);
  };
  visit(err, 0);
  return (parts.length ? parts.join(' || ') : inspect(err, { depth: 3, colors: false })).slice(0, 2000);
}

/** 阶段推进：日志 + 窗口标题 + loading 页文本三处同步（fail-visible 的载体）。 */
function setStage(text) {
  state.stage = text;
  logInfo(`[stage] ${text}`);
  const win = state.win;
  if (!win || win.isDestroyed()) return;
  try { win.setTitle(`Pi Desktop — ${text}`); } catch { /* 标题设置失败不影响主流程 */ }
  win.webContents
    .executeJavaScript(`window.__piSetStage && window.__piSetStage(${JSON.stringify(text)}, false);`, true)
    .catch(() => { /* loading 页尚未就绪：忽略 */ });
}

/**
 * 失败可见：写 globalThis.__extractError / __hostError / __renderError（真机用 CDP 取证），
 * 同时把失败阶段写进窗口标题与 loading 页（**绝不**留静默空白窗）。
 * @param {'extract'|'host'|'render'} which
 */
function failVisible(which, err) {
  const detail = describeError(err);
  globalThis[`__${which}Error`] = `${state.stage}: ${detail}`;
  logError(`启动失败（${which}）：${detail}`);
  const win = state.win;
  if (!win || win.isDestroyed()) return;
  try { win.setTitle(`Pi Desktop — 启动失败（${which}）：${detail.slice(0, 120)}`); } catch { /* ignore */ }
  win.webContents
    .executeJavaScript(
      `window.__piSetStage && window.__piSetStage(${JSON.stringify(`启动失败（${which}）\n阶段：${state.stage}\n原因：${detail}`)}, true);`,
      true,
    )
    .catch(() => { /* ignore */ });
}

// ── 网络地址 / 端口 ───────────────────────────────────────────────────
/** 取第一个非 internal 的 IPv4（真机上渲染进程无法访问 loopback，必须用局域网 IP）。 */
function pickLanIp() {
  try {
    const ifaces = nodeOs.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const info of ifaces[name] || []) {
        if (!info) continue;
        const isV4 = info.family === 'IPv4' || info.family === 4;
        if (isV4 && !info.internal && typeof info.address === 'string') return info.address;
      }
    }
    logWarn('未找到非 internal 的 IPv4 网卡，回退 127.0.0.1（真机可能因 loopback 隔离而白屏）');
  } catch (err) {
    logError(`枚举网卡失败：${describeError(err)}`);
  }
  return '127.0.0.1';
}

/** server.listen(0) 探测后释放，取一个空闲高位端口（§4.2 步骤 4）。 */
function resolveFreePort() {
  return new Promise((resolve, reject) => {
    const probe = nodeNet.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * 非安全上下文开关：http://<局域网IP>:<port> 不满足安全上下文 → crypto.subtle / randomUUID /
 * Service Worker 受限。默认追加 unsafely-treat-insecure-origin-as-secure（PI_DESKTOP_UNSAFE_ORIGIN=0 关闭）。
 * ⚠️ 必须在**第一个渲染进程 spawn 之前**调用：Electron 在创建 renderer 时把当前命令行开关下发给子进程，
 * app ready 之后再追加对已存在的 renderer 无效。
 */
function applyCommandLineSwitches() {
  const unsafeOrigin = process.env.PI_DESKTOP_UNSAFE_ORIGIN;
  const enabled = !(unsafeOrigin === '0' || unsafeOrigin === 'false' || unsafeOrigin === 'off');
  if (state.lanIp && state.port && enabled) {
    const origin = `http://${state.lanIp}:${state.port}`;
    app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', origin);
    logInfo(`已追加 unsafely-treat-insecure-origin-as-secure=${origin}（PI_DESKTOP_UNSAFE_ORIGIN=0 可关闭）`);
  } else if (!enabled) {
    logWarn('PI_DESKTOP_UNSAFE_ORIGIN 已关闭：非安全上下文限制（crypto.subtle / SW）将按浏览器默认生效');
  }
}

// ── (a) 环境装配：必须在任何 pi 代码被 require 之前完成 ─────────────────
/**
 * 沙箱环境装配（设计文档 §4.2 步骤 1 + §4.6 映射表）：
 *   HOME / USERPROFILE → userData；PI_CODING_AGENT_DIR → <userData>/pi-agent；
 *   TMPDIR → <userData>/tmp（并 monkey-patch os.tmpdir()，真机上环境变量对 Node 无效）；
 *   PI_OFFLINE=1（PL1 插件策略：不自动安装包源、不下载 fd/rg）；NO_PROXY 追加 loopback + 局域网 IP。
 * 同时创建 pi-agent 目录树与预置模板（仅缺失时写入）以及默认工作目录 <userData>/pi-cwd。
 */
function assembleSandboxEnv() {
  const userData = state.userData || app.getPath('userData');
  const piAgentDir = join(userData, 'pi-agent');
  const tmpDir = join(userData, 'tmp');
  const cwdRoot = join(userData, 'pi-cwd');
  state.userData = userData;
  state.piAgentDir = piAgentDir;
  state.tmpDir = tmpDir;
  state.piDistRoot = join(userData, 'pi-dist');

  // HOME：鸿蒙 Node 的 os.homedir() 解析自 HOME（POSIX 优先），指向沙箱外不可写目录会全线 EPERM。
  process.env.HOME = userData;
  process.env.USERPROFILE = userData;

  // pi 数据与扩展根（§5.3c）：settings.json / mcp.json / extensions / skills / sessions ...
  process.env.PI_CODING_AGENT_DIR = piAgentDir;

  // TMPDIR 只是「声明」；真机上 Node 不会因环境变量改变 os.tmpdir()，必须改函数本体。
  process.env.TMPDIR = tmpDir;
  process.env.TMP = tmpDir;
  process.env.TEMP = tmpDir;
  const originalTmpdir = nodeOs.tmpdir;
  nodeOs.tmpdir = () => tmpDir;
  logInfo(`os.tmpdir() 已 monkey-patch → ${tmpDir}（原实现返回 ${safeTmpdir(originalTmpdir)}）`);

  // PL1：关闭包自动安装与 fd/rg 二进制下载（§5.1 注入点 2；两者都变成可见 warning，不是硬失败）。
  if (!process.env.PI_OFFLINE) process.env.PI_OFFLINE = '1';

  // 代理绕过：本机请求必须直连（服务端绑 0.0.0.0，页面走局域网 IP）。
  const bypass = new Set(
    (process.env.NO_PROXY || process.env.no_proxy || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
  );
  for (const host of ['127.0.0.1', 'localhost', state.lanIp]) if (host) bypass.add(host);
  process.env.NO_PROXY = [...bypass].join(',');
  process.env.no_proxy = process.env.NO_PROXY;
  logInfo(`NO_PROXY = ${process.env.NO_PROXY}`);

  for (const dir of [
    piAgentDir, tmpDir, cwdRoot,
    join(piAgentDir, 'extensions'), join(piAgentDir, 'skills'), join(piAgentDir, 'prompts'),
    join(piAgentDir, 'themes'), join(piAgentDir, 'agents'), join(piAgentDir, 'sessions'),
    join(piAgentDir, 'tmp'),
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  // 预置模板：只在**不存在**时写入（壳预置不覆盖用户改动，§5.3b 规则 2）。
  // 键名与 pi 的 Settings 接口一致（packages / defaultProjectTrust，见 pi
  // packages/coding-agent/src/core/settings-manager.ts）；defaultProjectTrust 必须是 "ask"，
  // 绝不改成 always（§5.5 第 3 条：项目级扩展/MCP 需要用户显式信任）。
  writeIfAbsent(join(piAgentDir, 'settings.json'), JSON.stringify({
    packages: [],
    defaultProjectTrust: 'ask',
  }, null, 2) + '\n');
  writeIfAbsent(join(piAgentDir, 'mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');

  logInfo(`HOME = ${userData}`);
  logInfo(`PI_CODING_AGENT_DIR = ${piAgentDir}`);
  logInfo(`TMPDIR = ${tmpDir}`);
  logInfo(`PI_OFFLINE = ${process.env.PI_OFFLINE}`);
}

function safeTmpdir(fn) {
  try { return fn(); } catch { return '(不可用)'; }
}

function writeIfAbsent(file, content) {
  if (existsSync(file)) { logInfo(`保留已有文件：${file}`); return false; }
  writeFileSync(file, content, 'utf8');
  logInfo(`已写入预置文件：${file}`);
  return true;
}

/**
 * 壳资源 copy 物化（§5.3b 规则 1：禁用 symlink，一律 copy；真机 symlink = EACCES）。
 * 覆盖规则（已决策，别「修掉」）：
 *   - extensions/：**以壳为准**（代码类，版本漂移比覆盖更危险 → 覆盖同名）；
 *   - skills/    ：**以用户为准**（同名目录已存在则整棵跳过；技能是模型可见标识符，用户改写是有意行为）。
 * 投放源 = 解压后的 <userData>/pi-dist/resources/pi-agent/{extensions,skills}（仅放 resfile 不生效）。
 */
function materializeBundledResources() {
  const srcRoot = join(state.piDistRoot, BUNDLED_RESOURCES_REL);
  if (!existsSync(srcRoot)) {
    logWarn(`壳预置资源目录不存在，跳过物化：${srcRoot}`);
    return;
  }
  const extensions = copyBundledDir(join(srcRoot, 'extensions'), join(state.piAgentDir, 'extensions'), true);
  const skills = copyBundledDir(join(srcRoot, 'skills'), join(state.piAgentDir, 'skills'), false);
  logInfo(`壳资源物化完成：extensions 新增/覆盖 ${extensions} 项，skills 复制 ${skills} 项（同名跳过）`);
}

/** @returns {number} 实际写入的顶层条目数 */
function copyBundledDir(srcDir, destDir, overwrite) {
  if (!existsSync(srcDir)) {
    logWarn(`源目录不存在，跳过：${srcDir}`);
    return 0;
  }
  mkdirSync(destDir, { recursive: true });
  let written = 0;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    if (!overwrite && existsSync(dest)) {
      logInfo(`skills 同名条目已存在，保留用户版本：${dest}`);
      continue;
    }
    try {
      // dereference：即便源里有符号链接也复制实体内容（设备侧 symlink EACCES）。
      cpSync(src, dest, { recursive: true, force: true, dereference: true });
      written += 1;
    } catch (err) {
      logError(`复制失败 ${src} → ${dest}：${describeError(err)}`);
    }
  }
  return written;
}

// ── (b) 产物引导：SHA-256 marker 幂等解压 ──────────────────────────────
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = nodeFs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** 构建期由 collect-pi.mjs 写入：内容 = pi-dist.tar.gz 的 SHA-256 hex。 */
function readExpectedHash() {
  try {
    const raw = readFileSync(VERSION_PATH, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return raw.toLowerCase();
    logWarn(`pi-dist.version 内容不是 SHA-256，忽略：${raw.slice(0, 120)}`);
  } catch (err) {
    logWarn(`读取 pi-dist.version 失败：${describeError(err)}`);
  }
  return null;
}

/** 解压完整性的关键入口（marker 命中也要校验：解压中途被杀会留下「看似完整」的树）。 */
function payloadEntryCandidates() {
  const root = state.piDistRoot;
  return [
    join(root, 'node_modules', 'next', 'dist', 'server', 'lib', 'start-server.js'),
    join(root, 'node_modules', 'next', 'dist', 'server', 'next.js'),
    join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
  ];
}

function assertPayloadComplete(where) {
  const found = payloadEntryCandidates().find((p) => existsSync(p));
  if (!found) {
    throw new Error(`${where}：pi-dist 缺少 Next 服务入口（已探测 ${payloadEntryCandidates().length} 处）`);
  }
  const piPkg = join(state.piDistRoot, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'index.js');
  if (!existsSync(piPkg)) throw new Error(`${where}：缺少 ${piPkg}`);
  return found;
}

/**
 * 确保 pi 产物就位（首次/升级解压 tar.gz 到 <userData>/pi-dist）。
 * 幂等判据：marker 文件内容 === pi-dist.version 里的 SHA-256（**不是**目录存在性 —— dsh 只比
 * 存在性导致就地升级不生效，必须 hdc uninstall，这里明确修掉）。
 */
async function ensureArtifact() {
  const markerPath = join(state.userData, MARKER_NAME);
  if (!existsSync(ARCHIVE_PATH)) {
    throw new Error(`产物归档缺失：${ARCHIVE_PATH}`);
  }
  const actual = await sha256File(ARCHIVE_PATH);
  const declared = readExpectedHash();
  const expected = declared ?? actual;
  if (!declared) {
    logWarn(`未读到 pi-dist.version，marker 退化为「当前 tar 哈希」模式（tar 变化仍会触发重解压）：期望值 = ${expected}`);
  }
  const marker = readMarker(markerPath);
  logInfo(`归档 SHA-256 = ${actual}`);
  logInfo(`期望 SHA-256 = ${expected}｜marker = ${marker ?? '(无)'}`);

  if (marker === expected && existsSync(state.piDistRoot)) {
    try {
      const entry = assertPayloadComplete('marker 命中');
      logInfo(`产物已就位（marker 一致），跳过解压；Next 入口 = ${entry}`);
      return entry;
    } catch (err) {
      logWarn(`marker 一致但产物不完整，强制重解压：${describeError(err)}`);
    }
  } else if (marker === expected) {
    logWarn(`marker 一致但目标目录不存在，重新解压：${state.piDistRoot}`);
  } else if (marker && marker !== expected) {
    logInfo('marker 与当前归档不一致（升级或换包），重新解压');
  }

  if (existsSync(state.piDistRoot)) {
    logInfo(`清理旧产物目录：${state.piDistRoot}`);
    rmSync(state.piDistRoot, { recursive: true, force: true });
  }
  mkdirSync(state.piDistRoot, { recursive: true });
  logInfo(`首次/升级解压 ${ARCHIVE_PATH} → ${state.piDistRoot}（数十秒量级，请稍候）`);
  const count = await extractTarGz(ARCHIVE_PATH, state.piDistRoot);
  const entry = assertPayloadComplete('解压后校验');
  writeFileSync(markerPath, actual, 'utf8');
  logInfo(`解压完成：${count} 个文件；marker 已写入 ${markerPath}`);
  logInfo(`Next 入口 = ${entry}`);
  return entry;
}

function readMarker(markerPath) {
  try {
    const raw = readFileSync(markerPath, 'utf8').trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

// ── (c) 进程内启动 Next 服务器（§4.2 候选 A）──────────────────────────
/**
 * rotatePreviewSecrets：复用 pi-web 自带的 bin/rotate-preview-secrets.js（**不重新实现**）。
 * 它把 .next/prerender-manifest.json 里构建期固化的 previewModeId / 签名密钥 / 加密密钥换成随机值，
 * 否则任何读过发布 tarball 的人都能用 x-prerender-revalidate 头跳过 proxy.ts 的密码与 Host/Origin 围栏。
 * 必须在起服务前执行。
 */
function rotatePreviewSecrets(piDistRoot) {
  const rotatePath = join(piDistRoot, 'bin', 'rotate-preview-secrets.js');
  if (!existsSync(rotatePath)) {
    throw new Error(`pi-web 密钥轮换脚本缺失：${rotatePath}`);
  }
  const mod = require(rotatePath);
  if (typeof mod.rotatePreviewSecrets !== 'function') {
    throw new Error(`${rotatePath} 未导出 rotatePreviewSecrets（上游接口变化？）`);
  }
  const result = mod.rotatePreviewSecrets(join(piDistRoot, '.next'));
  if (result && result.ok) {
    logInfo('预览密钥已轮换（.next/prerender-manifest.json）');
  } else {
    const warning = typeof mod.getRotationWarning === 'function'
      ? mod.getRotationWarning(result && result.reason)
      : `原因：${result && result.reason}`;
    logWarn(`预览密钥轮换失败：\n${warning}`);
  }
}

/** CJS require，必要时退 ESM 动态 import（Next 16 的 dist 仍有 CJS，但不做假设）。 */
async function loadModule(absPath) {
  try {
    return require(absPath);
  } catch (err) {
    const code = err && err.code;
    if (code === 'ERR_REQUIRE_ESM' || code === 'ERR_REQUIRE_ASYNC_MODULE' || code === 'ERR_REQUIRE_CYCLE_MODULE') {
      return import(pathToFileURL(absPath).href);
    }
    throw err;
  }
}

/**
 * 候选 A 首选入口：`next/dist/server/lib/start-server` 的 startServer 导出。
 * CLI 入口（next/dist/bin/next）**禁止直接用** —— 它是命令行程序，会注册信号处理并调用
 * process.exit()，在 Electron 主进程里会连带杀掉整个桌面壳。
 * 导出形态在不同 Next 版本间有差异（startServer / default.startServer / 直接 default），
 * 这里逐个探测；找不到就抛错交给下一个候选。
 */
const START_SERVER_ENTRIES = [
  join('node_modules', 'next', 'dist', 'server', 'lib', 'start-server.js'),
  join('node_modules', 'next', 'dist', 'server', 'lib', 'start-server', 'index.js'),
];

function pickStartServerFn(mod) {
  if (!mod) return null;
  if (typeof mod.startServer === 'function') return mod.startServer;
  const d = mod.default;
  if (d && typeof d.startServer === 'function') return d.startServer;
  if (typeof d === 'function') return d;
  if (typeof mod === 'function') return mod;
  return null;
}

async function startViaStartServerExport({ dir, hostname, port }) {
  const tried = [];
  for (const rel of START_SERVER_ENTRIES) {
    const abs = join(dir, rel);
    if (!existsSync(abs)) { tried.push(`${rel}（不存在）`); continue; }
    const mod = await loadModule(abs);
    const startServer = pickStartServerFn(mod);
    if (!startServer) { tried.push(`${rel}（无 startServer 导出：${Object.keys(mod).slice(0, 12).join(',')}）`); continue; }
    // isDev / dev 两种键名都传：不同版本读的是其中之一，多余的键被忽略。
    const result = await startServer({
      dir,
      hostname,
      port,
      isDev: false,
      dev: false,
      allowRetry: false,
      keepAliveTimeout: 61_000,
    });
    logInfo(`startServer 返回：${result === undefined ? '(undefined)' : Object.prototype.toString.call(result)}`);
    return result;
  }
  throw new Error(`next/dist/server/lib/start-server 不可用：${tried.join('；')}`);
}

/**
 * 候选 A′：NextServer（自定义服务器）API —— next/dist/server/next.js 的 default。
 * 与候选 A 同样是**进程内**托管、不经过 CLI 的 process.exit()；作为导出形态不兼容时的第二道兜底。
 */
async function startViaNextServerApi({ dir, hostname, port }) {
  const abs = join(dir, 'node_modules', 'next', 'dist', 'server', 'next.js');
  if (!existsSync(abs)) throw new Error(`NextServer 入口不存在：${abs}`);
  const mod = await loadModule(abs);
  const NextServer = mod && (mod.default || mod);
  if (typeof NextServer !== 'function') throw new Error(`${abs} 未导出 NextServer 构造函数`);
  const serverApp = NextServer({ dir, dev: false, hostname, port });
  await serverApp.prepare();
  const handler = serverApp.getRequestHandler();
  const httpServer = nodeHttp.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      logError(`请求处理失败：${describeError(err)}`);
      try { res.statusCode = 500; res.end('Internal Server Error'); } catch { /* ignore */ }
    });
  });
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, hostname, () => resolve());
  });
  return httpServer;
}

/** 从 startServer 的返回值里挖出一个可关闭对象（不同版本返回 http.Server / { app } / undefined）。 */
function makeCloser(result) {
  const candidates = [result, result && result.server, result && result.httpServer, result && result.app];
  for (const candidate of candidates) {
    if (candidate && typeof candidate.close === 'function') {
      return () => new Promise((resolve) => {
        try { candidate.close(() => resolve()); } catch { resolve(); }
      });
    }
  }
  return null;
}

async function startNextInProcess({ dir, hostname, port }) {
  const attempts = [
    ['next/dist/server/lib/start-server（候选 A）', startViaStartServerExport],
    ['next/dist/server/next 的 NextServer API（候选 A′）', startViaNextServerApi],
  ];
  const failures = [];
  for (const [label, run] of attempts) {
    try {
      const result = await run({ dir, hostname, port });
      const close = makeCloser(result);
      if (!close) {
        // 已知限制：拿不到 server 句柄时无法优雅关闭。进程退出时由内核回收监听端口，
        // 桌面壳是单实例长驻进程，实际影响仅限「退出前端口短暂 TIME_WAIT」。
        logWarn(`${label}：未能取得 server 句柄，关闭服务将由进程退出代劳（已知限制）`);
      }
      logInfo(`Next 服务器已在进程内启动（${label}），监听 ${hostname}:${port}`);
      return { close };
    } catch (err) {
      const detail = describeError(err);
      failures.push(`${label}: ${detail}`);
      logError(`候选入口启动失败（${label}）：${detail}`);
    }
  }
  throw new Error(`进程内 Next 启动失败，全部候选均不可用：${failures.join(' | ')}`);
}

/** 生成强随机密码（32 字节 → base64url 43 字符）；PI_DESKTOP_PASSWORD 显式指定时优先。 */
function resolvePassword() {
  const fromEnv = process.env.PI_DESKTOP_PASSWORD;
  if (fromEnv && fromEnv.length > 0) {
    logWarn('使用 PI_DESKTOP_PASSWORD 指定的密码（仅调试用：会出现在环境变量与日志里）');
    return fromEnv;
  }
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * (c) 启动 Next 服务器（进程内）：轮换密钥 → 注入 pi-web 读取的环境变量 → 起服务。
 * PI_WEB_HOSTNAME / PI_WEB_PASSWORD 必须在**起服务之前**设置：pi-web 的 proxy.ts 与
 * lib/request-security.ts 在**每个请求**时读它们（Host 白名单 + 密码闸门）。
 */
async function startServer({ dir, hostname, port, password }) {
  rotatePreviewSecrets(dir);

  process.env.PI_WEB_HOSTNAME = hostname;
  process.env.PI_WEB_PASSWORD = password;
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  logInfo(`PI_WEB_HOSTNAME = ${hostname}｜PI_WEB_PASSWORD = ${password.length} 字符（不回显）`);

  const inProcess = await startNextInProcess({ dir, hostname: '0.0.0.0', port });
  return {
    mode: 'in-process',
    port,
    url: `http://${hostname}:${port}/`,
    password,
    close: inProcess.close,
  };
}

/**
 * (g) 候选 B 兜底（设计文档 §4.2 候选 B）：in-process 起不来时用 Electron 二进制以 Node 身份
 * spawn `bin/pi-web.js`。**已知平台代价与坑**：
 *   1. 回到子进程方案的三条平台问题（退出不可观测、每 spawn 泄漏 1 僵尸、应用域 fork+exec SIGSYS）；
 *   2. `bin/pi-web.js` 有 `>=22.19.0` 硬门禁，而 Electron 37 内置 Node 是 22.17.0 → 该入口在真机上
 *      大概率**立刻退出**并打印 "Pi Web requires Node.js 22.19.0 or newer"。因此本函数准备了第二个
 *      直接起 next CLI 的候选（绕过门禁，但仍会再 spawn 一层 next 子进程）。
 *   就绪判定统一改为 HTTP 轮询（不监听 stdout 的 "Ready"）。
 */
function spawnChildServerCandidates({ dir, hostname, port }) {
  const nextCli = join(dir, 'node_modules', 'next', 'dist', 'bin', 'next');
  return [
    {
      label: 'bin/pi-web.js --no-open（含 Node>=22.19.0 门禁）',
      args: [join(dir, 'bin', 'pi-web.js'), '--port', String(port), '--no-open'],
    },
    {
      label: 'next/dist/bin/next start（绕过 pi-web CLI 的 Node 版本门禁）',
      args: [nextCli, 'start', '-p', String(port), '-H', hostname],
    },
  ];
}

async function startServerViaChild({ dir, hostname, port }) {
  const failures = [];
  for (const candidate of spawnChildServerCandidates({ dir, hostname, port })) {
    logInfo(`候选 B：spawn ${candidate.label}`);
    const child = spawn(process.execPath, candidate.args, {
      cwd: dir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const tail = [];
    const collect = (stream, isErr) => {
      stream.setEncoding('utf8');
      stream.on('data', (text) => {
        for (const line of String(text).split('\n')) {
          if (!line.trim()) continue;
          tail.push(line.trim());
          if (tail.length > 20) tail.shift();
          (isErr ? logWarn : logInfo)(`[child] ${line.trim()}`);
        }
      });
    };
    collect(child.stdout, false);
    collect(child.stderr, true);
    let spawnError = null;
    child.once('error', (err) => { spawnError = err; });

    // 等一小会儿：立刻退出说明入口本身不可用（Node 版本门禁 / 门禁脚本报错），换下一个候选。
    await sleep(2500);
    if (spawnError) {
      failures.push(`${candidate.label}: ${describeError(spawnError)}`);
      continue;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      const detail = tail.join(' / ') || `exitCode=${child.exitCode} signal=${child.signalCode}`;
      failures.push(`${candidate.label}: 进程立即退出 → ${detail}`);
      logError(`候选 B 失败（${candidate.label}）：${detail}`);
      continue;
    }
    logInfo(`候选 B 已启动子进程 pid=${child.pid}（${candidate.label}）`);
    return {
      mode: 'child-process',
      port,
      url: `http://${hostname}:${port}/`,
      password: process.env.PI_WEB_PASSWORD,
      close: () => new Promise((resolve) => {
        try {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        } catch (err) {
          logWarn(`终止子进程失败：${describeError(err)}`);
        }
        resolve();
      }),
    };
  }
  throw new Error(`候选 B（子进程）全部失败：${failures.join(' | ')}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 进程内失败 → 打清晰诊断 → 退候选 B（含候选 B 自身失败的合并诊断）。 */
async function startServerWithFallback({ dir, hostname, port, password }) {
  try {
    return await startServer({ dir, hostname, port, password });
  } catch (err) {
    logError(`进程内宿主失败，转入候选 B（子进程）：${describeError(err)}`);
    globalThis.__hostError = `in-process failed: ${describeError(err)}`.slice(0, 2000);
  }
  return startServerViaChild({ dir, hostname, port });
}

// ── (d) 就绪探测：HTTP 轮询 ───────────────────────────────────────────
function httpGet(url, headers = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = nodeHttp.request(url, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('timeout', () => req.destroy(new Error(`请求超时（${timeoutMs}ms）`)));
    req.on('error', reject);
    req.end();
  });
}

/** 轮询 127.0.0.1:<port> 的 API 路由直到 200，上限 30s；每次尝试都记日志（可观测）。 */
async function waitForReady(port) {
  const url = `http://127.0.0.1:${port}${READY_PROBE_PATH}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let attempt = 0;
  let last = '(尚未探测)';
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await httpGet(url);
      if (res.status === 200) {
        logInfo(`[ready] 第 ${attempt} 次探测通过：GET ${READY_PROBE_PATH} → 200 ${res.body.slice(0, 120)}`);
        return true;
      }
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = describeError(err);
    }
    logInfo(`[ready] 第 ${attempt} 次探测未就绪（${last}），${READY_INTERVAL_MS}ms 后重试`);
    await sleep(READY_INTERVAL_MS);
  }
  throw new Error(`就绪探测超时（${READY_TIMEOUT_MS}ms / ${attempt} 次），最后结果：${last}`);
}

// ── 鉴权注入：用户永远看不到登录页 ────────────────────────────────────
/** 镜像 pi-web/lib/web-auth.ts 的 createWebSessionToken（键 / 载荷格式 / HMAC 完全一致）。 */
function createSessionToken(password) {
  const payload = `v1.${Math.floor(Date.now() / 1000) + PI_WEB_SESSION_MAX_AGE}.${crypto.randomBytes(16).toString('hex')}`;
  const signature = crypto.createHmac('sha256', password)
    .update(`pi-web-session:${payload}`, 'utf8').digest('hex');
  return `${payload}.${signature}`;
}

function basicAuthorizationHeader(password) {
  return `Basic ${Buffer.from(`${PI_WEB_AUTH_USERNAME}:${password}`, 'utf8').toString('base64')}`;
}

/**
 * pi-web 的 proxy.ts 对**页面导航**只认会话 cookie（Basic 头仅对 /api/* 生效），
 * 因此两条都注入：
 *   1) 直接写入 Electron 会话的 pi_web_session cookie（主进程知道密码，可自行签名）→ 首屏不弹登录页；
 *   2) onBeforeSendHeaders 给发往本服务 host:port 的请求补 Authorization: Basic（API/SSE 全通）。
 */
async function installAuthInjection(win, { host, port, password }) {
  const origin = `http://${host}:${port}/`;
  try {
    await win.webContents.session.cookies.set({
      url: origin,
      name: PI_WEB_SESSION_COOKIE,
      value: createSessionToken(password),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    logInfo(`已注入 ${PI_WEB_SESSION_COOKIE} 会话 cookie（origin=${origin}）`);
  } catch (err) {
    logWarn(`会话 cookie 注入失败（将回退到登录页）：${describeError(err)}`);
  }

  try {
    win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders || {};
      let target = null;
      try { target = new URL(details.url); } catch { /* data: 等非标准 URL：原样放行 */ }
      if (target
          && (target.protocol === 'http:' || target.protocol === 'https:')
          && target.hostname === host
          && target.port === String(port)) {
        headers.Authorization = basicAuthorizationHeader(password);
      }
      callback({ requestHeaders: headers });
    });
    logInfo(`已安装 Basic 鉴权注入（${host}:${port}）`);
  } catch (err) {
    logError(`webRequest 鉴权注入安装失败：${describeError(err)}`);
  }
}

// ── (e) 窗口 ──────────────────────────────────────────────────────────
/**
 * 所有 BrowserWindow 共用的 webPreferences：本鸿蒙 Electron 分支的标准配置为
 * nodeIntegration:true + contextIsolation:false（见 harmonypc-electron 运行时自带 main.js）。
 * pi 桌面壳**不向渲染层暴露任何 Node 能力**（§4.8：一切经 HTTP），preload 只按需使用：
 * renderer-preload.js 存在（P0-3 探针判定需要 crypto.randomUUID 兜底）时才挂载。
 */
function buildWebPreferences() {
  const prefs = { nodeIntegration: true, contextIsolation: false };
  const preloadPath = join(APP_DIR, 'renderer-preload.js');
  if (existsSync(preloadPath)) {
    prefs.preload = preloadPath;
    logInfo(`已挂载渲染层 preload：${preloadPath}`);
  } else {
    logInfo('未提供 renderer-preload.js（按 P0-3 探针结果决定是否需要），跳过 preload');
  }
  return prefs;
}

/** 窗口状态文件；userData 尚未解析成功时返回 null（调用方按「无记忆」处理）。 */
function windowStateFile() {
  return state.userData ? join(state.userData, 'window-state.json') : null;
}

function isVisibleOnSomeDisplay(bounds) {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
    return overlapX > 0 && overlapY > 0;
  });
}

function loadWindowState() {
  const file = windowStateFile();
  if (!file) return { width: 1200, height: 800, isMaximized: false };
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const width = typeof raw.width === 'number' && raw.width > 0 ? raw.width : 1200;
    const height = typeof raw.height === 'number' && raw.height > 0 ? raw.height : 800;
    const saved = { width, height, isMaximized: raw.isMaximized === true };
    if (typeof raw.x === 'number' && typeof raw.y === 'number'
        && isVisibleOnSomeDisplay({ x: raw.x, y: raw.y, width, height })) {
      saved.x = raw.x;
      saved.y = raw.y;
    }
    return saved;
  } catch {
    return { width: 1200, height: 800, isMaximized: false };
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const file = windowStateFile();
  if (!file) return;
  const bounds = win.getNormalBounds();
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      isMaximized: win.isMaximized(),
    }), 'utf8');
  } catch (err) {
    logError(`保存窗口状态失败：${describeError(err)}`);
  }
}

function trackWindowState(win) {
  let timer = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => saveWindowState(win), 400);
  };
  for (const evt of ['resize', 'move', 'maximize', 'unmaximize']) win.on(evt, schedule);
  win.on('close', () => { if (timer) clearTimeout(timer); saveWindowState(win); });
}

function installFullscreenShortcut(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.code === 'F11' || input.key === 'F11')) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
}

/** 外链一律交给 ArkWeb 外链页（§4.7）：Chromium 只渲染本应用自身的界面。 */
async function openExternalUrl(url) {
  if (!/^https?:\/\//i.test(url)) {
    logWarn(`非 http(s) 外链，忽略：${url}`);
    return;
  }
  const sp = electron.systemPreferences;
  if (sp && typeof sp.callArkTSFunction === 'function') {
    try {
      const raw = await sp.callArkTSFunction(EXTERNAL_WEB_BRIDGE, 'string', [url]);
      // 桥返回 { type, value } 信封时取 value；其它形态直接字符串化。
      const value = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
      logInfo(`外链已转交 ArkWeb 外链页（${EXTERNAL_WEB_BRIDGE}）：${url} → ${String(value)}`);
      return;
    } catch (err) {
      logError(`ArkTS 外链桥调用失败（${EXTERNAL_WEB_BRIDGE}）：${describeError(err)}`);
    }
  } else {
    logWarn(`ArkTS 外链桥不可用（systemPreferences.callArkTSFunction 缺失），回退 shell.openExternal`);
  }
  try {
    await shell.openExternal(url);
    logWarn(`已用 shell.openExternal 打开外链（无 ArkWeb 外链页时的回退路径）：${url}`);
  } catch (err) {
    logError(`外链打开彻底失败（${url}）：${describeError(err)}`);
  }
}

/**
 * 合规 + 安全守卫：弹窗一律拒绝（改走 ArkWeb 外链页），非本源导航一律阻止。
 * pi Web UI 用 window.open 打开 OAuth 登录页与会话导出，不拦会弹出 Chromium 窗口。
 */
function installExternalNavigationGuard(win) {
  try {
    win.webContents.setWindowOpenHandler(({ url }) => {
      logWarn(`已拦截弹窗：${url}（改由 ArkWeb 外链页承载）`);
      void openExternalUrl(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      let allowed = true;
      try {
        const target = new URL(url);
        allowed = target.protocol === 'data:' || target.protocol === 'about:'
          || (state.port !== null && target.port === String(state.port));
      } catch {
        allowed = true; // 非标准 URL：不改变既有行为
      }
      if (!allowed) {
        logWarn(`已拦截导航到非本源地址：${url}`);
        event.preventDefault();
      }
    });
    logInfo('已安装外链/导航守卫（Chromium 不承载外部网页）');
  } catch (err) {
    logError(`导航守卫安装失败：${describeError(err)}`);
  }
}

function createWindow() {
  const saved = loadWindowState();
  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== undefined && saved.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    title: 'Pi Desktop',
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: buildWebPreferences(),
  });
  state.win = win;
  win.setWindowButtonVisibility(true);
  trackWindowState(win);
  installFullscreenShortcut(win);
  installExternalNavigationGuard(win);
  if (saved.isMaximized) win.maximize();

  // 先加载内联 loading 页：首装解压 + 起服务耗时较长，且失败时必须看得见原因。
  void win.loadURL(LOADING_URL);
  win.webContents.on('did-fail-load', (_e, code, desc, failedUrl) => {
    const detail = `${code} ${desc}（${failedUrl}）`;
    globalThis.__renderError = detail;
    logError(`页面加载失败：${detail}`);
    if (/^https?:\/\//.test(failedUrl || '')) failVisible('render', new Error(detail));
  });
  return win;
}

// ── 生命周期 ──────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => logError(`uncaughtException: ${describeError(err)}`));
process.on('unhandledRejection', (reason) => logError(`unhandledRejection: ${describeError(reason)}`));

// 代理绕过：loopback 直连（与 NO_PROXY 双保险，参考工程沿用结论）。
app.commandLine.appendSwitch('proxy-bypass-list', '<-loopback>');

// userData 在 ready 之前即可读取，且被「窗口状态记忆」与沙箱环境装配共同依赖 —— 先取出，
// 否则 createWindow() 在建窗时拿到 null 路径，窗口尺寸/位置记忆会静默失效。
try {
  state.userData = app.getPath('userData');
  logInfo(`userData = ${state.userData}`);
} catch (err) {
  logError(`读取 userData 失败（窗口状态记忆与沙箱环境都会受影响）：${describeError(err)}`);
}

// 去掉 Electron 默认菜单
Menu.setApplicationMenu(null);

// 关于 --inspect：真机运行时默认带 --inspect（9229），经 hdc fport 转发后 CDP 上下文里 require 可用，
// 任何能连上 9229 的人都能完全控制宿主进程。**生产构建必须移除该开关** —— 移除动作在 ArkTS 侧的
// CommandLineAdapter overlay（runtime-overlays/web_engine/.../CommandLineAdapter.ets）里完成，主进程
// 不重复处理，只在日志里显式声明这一约定，避免被误当成当前进程的缺陷。
logInfo('约定：--inspect / --remote-debugging-port 由 ArkTS CommandLineAdapter overlay 在生产构建中剥离');

/**
 * 启动时序（§4.9，每个阶段都可观测）：
 *   [env] 环境装配 → [port] 端口/局域网 IP → [cmdline] 非安全上下文开关 → [window] loading 页
 *   → [artifact] 产物就位 → [server] 进程内 Next → [ready] HTTP 轮询 → [load] loadURL(局域网 IP)
 */
app.whenReady().then(async () => {
  let win;
  try {
    setStage('准备启动'); // 此时窗口尚未创建，只记日志
    const lanIp = pickLanIp();
    const port = await resolveFreePort();
    state.lanIp = lanIp;
    state.port = port;
    logInfo(`局域网 IP = ${lanIp}｜服务端口 = ${port}`);
    applyCommandLineSwitches();

    win = createWindow();
    setStage('环境装配（HOME / PI_CODING_AGENT_DIR / TMPDIR / PI_OFFLINE / NO_PROXY）');
    assembleSandboxEnv();
  } catch (err) {
    if (!win) {
      // 连窗口都没建起来（理论上只剩 userData 不可用）：把细节塞进标题与全局错误，便于 CDP/日志取证。
      try {
        win = new BrowserWindow({ width: 1200, height: 800, title: 'Pi Desktop — 启动失败',
          autoHideMenuBar: true, webPreferences: buildWebPreferences() });
        state.win = win;
        void win.loadURL(LOADING_URL);
      } catch { /* 窗口创建彻底失败：只能靠日志 */ }
    }
    failVisible('host', err);
    return;
  }

  try {
    setStage('校验 pi-dist 产物（SHA-256 marker 幂等）');
    await ensureArtifact();
  } catch (err) {
    failVisible('extract', err);
    return;
  }

  try {
    setStage('物化壳预置扩展 / 技能（copy，不建 symlink）');
    materializeBundledResources();

    const password = resolvePassword();
    state.password = password;
    setStage(`启动 Next 服务器（进程内，0.0.0.0:${state.port}）`);
    state.server = await startServerWithFallback({
      dir: state.piDistRoot,
      hostname: state.lanIp,
      port: state.port,
      password,
    });
    logInfo(`服务端模式 = ${state.server.mode}｜URL = ${state.server.url}`);

    setStage(`等待服务就绪（HTTP 轮询 127.0.0.1:${state.port}，上限 ${READY_TIMEOUT_MS / 1000}s）`);
    await waitForReady(state.port);

    setStage('注入鉴权（会话 cookie + Basic 头），用户无需手动登录');
    await installAuthInjection(win, { host: state.lanIp, port: state.port, password });

    setStage('加载 Pi Web UI');
    await win.loadURL(state.server.url);
    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML.slice(0, 4000)', true).catch(() => '');
    const marker = UI_HTML_MARKERS.find((m) => typeof html === 'string' && html.includes(m));
    if (marker) {
      logInfo(`首屏完成，UI 标记命中：${marker}`);
    } else {
      logWarn('首屏 HTML 未命中预期 UI 标记（Pi Web），请检查是否被重定向到登录页');
    }
    setStage('就绪');
    // 首屏已就位：把窗口标题交还给页面（loading 阶段的「阶段文本标题」到此结束）。
    try { win.setTitle('Pi Desktop'); } catch { /* 标题设置失败不影响主流程 */ }
  } catch (err) {
    failVisible('host', err);
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    try {
      const revived = createWindow();
      if (state.server) {
        void installAuthInjection(revived, { host: state.lanIp, port: state.port, password: state.password })
          .then(() => revived.loadURL(state.server.url))
          .catch((e) => failVisible('render', e));
      }
    } catch (err) {
      failVisible('host', err);
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  const server = state.server;
  if (!server || !server.close) return;
  state.server = null; // 只关一次
  event.preventDefault();
  logInfo('正在关闭服务端…');
  Promise.resolve()
    .then(() => server.close())
    .catch((err) => logWarn(`关闭服务端失败：${describeError(err)}`))
    .finally(() => app.quit());
});
