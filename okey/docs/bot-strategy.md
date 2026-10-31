# Bot difficulties

`fmi`, `bur` and `baba` keep their previous decision rules. `tmbyt` is the
fourth selectable level, **Ma mer mos luj se ki tmbyt**. On small player labels
it appears as “Stufe 4”; the complete name remains in the selector and tooltip.

## What the fourth level uses

- Its own hand and every tile exposed during the current round, deduplicated by
  physical tile ID. Public pickups, discards and declined offers are summarized
  per seat. The summary survives the short UI event window and resets each round.
- Exact minimum penalty points over valid disjoint runs/sets, with the same
  seven-pair and joker rules used for round scoring. This supplements the existing
  completed-meld and partial-meld heuristic.
- A discard-danger estimate from the next opponent's public pickups, currently
  known held tiles, discards and declined offers. A teammate is not penalized as
  an opponent. No private team hand is used.
- Match totals and remaining rounds. A lead increases emphasis on avoiding
  penalties and dangerous discards; a deficit increases the value of simulated
  wins and joker finishes. Certain legal wins are still taken immediately.
- A bounded Monte Carlo comparison of up to three distinct candidate discards,
  looking ahead up to two of the bot's own draws. Unknown tile types are sampled
  without replacement using remaining copy counts. Drawing the open discard is
  compared with drawing an unknown tile on the same future horizon.

All candidates use common sampled paths. Only complete comparison cycles count,
so an elapsed CPU budget cannot favor the first candidate. The fallback is the
static penalty/danger evaluation. The search has a soft 18 ms deadline checked
between evaluations, at most 48 evaluated hands, and at most eight sample paths.
Initial analysis and an in-progress evaluation can exceed the soft deadline.
The samples are deterministically seeded from the available information;
CPU load can change how many complete cycles fit in the budget.

## Limits and possible next improvements

This is a heuristic search, not an unbeatable solver. It simulates the bot's
future draws, not intervening opponents' decisions or the probability that a
round ends before those draws. It cannot see other hands or the actual stock
order. Public memory estimates preferences; it does not identify concealed
combinations with certainty.

Promising next work:

1. Sample plausible opponent hands consistent with public information and tile
   counts, then simulate their responses and the chance they close first.
2. Calibrate values against the probability of winning the entire 5/7-round
   match. In particular, decide when a trailing team should pass up a normal
   finish to pursue the joker bonus; the current bot always takes a certain win.
3. Spend more search effort on close decisions, using a worker so extra thinking
   cannot delay other tables. Evaluate more candidate discards when needed.
4. Tune and validate on separate seed banks against diverse opponents, including
   conservative and aggressive styles, rather than only exploiting Si Baba.

## Validation and reproducible comparisons

Run `npm test` for rules, memory, fairness and budget checks;
`CHROMIUM_PATH=/usr/bin/chromium npm run test:layout` checks the browser UI.
The fairness tests make opponent/partner hands and stock access throw during
strategy decisions. Scoring is cross-checked against the actual round scorer.

`npm run bench:bots -- 21000 8 5 teams` plays eight pairs of five-round matches.
Each pair repeats identical deals with the difficulties swapped between seats.
Use `1 individual` for single-round comparisons or `7 teams` for seven-round
matches. The script reports points, round wins and decision latency. In individual
mode, `matchWins` compares the sum for the two seats of each difficulty, not an
individual player's match victory. Timings include engine work in that tick and
can include end-of-round scoring. Wall-clock budgets make results vary somewhat
with host load. A small simulation run is evidence, not a general strength proof.

### Initial comparison, 2026-10-31

With unchanged evaluation weights, 168 rounds on three separate seed banks:

| Comparison | Fourth level | Si Baba |
| --- | ---: | ---: |
| Individual round wins (32 rounds, two seats each) | 21 | 11 |
| Five-round team match wins (16 matches) | 12 | 4 |
| Seven-round team match wins (8 matches) | 4 | 4 |
| Team penalty totals across both match lengths | 2337 | 4270 |

There was one stock exhaustion in the five-round run. Lower penalty totals are
favorable, but the seven-round match result was tied: this sample does not prove
superiority in every format. Elite tick medians were 12.6–13.3 ms, p95 20.9–21.6 ms,
and the maximum was 34.2 ms on the development host. Raw results are in
`bot-benchmark-2026-10-31.json`. An additional comparison against the previous
source verified identical decisions for the original three difficulties on
100 seeded hands each (300 decisions).
