/**
 * Small live HMM fitted to the Roller Coasters V3 log pilot.
 *
 * This is an inspectable research instrument, not a student assessment. Raw
 * CODAP notifications are reduced to the same eight 10-second observations
 * used by the offline experiment, then one forward-filter update is applied.
 *
 * Provenance: ported from codap-spirit-animal `web/src/exploration-classifier.js`
 * (commit 564085e, branch feat/live-exploration-classifier). The model
 * constants below are unchanged from that file, which took them from the
 * offline fit in the Roller Coasters log pilot (`sequence_experiment.py`).
 * The only change is the connection seam: Spirit Animal attached to its host
 * bridge's 'raw' event; here the plugin calls `observeMessage()` directly and
 * `start()`/`stop()` own the 10-second bin timer. See docs/model-card.md.
 */

export const EXPLORATION_STATES = [
  'orienting / revising',
  'constructing',
  'arranging / inspecting',
  'generating / refining',
  'inactive / unobserved',
];

export const EXPLORATION_OBSERVATIONS = [
  'idle', 'layout', 'construct', 'inspect', 'generate', 'revise', 'repeat', 'other',
];

const INITIAL = [0.9682, 0.0281, 0.0018, 0.0010, 0.0009];
const TRANSITION = [
  [0.0962, 0.0339, 0.3937, 0.1095, 0.3667],
  [0.0014, 0.8536, 0.0222, 0.0274, 0.0953],
  [0.0277, 0.0327, 0.7342, 0.1031, 0.1025],
  [0.0036, 0.0138, 0.0282, 0.5620, 0.3925],
  [0.0112, 0.0360, 0.0135, 0.0159, 0.9234],
];
const EMISSION = [
  [0.0038, 0.0399, 0.0075, 0.0151, 0.0056, 0.1627, 0.0001, 0.7653],
  [0.2483, 0.0692, 0.5720, 0.0409, 0.0491, 0.0117, 0.0056, 0.0031],
  [0.3267, 0.4456, 0.0114, 0.0831, 0.0083, 0.0893, 0.0271, 0.0085],
  [0.1797, 0.4705, 0.0099, 0.0109, 0.2720, 0.0301, 0.0268, 0.0002],
  [0.9672, 0.0069, 0.0071, 0.0026, 0.0157, 0.0000, 0.0004, 0.0000],
];
const FUTURE_PROXY_RISK = [0.2776, 0.3582, 0.2102, 0.2037, 0.1918];
const PRIORITY = { idle: 0, other: 1, layout: 2, repeat: 3, revise: 4,
  construct: 5, inspect: 6, generate: 7 };

const normalize = (values) => {
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => value / total);
};

/** Convert one Data Interactive notification into a model observation. */
export function classifyCodapMessage(message) {
  const { resource = '', values = {} } = message ?? {};
  const operation = values?.operation ?? '';
  const lower = operation.toLowerCase();

  if (resource === 'component' || resource.startsWith('component[')) {
    if (operation === 'create' && /graph/i.test(values?.type ?? values?.title ?? '')) {
      return { observation: 'construct', evidence: 'created a graph' };
    }
    if (operation === 'attributeChange') {
      return { observation: 'construct', evidence: 'changed a graph attribute' };
    }
    if (operation === 'move' || operation === 'resize') {
      return { observation: 'layout', evidence: `${operation}d a component` };
    }
    if (operation === 'delete') {
      return { observation: 'revise', evidence: 'deleted a component' };
    }
    if (operation === 'legendAttributeChange'
        || /toggleplotted|lsrl|residual|movable line|plotted function/.test(lower)
        || ['hideUnselected', 'hideSelected', 'displayOnlySelected', 'showAllCases'].includes(operation)) {
      return { observation: 'generate', evidence: operation };
    }
  }

  if (resource.startsWith('dataContextChangeNotice')) {
    if (operation === 'selectCases') {
      return { observation: 'inspect', evidence: 'selected cases' };
    }
    if (['createAttributes', 'updateAttributes', 'createCollection'].includes(operation)) {
      return { observation: 'generate', evidence: operation };
    }
    if (/sort|move.*categor/i.test(operation)) {
      return { observation: 'inspect', evidence: operation };
    }
  }

  if (resource.startsWith('dragDrop') && /drop/i.test(operation)) {
    return { observation: 'construct', evidence: 'dropped an attribute' };
  }
  return null;
}

