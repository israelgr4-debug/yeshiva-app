// "What is waiting now" for the מלגות module — one load that feeds the tab badges and the
// overview board: calls waiting for a charge, unidentified IDs, open entitlements that were
// never put in a report run, and runs whose checks were not marked as paid yet.

import { supabase } from '@/lib/supabase';
import { ScholarshipRun, ScholarshipType } from '@/lib/types';
import type { useScholarships } from '@/hooks/useScholarships';
import { belowMinimum, loadMinCheck } from '@/lib/scholarship-min';

type Sch = ReturnType<typeof useScholarships>;

export interface RunProgress {
  run: ScholarshipRun;
  entries: number;       // entitlements in the run
  openEntries: number;   // … still not paid
  openStudents: number;  // checks still to mark
  openTotal: number;
}

export interface WorkflowStatus {
  types: ScholarshipType[];
  pendingCalls: number;
  unmatchedIds: number;
  /** every open entitlement */
  open: { entries: number; students: number; total: number };
  /** open, not part of any saved run, and enough for a check → waiting for "הפקה לתשלום" */
  notInRun: { entries: number; students: number; total: number };
  /** open and not in a run, but the student's sum is below the minimum check → only accumulating */
  accumulating: { entries: number; students: number; total: number };
  minCheck: number;
  /** open one-time items (subset of the above) */
  oneTimeOpen: { entries: number; total: number };
  runs: RunProgress[];
  awaitingRuns: number;
}

export const EMPTY_STATUS: WorkflowStatus = {
  types: [], pendingCalls: 0, unmatchedIds: 0,
  open: { entries: 0, students: 0, total: 0 },
  notInRun: { entries: 0, students: 0, total: 0 },
  accumulating: { entries: 0, students: 0, total: 0 },
  minCheck: 0,
  oneTimeOpen: { entries: 0, total: 0 },
  runs: [], awaitingRuns: 0,
};

export async function loadWorkflowStatus(sch: Sch): Promise<WorkflowStatus> {
  const [minCheck, types, openEntries, runs, pend, unm] = await Promise.all([
    loadMinCheck(),
    sch.listTypes(true),
    sch.fetchOpenEntries(),
    sch.listRuns(40),
    supabase.from('scholarship_yemot_calls').select('id', { count: 'exact', head: true }).in('status', ['pending', 'deferred']),
    supabase.from('scholarship_yemot_calls').select('id, raw_id_number').eq('status', 'unmatched').limit(5000),
  ]);
  const openById = new Map(openEntries.map((e) => [e.id, e]));
  const oneTime = new Set(types.filter((t) => t.kind === 'one_time').map((t) => t.id));

  const inRun = new Set<string>();
  const progress: RunProgress[] = runs.map((run) => {
    const studs = new Set<string>();
    let openCount = 0, openTotal = 0;
    for (const id of run.entry_ids || []) {
      const e = openById.get(id);
      if (!e) continue;
      inRun.add(id);
      openCount++; openTotal += e.amount; studs.add(e.student_id);
    }
    return { run, entries: run.entry_ids?.length || 0, openEntries: openCount, openStudents: studs.size, openTotal };
  });

  const sum = (list: typeof openEntries) => ({
    entries: list.length,
    students: new Set(list.map((e) => e.student_id)).size,
    total: list.reduce((s, e) => s + e.amount, 0),
  });
  const ot = openEntries.filter((e) => oneTime.has(e.type_id));
  const free = openEntries.filter((e) => !inRun.has(e.id));
  const small = belowMinimum(free, minCheck);
  return {
    types,
    pendingCalls: pend.count || 0,
    unmatchedIds: new Set((unm.data || []).map((r: any) => r.raw_id_number || r.id)).size,
    open: sum(openEntries),
    notInRun: sum(free.filter((e) => !small.has(e.student_id))),
    accumulating: sum(free.filter((e) => small.has(e.student_id))),
    minCheck,
    oneTimeOpen: { entries: ot.length, total: ot.reduce((s, e) => s + e.amount, 0) },
    runs: progress,
    awaitingRuns: progress.filter((p) => p.openEntries > 0).length,
  };
}
