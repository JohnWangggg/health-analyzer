import { create } from 'zustand';

/** Shared workspace routes — drives desktop sidebar + mobile bottom nav together. */
export type WorkspaceId = 'overview' | 'trends' | 'reports' | 'data';

export type WorkspaceDef = {
  id: WorkspaceId;
  path: string;
  label: string;
  shortLabel: string;
  description: string;
};

export const WORKSPACES: readonly WorkspaceDef[] = [
  {
    id: 'overview',
    path: '/',
    label: '总览',
    shortLabel: '总览',
    description: '数据新鲜度、优先事项与核心指标',
  },
  {
    id: 'trends',
    path: '/trends',
    label: '趋势',
    shortLabel: '趋势',
    description: '主趋势图与数据表',
  },
  {
    id: 'reports',
    path: '/reports',
    label: '报告',
    shortLabel: '报告',
    description: '门诊一页纸 / 周报预览',
  },
  {
    id: 'data',
    path: '/data',
    label: '数据',
    shortLabel: '数据',
    description: '本地仓库状态与备份',
  },
] as const;

export function workspaceFromPath(pathname: string): WorkspaceId {
  if (pathname.startsWith('/trends')) return 'trends';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/data')) return 'data';
  return 'overview';
}

type WorkspaceState = {
  active: WorkspaceId;
  setActive: (id: WorkspaceId) => void;
  setFromPath: (pathname: string) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  active: 'overview',
  setActive: (id) => set({ active: id }),
  setFromPath: (pathname) => set({ active: workspaceFromPath(pathname) }),
}));
