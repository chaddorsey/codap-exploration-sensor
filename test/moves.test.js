import { describe, expect, it } from 'vitest';
import { classifyMove, MOVES, needsDatasetCountCheck } from '../src/sensing/moves.js';

const n = (resource, values) => ({ resource, values });

describe('data moves (verified in CODAP v3 by codap-spirit-animal)', () => {
  it.each([
    ['filtering out', n('component', { operation: 'hideUnselected', id: 4, numberHidden: 12 }), 'filtering', 'Hid cases (12 hidden)'],
    ['filtering in', n('component', { operation: 'showAllCases', id: 4 }), 'filtering', 'Showed all cases again'],
    ['grouping', n('component', { operation: 'legendAttributeChange', attributeName: 'Type' }), 'grouping', 'Grouped a graph by Type'],
    ['summarizing (adornment)', n('component', { operation: 'togglePlottedMean', isChecked: true }), 'summarizing', 'Added a Mean to a graph'],
    ['calculating (new column)', n('dataContextChangeNotice[Roller Coasters]', { operation: 'createAttributes' }), 'calculating', 'Added a new attribute'],
    ['calculating (formula)', n('dataContextChangeNotice[Roller Coasters]', { operation: 'updateAttributes', result: { attrs: [{ formula: 'Drop / Max_Height' }] } }), 'calculating', 'Calculated with a formula: Drop / Max_Height'],
    ['summarizing (formula)', n('dataContextChangeNotice[Roller Coasters]', { operation: 'updateAttributes', result: { attrs: [{ formula: 'mean(Top_Speed)' }] } }), 'summarizing', 'Summarized with a formula: mean(Top_Speed)'],
    ['hierarchy', n('dataContextChangeNotice[Roller Coasters]', { operation: 'createCollection' }), 'hierarchy', 'Made a new collection in Roller Coasters'],
  ])('%s', (_name, notification, move, description) => {
    const sensed = classifyMove(notification);
    expect(sensed).toMatchObject({ move, family: 'data', description, confidence: 'verified' });
  });

  it('marks merging inferred and asks for a dataset-count check', () => {
    const sensed = classifyMove(n('documentChangeNotice', { operation: 'dataContextCountChanged' }));
    expect(sensed).toMatchObject({ move: 'merging', confidence: 'inferred' });
    expect(needsDatasetCountCheck(sensed)).toBe(true);
    expect(needsDatasetCountCheck(classifyMove(n('component', { operation: 'create', type: 'graph' })))).toBe(false);
  });

  it('does not count turning a measure off as summarizing', () => {
    expect(classifyMove(n('component', { operation: 'togglePlottedMean', isChecked: false }))).toBeNull();
  });

  it('does not count a rename (updateAttributes without a formula)', () => {
    expect(classifyMove(n('dataContextChangeNotice[X]', { operation: 'updateAttributes', result: { attrs: [{ name: 'speed' }] } }))).toBeNull();
  });
});

describe('graph, inspection and revision moves', () => {
  it('senses making a graph, and ignores other new components', () => {
    expect(classifyMove(n('component', { operation: 'create', type: 'graph', id: 9 })))
      .toMatchObject({ move: 'representing', family: 'graph', description: 'Made a graph' });
    expect(classifyMove(n('component', { operation: 'create', type: 'caseTable' }))).toBeNull();
  });

  // Payloads below are copied from live CODAP v3.1.1 notifications (2026-10-13).
  it('senses an axis assignment with its attribute and axis', () => {
    expect(classifyMove(n('component', { attributeId: 241786301008015, attributeName: 'Top_Speed', plotType: 'dotPlot', primaryAxis: 'x', axisOrientation: 'horizontal', operation: 'attributeChange', id: 46435896018581, type: 'DG.GraphView', diType: 'graph' })))
      .toMatchObject({ move: 'axis', confidence: 'verified', description: 'Put Top_Speed on the x axis' });
    expect(classifyMove(n('component', { attributeName: 'Max_Height', axisOrientation: 'vertical', operation: 'attributeChange' })))
      .toMatchObject({ description: 'Put Max_Height on the y axis' });
  });

  it('senses a least-squares line being turned on, not off', () => {
    expect(classifyMove(n('component', { isChecked: true, operation: 'toggle LSRL', id: 46435896018581, type: 'DG.GraphView', diType: 'graph' })))
      .toMatchObject({ move: 'modeling', confidence: 'verified', description: 'Added a least-squares line to a graph' });
    expect(classifyMove(n('component', { isChecked: false, operation: 'toggle LSRL' }))).toBeNull();
  });

  it('senses hiding unselected cases with the live payload', () => {
    expect(classifyMove(n('component', { numberHidden: 141, operation: 'hideUnselected', id: 46435896018581, type: 'DG.GraphView', diType: 'graph' })))
      .toMatchObject({ move: 'filtering', description: 'Hid cases (141 hidden)' });
  });

  it('ignores tile title changes', () => {
    expect(classifyMove(n('component[46435896018581]', { from: 'Roller Coasters', to: 'Roller Coasters', operation: 'titleChange' }))).toBeNull();
  });

  it('senses selections but not clearing one', () => {
    expect(classifyMove(n('dataContextChangeNotice[C]', { operation: 'selectCases', result: { cases: [{}, {}] } })))
      .toMatchObject({ move: 'selecting', family: 'inspect', description: 'Selected 2 cases' });
    expect(classifyMove(n('dataContextChangeNotice[C]', { operation: 'selectCases', result: { cases: [] } }))).toBeNull();
  });

  it('treats deleting cases as filtering, and deleting a component as revising', () => {
    expect(classifyMove(n('dataContextChangeNotice[C]', { operation: 'deleteCases', result: { cases: [{}] } })))
      .toMatchObject({ move: 'filtering', kind: 'delete', description: 'Deleted 1 case' });
    expect(classifyMove(n('component', { operation: 'delete', type: 'graph' })))
      .toMatchObject({ move: 'deleting', family: 'revise', description: 'Deleted a graph' });
  });

  it('marks unconfirmed op names as inferred', () => {
    expect(classifyMove(n('component', { operation: 'toggle movable line' }))).toMatchObject({ move: 'modeling', confidence: 'inferred' });
    expect(classifyMove(n('dataContextChangeNotice[C]', { operation: 'moveCases' }))).toMatchObject({ move: 'sorting', confidence: 'inferred' });
  });

  it('ignores layout and unknown notifications', () => {
    expect(classifyMove(n('component', { operation: 'move' }))).toBeNull();
    expect(classifyMove(n('component', { operation: 'resize' }))).toBeNull();
    expect(classifyMove(n('somethingNew', { operation: 'whatever' }))).toBeNull();
    expect(classifyMove({})).toBeNull();
  });

  it('every move it can return is in the MOVES table', () => {
    const names = new Set(MOVES.map((m) => m.move));
    expect(names.size).toBe(MOVES.length);
  });
});
