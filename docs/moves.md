# Sensed moves: rules and evidence

Each rule matches one CODAP Data Interactive notification
(`src/sensing/moves.js`, with the data-move rules in
`src/sensing/data-moves.js`).

- **verified** — that exact notification was seen in a live CODAP v3.
- **inferred** — the rule matches an operation name that has not been seen
  live yet. It may never fire, or may fire for something else.

Sources of verification:

- **SA** — codap-spirit-animal `docs/DATA-MOVES.md`, live-verified against
  codap3.concord.org v3.0.3 on 2026-07-07.
- **ES** — this plugin, live-verified against codap3.concord.org v3.1.1 on
  2026-10-13 by driving CODAP's own interface. The payloads are in the tests in
  `test/moves.test.js`.

| Move | Student action in CODAP | Notification | Status |
|---|---|---|---|
| Filtering (out) | Graph eye menu → Hide Unselected / Hide Selected / Display Only Selected | `component` · `hideUnselected`, `hideSelected`, `displayOnlySelected` (carries `numberHidden`) | verified (SA; `hideUnselected` also ES) |
| Filtering (in) | Graph eye menu → Show All Cases | `component` · `showAllCases` | verified (SA, ES) |
| Filtering (delete) | Delete cases | `dataContextChangeNotice[…]` · `deleteCases` | inferred |
| Filtering (attribute) | Hide an attribute | `dataContextChangeNotice[…]` · `hideAttributes` | inferred |
| Grouping | Drop an attribute in the middle of a graph (legend) | `component` · `legendAttributeChange` | verified (SA) |
| Summarizing (measure) | Measure palette → Mean, Median, … turned on | `component` · `togglePlotted…` with `isChecked: true` | verified for Mean (SA); others inferred |
| Summarizing (formula) | Formula using `mean(`, `count(`, `median(` … | `dataContextChangeNotice[…]` · `updateAttributes` with an aggregate in `result.attrs[].formula` | verified (SA) |
| Calculating (new column) | Table **+** → new attribute | `dataContextChangeNotice[…]` · `createAttributes` | verified (SA) |
| Calculating (formula) | Any other formula | `dataContextChangeNotice[…]` · `updateAttributes` with a formula | verified (SA) |
| Making hierarchy | Drag an attribute left to make a collection | `dataContextChangeNotice[…]` · `createCollection` | verified (SA) |
| Merging / new data | A new dataset appears | `documentChangeNotice` · `dataContextCountChanged`, **and** the dataset count rose | inferred (see note) |
| Sorting | Sort a table column | `dataContextChangeNotice[…]` · any op containing "sort", or `moveCases` | inferred |
| Making a graph or map | Graph or Map tool | `component` · `create` with `type: graph` or `map` | verified for graph (ES) |
| Assigning an axis | Choose or drop an attribute on an axis | `component` · `attributeChange` (carries `attributeName`, `axisOrientation`) | verified (ES) |
| Adding a model | Measure palette → Least Squares Line turned on | `component` · `toggle LSRL` with `isChecked: true` | verified (ES) |
| Adding a model (other) | Movable line, plotted function, residuals … | `component` · op matching `MODEL_OP` | inferred |
| Selecting cases | Click or drag-select | `dataContextChangeNotice[…]` · `selectCases` with at least one case | verified (ES) |
| Deleting a tile | Close a graph, table, … | `component` · `delete` | inferred |
| Deleting an attribute | Delete an attribute | `dataContextChangeNotice[…]` · `deleteAttributes` | inferred |

**Not sensed:** moving or resizing tiles, renaming, editing single values,
clearing a selection, and turning a measure or model *off*. Moving and
resizing still count as *layout* for the model.

**Merging note.** CODAP v3.1.1 sends `dataContextCountChanged` when a graph is
created, with no new dataset (seen 2026-10-13). The plugin therefore re-counts
datasets (leaving out its own *Exploration Log*) and senses a merge only when
the count went up.

**Selections.** Dragging a selection rectangle sends one notification per
frame. Consecutive selections in the same dataset less than 1.5 s apart are
merged into one entry with the final count (`src/sensing/move-log.js`).

**The plugin's own actions** (loading the sample, writing the log table) are
not sensed: notifications during and up to 3 s after the sample load are
dropped, and notifications about the *Exploration Log* dataset are always
ignored.
