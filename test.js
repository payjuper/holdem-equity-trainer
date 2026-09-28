// Run with: node test.js
'use strict';
const P = require('./poker.js');

let passed = 0, failed = 0;
function check(cond, label) {
  if (cond) { passed++; console.log('  ok   ' + label); }
  else { failed++; console.log('  FAIL ' + label); }
}

function hand(str) { return str.trim().split(/\s+/).map(P.stringToCard); }
function score(str) { return P.evaluate7(hand(str)); }
function beats(a, b, label) { check(score(a) > score(b), label + '  [' + a + ' > ' + b + ']'); }
function ties(a, b, label) { check(score(a) === score(b), label + '  [' + a + ' == ' + b + ']'); }

// ---------------------------------------------------------------- cards
console.log('\nCard encoding');
check(P.cardToString(P.stringToCard('Ah')) === 'Ah', 'round trip Ah');
check(P.cardToString(P.stringToCard('Tc')) === 'Tc', 'round trip Tc');
check(P.stringToCard('2c') === 0, '2c is 0');
check(P.stringToCard('As') === 51, 'As is 51');
check(P.rankOf(P.stringToCard('Ad')) === 12 && P.suitOf(P.stringToCard('Ad')) === 1, 'rank/suit of Ad');
const deck = P.shuffle(P.newDeck(), P.seededRandom(1));
check(deck.length === 52 && new Set(deck).size === 52, 'shuffle keeps all 52 distinct cards');

// ------------------------------------------------------------ evaluator
console.log('\nEvaluator: category boundaries');
beats('As Ks Qs Js Ts 2c 3d', 'Ac Ad Ah As Kc 2d 3h', 'straight flush beats quads');
beats('Ac Ad Ah As Kc 2d 3h', 'Ac Ad Ah Kc Kd 2d 3h', 'quads beat full house');
beats('Ac Ad Ah Kc Kd 2d 3h', 'As Ks 9s 7s 2s 3d 4c', 'full house beats flush');
beats('2s 5s 9s 7s Ks Ad Ac', 'As Kd Qh Jc Ts 2d 3h', 'flush beats straight');
beats('9s 8d 7h 6c 5s 2d 3h', 'Ac Ad Ah Kc Qd 2d 3h', 'straight beats trips');
beats('2c 2d 2h Ac Kd 9d 3h', 'Ac Ad Kh Kc Qd 2d 3h', 'trips beat two pair');
beats('2c 2d 3h 3c Kd 9d 7h', 'Ac Ad Kh Qc Jd 2d 3h', 'two pair beats pair');
beats('2c 2d 3h 4c 5d 9d 7h', 'Ac Kd Qh Jc 9d 2d 3h', 'pair beats high card');
beats('2s 3s 4s 5s 6s Ad Ac', 'As Ks Qs Js 9s 2d 3h', 'straight flush (six high) beats ace-high flush');

console.log('\nEvaluator: straights');
beats('6s 5d 4h 3c 2s Kd Qh', 'As 2d 3h 4c 5s Kd Qh', 'six-high straight beats the wheel');
beats('As Kd Qh Jc Ts 2d 3h', 'Kd Qh Jc Ts 9s 2d 3h', 'broadway is the top straight');
beats('As 2d 3h 4c 5s Kd Qh', 'Ac Ad Kh Kc Qd 2d 3h', 'wheel beats two pair');
ties('As 2d 3h 4c 5s Kd Qh', 'Ac 2c 3d 4h 5d Jd 9h', 'wheel ties wheel');
ties('9s 8d 7h 6c 5s Ad Kh', '9c 8h 7d 6s 5c 2d 3h', 'straight tie ignores extra cards');
check(P.categoryOf(score('Ks Qd Jh Tc 2s 3d 4h')) === 0, 'K Q J T without 9 or A is not a straight');
check(P.categoryOf(score('Ks Qd Jh Tc As 3d 4h')) === 4, 'A K Q J T is a straight');
check(P.categoryOf(score('Ks Qd Jh 2c As 3d 4h')) === 0, 'K Q J A 2 3 4 does not wrap around');

