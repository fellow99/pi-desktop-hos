---
name: harmony-runtime-capabilities
description: What this HarmonyOS build of Pi can and cannot do — which built-in tools work, why `find` and `grep` are unavailable (they need external binaries), what `bash` actually spawns, why a subprocess cannot run Node, and which file operations behave differently. Read this before assuming a tool or command works.
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
| `bash` | **hangs on device — avoid** | it spawns the system `sh`, but the child's `exit`/`close` event never arrives on this platform, so a call may never return; see below |
| `find` | **unavailable** | shells out to the `fd` binary, which this device does not have and which cannot be downloaded |
| `grep` | **unavailable** | shells out to the `ripgrep` (`rg`) binary, same reason |
| `powershell` | **absent** | Windows-only tool |

`find` and `grep` will fail with an error such as `fd is not available and could not be
downloaded`. That is expected, not a temporary fault: this build runs with `PI_OFFLINE=1`, so
Pi never tries to fetch a binary, and the device ships neither `fd` nor `rg`.

**There is currently no working replacement for content search.** The toybox applets `find` / `grep`
(as *shell commands*, reached through the `bash` tool) do exist and would work — but the `bash` tool
itself is not usable on this platform (see the next section), so you cannot reach them. Concretely:

| want | tool | shell command via `bash` |
|---|---|---|
| list a directory | `ls` ✅ | — |
| find files by name | `find` tool ❌ (needs `fd`) | ⛔ unreachable (bash hangs) |
| search file contents | `grep` tool ❌ (needs `rg`) | ⛔ unreachable (bash hangs) |

Practical guidance: **do not claim to have searched.** Enumerate with `ls`, then `read` the specific
files you need. If a task genuinely requires recursive search, tell the user that this HarmonyOS build
cannot do it (rather than silently guessing or fabricating results). This is a known gap tracked as
R14 in `docs/工程规划.md`; the fix decision (wrap/replace the `bash` tool from the shell extension, or
patch pi's child-process wait) is still open.

> Note on the name collision: "`find` does not work" is true of the **tool** and false of the
> **command** — but on this build neither is reachable end-to-end, because the only way to run the
> command is the `bash` tool.

## Command execution (`bash`)

`bash` **should be avoided on this device.** It does spawn a real shell — **`/system/bin/sh`, which is mksh R59** —
with the application's own permissions and **without** a PTY, but on HarmonyOS the child's `exit`/`close` event
**never arrives** (the child becomes a zombie), and Pi's shell tool waits for exactly that event with no polling
and no deadline. Measured on device (`pi-desktop-hos` v0.11.1): the command really runs and stdout comes back,
then nothing further is observed — so **prefer `read`/`write`/`edit`/`ls`**, and reach for `bash` only when
nothing else fits, expecting that the call may hang.

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
- A non-zero exit code is a normal result, not a tool error.
- **No command in `bash` is fenced.** The shell runs with the application's full file access,
  so it can read and write wherever the application can — including outside the session
  workspace, bypassing the file-approval flow. Prefer the `read`/`write`/`edit` tools for
  file work, and reach for `bash` only when nothing else fits.
- **The first spawn of the shell is what makes a command possible at all; there is no
  per-command `workdir` parameter.** State (`cd`, shell variables) does not reliably persist
  between `bash` calls — pass an absolute path or `cd` within the same command line.

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

- `ls` lists a directory (pure Node.js) — use it for a plain directory listing.
- To search by pattern, use shell commands: `bash("find . -name '*.json'")`.
- To search file contents, use `bash("grep -rn '…' <dir>")`.

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
