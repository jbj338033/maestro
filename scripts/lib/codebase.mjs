import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, relative } from 'node:path';

const IGNORE = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'target',
  '.maestro', '.omc', '.claude', '__pycache__', '.venv', 'venv',
  'coverage', '.turbo', '.vercel', '.svelte-kit', '.nuxt',
]);

/**
 * scan a project directory and return a compact project map.
 * designed to run in < 2s for typical projects.
 *
 * @param {string} cwd - project root
 * @returns {{ summary: string, meta: object }}
 */
export function scanProject(cwd) {
  const meta = {
    languages: [],
    framework: null,
    packageManager: null,
    scripts: {},
    testFramework: null,
    entryPoints: [],
    structure: [],
    description: null,
  };

  // detect from package.json
  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      meta.languages.push('javascript/typescript');

      // package manager
      if (existsSync(join(cwd, 'pnpm-lock.yaml'))) meta.packageManager = 'pnpm';
      else if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) meta.packageManager = 'bun';
      else if (existsSync(join(cwd, 'yarn.lock'))) meta.packageManager = 'yarn';
      else meta.packageManager = 'npm';

      // scripts
      if (pkg.scripts) {
        for (const key of ['dev', 'build', 'test', 'lint', 'start', 'typecheck']) {
          if (pkg.scripts[key]) meta.scripts[key] = pkg.scripts[key];
        }
      }

      // framework detection from deps
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps['next']) meta.framework = 'next.js';
      else if (allDeps['nuxt']) meta.framework = 'nuxt';
      else if (allDeps['@sveltejs/kit']) meta.framework = 'sveltekit';
      else if (allDeps['astro']) meta.framework = 'astro';
      else if (allDeps['react']) meta.framework = 'react';
      else if (allDeps['vue']) meta.framework = 'vue';
      else if (allDeps['express']) meta.framework = 'express';
      else if (allDeps['hono']) meta.framework = 'hono';
      else if (allDeps['fastify']) meta.framework = 'fastify';

      // test framework
      if (allDeps['vitest']) meta.testFramework = 'vitest';
      else if (allDeps['jest']) meta.testFramework = 'jest';
      else if (allDeps['mocha']) meta.testFramework = 'mocha';
      else if (pkg.scripts?.test?.includes('node --test')) meta.testFramework = 'node:test';
    } catch { /* ignore */ }
  }

  // detect from Cargo.toml
  if (existsSync(join(cwd, 'Cargo.toml'))) {
    meta.languages.push('rust');
    meta.packageManager = meta.packageManager || 'cargo';
    meta.testFramework = meta.testFramework || 'cargo test';
    try {
      const cargo = readFileSync(join(cwd, 'Cargo.toml'), 'utf8');
      const nameMatch = cargo.match(/^name\s*=\s*"(.+)"/m);
      if (nameMatch) meta.description = `rust crate: ${nameMatch[1]}`;
    } catch { /* ignore */ }
  }

  // detect from pubspec.yaml
  if (existsSync(join(cwd, 'pubspec.yaml'))) {
    meta.languages.push('dart');
    meta.packageManager = meta.packageManager || 'flutter/dart';
    meta.framework = meta.framework || 'flutter';
    meta.testFramework = meta.testFramework || 'flutter test';
  }

  // detect from pyproject.toml / requirements.txt
  if (existsSync(join(cwd, 'pyproject.toml')) || existsSync(join(cwd, 'requirements.txt'))) {
    meta.languages.push('python');
    if (existsSync(join(cwd, 'pyproject.toml'))) {
      try {
        const pyproj = readFileSync(join(cwd, 'pyproject.toml'), 'utf8');
        if (/django/i.test(pyproj)) meta.framework = meta.framework || 'django';
        else if (/fastapi/i.test(pyproj)) meta.framework = meta.framework || 'fastapi';
        else if (/flask/i.test(pyproj)) meta.framework = meta.framework || 'flask';
      } catch { /* ignore */ }
    }
    meta.testFramework = meta.testFramework || 'pytest';
  }

  // detect from go.mod
  if (existsSync(join(cwd, 'go.mod'))) {
    meta.languages.push('go');
    meta.packageManager = meta.packageManager || 'go';
    meta.testFramework = meta.testFramework || 'go test';
  }

  // typescript detection
  if (existsSync(join(cwd, 'tsconfig.json'))) {
    if (!meta.languages.includes('javascript/typescript')) {
      meta.languages.push('typescript');
    }
  }

  // directory tree (depth 3)
  meta.structure = scanTree(cwd, cwd, 0, 3);

  // entry points
  const entryFiles = [
    'src/app/layout.tsx', 'src/app/page.tsx', // next.js app router
    'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx', // generic
    'src/lib/index.ts', 'src/lib.rs', 'main.go', 'main.py', 'app.py',
    'lib/main.dart',
  ];
  for (const f of entryFiles) {
    if (existsSync(join(cwd, f))) meta.entryPoints.push(f);
  }

  // README first lines for description
  if (!meta.description) {
    for (const readme of ['README.md', 'readme.md', 'README']) {
      const readmePath = join(cwd, readme);
      if (existsSync(readmePath)) {
        try {
          const lines = readFileSync(readmePath, 'utf8').split('\n').slice(0, 5);
          const desc = lines.find(l => l.trim() && !l.startsWith('#') && !l.startsWith('<') && !l.startsWith('!') && !/<[a-z]/i.test(l));
          if (desc) {
            // strip markdown links: [text](url) → text
            meta.description = desc.trim().replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 120);
          }
        } catch { /* ignore */ }
        break;
      }
    }
  }

  return { summary: formatSummary(meta), meta };
}

function scanTree(root, dir, depth, maxDepth) {
  if (depth >= maxDepth) return [];
  const dirs = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue;
      const children = scanTree(root, join(dir, entry.name), depth + 1, maxDepth);
      if (children.length > 0) {
        dirs.push(`${entry.name}/{${children.join(',')}}`);
      } else {
        dirs.push(entry.name);
      }
    }
  } catch { /* permission error etc */ }
  return dirs;
}

function formatSummary(meta) {
  const parts = [];

  // line 1: project identity
  const identity = [meta.framework, ...meta.languages].filter(Boolean);
  const pm = meta.packageManager ? ` + ${meta.packageManager}` : '';
  if (identity.length) {
    parts.push(`project: ${identity.join(' + ')}${pm}`);
  }

  // description
  if (meta.description) {
    parts.push(`  ${meta.description}`);
  }

  // structure
  if (meta.structure.length > 0) {
    const tree = meta.structure.slice(0, 10).join(', ');
    parts.push(`  structure: ${tree}`);
  }

  // scripts
  const scriptEntries = Object.entries(meta.scripts);
  if (scriptEntries.length > 0) {
    const formatted = scriptEntries.map(([k, v]) => {
      // shorten long commands
      const short = v.length > 30 ? v.slice(0, 27) + '...' : v;
      return `${k}(${short})`;
    });
    parts.push(`  scripts: ${formatted.join(', ')}`);
  }

  // test framework
  if (meta.testFramework) {
    parts.push(`  test: ${meta.testFramework}`);
  }

  // entry points
  if (meta.entryPoints.length > 0) {
    parts.push(`  entry: ${meta.entryPoints.join(', ')}`);
  }

  return parts.join('\n');
}
