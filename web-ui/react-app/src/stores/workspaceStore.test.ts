import { describe, expect, it } from 'vitest';
import {
  WORKSPACES,
  workspaceFromPath,
  useWorkspaceStore,
} from './workspaceStore';

describe('workspace store / nav state', () => {
  it('defines four workspaces with paths', () => {
    expect(WORKSPACES.map((w) => w.id)).toEqual([
      'overview',
      'trends',
      'reports',
      'data',
    ]);
    expect(WORKSPACES.every((w) => w.path && w.label)).toBe(true);
  });

  it('maps paths to workspace ids (shared by sidebar + bottom nav)', () => {
    expect(workspaceFromPath('/')).toBe('overview');
    expect(workspaceFromPath('/trends')).toBe('trends');
    expect(workspaceFromPath('/reports')).toBe('reports');
    expect(workspaceFromPath('/data')).toBe('data');
    expect(workspaceFromPath('/trends/extra')).toBe('trends');
  });

  it('setFromPath updates active for both nav surfaces', () => {
    useWorkspaceStore.getState().setFromPath('/reports');
    expect(useWorkspaceStore.getState().active).toBe('reports');
    useWorkspaceStore.getState().setActive('data');
    expect(useWorkspaceStore.getState().active).toBe('data');
  });
});
