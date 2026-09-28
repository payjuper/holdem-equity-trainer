# Hold'em Equity Trainer

Monte Carlo equity calculator for Texas Hold'em with live per-street win
probability, standard-error reporting, an opponent-holdings matrix, and exact
enumeration for verification. Vanilla JavaScript, Web Worker, zero dependencies.

A single-page Texas Hold'em practice tool. You get two hole cards, the board
comes out one street at a time, and your win probability against 1 to 3
random hands updates after every reveal. No betting, no chips. The point is
to build intuition for how equity moves as cards land.

Plain HTML, CSS and JavaScript. No frameworks, no build step, no server.

Live demo: https://payjuper.github.io/holdem-equity-trainer/

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `style.css` | Styling, cards drawn with CSS |
| `poker.js` | Engine: card encoding, evaluator, hand naming, Monte Carlo and exact equity. No DOM code. |
| `worker.js` | Web Worker that runs the Monte Carlo simulation and the holdings matrix off the main thread |
| `app.js` | UI logic |
| `test.js` | Engine tests, run with Node |

## Running it

Hosted on GitHub Pages: create a repository named `holdem-equity-trainer`,
push this folder to it, then in the repository go to Settings, Pages, choose
"Deploy from a branch", pick `main` and the root folder, and save. A minute
later the app is live at `https://<your-username>.github.io/holdem-equity-trainer/`.

Locally, the cleanest way is a tiny static server from this folder:

```
python -m http.server 8000
```

then open http://localhost:8000. You can also double-click `index.html`.
Firefox runs it fully from `file://`. Chrome blocks Web Workers on `file://`,
so there the app detects the failed worker and runs the simulation on the
main thread instead (the footer says "main thread"). It is still fast enough
that you will not notice; the worker matters mostly for the hosted version.

Tests:

```
node test.js
```

## Controls

Space or the gold button deals the next street. N or "New hand" starts over.
The Opponents select picks how many random hands you are up against.
"Guess first" hides the probability after each reveal until you type your
estimate and press Enter; the true value and your error then appear, and the
footer keeps a running mean absolute error for the session. After the river
the opponent cards flip and the felt shows who won.

## How the equity calculation works

### Hand evaluation

Cards are integers 0 to 51: `rank = card % 13` (0 is a deuce, 12 an ace) and
`suit = Math.floor(card / 13)`. `evaluate7` takes up to seven cards, builds
a histogram of ranks and one of suits plus a 13-bit rank mask per suit, and
from those decides the category (flush and straight flush from the suit
masks, quads / full house / trips / pairs from the rank counts, straights
from the combined mask including the wheel A-2-3-4-5). It returns a single
integer `category * 13^5 + tiebreak`, where the tiebreak packs the deciding
ranks in base 13, so two hands compare with a plain `>` and equal scores are
a chop. It allocates nothing per call, which matters because the simulation
calls it millions of times.

### Monte Carlo

Given your hole cards and the known board, the exact win probability is the
fraction of all possible completions (opponent hands plus remaining board
cards) in which you hold the best hand. Preflop against one opponent that is
about 1.7 million evaluations; against three it is astronomically more.
Instead of enumerating, `equity` samples: each trial it draws the missing
board cards and each opponent's two cards at random from the unseen deck
(a partial Fisher-Yates shuffle), evaluates everyone, and records win, tie
or loss. After 20,000 trials the win fraction is the estimate.

### Standard error

A Monte Carlo estimate is itself random. With `n` trials and an estimated
win fraction `p`, the standard error of that estimate is
`sqrt(p * (1 - p) / n)`. It is the typical distance between the estimate
and the true value; about two thirds of the time the truth lies within one
standard error, about 95% of the time within two. At 20,000 trials the
standard error is at most 0.35 percentage points (worst case at p = 50%),
which is why the panel shows a "±" figure and why the tenths digit in the
big number is only approximately meaningful.

### Opponent holdings matrix

The 13 x 13 grid on the left is the standard hand chart: pairs on the
diagonal, suited hands above it, offsuit below. Each cell is colored by your
equity against exactly that holding for one opponent: red when you are
behind (under 45%), amber for a coin flip (45 to 55%), green when you are
ahead, with a continuous gradient in between. Grey hatched cells are
impossible because every combo of that class is blocked by cards already
out. Hover a cell for the combo count and exact win/tie/lose numbers. `handMatrix` enumerates every live combo of each class and,
on the flop, turn and river, every runout, so those are exact. Preflop it
samples about 600 random boards per class instead (labelled "sampled"). In
guess-first mode the whole panel is covered until you have entered your
estimate, since it would give the answer away.

### Exact equity

`exactEquity` enumerates every remaining river card and every opponent hand
for the turn and river. It exists to check the simulation: `test.js` runs
both on the same turn spots and asserts they agree within three standard
errors.

### Why a Web Worker

JavaScript on a page runs on the same thread that paints the screen and
handles clicks. Twenty thousand trials with three opponents is about 80,000
evaluations, only tens of milliseconds, but anything running on the main
thread blocks the UI for exactly that long, and larger trial counts would
turn into visible freezes. A Web Worker is a separate thread: the page posts
`{hole, board, numOpponents, trials}` to it, keeps animating, and receives
the result as a message. Each request carries an id so a late result from a
previous hand is ignored.

## Tests

`test.js` covers card encoding, 30+ evaluator comparisons across every
category boundary and kicker rule, hand naming and draw notes, known
preflop equities (AA, AKs, 22 against one random hand and AA against
three), sanity checks on exact enumeration, Monte Carlo versus exact on
several turn and river spots, the holdings matrix (combo counts, and that
its combo-weighted average equals `exactEquity` on the river and agrees
with Monte Carlo on the flop), and evaluator speed. 77 checks in all.
