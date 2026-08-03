/**
 * Secondary Overview tools — separate chunk from the critical KPI path.
 * Loaded after first paint (or on demand via parent Suspense).
 */
import { DateFilterPanel } from './DateFilterPanel';
import { UserContextPanel } from './UserContextPanel';
import { EventsPanel } from './EventsPanel';
import { CsvMergePanel } from './CsvMergePanel';
import { RecoveryWeightsPanel } from './RecoveryWeightsPanel';

export function OverviewAdvancedTools() {
  return (
    <>
      <DateFilterPanel />
      <UserContextPanel />
      <EventsPanel />
      <CsvMergePanel />
      <RecoveryWeightsPanel />
    </>
  );
}
