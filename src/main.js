import './styles.css';
import { createCodapConnection } from './codap/connection.js';
import { ensureLogTable, writeLogEntries, LOG_CONTEXT } from './codap/log-table.js';
import { ExplorationClassifier } from './model/exploration-classifier.js';
import { classifyMove, needsDatasetCountCheck } from './sensing/moves.js';
import { MoveLog, toCsv } from './sensing/move-log.js';
import { ensureCoasters } from './fixtures/roller-coasters.js';
import { createPanel } from './ui/panel.js';

const STATE_VERSION = 1;
const SAVED_MOVES = 500;

const codap = createCodapConnection();
const classifier = new ExplorationClassifier();
const log = new MoveLog({ clock: () => classifier.elapsedSec() });
let recording = false;
let unwritten = [];

// The last 200 raw notifications, for checking what CODAP sends when adding a
// new move rule: run `__explorationSensor.raw` in the plugin frame's console.
const raw = [];
window.__explorationSensor = { raw, log, classifier, codap, get datasetCount() { return datasetCount; } };

// Every notification feeds both the model and the move sensor.
codap.onNotification((notification) => {
  raw.push(notification);
  if (raw.length > 200) raw.shift();
  classifier.observeMessage(notification);
  const sensed = classifyMove(notification);
  if (needsDatasetCountCheck(sensed)) {
    datasetCountRose().then((rose) => { if (rose) log.add(sensed); });
  } else if (sensed) {
    log.add(sensed);
  }
});

// dataContextCountChanged also fires when no dataset was added (e.g. making a
// graph), so a merge is only sensed when the student's dataset count rises.
let datasetCount = null;
async function countDatasets() {
  try {
    const list = await codap.request('get', 'dataContextList');
    return list?.success ? list.values.filter((c) => c.name !== LOG_CONTEXT).length : null;
  } catch {
    return null; // unknown, so the next count cannot claim a rise
  }
}
async function datasetCountRose() {
  const before = datasetCount;
  datasetCount = await countDatasets();
  return before != null && datasetCount != null && datasetCount > before;
}

const download = (name, type, text) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const panel = createPanel(document.getElementById('app'), {
  classifier,
  log,
  actions: {
    async sample(button) {
      button.disabled = true;
      try {
        await codap.asSelf(() => ensureCoasters(codap.request));
        panel.notify('Roller Coasters sample loaded');
      } catch (error) {
        panel.notify(`Could not load the sample: ${error?.message ?? error}`);
      } finally {
        datasetCount = await countDatasets();
        button.disabled = false;
      }
    },
    async record(checkbox) {
      if (!checkbox.checked) {
        recording = false;
        saveState();
        return;
      }
      checkbox.disabled = true;
      try {
        await ensureLogTable(codap);
        // Start recording only now, with every move sensed so far this
        // session (including during setup), so no row is written before
        // the dataset exists.
        recording = true;
        unwritten = log.entries.filter((e) => !e.restored);
        scheduleWrite();
      } catch (error) {
        panel.setRecording(false);
        panel.notify(`Could not set up the log table: ${error?.message ?? error}`);
      } finally {
        checkbox.disabled = false;
      }
      saveState();
    },
    'export-csv': () => download(`exploration-moves-${stamp()}.csv`, 'text/csv', toCsv(log.entries)),
    'export-json': () => download(`exploration-session-${stamp()}.json`, 'application/json',
      JSON.stringify({ exportedAt: new Date().toISOString(), moves: log.entries,
        model: classifier.snapshot() }, null, 2)),
    reset() {
      classifier.reset();
      log.clear();
      unwritten = [];
      saveState();
    },
    demo: () => classifier.demoSequence(),
    idle: () => classifier.flush('idle', 'no logged action'),
  },
});

// Persist the move record in the CODAP document, so it survives save/reopen.
let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => codap.saveState({
    version: STATE_VERSION, recording,
    moves: log.entries.slice(-SAVED_MOVES).map((e) => ({ ...e, restored: true })),
  }), 500);
}

let writeTimer = null;
// Short delay so a selection drag lands as one row, with its final count.
function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const batch = unwritten;
    unwritten = [];
    writeLogEntries(codap, batch).catch(() => panel.notify(`Could not write to ${LOG_CONTEXT}`));
  }, 2000);
}
log.addEventListener('change', ({ detail }) => {
  saveState();
  if (!recording || !detail.isNew || !detail.entry) return;
  unwritten.push(detail.entry);
  scheduleWrite();
});

classifier.start();
panel.setConnected('connecting');
codap.connect({ onSlow: () => panel.setConnected('waiting') }).then((state) => {
  panel.setConnected(codap.connected);
  if (codap.connected) countDatasets().then((n) => { datasetCount = n; });
  if (state?.version === STATE_VERSION) {
    log.restore(state.moves ?? []);
    if (state.recording) {
      recording = true;
      panel.setRecording(true);
      codap.ignoreContext(LOG_CONTEXT);
    }
  }
});