console.log('\nEvaluator: kickers within categories');
beats('Ac Ad Kh 9c 7d 2d 3h', 'As Ah Qh 9d 7c 2s 3c', 'equal pairs: kicker decides');
ties('Ac Ad Kh 9c 7d 2d 3h', 'As Ah Kd 9d 7c 2s 3c', 'equal pair and kickers tie');
beats('Kc Kd Jh 9c 7d 2d 3h', 'Qc Qd Ah 9c 7d 2d 3h', 'pair of kings beats pair of queens with a better kicker');
beats('Ac Ad 2h 2c Kd 9d 7h', 'Kc Kd Qh Qc Ad 9d 7h', 'two pair: high pair compared first');
beats('Ac Ad Kh Kc 2d 9d 7h', 'As Ah Qh Qc Kd 9d 7h', 'two pair: low pair compared second');
beats('Ac Ad Kh Kc Qd 9d 7h', 'As Ah Kd Ks Jd 9d 7h', 'two pair: kicker compared third');
beats('Ac Ad Kh Kc Qd Qs 7h', 'As Ah Kd Ks 2d 9d 7h', 'three pairs: best two pair plus best kicker (Q) beats 9 kicker');
beats('5c 5d 5h Ac Kd 2d 3h', '5s 5c 5d Ac Qd 2d 3h', 'trips: second kicker decides');
beats('6c 6d 6h 2c 3d 4d 9h', '5s 5c 5d Ac Kd 2d 3h', 'higher trips beat lower trips with better kickers');
beats('As Ks 9s 7s 3s 2d 4c', 'As Ks 9s 6s 5s 2d 4c', 'flush: fourth card decides');
beats('3c 3d 3h 2s 2h 9d 7h', '2c 2d 2h Ac Ad 9d 7h', 'full house: trips rank first');
beats('3c 3d 3h Ac Ad 9d 7h', '3s 3c 3d Ks Kh 9d 7h', 'full house: pair rank second');
beats('3c 3d 3h Ac Ad As 7h', '3s 3c 3d Ks Kh 9d 7h', 'two sets of trips: higher trips become the pair');
beats('2c 2d 2h 2s Ad 9d 7h', '2c 2d 2h 2s Kd 9d 7h', 'quads: kicker decides');
beats('Ac Kd Qh Jc 9d 2d 3h', 'Ac Kd Qh Jc 8d 2d 3h', 'high card: fifth card decides');
ties('Ac Kd Qh Jc 9d 2d 3h', 'As Kc Qd Jh 9c 4d 5h', 'high card: sixth and seventh cards ignored');
check(P.categoryOf(score('Ac Ad 5c 5d 9c 9d 7c')) === 2, 'three pairs still counts as two pair');

// -------------------------------------------------------------- naming
console.log('\nHand names');
function nameOf(str) { return P.handName(hand(str)).name; }
function drawOf(str) { return P.handName(hand(str)).draw; }
check(nameOf('8c 9h 8s Kh 2c') === 'Pair of eights', 'Pair of eights: ' + nameOf('8c 9h 8s Kh 2c'));
check(nameOf('As Ks 9s 7s 2s 3d 4c') === 'Flush, ace high', 'Flush, ace high');
check(nameOf('As 2d 3h 4c 5s') === 'Straight, five high', 'wheel is five high');
check(nameOf('As Ks Qs Js Ts') === 'Royal flush', 'Royal flush');
check(nameOf('3c 3d 3h Ac Ad') === 'Full house, threes over aces', 'Full house wording');
check(nameOf('Ac Ad Kh Kc 2d') === 'Two pair, aces and kings', 'Two pair wording');
check(nameOf('Ah Kh') === 'Ace high, suited', 'preflop suited');
check(nameOf('2c 2d') === 'Pair of twos', 'preflop pair');
check(drawOf('8c 9h 8s Kh 2c') === '', 'no draw on 8 9 / 8 K 2: "' + drawOf('8c 9h 8s Kh 2c') + '"');
check(/open-ended straight draw \(any five or ten\)/i.test(drawOf('8c 9h 6s 7h 2c')), 'open-ended draw: ' + drawOf('8c 9h 6s 7h 2c'));
check(/gutshot straight draw \(any seven\)/i.test(drawOf('8c 9h 6s Th 2c')), 'gutshot draw: ' + drawOf('8c 9h 6s Th 2c'));
check(/flush draw/i.test(drawOf('Ah Kh 2h 9h 3c')), 'flush draw: ' + drawOf('Ah Kh 2h 9h 3c'));
check(drawOf('Ah Kh 2h 9h 3h') === '', 'made flush reports no flush draw');
check(drawOf('8c 9h 6s 7h 2c Td') === '', 'made straight reports no straight draw');

// -------------------------------------------------------------- equity
console.log('\nEquity: known values (win + tie/2, tolerance 1.5 points)');
function eq(holeStr, expected, label) {
  const r = P.equity(hand(holeStr), [], 1, 100000, P.seededRandom(42));
  const e = r.win + r.tie / 2;
  const ok = Math.abs(e - expected) <= 0.015;
  check(ok, label + ': got ' + (e * 100).toFixed(1) + '%, expected ~' + (expected * 100).toFixed(1) + '% (stderr ' + (r.stderr * 100).toFixed(2) + ')');
  return e;
}
eq('Ac Ad', 0.852, 'AA vs one random hand');
eq('Ah Kh', 0.670, 'AKs vs one random hand');
eq('2c 2d', 0.503, '22 vs one random hand');
{
  const r = P.equity(hand('Ac Ad'), [], 3, 50000, P.seededRandom(7));
  const e = r.win + r.tie / 2;
  check(Math.abs(e - 0.64) <= 0.02, 'AA vs three random hands ~64%: got ' + (e * 100).toFixed(1) + '%');
  check(Math.abs(r.win + r.tie + r.lose - 1) < 1e-9, 'win + tie + lose = 1');
}

