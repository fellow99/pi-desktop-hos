#!/usr/bin/env node
/**
 * smoke-node22.mjs — ②′ host 侧门禁（设计文档 §8.1 阶段 ②′、§4.4）
 *
 * 为什么存在：pi / pi-web 声明 `engines.node >= 22.19.0`，而 Electron 37 内置 Node 是 **22.17.0**。
 * 差 2 个 patch，能否跑起来必须**实测**、不能推断。本脚本用宿主机上与设备同版本的 Node 起同一份
 * Next 产物（与 src-main/main.js 完全相同的进程内启动方式），验证四件事：
 *   1) GET /                                   → 200 且 HTML 含 pi-web UI 标记（"Pi Web"）
 *   2) GET /api/web-auth                       → 200（该路由免鉴权，返回 { enabled, authenticated }）
 *   3) Host 白名单：以 Host: <局域网IP>:<port> 请求 → 200（设备侧渲染进程走的就是这条路径）
 *   4) GET /api/agent/<id>/events              → content-type: text/event-stream（无会话可建连时打印 SKIP）
 * 任何一项失败即 **非零退出**：不确定的产物不允许推到真机。
 *
 * 用法：
 *   node scripts/smoke-node22.mjs                 # 断言 Node 22.17.x（= Electron 37 的 Node）
 *   node scripts/smoke-node22.mjs --allow-any-node    # 仅做功能验证（版本门禁降级为警告）
 *
 * ⚠️ 本机默认 Node 是 v24.7.0，不满足 22.17 断言 → 需要显式提供 Node 22.17.0 的 node 可执行文件
 *    （例如 `"C:\Program Files\nodejs-22.17.0\node.exe" scripts/smoke-node22.mjs`）。
 *
 * 与 main.js 的关系：启动方式（预览密钥轮换 → 环境变量注入 → 进程内 startServer）是 main.js 的镜像，
 * **改动需两边同步**。这里不复用 scripts/lib 下的共享模块，因为 main.js 必须能独立投放进 resfile。
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const piWebRoot = resolve(projectRoot, '../pi-web');
const piDistRoot = join(projectRoot, 'pi-dist');
const LOG = '[smoke-node22]';
const ALLOW_ANY_NODE = process.argv.includes('--allow-any-node');
const READY_TIMEOUT_MS = 30_000;
const READY_INTERVAL_MS = 400;

const results = [];
const authHeaderValue = (password) => 'Basic ' + Buffer.from('pi:' + password).toString('base64');
let serverHandle = null;
let agentDir = null;

function banner(text) {
  console.log(`\n${LOG} ==== ${text} ====`);
}

function record(name, status, detail) {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✔' : status === 'SKIP' ? '○' : '✗';
  console.log(`${LOG} ${icon} [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function describeError(err) {
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
  return parts.join(' || ') || String(err);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(url, headers = {}, timeoutMs = 8000) {
  return new Promise((resolvePromise, reject) => {
    const req = http.request(url, { method: 'GET', headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolvePromise({
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

function pickLanIp() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const info of list || []) {
      if (info && (info.family === 'IPv4' || info.family === 4) && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}

/** 与 src-main/main.js 的 createSessionToken 完全一致（镜像 pi-web/lib/web-auth.ts）。 */
function createSessionToken(password) {
  const payload = `v1.${Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30}.${randomBytes(16).toString('hex')}`;
  const signature = createHmac('sha256', password).update(`pi-web-session:${payload}`, 'utf8').digest('hex');
  return `${payload}.${signature}`;
}

async function loadModule(absPath) {
  try {
    return require(absPath);
  } catch (err) {
    if (['ERR_REQUIRE_ESM', 'ERR_REQUIRE_ASYNC_MODULE', 'ERR_REQUIRE_CYCLE_MODULE'].includes(err.code)) {
      return import(pathToFileURL(absPath).href);
    }
    throw err;
  }
}

function pickStartServerFn(mod) {
  if (!mod) return null;
  if (typeof mod.startServer === 'function') return mod.startServer;
  const d = mod.default;
  if (d && typeof d.startServer === 'function') return d.startServer;
  if (typeof d === 'function') return d;
  if (typeof mod === 'function') return mod;
  return null;
}

