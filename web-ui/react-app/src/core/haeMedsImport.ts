/**
 * Import HAE medications JSON → healthEvents (lib extractMedicationEventsFromHaeJson).
 */
import { extractMedicationEventsFromHaeJson } from '@health-analyzer/lib';
import { saveLocalHealthEvent, type HealthEvent } from './localEvents';

export type HaeMedsImportResult = {
  parsed: number;
  saved: number;
  events: HealthEvent[];
};

export async function importHaeMedicationsJsonText(
  text: string,
  options?: { includeTaken?: boolean },
): Promise<HaeMedsImportResult> {
  const events = extractMedicationEventsFromHaeJson(text, {
    includeTaken: !!options?.includeTaken,
  }) as HealthEvent[];
  let saved = 0;
  for (const ev of events) {
    await saveLocalHealthEvent({
      id: ev.id,
      kind: ev.kind,
      date: ev.date,
      endDate: ev.endDate,
      title: ev.title,
      note: ev.note,
      source: ev.source || 'apple_medication',
      createdAt: ev.createdAt,
    });
    saved += 1;
  }
  return { parsed: events.length, saved, events };
}

export async function importHaeMedicationsFile(
  file: File,
  options?: { includeTaken?: boolean },
): Promise<HaeMedsImportResult> {
  const text = await file.text();
  return importHaeMedicationsJsonText(text, options);
}
