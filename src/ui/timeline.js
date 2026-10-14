/**
 * Live timeline: one stacked column per 10-second bin showing the model's
 * state probabilities, with a marker row beneath for bins in which moves were
 * sensed. Hover or focus a column for its details.
 */
import { EXPLORATION_STATES } from '../model/exploration-classifier.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const MAX_BINS = 60;          // ten minutes at 10-second bins
const PLOT_H = 84;
const MARK_H = 16;
const COL_GAP = 2;

const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

const formatTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** Group moves into the bins of `history` by elapsed time. */
export function movesByBin(history, moves) {
  const bins = history.map(() => []);
  let start = history.length ? history[0].elapsedSec - 10 : 0;
  history.forEach((entry, index) => {
    for (const move of moves) {
      if (!move.restored && move.elapsedSec > start && move.elapsedSec <= entry.elapsedSec) {
        bins[index].push(move);
      }
    }
    start = entry.elapsedSec;
  });
  return bins;
}

export function createTimeline(container) {
  const width = 360;
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${PLOT_H + MARK_H + 4}`, class: 'timeline-svg',
    role: 'img', 'aria-label': 'Model state over time',
  });
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.hidden = true;
  const empty = document.createElement('p');
  empty.className = 'muted timeline-empty';
  empty.textContent = 'The timeline fills in one column every 10 seconds.';
  container.append(svg, tooltip, empty);

  let columns = [];

  const showTip = (index, anchorX) => {
    const col = columns[index];
    if (!col) return;
    const top = col.entry.probabilities.indexOf(Math.max(...col.entry.probabilities));
    tooltip.innerHTML = '';
    const head = document.createElement('strong');
    head.textContent = `${formatTime(col.entry.elapsedSec)} · ${EXPLORATION_STATES[top]} ${Math.round(col.entry.probabilities[top] * 100)}%`;
    const obs = document.createElement('div');
    obs.textContent = `Observed: ${col.entry.observation} — ${col.entry.evidence}`;
    tooltip.append(head, obs);
    for (const move of col.moves.slice(0, 4)) {
      const line = document.createElement('div');
      line.textContent = `• ${move.description}`;
      tooltip.append(line);
    }
    tooltip.hidden = false;
    const box = container.getBoundingClientRect();
    const x = (anchorX / width) * box.width;
    tooltip.style.left = `${Math.max(0, Math.min(box.width - 220, x - 110))}px`;
  };
  const hideTip = () => { tooltip.hidden = true; };

  svg.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * width;
    const index = columns.findIndex((c) => x >= c.x - COL_GAP / 2 && x < c.x + c.w + COL_GAP / 2);
    if (index >= 0) showTip(index, columns[index].x); else hideTip();
  });
  svg.addEventListener('pointerleave', hideTip);

  return {
    render(history, moves) {
      const shown = history.slice(-MAX_BINS);
      const binMoves = movesByBin(shown, moves);
      empty.hidden = shown.length > 0;
      svg.replaceChildren();
      const colW = (width - COL_GAP * (MAX_BINS - 1)) / MAX_BINS;
      // baseline
      svg.append(el('line', { x1: 0, x2: width, y1: PLOT_H + 0.5, y2: PLOT_H + 0.5, class: 'axis' }));
      columns = shown.map((entry, index) => {
        const x = index * (colW + COL_GAP);
        const group = el('g', { class: 'col', tabindex: '0',
          'aria-label': `${formatTime(entry.elapsedSec)}: ${EXPLORATION_STATES[entry.probabilities.indexOf(Math.max(...entry.probabilities))]}` });
        let y = PLOT_H;
        entry.probabilities.forEach((p, state) => {
          const h = p * PLOT_H;
          if (h < 0.5) return;
          y -= h;
          group.append(el('rect', { x, y, width: colW, height: h, class: `seg s${state}` }));
        });
        if (binMoves[index].length) {
          group.append(el('circle', { cx: x + colW / 2, cy: PLOT_H + MARK_H / 2 + 2, r: 4, class: 'move-dot' }));
        }
        group.addEventListener('focus', () => showTip(index, x));
        group.addEventListener('blur', hideTip);
        svg.append(group);
        return { x, w: colW, entry, moves: binMoves[index] };
      });
    },
  };
}
