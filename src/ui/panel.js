/**
 * The plugin tile. Three live views over the same session:
 *   Right now   — the model's current state and its five probabilities
 *   Over time   — the timeline chart (./timeline.js)
 *   Moves       — counts per sensed move, and the most recent moves
 * plus research signals (proxy meter, teacher prompt) behind a disclosure,
 * and session controls.
 */
import { EXPLORATION_STATES } from '../model/exploration-classifier.js';
import { MOVES } from '../sensing/moves.js';
import { createTimeline } from './timeline.js';

const PROMPTS = [
  'What are you trying to change, and what would count as an improvement?',
  'What relationship should this representation help you examine?',
  'Which cases or groups could you compare to test what you notice?',
  'What does the new grouping, summary, or model add to your claim?',
  'What are you noticing, and what representation might help you examine it?',
];
const ABSTAIN_BELOW = 0.55;
const FEED_LENGTH = 25;

const formatTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

const TEMPLATE = `
  <header class="app-header">
    <h1>Exploration Sensor</h1>
    <span class="status" data-ref="status" role="status"></span>
  </header>
  <div class="banner" data-ref="banner" hidden>
    Not connected to CODAP. Open this page as a plugin inside CODAP to sense
    moves; the model demo below still works here.
  </div>

  <section aria-labelledby="now-h">
    <h2 id="now-h">Right now</h2>
    <div class="now-head">
      <span class="now-state" data-ref="state"></span>
      <span class="muted now-conf" data-ref="confidence"></span>
    </div>
    <div class="bars" data-ref="bars"></div>
    <p class="muted evidence" data-ref="evidence"></p>
  </section>

  <section aria-labelledby="time-h">
    <h2 id="time-h">Over time</h2>
    <div class="timeline" data-ref="timeline"></div>
    <ul class="legend" aria-label="Model states">
      ${EXPLORATION_STATES.map((s, i) => `<li><span class="swatch s${i}"></span>${s}</li>`).join('')}
      <li><span class="swatch dot"></span>moves sensed</li>
    </ul>
  </section>

  <section aria-labelledby="moves-h">
    <h2 id="moves-h">Moves sensed <span class="muted" data-ref="total"></span></h2>
    <table class="counts" data-ref="counts" aria-label="Count of each move"></table>
    <h3>Most recent</h3>
    <ol class="feed" data-ref="feed"></ol>
    <p class="muted" data-ref="feed-empty">Try a data move in CODAP: filter, group, summarize or calculate.</p>
  </section>

  <details class="research">
    <summary>Research signals</summary>
    <div class="signal">
      <div class="signal-head"><span>Near-term proxy</span><strong data-ref="risk"></strong></div>
      <div class="meter"><span class="needle" data-ref="needle"></span></div>
    </div>
    <p class="prompt"><b>Possible teacher prompt</b><span data-ref="prompt"></span></p>
    <p class="warning">Research instrument. The meter predicts a provisional
      event-pattern proxy, not learning, ability or intent. Its test accuracy
      was barely above chance (AUC 0.61). Do not show it to students or use it
      to grade.</p>
    <div class="controls">
      <button type="button" data-action="demo">Play model demo</button>
      <button type="button" data-action="idle">Add 10 s unobserved</button>
    </div>
  </details>

  <footer class="controls">
    <button type="button" data-action="sample">Load Roller Coasters sample</button>
    <label class="toggle"><input type="checkbox" data-action="record"> Record moves in a CODAP table</label>
    <button type="button" data-action="export-csv">Download moves (CSV)</button>
    <button type="button" data-action="export-json">Download session (JSON)</button>
    <button type="button" data-action="reset">Reset session</button>
  </footer>
  <p class="sr-only" aria-live="polite" data-ref="announce"></p>
`;

