import type { Project } from './types';
import { validateProject } from './engine/validation';
import { DEFAULT_ELEVATION_CHANGE_M, DEFAULT_PIPE_ROUGHNESS_M } from './defaults';

const KEY = 'flowsure-project-v1';
const ROUGHNESS_MIGRATION_KEY = 'flowsure-roughness-default-015mm-v1';
const ELEVATION_MIGRATION_KEY = 'flowsure-elevation-default-15m-v1';
const LEGACY_DEFAULT_ROUGHNESS_M = 0.000045;

export function saveProject(project: Project): void {
  localStorage.setItem(KEY, JSON.stringify(project));
}

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const checked = validateProject(JSON.parse(raw));
    if (!checked.valid) return null;
    let migrated = checked.project;
    if (!localStorage.getItem(ROUGHNESS_MIGRATION_KEY)) {
      migrated = migrateLegacyDefaultRoughness(migrated);
      localStorage.setItem(ROUGHNESS_MIGRATION_KEY, 'done');
    }
    if (!localStorage.getItem(ELEVATION_MIGRATION_KEY)) {
      migrated = migrateLegacyDefaultElevation(migrated);
      localStorage.setItem(ELEVATION_MIGRATION_KEY, 'done');
    }
    localStorage.setItem(KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

// One-time migration: replace only the app's former default (0.045 mm).
// Other user-entered roughness values are preserved.
export function migrateLegacyDefaultRoughness(project: Project): Project {
  return {
    ...project,
    segments: project.segments.map((segment) => ({
      ...segment,
      roughnessM: Math.abs(segment.roughnessM - LEGACY_DEFAULT_ROUGHNESS_M) < 1e-12
        ? DEFAULT_PIPE_ROUGHNESS_M
        : segment.roughnessM,
    })),
  };
}

// One-time migration of the former starter-project elevation (5 m).
// Zero and all other entered elevation values remain unchanged.
export function migrateLegacyDefaultElevation(project: Project): Project {
  return {
    ...project,
    segments: project.segments.map((segment, index) => ({
      ...segment,
      elevationChangeM: index === 0 && segment.elevationChangeM === 5
        ? DEFAULT_ELEVATION_CHANGE_M
        : segment.elevationChangeM,
    })),
  };
}

export function clearProject(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(ROUGHNESS_MIGRATION_KEY);
  localStorage.removeItem(ELEVATION_MIGRATION_KEY);
}
