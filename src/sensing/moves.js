/**
 * Move sensor: one CODAP notification in, at most one sensed move out.
 *
 * Moves come in four families:
 *   data     — Erickson et al.'s data moves (filtering, grouping, summarizing,
 *              calculating, hierarchy, merging), from ./data-moves.js, plus
 *              case deletion, hidden attributes and sorting, added here.
 *   graph    — building a representation: making a graph or map, putting an
 *              attribute on an axis, adding a model (movable line, LSRL, …).
 *   inspect  — selecting cases.
 *   revise   — deleting a component or an attribute.
 *
 * Each rule is pure op-matching on the notification. Confidence is recorded
 * per rule ("verified" = seen live in CODAP v3; "inferred" = op name assumed,
 * not yet observed) so readers know which rows to trust. docs/moves.md has
 * the full table. Like data-moves.js, unknown ops are left unsensed: a missed
 * move is invisible, a wrong one is noise in a research record.
 */
import { classifyDataMove } from './data-moves.js';

export const FAMILIES = ['data', 'graph', 'inspect', 'revise'];

// The order is the display order of the counts chart.
export const MOVES = [
  { move: 'filtering', family: 'data', label: 'Filtering' },
  { move: 'grouping', family: 'data', label: 'Grouping' },
  { move: 'summarizing', family: 'data', label: 'Summarizing' },
  { move: 'calculating', family: 'data', label: 'Calculating' },
  { move: 'hierarchy', family: 'data', label: 'Making hierarchy' },
  { move: 'merging', family: 'data', label: 'Merging / new data' },
  { move: 'sorting', family: 'data', label: 'Sorting' },
  { move: 'representing', family: 'graph', label: 'Making a graph or map' },
  { move: 'axis', family: 'graph', label: 'Assigning an axis' },
  { move: 'modeling', family: 'graph', label: 'Adding a model' },
  { move: 'selecting', family: 'inspect', label: 'Selecting cases' },
  { move: 'deleting', family: 'revise', label: 'Deleting' },
];

const MOVE_INFO = Object.fromEntries(MOVES.map((m) => [m.move, m]));

const MODEL_OP = /lsrl|least.?squares|movable.?line|movable.?value|plotted.?function|plotted.?value|residual|connecting.?lines/i;
// Seen live in CODAP v3.1.1 (2026-10-13). Other model ops match MODEL_OP
// but stay "inferred" until their exact names are observed.
const MODEL_NAMES = { 'toggle LSRL': 'a least-squares line' };
const AXIS_NAMES = { horizontal: 'the x axis', vertical: 'the y axis' };
const COMPONENT_NAMES = {
  graph: 'graph', map: 'map', caseTable: 'case table', caseCard: 'case card',
  slider: 'slider', text: 'text', calculator: 'calculator', webView: 'web view',
};

const contextOf = (resource) => resource.match(/\[(.*)\]/)?.[1];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function describeDataMove({ move, kind, detail }) {
  switch (move) {
    case 'filtering':
      return kind === 'in'
        ? 'Showed all cases again'
        : `Hid cases${detail.numberHidden != null ? ` (${detail.numberHidden} hidden)` : ''}`;
    case 'grouping':
      return `Grouped a graph by ${detail.attribute ?? 'an attribute'}`;
    case 'summarizing':
      return kind === 'formula'
        ? `Summarized with a formula: ${detail.formula}`
        : `Added a ${detail.measure || 'summary'} to a graph`;
    case 'calculating':
      return kind === 'formula'
        ? `Calculated with a formula: ${detail.formula}`
        : 'Added a new attribute';
    case 'hierarchy':
      return `Made a new collection${detail.context ? ` in ${detail.context}` : ''}`;
    case 'merging':
      return 'Brought a new dataset into the document';
    default:
      return move;
  }
}