export function createPanel(root, { classifier, log, actions }) {
  root.innerHTML = TEMPLATE;
  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  const timeline = createTimeline(ref('timeline'));

  const renderModel = (snapshot) => {
    const abstain = snapshot.probability < ABSTAIN_BELOW;
    ref('state').textContent = abstain ? 'Uncertain' : snapshot.state;
    ref('confidence').textContent = `${formatTime(snapshot.elapsedSec)} · ${abstain
      ? `no state above ${Math.round(ABSTAIN_BELOW * 100)}%`
      : `${Math.round(snapshot.probability * 100)}% likely`}`;
    ref('bars').replaceChildren(...snapshot.probabilities.map((p, i) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const pct = Math.round(p * 100);
      row.innerHTML = `<span class="bar-label">${EXPLORATION_STATES[i]}</span>
        <span class="track"><span class="fill s${i}" style="width:${pct}%"></span></span>
        <span class="bar-value">${pct}%</span>`;
      return row;
    }));
    ref('evidence').textContent = `Last 10 s: ${snapshot.observation} — ${snapshot.evidence}`;
    const risk = Math.round(snapshot.proxyLikelihood * 100);
    ref('risk').textContent = `${risk}%`;
    ref('needle').style.left = `calc(${Math.max(1, Math.min(99, risk))}% - 1px)`;
    ref('prompt').textContent = abstain
      ? 'What are you working on right now, and what would you like to find out?'
      : PROMPTS[snapshot.stateIndex];
    timeline.render(snapshot.history, log.entries);
  };

  const renderMoves = () => {
    const counts = log.counts();
    const max = Math.max(1, ...Object.values(counts));
    ref('total').textContent = `(${log.entries.length})`;
    ref('counts').innerHTML = `<thead class="sr-only"><tr><th>Move</th><th>Count</th></tr></thead><tbody>${
      MOVES.map(({ move, label, family }) => `<tr class="${counts[move] ? '' : 'zero'}">
        <th scope="row"><span class="fam fam-${family}">${family}</span>${label}</th>
        <td><span class="cbar" style="width:${(counts[move] / max) * 100}%"></span><span class="cval">${counts[move]}</span></td>
      </tr>`).join('')}</tbody>`;
    const recent = log.entries.slice(-FEED_LENGTH).reverse();
    ref('feed-empty').hidden = recent.length > 0;
    ref('feed').replaceChildren(...recent.map((entry) => {
      const li = document.createElement('li');
      const time = document.createElement('span');
      time.className = 'muted feed-time';
      time.textContent = entry.restored ? 'saved' : formatTime(entry.elapsedSec);
      const text = document.createElement('span');
      text.textContent = entry.description;
      const tag = document.createElement('span');
      tag.className = `fam fam-${entry.family}`;
      tag.textContent = entry.label;
      li.append(time, tag, text);
      if (entry.confidence === 'inferred') li.title = 'Inferred: this CODAP operation has not yet been confirmed live.';
      return li;
    }));
  };

  let lastAnnounce = 0;
  classifier.addEventListener('update', (event) => renderModel(event.detail));
  log.addEventListener('change', (event) => {
    renderMoves();
    const { entry, isNew } = event.detail;
    if (isNew && entry && performance.now() - lastAnnounce > 3000) {
      lastAnnounce = performance.now();
      ref('announce').textContent = `Sensed: ${entry.label}`;
    }
  });

  root.addEventListener('click', (event) => {
    const action = event.target.closest('button[data-action]')?.dataset.action;
    if (action) actions[action]?.(event.target);
  });
  root.querySelector('[data-action="record"]').addEventListener('change', (event) =>
    actions.record?.(event.target));

  renderModel(classifier.snapshot());
  renderMoves();

  return {
    /** true, false, 'connecting' or 'waiting' (still retrying; no banner yet). */
    setConnected(connected) {
      const label = { connecting: 'Connecting to CODAP…', waiting: 'Still waiting for CODAP…',
        true: 'Connected to CODAP', false: 'Not connected' };
      ref('status').textContent = label[connected];
      ref('status').dataset.connected = String(connected === true);
      ref('banner').hidden = connected !== false;
      connected = connected === true;
      for (const name of ['sample', 'record']) {
        root.querySelector(`[data-action="${name}"]`).disabled = !connected;
      }
    },
    setRecording(on) {
      root.querySelector('[data-action="record"]').checked = on;
    },
    notify(message) { ref('announce').textContent = message; },
  };
}
