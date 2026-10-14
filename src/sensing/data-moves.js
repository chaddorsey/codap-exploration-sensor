/**
 * Data-move classifier.
 *
 * Provenance: copied unchanged (apart from this header) from codap-spirit-animal
 * `web/src/data-moves.js`, whose design notes are that repo's docs/DATA-MOVES.md.
 * There, "cheer" meant the axolotl reacting; here it means a move is recorded.
 *
 * Data moves (Erickson, Wilkerson, Finzer & Reichsman 2019): actions that
 * alter a dataset's contents, structure, or values — filtering, grouping,
 * summarizing, calculating, merging, making hierarchy. Every row below was
 * live-verified against CODAP v3.0.3 (2026-07-07); `createCollection`
 * confirmed manually by Chad. Pure op-matching, no heuristics — the one
 * "smart" bit is the aggregate-function regex on formula text, and the
 * formula arrives inside the notification itself.
 *
 * Philosophy on unknowns: prefer UNDER-cheering. A missed cheer is
 * invisible; a wrong cheer is noise. Unmatched ops stay plain `raw`.
 */

const AGGREGATE_FN = new RegExp(
  '\\b(mean|median|count|sum|min|max|stdDev|stdErr|mad|variance|percentile|'
  + 'uniqueValues|correlation|rollingMean|first|last)\\s*\\(', 'i');

const FILTER_OUT_OPS = new Set(['hideUnselected', 'hideSelected', 'displayOnlySelected']);

/**
 * Classify one raw DI notification. Returns
 * `{ move, kind, detail } | null` where move ∈ filtering | grouping |
 * summarizing | calculating | hierarchy | merging.
 */
export function classifyDataMove(resource, op, values) {
  if (!op) return null;

  if (resource === 'component' || resource?.startsWith?.('component[')) {
    if (FILTER_OUT_OPS.has(op)) {
      return { move: 'filtering', kind: 'out',
        detail: { componentId: values?.id, numberHidden: values?.numberHidden } };
    }
    if (op === 'showAllCases') {
      return { move: 'filtering', kind: 'in', detail: { componentId: values?.id } };
    }
    if (op === 'legendAttributeChange') {
      return { move: 'grouping', kind: 'legend',
        detail: { componentId: values?.id, attribute: values?.attributeName,
          plotType: values?.plotType } };
    }
    // Measure palette: togglePlottedMean/Median/StDev/… — only turning a
    // measure ON is a summarizing act; un-checking is not a celebration
    if (/^togglePlotted/i.test(op) && values?.isChecked === true) {
      return { move: 'summarizing', kind: 'adornment',
        detail: { componentId: values?.id, measure: op.replace(/^togglePlotted/i, '') } };
    }
    return null;
  }

  if (resource?.startsWith?.('dataContextChangeNotice')) {
    const context = resource.match(/\[(.*)\]/)?.[1];
    if (op === 'createAttributes') {
      return { move: 'calculating', kind: 'newColumn', detail: { context } };
    }
    if (op === 'updateAttributes') {
      const formula = values?.result?.attrs?.find?.((a) => a?.formula)?.formula;
      if (!formula) return null;                 // rename etc. — not a move
      return AGGREGATE_FN.test(formula)
        ? { move: 'summarizing', kind: 'formula', detail: { context, formula } }
        : { move: 'calculating', kind: 'formula', detail: { context, formula } };
    }
    if (op === 'createCollection') {
      return { move: 'hierarchy', kind: 'collection', detail: { context } };
    }
    return null;
  }

  if (resource === 'documentChangeNotice' && op === 'dataContextCountChanged') {
    return { move: 'merging', kind: 'newData', detail: {} };
  }

  return null;
}
