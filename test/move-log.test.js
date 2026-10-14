import { describe, expect, it } from 'vitest';
import { MoveLog, toCsv } from '../src/sensing/move-log.js';
import { classifyMove } from '../src/sensing/moves.js';

const select = (count, context = 'C') => classifyMove({ resource: `dataContextChangeNotice[${context}]`,
  values: { operation: 'selectCases', result: { cases: Array.from({ length: count }, () => ({})) } } });
const graph = () => classifyMove({ resource: 'component', values: { operation: 'create', type: 'graph' } });

function makeLog() {
  let t = 0;
  const log = new MoveLog({ now: () => t, clock: () => Math.round(t / 1000),
    wallClock: () => new Date('2026-10-13T12:00:00Z') });
  return { log, advance: (ms) => { t += ms; } };
}

describe('MoveLog', () => {
  it('merges a selection drag into one entry with the final count', () => {
    const { log, advance } = makeLog();
    log.add(select(1)); advance(200); log.add(select(5)); advance(200); log.add(select(9));
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].description).toBe('Selected 9 cases');
  });

  it('keeps selections apart when separated by time, context or another move', () => {
    const { log, advance } = makeLog();
    log.add(select(1)); advance(5000); log.add(select(2));
    log.add(select(3, 'D'));
    log.add(graph()); log.add(select(4, 'D'));
    expect(log.entries.map((e) => e.move)).toEqual(['selecting', 'selecting', 'selecting', 'representing', 'selecting']);
  });

  it('counts moves and stamps elapsed time', () => {
    const { log, advance } = makeLog();
    advance(12_000); log.add(graph());
    expect(log.counts().representing).toBe(1);
    expect(log.counts().filtering).toBe(0);
    expect(log.entries[0]).toMatchObject({ id: 1, elapsedSec: 12, time: '2026-10-13T12:00:00.000Z' });
  });

  it('restores saved entries and continues their ids', () => {
    const { log } = makeLog();
    log.restore([{ id: 7, move: 'grouping', restored: true }]);
    log.add(graph());
    expect(log.entries.map((e) => e.id)).toEqual([7, 8]);
  });

  it('writes CSV with quoting', () => {
    const csv = toCsv([{ id: 1, description: 'Calculated with a formula: if(a, "x", "y")' }]);
    expect(csv.split('\n')[1]).toBe('1,,,,,,,"Calculated with a formula: if(a, ""x"", ""y"")"');
  });
});