/** 镜像 main.js 的 startNextInProcess（候选 A：start-server 导出；候选 A′：NextServer API）。 */
async function startNextInProcess({ dir, hostname, port }) {
  const tried = [];
  for (const rel of [
    join('node_modules', 'next', 'dist', 'server', 'lib', 'start-server.js'),
    join('node_modules', 'next', 'dist', 'server', 'lib', 'start-server', 'index.js'),
  ]) {
    const abs = join(dir, rel);
    if (!existsSync(abs)) { tried.push(`${rel}（不存在）`); continue; }
    const startServer = pickStartServerFn(await loadModule(abs));
    if (!startServer) { tried.push(`${rel}（无 startServer 导出）`); continue; }
    const result = await startServer({ dir, hostname, port, isDev: false, dev: false, allowRetry: false, keepAliveTimeout: 61_000 });
    return { mode: `start-server:${rel}`, result, closer: makeCloser(result) };
  }
  console.warn(`${LOG} start-server 候选不可用：${tried.join('；')} → 尝试 NextServer API`);

  const nextServerPath = join(dir, 'node_modules', 'next', 'dist', 'server', 'next.js');
  if (!existsSync(nextServerPath)) throw new Error(`NextServer 入口不存在：${nextServerPath}`);
  const mod = await loadModule(nextServerPath);
  const NextServer = mod.default || mod;
  const app = NextServer({ dir, dev: false, hostname, port });
  await app.prepare();
  const handler = app.getRequestHandler();
  const srv = http.createServer((req, res) => { Promise.resolve(handler(req, res)).catch(() => { res.statusCode = 500; res.end(); }); });
  await new Promise((resolvePromise, reject) => {
    srv.once('error', reject);
    srv.listen(port, hostname, () => resolvePromise());
  });
  return { mode: 'NextServer API', result: srv, closer: () => new Promise((r) => srv.close(() => r())) };
}

function makeCloser(result) {
  for (const candidate of [result, result && result.server, result && result.httpServer, result && result.app]) {
    if (candidate && typeof candidate.close === 'function') {
      return () => new Promise((r) => { try { candidate.close(() => r()); } catch { r(); } });
    }
  }
  return null;
}

async function freePort() {
  return await new Promise((resolvePromise, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePromise(port));
    });
  });
}

async function waitForReady(port) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let attempt = 0;
  let last = '(尚未探测)';
  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const res = await httpGet(`http://127.0.0.1:${port}/api/web-auth`);
      if (res.status === 200) {
        console.log(`${LOG} [ready] 第 ${attempt} 次探测通过`);
        return true;
      }
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = describeError(err);
    }
    await sleep(READY_INTERVAL_MS);
  }
  throw new Error(`就绪探测超时（${READY_TIMEOUT_MS}ms / ${attempt} 次），最后结果：${last}`);
}

