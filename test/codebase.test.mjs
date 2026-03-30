import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { scanProject } from '../scripts/lib/codebase.mjs';

const testDir = join(tmpdir(), `maestro-codebase-test-${randomBytes(4).toString('hex')}`);

before(() => {
  mkdirSync(testDir, { recursive: true });
});

after(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('scanProject', () => {
  it('detects node.js + pnpm project', () => {
    const dir = join(testDir, 'node-project');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      scripts: { dev: 'next dev', build: 'next build', test: 'vitest' },
      dependencies: { next: '^14', react: '^18' },
      devDependencies: { vitest: '^1' }
    }));
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    writeFileSync(join(dir, 'tsconfig.json'), '{}');

    const { summary, meta } = scanProject(dir);
    assert.ok(meta.languages.includes('javascript/typescript'));
    assert.strictEqual(meta.framework, 'next.js');
    assert.strictEqual(meta.packageManager, 'pnpm');
    assert.strictEqual(meta.testFramework, 'vitest');
    assert.ok(meta.scripts.build);
    assert.ok(summary.includes('next.js'));
  });

  it('detects rust project', () => {
    const dir = join(testDir, 'rust-project');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "myapp"\nversion = "0.1.0"');

    const { meta } = scanProject(dir);
    assert.ok(meta.languages.includes('rust'));
    assert.strictEqual(meta.packageManager, 'cargo');
    assert.ok(meta.description.includes('myapp'));
  });

  it('detects python project', () => {
    const dir = join(testDir, 'python-project');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pyproject.toml'), '[tool.poetry]\nname = "myapp"\n[tool.poetry.dependencies]\nfastapi = "^0.100"');

    const { meta } = scanProject(dir);
    assert.ok(meta.languages.includes('python'));
    assert.strictEqual(meta.framework, 'fastapi');
  });

  it('scans directory structure', () => {
    const dir = join(testDir, 'structured');
    mkdirSync(join(dir, 'src', 'components'), { recursive: true });
    mkdirSync(join(dir, 'src', 'lib'), { recursive: true });
    mkdirSync(join(dir, 'test'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{}');

    const { meta } = scanProject(dir);
    assert.ok(meta.structure.length > 0);
    assert.ok(meta.structure.some(s => s.includes('src')));
  });

  it('reads README for description', () => {
    const dir = join(testDir, 'with-readme');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'README.md'), '# My Project\n\nA cool tool for doing things.\n');

    const { meta } = scanProject(dir);
    assert.strictEqual(meta.description, 'A cool tool for doing things.');
  });

  it('handles empty directory gracefully', () => {
    const dir = join(testDir, 'empty');
    mkdirSync(dir, { recursive: true });

    const { summary, meta } = scanProject(dir);
    assert.strictEqual(meta.languages.length, 0);
    assert.strictEqual(meta.framework, null);
  });

  it('ignores node_modules', () => {
    const dir = join(testDir, 'with-nm');
    mkdirSync(join(dir, 'node_modules', 'foo'), { recursive: true });
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{}');

    const { meta } = scanProject(dir);
    assert.ok(!meta.structure.some(s => s.includes('node_modules')));
  });
});