function sense(notification) {
  const { resource = '', values = {} } = notification ?? {};
  const op = values?.operation;
  if (!op) return null;

  const dataMove = classifyDataMove(resource, op, values);
  if (dataMove) {
    // Merging is the one data-move row Spirit Animal's notes list as not
    // verified, and CODAP v3.1.1 also sends dataContextCountChanged when a
    // graph is made (seen live 2026-10-13). The caller must confirm that the
    // dataset count actually rose; see `needsDatasetCountCheck`.
    const confidence = dataMove.move === 'merging' ? 'inferred' : 'verified';
    return { ...dataMove, confidence, description: describeDataMove(dataMove) };
  }

  if (resource === 'component' || resource.startsWith('component[')) {
    const type = values?.type ?? '';
    const name = COMPONENT_NAMES[type] ?? (type || 'component');
    if (op === 'create' && (type === 'graph' || type === 'map')) {
      return { move: 'representing', kind: type, confidence: 'verified',
        detail: { componentId: values?.id }, description: `Made a ${name}` };
    }
    if (op === 'attributeChange') {
      const attribute = values?.attributeName;
      const axis = AXIS_NAMES[values?.axisOrientation] ?? 'a graph axis';
      return { move: 'axis', kind: 'attributeChange', confidence: 'verified',
        detail: { componentId: values?.id, attribute, axisOrientation: values?.axisOrientation },
        description: attribute ? `Put ${attribute} on ${axis}` : `Changed ${axis}` };
    }
    if (op === 'delete') {
      return { move: 'deleting', kind: 'component', confidence: 'inferred',
        detail: { componentId: values?.id, type }, description: `Deleted a ${name}` };
    }
    if (MODEL_OP.test(op)) {
      // Like the measure toggles: only switching a model ON is a move.
      if (values?.isChecked === false) return null;
      const verified = MODEL_NAMES[op];
      return { move: 'modeling', kind: op, confidence: verified ? 'verified' : 'inferred',
        detail: { componentId: values?.id },
        description: verified ? `Added ${verified} to a graph` : `Added a model to a graph (${op})` };
    }
    return null;
  }

  if (resource.startsWith('dataContextChangeNotice')) {
    const context = contextOf(resource);
    if (op === 'selectCases') {
      const count = values?.result?.cases?.length ?? 0;
      if (!count) return null; // clearing a selection is not inspecting anything
      return { move: 'selecting', kind: 'select', confidence: 'verified',
        detail: { context, count }, description: `Selected ${plural(count, 'case')}` };
    }
    if (op === 'deleteCases') {
      const count = values?.result?.cases?.length ?? values?.result?.caseIDs?.length;
      return { move: 'filtering', kind: 'delete', confidence: 'inferred',
        detail: { context, count },
        description: count ? `Deleted ${plural(count, 'case')}` : 'Deleted cases' };
    }
    if (op === 'hideAttributes') {
      return { move: 'filtering', kind: 'hideAttribute', confidence: 'inferred',
        detail: { context }, description: 'Hid an attribute' };
    }
    if (op === 'deleteAttributes') {
      return { move: 'deleting', kind: 'attribute', confidence: 'inferred',
        detail: { context }, description: 'Deleted an attribute' };
    }
    // r-sidebar's open spike question: sorting may arrive as `moveCases`.
    if (/sort/i.test(op) || op === 'moveCases') {
      return { move: 'sorting', kind: op, confidence: 'inferred',
        detail: { context }, description: 'Sorted a table' };
    }
  }
  return null;
}

/** True for a sensed move that only counts if the number of datasets rose. */
export const needsDatasetCountCheck = (sensed) => sensed?.move === 'merging';

/**
 * Classify one notification. Returns `{ move, family, kind, label,
 * description, confidence, detail }` or null.
 */
export function classifyMove(notification) {
  const sensed = sense(notification);
  if (!sensed) return null;
  const info = MOVE_INFO[sensed.move];
  return { ...sensed, family: info.family, label: info.label };
}