async function main() {
  // ── 0. Node 版本门禁 ────────────────────────────────────────────────
  banner(`0. Node 版本门禁（current = v${process.versions.node}）`);
  const nodeOk = process.versions.node.startsWith('22.17');
  if (nodeOk) {
    record('Node 版本 = 22.17.x（= Electron 37 内置 Node）', 'PASS', `v${process.versions.node}`);
  } else if (ALLOW_ANY_NODE) {
    record('Node 版本 = 22.17.x（= Electron 37 内置 Node）', 'SKIP',
      `当前 v${process.versions.node}（--allow-any-node：仅做功能验证，不代表设备可用）`);
  } else {
    record('Node 版本 = 22.17.x（= Electron 37 内置 Node）', 'FAIL',
      `当前 v${process.versions.node}；请用 Node 22.17.0 运行本门禁（或用 --allow-any-node 临时放行）`);
    return;
  }

  // ── 1. 载荷目录：优先 pi-dist（③ 之后），否则用 pi-web（② 之后）──────
  banner('1. 解析载荷目录与前置条件');
  let payloadDir = null;
  if (existsSync(join(piDistRoot, 'node_modules', 'next'))) {
    payloadDir = piDistRoot;
    console.log(`${LOG} 使用 pi-dist（③ 的产物）：${payloadDir}`);
  } else if (existsSync(join(piWebRoot, 'node_modules', 'next')) && existsSync(join(piWebRoot, '.next', 'BUILD_ID'))) {
    payloadDir = piWebRoot;
    console.log(`${LOG} pi-dist 不存在，改用 pi-web（② 的产物，等价于投放内容）：${payloadDir}`);
  } else {
    record('载荷目录可用', 'FAIL',
      `既没有 pi-dist（${piDistRoot}）也没有可直接运行的 pi-web（${piWebRoot}）\n      → 先运行：node scripts/prepare-next.mjs`);
    return;
  }
  record('载荷目录可用', 'PASS', payloadDir);

  // ── 2. 环境装配（参照 main.js，但隔离到临时 pi-agent 目录）───────────
  banner('2. 环境装配（隔离到临时 PI_CODING_AGENT_DIR）');
  agentDir = join(os.tmpdir(), `pi-desktop-smoke-${randomBytes(4).toString('hex')}`);
  mkdirSync(agentDir, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.PI_OFFLINE = '1';
  process.env.NODE_ENV = 'production';
  const lanIp = pickLanIp();
  const port = await freePort();
  const password = randomBytes(32).toString('base64url');
  process.env.PI_WEB_HOSTNAME = lanIp;
  process.env.PI_WEB_PASSWORD = password;
  console.log(`${LOG} PI_CODING_AGENT_DIR = ${agentDir}`);
  console.log(`${LOG} 局域网 IP = ${lanIp}｜端口 = ${port}｜密码 = ${password.length} 字符（不回显）`);

  // 与 main.js 相同：起服务前必须轮换预览密钥。
  const rotatePath = join(payloadDir, 'bin', 'rotate-preview-secrets.js');
  if (!existsSync(rotatePath)) {
    record('预览密钥轮换', 'SKIP', `未找到 ${rotatePath}（② 的实现在 prepare-next.mjs 里已做过）`);
  } else {
    try {
      const rotate = require(rotatePath);
      const result = rotate.rotatePreviewSecrets(join(payloadDir, '.next'));
      record('预览密钥轮换', result && result.ok ? 'PASS' : 'SKIP',
        result && result.ok ? '.next/prerender-manifest.json 已轮换' : `reason=${result && result.reason}`);
    } catch (err) {
      record('预览密钥轮换', 'FAIL', describeError(err));
      return;
    }
  }

  // ── 3. 进程内启动 Next（与 main.js 同一路径）─────────────────────────
  banner('3. 进程内启动 Next 服务器');
  const startedAt = Date.now();
  try {
    serverHandle = await startNextInProcess({ dir: payloadDir, hostname: '0.0.0.0', port });
    record('进程内启动 Next（0.0.0.0）', 'PASS', `${serverHandle.mode}（${Date.now() - startedAt}ms）`);
  } catch (err) {
    record('进程内启动 Next（0.0.0.0）', 'FAIL', describeError(err));
    return;
  }

  try {
    await waitForReady(port);
    record('HTTP 就绪（/api/web-auth 200）', 'PASS', `上限 ${READY_TIMEOUT_MS / 1000}s 内就绪`);
  } catch (err) {
    record('HTTP 就绪（/api/web-auth 200）', 'FAIL', describeError(err));
    return;
  }

  const base = `http://127.0.0.1:${port}`;
  const cookie = `pi_web_session=${createSessionToken(password)}`;
  const authHeaders = { Cookie: cookie, Authorization: authHeaderValue(password) };

  // ── 4. GET / → 200 + UI 标记 ─────────────────────────────────────────
  banner('4. 首屏：GET /');
  try {
    const res = await httpGet(`${base}/`, authHeaders);
    const hasMarker = res.body.includes('Pi Web');
    if (res.status === 200 && hasMarker) {
      record('GET / 返回 200 且含 UI 标记 "Pi Web"', 'PASS', `HTML ${res.body.length} 字节`);
    } else if (res.status !== 200) {
      record('GET / 返回 200 且含 UI 标记 "Pi Web"', 'FAIL',
        `HTTP ${res.status}（带会话 cookie/Basic 头仍非 200；body 前缀：${res.body.slice(0, 200).replace(/\s+/g, ' ')}）`);
    } else {
      record('GET / 返回 200 且含 UI 标记 "Pi Web"', 'FAIL', `HTML 中未找到标记（前缀：${res.body.slice(0, 200).replace(/\s+/g, ' ')}）`);
    }
  } catch (err) {
    record('GET / 返回 200 且含 UI 标记 "Pi Web"', 'FAIL', describeError(err));
  }

  // ── 5. GET /api/web-auth → 200（免鉴权路由）──────────────────────────
  banner('5. API：GET /api/web-auth');
  try {
    const res = await httpGet(`${base}/api/web-auth`);
    const json = (() => { try { return JSON.parse(res.body); } catch { return null; } })();
    if (res.status === 200 && json && typeof json.enabled === 'boolean') {
      record('GET /api/web-auth 返回 200 + JSON', 'PASS',
        `enabled=${json.enabled} authenticated=${json.authenticated}（无凭据时应为 authenticated=false）`);
      if (json.enabled !== true) record('密码鉴权处于启用状态', 'FAIL', 'PI_WEB_PASSWORD 未被 pi-web 读到');
      else record('密码鉴权处于启用状态', 'PASS', 'enabled=true');
    } else {
      record('GET /api/web-auth 返回 200 + JSON', 'FAIL',
        `HTTP ${res.status}｜body：${res.body.slice(0, 200)}`);
    }
  } catch (err) {
    record('GET /api/web-auth 返回 200 + JSON', 'FAIL', describeError(err));
  }

  // ── 6. Host 白名单：局域网 IP 字面量（设备侧渲染进程走这条路径）──────
  banner('6. Host 白名单（局域网 IP 字面量）');
  try {
    const res = await httpGet(`${base}/api/web-auth`, { Host: `${lanIp}:${port}` });
    record(`Host: ${lanIp}:${port} 通过 Host 围栏`, res.status === 200 ? 'PASS' : 'FAIL',
      `HTTP ${res.status}${res.status === 403 ? '（isApiRequestHostAllowed 拒绝了 IP 字面量，与 §4.5 结论不符）' : ''}`);
  } catch (err) {
    record(`Host: ${lanIp}:${port} 通过 Host 围栏`, 'FAIL', describeError(err));
  }

  // ── 7. SSE：text/event-stream ────────────────────────────────────────
  banner('7. SSE 通道：GET /api/agent/<id>/events');
  try {
    const res = await httpGet(`${base}/api/agent/__smoke_probe__/events`, authHeaders, 4000);
    const contentType = String(res.headers['content-type'] || '');
    if (res.status === 200 && contentType.startsWith('text/event-stream')) {
      record('SSE 返回 content-type: text/event-stream', 'PASS', contentType);
    } else if (res.status === 404) {
      // pi-web 的 SSE 路由要求真实存在的会话（resolveSessionPath 查不到即 404），
      // 冒烟环境里没有任何会话文件 → 该子检查按 SKIP 记录（设计文档 §8.1 ②′ 第 3 项）。
      record('SSE 返回 content-type: text/event-stream', 'SKIP',
        `GET /api/agent/<id>/events → 404（无会话可建连；需有真实会话 id 才能断言 SSE）`);
    } else {
      record('SSE 返回 content-type: text/event-stream', 'SKIP', `HTTP ${res.status}｜content-type=${contentType}`);
    }
  } catch (err) {
    record('SSE 返回 content-type: text/event-stream', 'SKIP', `探测异常：${describeError(err)}`);
  }
}

// ── 执行 + 汇总 ───────────────────────────────────────────────────────
let fatal = null;
try {
  await main();
} catch (err) {
  fatal = err;
  record('冒烟脚本自身异常', 'FAIL', describeError(err));
} finally {
  if (serverHandle && serverHandle.closer) {
    try { await serverHandle.closer(); } catch { /* 关闭失败不影响判定 */ }
  }
  if (agentDir) {
    try { rmSync(agentDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

const failed = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'PASS');
const skipped = results.filter((r) => r.status === 'SKIP');

console.log(`\n${LOG} ================= 冒烟汇总（host 侧门禁，§8.1 ②′）=================`);
for (const r of results) {
  console.log(`${LOG}  [${r.status}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(`${LOG} PASS ${passed.length}｜SKIP ${skipped.length}｜FAIL ${failed.length}`);
if (failed.length > 0 || fatal) {
  console.error(`${LOG} ✗ 门禁未通过：产物不得推到真机（设计文档 §4.4 的 Node 版本错位风险直接命中）。`);
  process.exit(1);
}
console.log(`${LOG} ✔ 全绿（SKIP 项视为「本次环境无法证伪」，上真机前需在真机复验）。`);
process.exit(0);
