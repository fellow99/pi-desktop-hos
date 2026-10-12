---
name: harmony-runtime-capabilities
description: What this HarmonyOS build of Pi can and cannot do — which built-in tools work (and which ones are re-implemented by the shipped shell extensions), what `bash` actually spawns, why a subprocess cannot run Node, and which file operations behave differently. Read this before assuming a tool or command works.
whenToUse: Before running shell commands with `bash`, before using `find`/`grep`, when a tool reports a missing binary, when writing files outside the session workspace, or when a tool seems to be absent.
---

# HarmonyOS runtime capabilities

This deployment runs inside a HarmonyOS HAP on the Electron-on-HarmonyOS runtime. The
platform removes several capabilities that a normal Pi install has, and the shell is not a
Linux desktop shell. Check the facts below before you spend turns discovering them.

The host is Pi's own agent runtime running inside an Electron main process, together with the
Pi Web server. Everything that is pure JavaScript works. Everything that needs an **external
executable**, a **TTY**, or **JIT in a child process** does not.

## Available tools

| Tool | Status | Why |
|---|---|---|
| `read` / `write` / `edit` | **available** | pure Node.js |
| `ls` | **available** | pure Node.js (`fs.readdir`) |
| `bash` | **available** (shell extension) | resident `/system/bin/sh` + sentinel-line protocol, because the child's `exit`/`close` events never arrive on this platform; see below |
| `find` | **available** (shell extension) | pure-JS directory walk — the built-in one shells out to `fd`, which this device does not have |
| `grep` | **available** (shell extension) | pure-JS content search — the built-in one shells out to `ripgrep` (`rg`), same reason |
| `powershell` | **absent** | Windows-only tool |

`bash`, `find` and `grep` are **replaced by shell extensions shipped with this build**
(`extensions/harmony-exec.js`, `extensions/harmony-search.js`). They keep the built-in tool
**names and parameters**, so how you call them does not change — but the implementations no
longer need `fd`/`rg`, and no longer wait for process events that never fire.

### What to use for what

| want | use |
|---|---|
| list a directory | `ls` |
| find files by name | `find` (glob; use `**` to recurse, e.g. `**/*.json`) |
| search file contents | `grep` (regex by default, `literal` for plain text, `glob` to filter files) |
| run a command | `bash` (mksh R59 — but read the limits below first) |

Both search tools skip dot-directories, `node_modules` and `.git`, and **report every cap they
hit** (depth, file count, per-file size, result limit) in the output. They do **not** parse
`.gitignore` — the exclusion rules are the simpler ones above. Files over 512 KiB are skipped
and counted rather than read.

## Command execution (`bash`)

`bash` works on this device, through a **resident** `/system/bin/sh` (mksh R59) driven by a
sentinel-line protocol. Why it needs that: the platform **never delivers a child's `exit`/`close`
events**, so the built-in spawn-based tool waits forever and never returns. The extension instead
marks the end of each command with a fresh random sentinel line on stdout, and never depends on
any process event.

What this means in practice:

- There is **no TTY**. Interactive programs (editors, pagers, `top`, anything waiting on a
  terminal) are unsupported. Use non-interactive forms.
- `bash` is the tool's name, not the shell's. There is no `bash` binary on the device; the
  command runs under `sh`. GNU-only tools (`bash`, `busybox`, `vi`, `strace`) do **not** exist.
- Directly runnable are the coreutils-style commands (`pwd`, `ls`, `cat`, `grep`, `sed`,
  `wc`, …) and any toybox applet reached as `toybox <name>`.
- **`git` is not shipped at all.** There is no `git` binary and no way to install one. Any
  version-control operation must be done by reading and writing files directly.
- **`curl` is not available.** Network access from the agent's tools goes through the
  `web_search` / `web_fetch` tools, not the shell.
- `node`, `npm`, `npx`, `pnpm`, `python` are **not** on `PATH` for this application. Do not
  try to run them.
- A non-zero exit code is reported as `(exit code N)` and marks the result as an error. That
  is normal for a failing command, not a tool malfunction.
- **There is a default timeout of 120 seconds** (pass `timeout` in seconds to change it). On
  timeout the resident shell is reset — output produced **before** the deadline is still
  returned, followed by the timeout notice — and the next call starts a fresh shell. Commands
  that were still running are killed **with their children** (the shell is a process group),
  so a killed command cannot leak output into a later call.
