# Model card: live exploration-state model

**What it is.** A five-state hidden Markov model (HMM) that turns a stream of
CODAP actions into a probability for each of five exploration states, updated
every 10 seconds. Code: `src/model/exploration-classifier.js`.

**Status: research instrument.** It describes patterns of interface activity.
It does not measure learning, understanding, ability or intent. Do not show
its output to students as feedback about them, and do not use it to grade.

## Where it came from

All numbers below come from the offline pilot in
`CODAP-log-data/roller-coaster-pilot/` (files `PILOT-REPORT.md` and
`SEQUENCE-EXPERIMENT.md`, September 2026), which is not part of this
repository. The fitted constants were first ported to
[codap-spirit-animal](https://github.com/chaddorsey/codap-spirit-animal)
(`web/src/exploration-classifier.js`, commit `564085e`) and are copied here
unchanged.

| | |
|---|---|
| Source logs | CODAP v3 report CSV, activity titled exactly "Roller Coasters" |
| Sessions in extract | 2,955 (83,160 event rows) |
| Sessions used | 1,247 (excluded: under 20 rows or under 5 minutes of log time) |
| Window | first five minutes of each session |
| Split | chronological: first 70% to fit, last 30% (375 sessions) to test |
| Student, class or outcome data | none in the extract |

## How it works

1. **Each CODAP notification becomes one of eight observations:** idle,
   layout, construct, inspect, generate, revise, repeat, other
   (`classifyCodapMessage`). An identical action within 30 seconds becomes
   *repeat*.
2. **Each 10-second bin keeps its highest-priority observation** (generate >
   inspect > construct > revise > repeat > layout > other > idle). A bin with
   no notification is *idle*.
3. **One forward-filter step per bin** updates the five state probabilities.

The mapping in step 1 was written by hand for live notifications. The model
was fitted to *log strings*, which were normalized to the same eight
observations by a different route (`sequence_experiment.py`). The two routes
have not been checked against each other on the same sessions, so the live
model sees a somewhat different signal from the one it was fitted on.

## The five states

The pilot's own advice is to read the states by what they mostly emit, not by
their labels:

| State | Mostly made of | Mean dwell (HSMM fit) |
|---|---|---|
| orienting / revising | initialization, "other" and revision events | ~11 s |
| constructing | graph and axis construction, mixed with idle bins | ~46 s |
| arranging / inspecting | layout and idle, some inspection | ~51 s |
| generating / refining | generative controls (grouping, summaries, models) mixed with layout | ~22 s |
| inactive / unobserved | bins with no logged event | ~75 s |

*Inactive / unobserved* is the most important caveat: no CODAP event does not
mean no thinking. The student may be reading, talking, writing or reasoning.

## How well it works

The **near-term proxy** meter (under *Research signals*) is the model's
estimate that a "productive episode" happens in the next few minutes. That
target is a rule, defined in the pilot as a linked episode in minutes 2–5 with
at least two meaningful move types, an advanced move, and either constructive
context or several investigative move types. It is not a validated measure of
anything.

| Predicting that target at minute 2 | Test sessions | ROC AUC | Brier |
|---|---:|---:|---:|
| Count-based logistic baseline | 375 | 0.606 | 0.132 |
| **This HMM** (filtered state probabilities) | 375 | **0.612** | 0.136 |
| Explicit-duration HSMM | 375 | 0.583 | 0.136 |

An AUC of 0.5 is chance. The HMM adds essentially nothing over counting
moves.

In a blinded check, three stand-in coders (AI coding agents, not people)
reviewed 24 session replays. They agreed strongly on what a student was doing
at minute 2 (Fleiss' kappa 0.89), but for 14 of the 24 the majority judgment
of "on track?" was *uncertain*: early CODAP activity often does not reveal
intent.

## How the plugin uses it

- It shows **Uncertain** instead of a state when no state is above 55%.
- The proxy meter and the teacher prompts are collapsed under *Research
  signals*, with this warning beside them.
- The model's state is not saved in the document; each session starts fresh.
  The move record is saved.
- The model was fitted on one activity. In other activities and datasets its
  states may mean something different.
