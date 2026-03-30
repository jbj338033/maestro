import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { readState, writeState, updateState } from '../scripts/lib/state.mjs';
import { readMission, createMission, updateCriteria, allCriteriaMet, clearMission } from '../scripts/lib/mission.mjs';
import { readMemory, addMemory, getAllMemory } from '../scripts/lib/memory.mjs';

const testDir = join(tmpdir(), `maestro-test-${randomBytes(4).toString('hex')}`);

before(() => {
  mkdirSync(testDir, { recursive: true });
  process.env.CLAUDE_PLUGIN_DATA = testDir;
});

after(() => {
  rmSync(testDir, { recursive: true, force: true });
  delete process.env.CLAUDE_PLUGIN_DATA;
});

describe('state', () => {
  it('writeState + readState roundtrip', () => {
    writeState('test.json', { foo: 'bar' });
    const data = readState('test.json');
    assert.deepStrictEqual(data, { foo: 'bar' });
  });

  it('readState returns default for missing file', () => {
    const data = readState('nonexistent.json', { default: true });
    assert.deepStrictEqual(data, { default: true });
  });

  it('updateState applies updater function', () => {
    writeState('counter.json', { count: 0 });
    const result = updateState('counter.json', (s) => { s.count++; return s; });
    assert.strictEqual(result.count, 1);
    assert.strictEqual(readState('counter.json').count, 1);
  });

  it('atomic write does not corrupt on valid data', () => {
    writeState('atomic.json', { big: 'x'.repeat(10000) });
    const data = readState('atomic.json');
    assert.strictEqual(data.big.length, 10000);
  });
});

describe('mission', () => {
  it('createMission + readMission', () => {
    const m = createMission('test objective', ['criterion 1', 'criterion 2'], [], 'medium');
    assert.strictEqual(m.objective, 'test objective');
    assert.strictEqual(m.acceptance_criteria.length, 2);
    assert.strictEqual(m.acceptance_criteria[0].verified, false);

    const read = readMission();
    assert.strictEqual(read.objective, 'test objective');
  });

  it('updateCriteria marks verified', () => {
    updateCriteria(0, true);
    const m = readMission();
    assert.strictEqual(m.acceptance_criteria[0].verified, true);
    assert.strictEqual(m.acceptance_criteria[1].verified, false);
  });

  it('allCriteriaMet returns false when some unmet', () => {
    assert.strictEqual(allCriteriaMet(), false);
  });

  it('allCriteriaMet returns true when all met', () => {
    updateCriteria(1, true);
    assert.strictEqual(allCriteriaMet(), true);
  });

  it('clearMission removes mission', () => {
    clearMission();
    assert.strictEqual(readMission(), null);
    assert.strictEqual(allCriteriaMet(), true);
  });
});

describe('memory', () => {
  it('starts empty', () => {
    const m = readMemory('conventions');
    assert.deepStrictEqual(m, { entries: [] });
  });

  it('addMemory appends entry', () => {
    addMemory('conventions', { rule: 'use strict mode' });
    const m = readMemory('conventions');
    assert.strictEqual(m.entries.length, 1);
    assert.strictEqual(m.entries[0].rule, 'use strict mode');
    assert.ok(m.entries[0].added_at);
  });

  it('getAllMemory returns all types', () => {
    const all = getAllMemory();
    assert.ok(all.conventions);
    assert.ok(all.decisions);
    assert.ok(all.patterns);
  });

  it('caps at 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      addMemory('patterns', { i });
    }
    const m = readMemory('patterns');
    assert.strictEqual(m.entries.length, 100);
  });
});
