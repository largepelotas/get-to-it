// Writes public/third-party-notices.txt: the licence notices of every production
// npm package and every Rust crate the app ships with. Run by `npm run notices`
// (and so by `tauri build`, through beforeBuildCommand). Exits non-zero rather
// than write a partial file.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The first line of the file; the app checks it, since Vite's dev server answers unknown paths with index.html. */
export const MARKER = 'Get To It — third-party notices';

const HEADER = `${MARKER}

Get To It includes the following third-party software. Each is used under the
licence named beside it; the full text of each licence is in the appendix at the
end, and the entries refer to it by number.`;

const NO_FILE = '(no licence file in package)';

/** Licence file names: LICENSE, LICENCE, COPYING, NOTICE, with any suffix (LICENSE-MIT, LICENSE.md). */
export const LICENCE_FILE = /^(licen[sc]e|copying|notice)([-_. ].*)?$/i;

export function normalise(text) {
  return text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim();
}

/**
 * packages: [{ name, version, license, texts: string[] }]. Returns { text, missing, distinct }.
 * Throws if a package has neither a licence id nor a licence file.
 */
export function buildNotices(packages) {
  const bad = packages.filter((p) => !p.license && !p.texts.length);
  if (bad.length)
    throw new Error(
      `No licence id and no licence file: ${bad.map((p) => `${p.name} ${p.version}`).join(', ')}`,
    );
  const sorted = [...packages].sort(
    (a, b) =>
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.version < b.version ? -1 : a.version > b.version ? 1 : 0),
  );
  const numbers = new Map(); // normalised text -> appendix number
  const entries = sorted.map((p) => {
    const head = `${p.name} ${p.version} — ${p.license || 'licence not declared'}`;
    const texts = [...new Set(p.texts.map(normalise).filter(Boolean))];
    if (!texts.length) return `${head}\n  ${NO_FILE}`;
    const refs = texts.map((t) => {
      if (!numbers.has(t)) numbers.set(t, numbers.size + 1);
      return numbers.get(t);
    });
    return `${head}\n  Licence text: ${refs.map((n) => `[${n}]`).join(' ')}`;
  });
  const appendix = [...numbers].map(([t, n]) => `[${n}]\n${'-'.repeat(60)}\n${t}`);
  const missing = packages.filter((p) => !p.texts.some((t) => normalise(t))).length;
  const text =
    [HEADER, entries.join('\n\n'), `Licence texts\n=============\n\n${appendix.join('\n\n')}`].join(
      '\n\n',
    ) + '\n';
  return { text, missing, distinct: numbers.size };
}

/** The `licenses` of an npm package.json, in whichever of its forms. */
export function licenceId(pkg) {
  const l = pkg.license ?? pkg.licenses;
  if (typeof l === 'string') return l;
  if (Array.isArray(l)) return l.map((x) => x.type ?? x).join(' OR ');
  return l?.type ?? '';
}

/** The names of production packages in a package-lock.json (v3): entries under node_modules without `dev: true`. */
export function productionPaths(lock) {
  return Object.entries(lock.packages)
    .filter(([path, p]) => path.startsWith('node_modules/') && !p.dev && !p.link)
    .map(([path]) => path);
}

// --- File system and cargo: a thin wrapper, not unit-tested. ---

function licenceTexts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENCE_FILE.test(e.name))
    .map((e) => e.name)
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'));
}

function npmPackages(root) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  return productionPaths(lock).map((path) => {
    const dir = join(root, path);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return {
      name: pkg.name ?? path.replace(/^.*node_modules\//, ''),
      version: pkg.version,
      license: licenceId(pkg),
      texts: licenceTexts(dir),
    };
  });
}

function rustPackages(root) {
  let json;
  try {
    json = execFileSync(
      'cargo',
      ['metadata', '--format-version', '1', '--manifest-path', 'src-tauri/Cargo.toml', '--locked'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );
  } catch (err) {
    throw new Error(`cargo metadata failed (is cargo installed?): ${err.message}`);
  }
  const meta = JSON.parse(json);
  const own = new Set(meta.workspace_members);
  return meta.packages
    .filter((p) => !own.has(p.id))
    .map((p) => ({
      name: p.name,
      version: p.version,
      license: p.license ?? '',
      texts: licenceTexts(dirname(p.manifest_path)),
    }));
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const npm = npmPackages(root);
  const rust = rustPackages(root);
  const { text, missing, distinct } = buildNotices([...npm, ...rust]);
  writeFileSync(join(root, 'public', 'third-party-notices.txt'), text);
  console.log(
    `${npm.length} npm and ${rust.length} Rust packages, ${distinct} distinct licence texts, ${text.length} characters.`,
  );
  if (missing) console.error(`${missing} package(s) have no licence file.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
