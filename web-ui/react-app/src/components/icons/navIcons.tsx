import {
  Activity,
  BarChart3,
  Database,
  FileText,
  Home,
  Import,
  Monitor,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { WorkspaceId } from '../../stores/workspaceStore';

export const WORKSPACE_ICONS: Record<WorkspaceId, LucideIcon> = {
  overview: Home,
  trends: BarChart3,
  reports: FileText,
  data: Database,
};

export const ShellIcons = {
  activity: Activity,
  import: Import,
  monitor: Monitor,
  settings: Settings,
} as const;

export function NavIcon({
  id,
  size = 18,
  className,
}: {
  id: WorkspaceId;
  size?: number;
  className?: string;
}) {
  const Icon = WORKSPACE_ICONS[id];
  return (
    <Icon
      className={className}
      size={size}
      strokeWidth={2}
      aria-hidden
    />
  );
}