- **A command's stdin is `/dev/null`** (same as the built-in tool). So `cat`, `read` or a
  `grep` with no file argument return **immediately with empty input** instead of waiting for
  input that will never come.
- **Every command runs in a subshell with the working directory re-set to the session
  workspace.** If that directory no longer exists the command fails at once (`cd failed: …`).
  `cd` and shell variables do **not** persist between calls — pass absolute paths, or `cd`
  inside the same command line. A bare `exit`/`exec` only ends that subshell; it returns its
  exit code and does **not** break subsequent calls.
- stderr is **merged into stdout** (order preserved), so errors appear inline in the output.
- **No command in `bash` is fenced.** The shell runs with the application's full file access,
  so it can read and write wherever the application can — including outside the session
  workspace, bypassing the file-approval flow. Prefer the `read`/`write`/`edit` tools for file
  work, and reach for `bash` when a shell is genuinely the right tool.
- The resident shell is **reused across calls** (one long-lived process rather than one per
  command), which also keeps zombie leakage far lower than the built-in tool's per-command spawn.

### Do not expect a Node script to run in a subprocess

A subprocess cannot usefully run a Node script on this device. Measured on device (`pi-desktop-hos` v0.11.1):
`node -v` *does* print a version (`v24.13.0`), but `node -e "console.log(1+1)"` produces **no stdout and no
stderr**, and the process becomes a zombie. The termination cause **could not be read** (the `exit` event never
arrives, so no signal is observable). The sibling project `dsh-desktop-hos` recorded the same symptom three
times and reported it as `Signal 31 (core dumped)` / SIGSYS from seccomp refusing the JIT's executable memory —
that is a **plausible but unproven** explanation here, so treat it as "assume it will not work" rather than as a
verified signal.

The practical consequence: anything that needs a JavaScript runtime must run **inside the
agent process** (which is where Pi itself runs), never in a child process.

## Listing and finding files
- To search by pattern, use the **`find`** tool (glob; `**` recurses). It no longer needs the `fd` binary —
  this build ships `extensions/harmony-search.js`, which re-implements `find` and `grep` in pure JavaScript.
- To search file contents, use the **`grep`** tool (regex by default, plus `literal`, `ignoreCase`, `glob`, `context`).
  The toybox commands `find` / `grep` also work now through the `bash` tool, and are a fine fallback.

## Paths, sandbox, and user directories

- The session workspace is a directory inside the application sandbox, under
  `/data/storage/el2/base/files/`.
- Pi's data directory is
  `/data/storage/el2/base/files/pi-agent/` (it is redirected there by
  `PI_CODING_AGENT_DIR`). Sessions, settings, skills, extensions, and credentials live there.
- The **user's home directory** (`/storage/Users/currentUser`) is **not writable** by the
  application. `Desktop`, `Documents`, and `Download` are separate HarmonyOS system
  permissions: the user must grant them in
  *Settings → Apps → this app → Allow access*, and then **restart the app** before writes
  succeed. A write may still fail after any in-app approval, because the in-app approval is
  not an OS grant. Prefer keeping artifacts inside the workspace and telling the user where
  they are.
- `symlink` is refused by the application sandbox (`EACCES`). Anything that would create a
  symlink must copy instead.
- **A new file created outside the workspace can fail** even when overwriting an existing
  file works: the atomic-create path uses a hard link, which the shared user-directory
  filesystem (`hmdfs`) rejects. If a create fails there, get the target to exist first (or
  create it inside the workspace) and then write to it.
- `chmod` is not honored on the shared user-directory volume: the call succeeds but the mode
  that comes back is not the one you asked for. Inside the workspace it works normally.

## Network access

- The agent's HTTP access is through `web_search` / `web_fetch`. The shell has no special
  network grant and no `curl`.
- The Pi Web server listens on the device's **LAN address**, not on `127.0.0.1`: the platform
  isolates loopback between processes, so the renderer reaches the server over the local
  network interface. A password is always set for that server.

## Related reading

The project's capability inventory, with the root cause (platform limit vs. missing native
artifact vs. this build's own configuration choice vs. an upstream API gap) and the recovery
plan for each gap, lives in the repository at
`pi-desktop-hos/docs/工程规划.md` §9.3 (degradation table) and §11 (risks and open questions).
Read it when you need to know whether a limitation is fixable.
