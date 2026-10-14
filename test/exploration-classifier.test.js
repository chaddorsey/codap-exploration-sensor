import { describe, expect, it } from 'vitest';
import { classifyCodapMessage, ExplorationClassifier, EXPLORATION_STATES } from '../src/model/exploration-classifier.js';
import { movesByBin } from '../src/ui/timeline.js';

const make = () => {
  let t = 0;
  const c = new ExplorationClassifier({ now: () => t });
  return { c, advance: (ms) => { t += ms; } };
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('ExplorationClassifier (ported unchanged from codap-spirit-animal)', () => {
  it('keeps a normalized distribution after every update', () => {
    const { c } = make();
    for (const obs of ['construct', 'idle', 'inspect', 'generate', 'layout', 'revise']) {
      expect(sum(c.flush(obs).probabilities)).toBeCloseTo(1, 10);
    }
  });

  it('settles into constructing after sustained construction', () => {
    const { c } = make();
    for (let i = 0; i < 4; i++) c.flush('construct', 'created a graph');
    expect(c.snapshot().state).toBe('constructing');
  });

  it('settles into inactive after sustained idle bins', () => {
    const { c } = make();
    c.flush('construct');
    for (let i = 0; i < 8; i++) c.flush('idle');
    expect(c.snapshot().state).toBe('inactive / unobserved');
  });

  it('turns an identical action within 30 s into a repeat', () => {
    const { c, advance } = make();
    c.observe('construct', 'created a graph');
    c.flush();
    advance(5000);
    c.observe('construct', 'created a graph');
    expect(c.flush().history.at(-1)).toMatchObject({ observation: 'repeat', evidence: 'repeated created a graph' });
  });

  it('keeps the highest-priority observation within a bin', () => {
    const { c } = make();
    c.observe('layout'); c.observe('generate', 'grouped'); c.observe('inspect');
    expect(c.flush().history.at(-1)).toMatchObject({ observation: 'generate', evidence: 'grouped' });
  });

  it('maps notifications to observations', () => {
    expect(classifyCodapMessage({ resource: 'component', values: { operation: 'create', type: 'graph' } }).observation).toBe('construct');
    expect(classifyCodapMessage({ resource: 'component', values: { operation: 'move' } }).observation).toBe('layout');
    expect(classifyCodapMessage({ resource: 'dataContextChangeNotice[C]', values: { operation: 'selectCases' } }).observation).toBe('inspect');
    expect(classifyCodapMessage({ resource: 'component', values: { operation: 'legendAttributeChange' } }).observation).toBe('generate');
    expect(classifyCodapMessage({ resource: 'nothing', values: {} })).toBeNull();
  });

  it('has five states', () => { expect(EXPLORATION_STATES).toHaveLength(5); });
});

describe('movesByBin', () => {
  it('assigns each move to the bin whose interval contains it', () => {
    const history = [{ elapsedSec: 10 }, { elapsedSec: 20 }, { elapsedSec: 30 }];
    const bins = movesByBin(history, [{ elapsedSec: 3 }, { elapsedSec: 20 }, { elapsedSec: 21 }, { elapsedSec: 25, restored: true }]);
    expect(bins.map((b) => b.length)).toEqual([1, 1, 1]);
  });
});