export class ExplorationClassifier extends EventTarget {
  constructor({ binMs = 10_000, now = () => performance.now() } = {}) {
    super();
    this.binMs = binMs;
    this.now = now;
    this.startedAt = now();
    this.probabilities = [...INITIAL];
    this.pending = null;
    this.history = [];
    this.lastSignature = null;
    this.lastSignatureAt = -Infinity;
    this.timer = null;
    this.demoing = false;
  }

  /** Start closing one bin every `binMs`. Feed it with `observeMessage()`. */
  start() {
    this.stop();
    this.timer = setInterval(() => { if (!this.demoing) this.flush(); }, this.binMs);
    this._emit();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  destroy() { this.stop(); }

  /** Seconds since the session (or the last reset) began, on the model's clock. */
  elapsedSec() {
    return Math.round((this.now() - this.startedAt) / 1000);
  }

  observeMessage(message) {
    const classified = classifyCodapMessage(message);
    if (classified) this.observe(classified.observation, classified.evidence);
    return classified;
  }

  observe(observation, evidence = observation) {
    if (!EXPLORATION_OBSERVATIONS.includes(observation)) return false;
    const at = this.now();
    const signature = `${observation}:${evidence}`;
    if (signature === this.lastSignature && at - this.lastSignatureAt <= 30_000) {
      observation = 'repeat';
      evidence = `repeated ${evidence}`;
    }
    this.lastSignature = signature;
    this.lastSignatureAt = at;
    if (!this.pending || PRIORITY[observation] >= PRIORITY[this.pending.observation]) {
      this.pending = { observation, evidence };
    }
    this._emit();
    return true;
  }

  /** Close one bin immediately. Used by the timer and the debug demo controls. */
  flush(forcedObservation = null, forcedEvidence = null) {
    const observation = forcedObservation ?? this.pending?.observation ?? 'idle';
    const evidence = forcedEvidence ?? this.pending?.evidence
      ?? 'no interpretable logged action in this interval';
    const symbol = EXPLORATION_OBSERVATIONS.indexOf(observation);
    const predicted = TRANSITION[0].map((_, destination) =>
      this.probabilities.reduce((sum, probability, source) =>
        sum + probability * TRANSITION[source][destination], 0));
    this.probabilities = normalize(predicted.map((value, state) =>
      value * Math.max(EMISSION[state][symbol], 1e-6)));
    this.history.push({
      elapsedSec: Math.round((this.now() - this.startedAt) / 1000),
      observation, evidence, probabilities: [...this.probabilities],
    });
    if (this.history.length > 180) this.history.shift();
    this.pending = null;
    this._emit();
    return this.snapshot();
  }

  reset() {
    this.startedAt = this.now();
    this.probabilities = [...INITIAL];
    this.pending = null;
    this.history = [];
    this.lastSignature = null;
    this.lastSignatureAt = -Infinity;
    this._emit();
  }

  async demoSequence() {
    this.demoing = true;
    this.reset();
    const steps = [
      ['construct', 'created a graph'],
      ['construct', 'assigned a second axis'],
      ['inspect', 'selected and compared cases'],
      ['generate', 'added a grouping'],
      ['generate', 'added a summary'],
      ['generate', 'added or refined a model'],
    ];
    try {
      for (const [observation, evidence] of steps) {
        this.flush(observation, evidence);
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
    } finally {
      this.demoing = false;
    }
  }

  snapshot() {
    const probability = Math.max(...this.probabilities);
    const stateIndex = this.probabilities.indexOf(probability);
    const latest = this.history.at(-1);
    return {
      stateIndex,
      state: EXPLORATION_STATES[stateIndex],
      probability,
      probabilities: [...this.probabilities],
      proxyLikelihood: this.probabilities.reduce((sum, value, index) =>
        sum + value * FUTURE_PROXY_RISK[index], 0),
      elapsedSec: Math.round((this.now() - this.startedAt) / 1000),
      observation: latest?.observation ?? this.pending?.observation ?? 'waiting',
      evidence: latest?.evidence ?? this.pending?.evidence ?? 'waiting for CODAP activity',
      pending: this.pending,
      history: this.history.map((entry) => ({ ...entry, probabilities: [...entry.probabilities] })),
    };
  }

  _emit() {
    this.dispatchEvent(new CustomEvent('update', { detail: this.snapshot() }));
  }
}
