/**
 * Append-only record of sensed moves for one session.
 *
 * Dragging a selection rectangle emits a selectCases notification per frame,
 * so consecutive selections within `coalesceMs` merge into one entry (its
 * count is updated) instead of flooding the record.
 */
import { MOVES } from './moves.js';

export const MAX_ENTRIES = 2000;

export class MoveLog extends EventTarget {
  constructor({ clock = () => 0, wallClock = () => new Date(), coalesceMs = 1500,
    now = () => performance.now() } = {}) {
    super();
    this.clock = clock;          // elapsed seconds on the model's clock
    this.wallClock = wallClock;
    this.coalesceMs = coalesceMs;
    this.now = now;
    this.entries = [];
    this.nextId = 1;
    this.lastAt = -Infinity;
  }

  add(sensed) {
    const at = this.now();
    const last = this.entries.at(-1);
    if (sensed.move === 'selecting' && last?.move === 'selecting'
        && at - this.lastAt <= this.coalesceMs
        && last.detail?.context === sensed.detail?.context) {
      Object.assign(last, { description: sensed.description, detail: sensed.detail });
      this.lastAt = at;
      this._emit(last, false);
      return last;
    }
    const entry = {
      id: this.nextId++,
      time: this.wallClock().toISOString(),
      elapsedSec: this.clock(),
      ...sensed,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    this.lastAt = at;
    this._emit(entry, true);
    return entry;
  }

  counts() {
    const counts = Object.fromEntries(MOVES.map(({ move }) => [move, 0]));
    for (const entry of this.entries) counts[entry.move] = (counts[entry.move] ?? 0) + 1;
    return counts;
  }

  /** Replace the record, e.g. from a saved CODAP document. */
  restore(entries = []) {
    this.entries = entries.slice(-MAX_ENTRIES);
    this.nextId = Math.max(0, ...this.entries.map((e) => e.id ?? 0)) + 1;
    this.lastAt = -Infinity;
    this._emit(null, false);
  }

  clear() { this.restore([]); }

  _emit(entry, isNew) {
    this.dispatchEvent(new CustomEvent('change', { detail: { entry, isNew } }));
  }
}

const CSV_COLUMNS = ['id', 'time', 'elapsedSec', 'family', 'move', 'kind', 'confidence', 'description'];

export function toCsv(entries) {
  const cell = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [CSV_COLUMNS.join(','),
    ...entries.map((e) => CSV_COLUMNS.map((c) => cell(e[c])).join(','))].join('\n') + '\n';
}