console.log('\nEquity: exact enumeration sanity');
{
  const r = P.exactEquity(hand('As Ks'), hand('Qs Js Ts 2d 3c'), 1);
  check(r.lose === 0 && r.tie === 0 && r.win === 1, 'royal flush on the river wins every matchup');
  const r2 = P.exactEquity(hand('2c 3d'), hand('Ah Kh Qh Jh Th'), 1);
  check(r2.tie === 1, 'board royal flush is always a chop');
  const r3 = P.exactEquity(hand('Ac Ad'), hand('2c 7d 9h Kc'), 1);
  check(r3.trials === 46 * (45 * 44 / 2), 'turn enumeration count is 46 * C(45,2) = ' + r3.trials);
}

console.log('\nEquity: Monte Carlo vs exact on the turn (one opponent, within 3 stderr)');
const cases = [
  ['Ac Ad', '2c 7d 9h Kc'],
  ['8c 9h', '8s Kh 2c Ad'],
  ['Jh Th', '9h 2c 5d 6s'],
  ['4c 4d', 'Ac Kd Qh 4s']
];
cases.forEach(([h, b], i) => {
  const ex = P.exactEquity(hand(h), hand(b), 1);
  const mc = P.equity(hand(h), hand(b), 1, 20000, P.seededRandom(100 + i));
  const diff = Math.abs(mc.win - ex.win);
  check(diff <= 3 * mc.stderr, h + ' on ' + b + ': exact ' + (ex.win * 100).toFixed(2) + '%, MC ' + (mc.win * 100).toFixed(2) + '%, diff ' + (diff * 100).toFixed(2) + ' <= 3 x ' + (mc.stderr * 100).toFixed(2));
});
{
  const ex = P.exactEquity(hand('Ac Ad'), hand('2c 7d 9h Kc 3s'), 1);
  const mc = P.equity(hand('Ac Ad'), hand('2c 7d 9h Kc 3s'), 1, 20000, P.seededRandom(9));
  check(Math.abs(mc.win - ex.win) <= 3 * mc.stderr, 'river: AA on 2 7 9 K 3: exact ' + (ex.win * 100).toFixed(2) + '%, MC ' + (mc.win * 100).toFixed(2) + '%');
}

console.log('\nHand matrix');
{
  const h = hand('Ac Ad');
  const t0 = Date.now();
  const m = P.handMatrix(h, hand('2c 7d 9h Kc 3s'));
  check(m.length === 169, '169 cells');
  const aa = m.find(c => c.label === 'AA');
  check(aa.combos === 1, 'AA has one live combo when hero holds two aces: ' + aa.combos);
  const total = m.reduce((s, c) => s + c.combos, 0);
  check(total === 45 * 44 / 2, 'live combos sum to C(45,2) on the river: ' + total);
  // Weighted average over the matrix must equal exactEquity vs a random hand.
  const ex = P.exactEquity(h, hand('2c 7d 9h Kc 3s'), 1);
  const avg = m.reduce((s, c) => s + c.win * c.combos, 0) / total;
  check(Math.abs(avg - ex.win) < 1e-9, 'combo-weighted matrix win matches exactEquity: ' + (avg * 100).toFixed(2));
  const kk = m.find(c => c.label === 'KK');
  check(kk.lose === 1, 'AA loses to every KK combo on 2 7 9 K 3');
  const mf = P.handMatrix(hand('8c 9h'), hand('7d Tc 2s'));
  const exf = P.equity(hand('8c 9h'), hand('7d Tc 2s'), 1, 100000, P.seededRandom(3));
  const totf = mf.reduce((s, c) => s + c.combos, 0);
  const avgf = mf.reduce((s, c) => s + c.win * c.combos, 0) / totf;
  check(Math.abs(avgf - exf.win) < 0.01, 'flop matrix (exact) agrees with Monte Carlo: ' + (avgf * 100).toFixed(2) + ' vs ' + (exf.win * 100).toFixed(2));
  const mp = P.handMatrix(hand('Ac Ad'), [], P.seededRandom(5));
  const totp = mp.reduce((s, c) => s + c.combos, 0);
  check(totp === 1225, 'preflop live combos = C(50,2) = ' + totp);
  const avgp = mp.reduce((s, c) => s + c.win * c.combos, 0) / totp;
  check(Math.abs(avgp - 0.849) < 0.02, 'preflop sampled matrix vs AA ~85%: ' + (avgp * 100).toFixed(1));
  check(mp[0].exact === false && m[0].exact === true, 'exact flag set correctly');
  console.log('  (matrix timings: river+flop+preflop in ' + (Date.now() - t0) + ' ms)');
}

console.log('\nSpeed');
{
  const cards = hand('Ac Kd 9h 9c 2s 7d 5h');
  const N = 1000000;
  const t0 = Date.now();
  let s = 0;
  for (let i = 0; i < N; i++) s ^= P.evaluate7(cards);
  const ms = Date.now() - t0;
  check(ms < 5000, N.toLocaleString() + ' evaluate7 calls in ' + ms + ' ms');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
