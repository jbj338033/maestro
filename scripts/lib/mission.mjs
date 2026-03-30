import { readState, writeState } from './state.mjs';

const MISSION_FILE = 'mission.json';

/** read current mission, null if none */
export function readMission() {
  return readState(MISSION_FILE, null);
}

/** create a new mission */
export function createMission(objective, acceptanceCriteria = [], constraints = [], complexity = 'medium') {
  const mission = {
    version: 1,
    objective,
    acceptance_criteria: acceptanceCriteria.map((desc, i) => ({
      id: i,
      description: desc,
      verified: false
    })),
    constraints,
    created_at: new Date().toISOString(),
    complexity
  };
  writeState(MISSION_FILE, mission);
  return mission;
}

/** update a specific criteria's verified status */
export function updateCriteria(criteriaId, verified) {
  const mission = readMission();
  if (!mission) return null;
  const criteria = mission.acceptance_criteria.find(c => c.id === criteriaId);
  if (criteria) {
    criteria.verified = verified;
  }
  writeState(MISSION_FILE, mission);
  return mission;
}

/** check if all criteria are verified */
export function allCriteriaMet() {
  const mission = readMission();
  if (!mission) return true; // no mission = no criteria to meet
  return mission.acceptance_criteria.every(c => c.verified);
}

/** clear mission */
export function clearMission() {
  writeState(MISSION_FILE, null);
}
