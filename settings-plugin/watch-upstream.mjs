#!/usr/bin/env node

/**
 * Watch decentespresso/streamline-js for new releases and pull in only the
 * settings-page changes.
 *
 * "Only the settings page" is not a guess: sync-upstream.mjs's FILES manifest
 * already names every upstream path this plugin vendors, so it is imported here
 * and used as the filter. A release that touches nothing in that list is
 * reported as "no settings changes" and nothing is written.
 *
 * Source of truth for *what the plugin ships* is a release tag, recorded in
 * upstream.json. That is deliberately not the same as `npm run sync`, which
 * reads whatever is in the local skin checkout — usually ahead of the last
 * release. Use this to track releases; use `npm run sync` when developing
 * against unreleased skin changes.
 *
 * Usage:
 *   node watch-upstream.mjs --check        # is there a new release? what changed? writes nothing
 *   node watch-upstream.mjs                # sync to the latest release, record it
 *   node watch-upstream.mjs --tag v0.1.109 # sync to a specific tag
 *
 * Exit codes (for CI):
 *   0  up to date, or synced successfully
 *   1  a new release exists with settings changes (--check only)
 *   2  error
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILES } from "./sync-upstream.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.STREAMLINE_REPO || "decentespresso/streamline-js";
const STATE = resolve(__dirname, "upstream.json");

const args = process.argv.slice(2);
const check = args.includes("--check");
const tagFlag = args.indexOf("--tag");
const wantTag = tagFlag > -1 ? args[tagFlag + 1] : null;

const say = (...m) => console.log(...m);
const die = (m) => { console.error(m); process.exit(2); };

// ── GitHub access ───────────────────────────────────────────────────────────
// `gh` when it is there (auth, private repos, a sane rate limit), plain fetch
// otherwise so this still works in a bare container.

function hasGh() {
  try {
    execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function latestTag() {
  if (hasGh()) {
    const out = execFileSync("gh", ["release", "view", "--repo", REPO, "--json", "tagName"], {
      encoding: "utf-8",
    });
    return JSON.parse(out).tagName;
  }
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) die(`GitHub: ${res.status} ${res.statusText} fetching the latest release`);
  return (await res.json()).tag_name;
}

/** Extract the release tarball and return the path to its `src/` directory. */
async function fetchSrc(tag) {
  const dir = mkdtempSync(join(tmpdir(), "streamline-"));
  const tarball = join(dir, "repo.tar.gz");

  if (hasGh()) {
    execFileSync("gh", ["api", `repos/${REPO}/tarball/${tag}`], {
      stdio: ["ignore", openSync(tarball, "w"), "inherit"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } else {
    const res = await fetch(`https://api.github.com/repos/${REPO}/tarball/${tag}`);
    if (!res.ok) die(`GitHub: ${res.status} fetching the tarball for ${tag}`);
    writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  }

  // --strip-components=1 drops the `<owner>-<repo>-<sha>/` wrapper GitHub adds.
  // ponytail: extract the whole tree (~5 MB). Filtering to src/ needs a member
  // pattern that differs between bsdtar (macOS) and GNU tar (CI), and the copy
  // step below only ever reads src/ anyway.
  mkdirSync(join(dir, "tree"), { recursive: true });
  execFileSync("tar", ["xzf", tarball, "-C", join(dir, "tree"), "--strip-components=1"],
               { stdio: "inherit" });

  const src = join(dir, "tree", "src");
  if (!existsSync(src)) die(`${tag}: no src/ in the release tarball`);
  return { src, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── State ───────────────────────────────────────────────────────────────────

const state = existsSync(STATE)
  ? JSON.parse(readFileSync(STATE, "utf-8"))
  : { repo: REPO, tag: null, syncedAt: null };

// `npm run sync` records a local working tree instead of a release tag. Say so,
// rather than reporting "vendored (nothing)" — the difference matters: a working
// tree is usually ahead of the last release, so syncing to that release is a
// downgrade, not an update.
const vendoredFrom = state.tag
  ? state.tag
  : state.source === "local-tree"
    ? `local tree ${state.describe || state.path} (not a release)`
    : "(nothing recorded)";

// ── Run ─────────────────────────────────────────────────────────────────────

const tag = wantTag || (await latestTag());

if (!wantTag && state.tag === tag) {
  say(`up to date: ${REPO} ${tag}`);
  process.exit(0);
}

say(`${REPO}: vendored ${vendoredFrom}\n${" ".repeat(REPO.length + 2)}latest release ${tag}`);

const { src, cleanup } = await fetchSrc(tag);
try {
  // A vendored copy is never byte-equal to upstream — it carries the port's
  // patches and a banner — so "did anything change?" is answered by dry-running
  // the sync itself: --check writes nothing and reports each copy that would move.
  // Anything the manifest does not name is, by construction, not a settings change.
  const missing = FILES.filter((f) => !f.optional && !existsSync(join(src, f.from)));
  if (missing.length) {
    say(`\n${tag} no longer contains ${missing.length} watched path(s):`);
    for (const f of missing) say(`  GONE: ${f.from}`);
    say("The sync manifest needs updating before this release can be vendored.");
    process.exit(2);
  }

  let drift = "";
  try {
    drift = execFileSync("node", [resolve(__dirname, "sync-upstream.mjs"), "--check", "--src", src],
                         { encoding: "utf-8" });
  } catch (e) {
    drift = e.stdout || "";
  }
  const drifted = drift.split("\n").filter((l) => l.includes("DRIFTED")).map((l) => l.trim());

  if (!drifted.length) {
    say(`\n${tag} changes nothing this plugin vendors — no settings changes.`);
    if (!check) {
      writeFileSync(STATE, JSON.stringify({ repo: REPO, tag, syncedAt: new Date().toISOString() }, null, 2) + "\n");
      say(`recorded ${tag}`);
    }
    process.exit(0);
  }

  say(`\n${drifted.length} vendored file(s) differ between what is vendored now and ${tag}:`);
  for (const line of drifted) say(`  ${line.replace("DRIFTED", "").trim()}`);

  if (state.source === "local-tree") {
    say(`\nNote: the copies here came from a local working tree, which is normally`);
    say(`ahead of the last release. Syncing to ${tag} would move them BACKWARDS.`);
    say(`Check \`git -C <skin> describe\` before running the sync.`);
  }

  if (check) {
    say(`\nRun \`npm run watch:sync\` to pull them in.`);
    process.exit(1);
  }

  say("");
  execFileSync("node", [resolve(__dirname, "sync-upstream.mjs"), "--src", src], { stdio: "inherit" });
  writeFileSync(STATE, JSON.stringify({ repo: REPO, tag, syncedAt: new Date().toISOString() }, null, 2) + "\n");
  say(`\nrecorded ${tag} in upstream.json`);
  say("Now: npm run build && npm test");
} finally {
  cleanup();
}
