import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

function getGlobalDir() {
  const dir = join(homedir(), '.maestro', 'global');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function readGlobalJson(filename) {
  try {
    const filepath = join(getGlobalDir(), filename);
    if (!existsSync(filepath)) return null;
    return JSON.parse(readFileSync(filepath, 'utf8'));
  } catch {
    return null;
  }
}

function writeGlobalJson(filename, data) {
  const dir = getGlobalDir();
  const filepath = join(dir, filename);
  const tmp = filepath + '.' + randomBytes(4).toString('hex') + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, filepath);
}

export function readGlobalMemory(type) {
  return readGlobalJson(`${type}.json`) || { entries: [] };
}

export function writeGlobalMemory(type, entry) {
  const data = readGlobalMemory(type);
  data.entries.push({
    ...entry,
    added_at: new Date().toISOString(),
  });
  if (data.entries.length > 200) {
    data.entries = data.entries.slice(-200);
  }
  writeGlobalJson(`${type}.json`, data);
  return data;
}

export function promoteToGlobal(projectEntry, projectId, technologies) {
  const data = readGlobalMemory('conventions');
  const content = projectEntry.rule || projectEntry.convention || projectEntry.decision || '';

  const existing = data.entries.find(e => {
    const eContent = e.rule || e.convention || e.decision || '';
    return contentOverlap(content, eContent) > 0.8;
  });

  if (existing) {
    existing.seen_in_projects = (existing.seen_in_projects || 1) + 1;
    if (!existing.projects) existing.projects = [];
    if (!existing.projects.includes(projectId)) existing.projects.push(projectId);
    writeGlobalJson('conventions.json', data);
    return { promoted: existing.seen_in_projects >= 2, entry: existing };
  }

  const entry = {
    ...projectEntry,
    seen_in_projects: 1,
    projects: [projectId],
    technologies,
    added_at: new Date().toISOString(),
  };
  data.entries.push(entry);
  if (data.entries.length > 200) {
    data.entries = data.entries.slice(-200);
  }
  writeGlobalJson('conventions.json', data);
  return { promoted: false, entry };
}

function contentOverlap(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  if (!wordsA.size || !wordsB.size) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const total = Math.max(wordsA.size, wordsB.size);
  return overlap / total;
}

export function getRelevantGlobal(technologies) {
  const techSet = new Set(technologies.map(t => t.toLowerCase()));

  const conventions = readGlobalMemory('conventions');
  const antiPatterns = readGlobalMemory('anti-patterns');

  const filterEntries = (entries) => entries.filter(e => {
    if (e.seen_in_projects >= 3) return true;
    if (!e.technologies) return false;
    return e.technologies.some(t => techSet.has(t.toLowerCase()));
  }).slice(0, 10);

  return {
    conventions: filterEntries(conventions.entries),
    anti_patterns: filterEntries(antiPatterns.entries),
  };
}

export function readTechProfile(technology) {
  const data = readGlobalJson('tech-profiles.json') || {};
  return data[technology] || { entries: [] };
}

export function updateTechProfile(technology, entry) {
  const data = readGlobalJson('tech-profiles.json') || {};
  if (!data[technology]) data[technology] = { entries: [] };

  data[technology].entries.push({
    ...entry,
    added_at: new Date().toISOString(),
  });

  if (data[technology].entries.length > 50) {
    data[technology].entries = data[technology].entries.slice(-50);
  }

  writeGlobalJson('tech-profiles.json', data);
  return data[technology];
}
