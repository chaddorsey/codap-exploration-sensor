/**
 * Opt-in: mirror sensed moves into a CODAP dataset, so a teacher or
 * researcher can table and graph a session's moves in CODAP itself.
 *
 * Off by default because it adds a dataset to the student's document. The
 * connection ignores notifications about this dataset, so writing to it is
 * never sensed as a move.
 */
import { settle, isTimeout } from './settle.js';

export const LOG_CONTEXT = 'Exploration Log';

const ATTRIBUTES = [
  { name: 'id', type: 'numeric', description: 'Order the move was sensed in' },
  { name: 'time', type: 'date', description: 'Clock time the move was sensed' },
  { name: 'elapsed', type: 'numeric', unit: 's', description: 'Seconds since the sensor session began' },
  { name: 'family', type: 'categorical', description: 'data, graph, inspect or revise' },
  { name: 'move', type: 'categorical' },
  { name: 'kind', type: 'categorical' },
  { name: 'confidence', type: 'categorical', description: 'verified = op seen live in CODAP; inferred = op name assumed' },
  { name: 'description', type: 'categorical' },
];

export async function ensureLogTable(codap) {
  codap.ignoreContext(LOG_CONTEXT);
  const tableExists = async () => {
    const list = await codap.request('get', 'componentList');
    return (list?.values ?? []).some((c) => /caseTable/i.test(c.type) && c.name === LOG_CONTEXT);
  };
  // Not asSelf(): verifying a slow write can take a while, and the student's
  // moves must keep being sensed meanwhile. Nothing here is sensed anyway:
  // this dataset is ignored by name, a new case table is not a move, and the
  // merge check leaves this dataset out of its count.
  const existing = await codap.request('get', `dataContext[${LOG_CONTEXT}]`);
  if (!existing?.success) {
    await settle('log dataset',
      () => codap.request('create', 'dataContext', {
        name: LOG_CONTEXT, title: LOG_CONTEXT,
        collections: [{ name: 'Moves', title: 'Moves', attrs: ATTRIBUTES }],
      }),
      async () => (await codap.request('get', `dataContext[${LOG_CONTEXT}]`))?.success);
  }
  if (!(await tableExists())) {
    await settle('log table',
      () => codap.request('create', 'component', {
        type: 'caseTable', dataContext: LOG_CONTEXT, name: LOG_CONTEXT,
      }),
      tableExists);
  }
}

export async function writeLogEntries(codap, entries) {
  if (!entries.length) return;
  // Not asSelf(): its quiet window would also drop the student's next moves.
  // Notifications about this dataset are already ignored by name. A timeout
  // is not retried: the rows usually land anyway, and a retry could double them.
  await codap.request('create', `dataContext[${LOG_CONTEXT}].item`,
    entries.map((e) => ({
      id: e.id, time: e.time, elapsed: e.elapsedSec, family: e.family, move: e.move,
      kind: e.kind, confidence: e.confidence, description: e.description,
    }))).catch((error) => { if (!isTimeout(error)) throw error; });
}
