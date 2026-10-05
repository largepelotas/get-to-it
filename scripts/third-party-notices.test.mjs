import { describe, expect, it } from 'vitest';
import { NOTICES_MARKER } from '../src/lib/about';
import {
  buildNotices,
  licenceId,
  LICENCE_FILE,
  MARKER,
  productionPaths,
} from './third-party-notices.mjs';

const MIT = 'MIT License\r\n\r\nPermission is hereby granted';

describe('buildNotices', () => {
  it('starts with the marker line the app checks, or a dev server answering with index.html looks like notices', () => {
    const { text } = buildNotices([{ name: 'a', version: '1', license: 'MIT', texts: [MIT] }]);
    expect(text.split('\n')[0]).toBe(MARKER);
  });

  it('prints identical licence texts once, whatever their line endings, so the file stays small', () => {
    const { text, distinct } = buildNotices([
      { name: 'a', version: '1', license: 'MIT', texts: [MIT] },
      { name: 'b', version: '2', license: 'MIT', texts: [MIT.replace(/\r\n/g, '\n') + '\n'] },
      { name: 'c', version: '3', license: 'ISC', texts: ['ISC text'] },
    ]);
    expect(distinct).toBe(2);
    expect(text.match(/Permission is hereby granted/g)).toHaveLength(1);
    expect(text).not.toContain('\r');
    expect(text).toContain('b 2 — MIT\n  Licence text: [1]');
    expect(text).toContain('c 3 — ISC\n  Licence text: [2]');
  });

  it('keeps texts that differ only in the copyright line apart, because each holder’s notice has to survive', () => {
    const { text, distinct } = buildNotices([
      { name: 'a', version: '1', license: 'MIT', texts: [`Copyright (c) Ann\n\n${MIT}`] },
      { name: 'b', version: '1', license: 'MIT', texts: [`Copyright (c) Bob\n\n${MIT}`] },
    ]);
    expect(distinct).toBe(2);
    expect(text).toContain('Copyright (c) Ann');
    expect(text).toContain('Copyright (c) Bob');
  });

  it('uses the same marker as the app, or every installed copy would say it is a development build', () => {
    expect(MARKER).toBe(NOTICES_MARKER);
  });

  it('sorts by name then version, whatever order the packages arrive in, so output is deterministic', () => {
    const pkgs = [
      { name: 'zed', version: '1', license: 'MIT', texts: [MIT] },
      { name: 'abc', version: '2', license: 'MIT', texts: [MIT] },
      { name: 'abc', version: '1', license: 'MIT', texts: [MIT] },
    ];
    const a = buildNotices(pkgs).text;
    expect(buildNotices([...pkgs].reverse()).text).toBe(a);
    expect(a.indexOf('abc 1')).toBeLessThan(a.indexOf('abc 2'));
    expect(a.indexOf('abc 2')).toBeLessThan(a.indexOf('zed 1'));
  });

  it('lists a package with no licence file, notes it and counts it, so nothing is silently omitted', () => {
    const { text, missing } = buildNotices([
      { name: 'a', version: '1', license: 'MIT', texts: [] },
      { name: 'b', version: '1', license: 'MIT', texts: [MIT] },
    ]);
    expect(text).toContain('a 1 — MIT\n  (no licence file in package)');
    expect(missing).toBe(1);
  });

  it('throws for a package with neither a licence id nor a file, so an installer is never built with a partial file', () => {
    expect(() => buildNotices([{ name: 'x', version: '9', license: '', texts: [] }])).toThrow(
      /x 9/,
    );
  });
});

describe('helpers', () => {
  it('takes only production entries under node_modules from a lockfile', () => {
    const lock = {
      packages: {
        '': {},
        'node_modules/a': {},
        'node_modules/b': { dev: true },
        'node_modules/a/node_modules/c': {},
      },
    };
    expect(productionPaths(lock)).toEqual(['node_modules/a', 'node_modules/a/node_modules/c']);
  });

  it('reads old and new package.json licence fields', () => {
    expect(licenceId({ license: 'MIT' })).toBe('MIT');
    expect(licenceId({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe(
      'MIT OR Apache-2.0',
    );
    expect(licenceId({})).toBe('');
  });

  it('recognises licence file names', () => {
    for (const n of [
      'LICENSE',
      'license.md',
      'LICENCE.txt',
      'COPYING',
      'NOTICE',
      'LICENSE-MIT',
      'LICENSE-APACHE',
    ])
      expect(LICENCE_FILE.test(n)).toBe(true);
    for (const n of ['licensed.js', 'README.md', 'index.js'])
      expect(LICENCE_FILE.test(n)).toBe(false);
  });
});
