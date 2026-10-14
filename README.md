# Exploration Sensor for CODAP

A [CODAP](https://codap.concord.org) plugin that watches what a student does in
CODAP and shows, live:

- **the moves they make** — data moves such as filtering, grouping,
  summarizing and calculating, plus making graphs, assigning axes, adding
  models, selecting cases and deleting things;
- **an estimate of what kind of exploration they are in right now** —
  orienting, constructing, inspecting, refining or inactive — and how that has
  changed over the session, from a small model fitted to CODAP logs.

It is a research and teaching instrument. It runs entirely in the browser,
sends nothing anywhere, and changes nothing in the student's document unless
you turn on table recording (below).

## Use it

1. Open CODAP with the plugin attached:
   **https://codap3.concord.org/?di=https://chaddorsey.github.io/codap-exploration-sensor/**
   (or your own copy's address — see [Host your own copy](#host-your-own-copy)).
2. Wait for the tile to say **Connected to CODAP**. CODAP can take up to a
   minute to answer while it starts up; the plugin keeps trying.
3. Work in CODAP as usual, or press **Load Roller Coasters sample** for data to
   try it on.

### What the tile shows

| Section | What it is |
|---|---|
| **Right now** | The model's most likely state, its probability, and all five state probabilities. Below 55% it says **Uncertain** rather than guess. |
| **Over time** | One column per 10 seconds (the last ten minutes), stacked by state probability. A dot under a column means moves were sensed in that interval. Hover or tab to a column for details. |
| **Moves sensed** | A count of each kind of move, and the most recent moves in plain language. |
| **Research signals** (collapsed) | The model's near-term "proxy" meter and a possible teacher prompt. Read the caveats in [docs/model-card.md](docs/model-card.md) before using either. |

### Saving and exporting

- **The move record is saved in the CODAP document.** Save the document and
  reopen it, and earlier moves come back (marked *saved*). The model's state
  starts fresh each session.
- **Download moves (CSV)** and **Download session (JSON)** save files to your
  computer. Nothing is uploaded.
- **Record moves in a CODAP table** (off by default) adds a dataset named
  *Exploration Log* to the document, one row per move, so you can table and
  graph a session's moves in CODAP itself. It is off by default because it
  adds data to the student's document. CODAP pauses for several seconds while
  it creates that table.

## What it senses, and how sure it is

Every rule matches one CODAP notification. Each sensed move is tagged
**verified** (that exact notification was observed in a live CODAP) or
**inferred** (the rule matches an operation name that has not been observed
yet). The full table, with the evidence for each row, is in
[docs/moves.md](docs/moves.md).

| Family | Moves |
|---|---|
| Data moves | filtering (hiding/showing cases, deleting cases, hiding attributes), grouping, summarizing (measures and aggregate formulas), calculating (new attributes and formulas), making hierarchy, merging/new data, sorting |
| Graph moves | making a graph or map, putting an attribute on an axis, adding a model (least-squares line and others) |
| Inspecting | selecting cases (a drag selection counts once) |
| Revising | deleting a tile or an attribute |

Data moves follow Erickson, Wilkerson, Finzer & Reichsman, *Data Moves*
(Technology Innovations in Statistics Education 12(1), 2019).

## About the model

The live estimate is a five-state hidden Markov model fitted to 1,247 sessions
of a CODAP activity titled "Roller Coasters". On held-out sessions it
predicted a provisional "productive episode" target barely better than chance
(AUC 0.61). **It describes patterns of interface activity; it does not measure
learning, ability or intent, and it should not be shown to students or used to
grade.** A gap in logged activity is not the same as a student doing nothing.
See [docs/model-card.md](docs/model-card.md).

## Privacy

Everything happens in the browser tab. The plugin makes no network requests
of its own, has no analytics, and stores the move record only inside the CODAP
document (and in files you choose to download). The record says what kind
of move happened (for example "Selected 3 cases"), not the data involved; the
exceptions are attribute names and formula text, which appear in move
descriptions. If you use it with students, follow your institution's rules for
recording student activity, including when the move record is saved in
documents you collect.

## Host your own copy

The plugin is a static web page, so GitHub Pages can host it for free.

1. **Fork** this repository on GitHub.
2. In your fork, open **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. Open the **Actions** tab, choose **Deploy to GitHub Pages**, and press
   **Run workflow** (it also runs on every push to `main`).
4. When it finishes, your plugin is at
   `https://<your-github-name>.github.io/codap-exploration-sensor/`.
   Open CODAP with `?di=` followed by that address.

Any static host works: run `npm run build` and upload the `dist/` folder.

## Develop

Requires Node.js 18 or newer.

```sh
npm install
npm test             # unit tests (Vitest)
npm run dev          # https://localhost:8090
npm run dev-browser  # in a second terminal: Chrome with CODAP + this plugin
```

CODAP runs on https, so the dev server does too. If you have a trusted
localhost certificate in `~/.localhost-ssl/` (the CODAP convention, made with
`mkcert`), it is used; otherwise the server makes a self-signed one, which you
must accept once by opening https://localhost:8090 directly.

**Chrome blocks codap3.concord.org from loading `https://localhost` plugins**
(Local Network Access). `npm run dev-browser` opens a separate Chrome profile
with that check disabled. In your own Chrome, allow it once per profile:
address-bar icon → Site settings → Local network access → Allow. A deployed
copy is a public address and is not affected.

`npm run test:e2e` drives the plugin in hosted CODAP through CODAP's own
interface: it loads the sample, makes a graph, assigns both axes, adds a
least-squares line, selects a case and hides the unselected cases, and checks
each move appears in the feed. It needs the dev server running and Google
Chrome installed, opens a visible window, and takes about 7 minutes, most of
it CODAP pausing after data loads.

### Adding a move

1. Do the action in CODAP with the plugin open, then run
   `__explorationSensor.raw` in the browser console with the plugin's frame
   selected. It holds the last 200 notifications.
2. Add a rule in `src/sensing/moves.js`, and a test in `test/moves.test.js`
   using the payload you saw.
3. Add a row to `docs/moves.md`, marked verified, with the date and CODAP
   version.

### Things worth knowing about CODAP's plugin API

Learned while building this, measured on codap3.concord.org v3.1.1 (October
2026):

- The plugin library gives up on a request after **2 seconds**, but CODAP
  often takes longer to answer while it starts up or after creating data or
  tables, and the change still happens. So this plugin retries its first
  connection, retries reads, and confirms slow writes by reading back rather
  than treating a timeout as failure (`src/codap/settle.js`).
- CODAP reloads a plugin's frame once, adding `?lang=…&locale=…` to its
  address, when it first recognizes the frame as a plugin.
- `documentChangeNotice / dataContextCountChanged` also fires when a graph is
  created, so it is only counted as a new dataset when the number of datasets
  actually goes up.

## Where it came from

The model and the data-move rules were first built for
[codap-spirit-animal](https://github.com/chaddorsey/codap-spirit-animal) (an
animated companion for CODAP). This plugin takes them out of that project so
they can run on their own as an ordinary CODAP plugin. The sample dataset is
157 US roller coasters from CODAP's own example document in
[concord-consortium/codap-data](https://github.com/concord-consortium/codap-data);
that repository has no license file, so check its terms before reusing the
data outside this plugin.

## License

MIT — see [LICENSE](LICENSE).
