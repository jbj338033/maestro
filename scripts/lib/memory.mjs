import { readState, writeState } from './state.mjs';

const MEMORY_DIR = 'memory';

function memoryPath(type) {
  return `${MEMORY_DIR}/${type}.json`;
}

/** read a memory type (conventions, decisions, patterns) */
export function readMemory(type) {
  return readState(memoryPath(type), { entries: [] });
}

/** add an entry to a memory type */
export function addMemory(type, entry) {
  const memory = readMemory(type);
  memory.entries.push({
    ...entry,
    added_at: new Date().toISOString()
  });
  // keep last 100 entries
  if (memory.entries.length > 100) {
    memory.entries = memory.entries.slice(-100);
  }
  writeState(memoryPath(type), memory);
  return memory;
}

/** get all memory types combined */
export function getAllMemory() {
  return {
    conventions: readMemory('conventions'),
    decisions: readMemory('decisions'),
    patterns: readMemory('patterns')
  };
}
