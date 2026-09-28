/*
 * poker.js - Texas Hold'em engine (no DOM code).
 *
 * Works as a classic browser script (exposes window.Poker), inside a Web
 * Worker (self.Poker after importScripts) and in Node (module.exports).
 *
 * Card encoding: integers 0..51
 *   rank = card % 13          0 = 2, 1 = 3, ... 8 = T, 9 = J, 10 = Q, 11 = K, 12 = A
 *   suit = Math.floor(card / 13)   0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Poker = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RANK_CHARS = '23456789TJQKA';
  var SUIT_CHARS = 'cdhs';
  var RANK_WORDS = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'jack', 'queen', 'king', 'ace'];
  var RANK_PLURALS = ['twos', 'threes', 'fours', 'fives', 'sixes', 'sevens',
    'eights', 'nines', 'tens', 'jacks', 'queens', 'kings', 'aces'];

  // Hand categories, low to high.
  var HIGH_CARD = 0, PAIR = 1, TWO_PAIR = 2, TRIPS = 3, STRAIGHT = 4,
    FLUSH = 5, FULL_HOUSE = 6, QUADS = 7, STRAIGHT_FLUSH = 8;
  var CATEGORY_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind',
    'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

  // Score layout: category * BASE + tiebreak, tiebreak is up to five ranks
  // packed in base 13 (most significant first). BASE = 13^5.
  var BASE = 371293;

  // ---------------------------------------------------------------- cards

  function cardToString(card) {
    return RANK_CHARS[card % 13] + SUIT_CHARS[Math.floor(card / 13)];
  }

  function stringToCard(str) {
    var s = str.trim();
    var rc = s[0].toUpperCase();
    if (rc === '1' && s[1] === '0') { rc = 'T'; s = 'T' + s.slice(2); }
    var r = RANK_CHARS.indexOf(rc);
    var su = SUIT_CHARS.indexOf(s[1].toLowerCase());
    if (r < 0 || su < 0) throw new Error('Bad card string: ' + str);
    return su * 13 + r;
  }

  function rankOf(card) { return card % 13; }
  function suitOf(card) { return Math.floor(card / 13); }

  function newDeck() {
    var d = new Array(52);
    for (var i = 0; i < 52; i++) d[i] = i;
    return d;
  }

  // Fisher-Yates, in place. rng returns a float in [0, 1).
  function shuffle(deck, rng) {
    rng = rng || Math.random;
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  // ------------------------------------------------------------ evaluator

  // Scratch buffers, reused across calls so the hot loop never allocates.
  var RC = new Uint8Array(13);   // rank counts
  var SC = new Uint8Array(4);    // suit counts
  var SM = new Int32Array(4);    // per-suit rank bitmasks

  // Highest card of a straight contained in a rank bitmask, or -1.
  function straightHigh(mask) {
    for (var h = 12; h >= 4; h--) {
      if (((mask >> (h - 4)) & 31) === 31) return h;
    }
    if ((mask & 0x100F) === 0x100F) return 3; // wheel: A 2 3 4 5, five high
    return -1;
  }

  // Pack the n highest set bits of mask, most significant first, base 13.
  // Missing positions are filled with 0 so results with fewer bits compare
  // consistently.
  function topN(mask, n) {
    var v = 0, found = 0;
    for (var r = 12; r >= 0 && found < n; r--) {
      if (mask & (1 << r)) { v = v * 13 + r; found++; }
    }
    while (found < n) { v = v * 13; found++; }
    return v;
  }

  /**
   * evaluate7(cards): cards is an array of 5..7 card integers (fewer also
   * works, e.g. for naming a preflop holding). Returns an integer; higher
   * is better and equal means a chop.
   */
  function evaluate7(cards) {
    var n = cards.length;
    for (var i = 0; i < 13; i++) RC[i] = 0;
    SC[0] = SC[1] = SC[2] = SC[3] = 0;
    SM[0] = SM[1] = SM[2] = SM[3] = 0;
    var mask = 0;
    for (i = 0; i < n; i++) {
      var c = cards[i];
      var r = c % 13;
      var s = (c / 13) | 0;
      RC[r]++; SC[s]++;
      mask |= 1 << r;
      SM[s] |= 1 << r;
    }

    // Flush / straight flush. At most one suit can have 5+ of 7 cards.
    for (s = 0; s < 4; s++) {
      if (SC[s] >= 5) {
        var sh = straightHigh(SM[s]);
        if (sh >= 0) return STRAIGHT_FLUSH * BASE + sh;
        return FLUSH * BASE + topN(SM[s], 5);
      }
    }

    var quad = -1, trips = -1, trips2 = -1, p1 = -1, p2 = -1;
    for (r = 12; r >= 0; r--) {
      var cnt = RC[r];
      if (cnt === 4) quad = r;
      else if (cnt === 3) { if (trips < 0) trips = r; else if (trips2 < 0) trips2 = r; }
      else if (cnt === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }

    if (quad >= 0) {
      return QUADS * BASE + quad * 13 + topN(mask & ~(1 << quad), 1);
    }
    if (trips >= 0 && (trips2 >= 0 || p1 >= 0)) {
      var pairRank = trips2 > p1 ? trips2 : p1;
      return FULL_HOUSE * BASE + trips * 13 + pairRank;
    }
    var st = straightHigh(mask);
    if (st >= 0) return STRAIGHT * BASE + st;
    if (trips >= 0) {
      return TRIPS * BASE + trips * 169 + topN(mask & ~(1 << trips), 2);
    }
    if (p1 >= 0 && p2 >= 0) {
      return TWO_PAIR * BASE + p1 * 169 + p2 * 13 + topN(mask & ~(1 << p1) & ~(1 << p2), 1);
    }
    if (p1 >= 0) {
      return PAIR * BASE + p1 * 2197 + topN(mask & ~(1 << p1), 3);
    }
    return HIGH_CARD * BASE + topN(mask, 5);
  }

  function categoryOf(score) { return Math.floor(score / BASE); }

  // Unpack the tiebreak part of a score into an array of ranks (MSB first).
  function unpackRanks(score, n) {
    var t = score % BASE;
    var out = new Array(n);
    for (var i = n - 1; i >= 0; i--) { out[i] = t % 13; t = Math.floor(t / 13); }
    return out;
  }

  // ------------------------------------------------------------- naming

  function describe(score) {
    var cat = categoryOf(score);
    var r;
    switch (cat) {
      case HIGH_CARD:
        r = unpackRanks(score, 5);
        return capitalize(RANK_WORDS[r[0]]) + ' high';
      case PAIR:
        r = unpackRanks(score, 4);
        return 'Pair of ' + RANK_PLURALS[r[0]];
      case TWO_PAIR:
        r = unpackRanks(score, 3);
        return 'Two pair, ' + RANK_PLURALS[r[0]] + ' and ' + RANK_PLURALS[r[1]];
      case TRIPS:
        r = unpackRanks(score, 3);
        return 'Three of a kind, ' + RANK_PLURALS[r[0]];
      case STRAIGHT:
        r = unpackRanks(score, 1);
        return 'Straight, ' + RANK_WORDS[r[0]] + ' high';
      case FLUSH:
        r = unpackRanks(score, 5);
        return 'Flush, ' + RANK_WORDS[r[0]] + ' high';
      case FULL_HOUSE:
        r = unpackRanks(score, 2);
        return 'Full house, ' + RANK_PLURALS[r[0]] + ' over ' + RANK_PLURALS[r[1]];
      case QUADS:
        r = unpackRanks(score, 2);
        return 'Four of a kind, ' + RANK_PLURALS[r[0]];
      case STRAIGHT_FLUSH:
        r = unpackRanks(score, 1);
        if (r[0] === 12) return 'Royal flush';
        return 'Straight flush, ' + RANK_WORDS[r[0]] + ' high';
    }
    return '';
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function joinWords(words) {
    if (words.length === 1) return words[0];
    if (words.length === 2) return words[0] + ' or ' + words[1];
    return words.slice(0, -1).join(', ') + ' or ' + words[words.length - 1];
  }

  /**
   * handName(cards): cards = hole cards plus whatever board is out (2..7).
   * Returns { name, draw }. draw is '' when there is nothing to note.
   * Draws are only reported on the flop and turn (5 or 6 cards).
   */
  function handName(cards) {
    var n = cards.length;
    var name;
    if (n < 5) {
      // Preflop-style description.
      var ranks = cards.map(rankOf).sort(function (a, b) { return b - a; });
      if (n === 2 && ranks[0] === ranks[1]) name = 'Pair of ' + RANK_PLURALS[ranks[0]];
      else {
        name = capitalize(RANK_WORDS[ranks[0]]) + ' high';
        if (n === 2) {
          if (suitOf(cards[0]) === suitOf(cards[1])) name += ', suited';
          else name += ', offsuit';
        }
      }
      return { name: name, draw: '' };
    }
    var score = evaluate7(cards);
    name = describe(score);
    var draw = '';
    if (n === 5 || n === 6) {
      var cat = categoryOf(score);
      var notes = [];
      // Flush draw: four of one suit, no flush made.
      var suitCount = [0, 0, 0, 0];
      var mask = 0;
      for (var i = 0; i < n; i++) { suitCount[suitOf(cards[i])]++; mask |= 1 << rankOf(cards[i]); }
      var flushDraw = cat < FLUSH && (suitCount[0] === 4 || suitCount[1] === 4 || suitCount[2] === 4 || suitCount[3] === 4);
      if (flushDraw) notes.push('flush draw');
      // Straight draw: which single ranks would complete a straight?
      if (cat !== STRAIGHT && cat < FLUSH) {
        var outs = [];
        for (var r = 0; r < 13; r++) {
          if (!(mask & (1 << r)) && straightHigh(mask | (1 << r)) >= 0) outs.push(r);
        }
        if (outs.length === 1) {
          notes.push('gutshot straight draw (any ' + RANK_WORDS[outs[0]] + ')');
        } else if (outs.length >= 2) {
          var words = outs.map(function (x) { return RANK_WORDS[x]; });
          var label = outs.length === 2 ? 'open-ended straight draw' : 'straight draw';
          notes.push(label + ' (any ' + joinWords(words) + ')');
        }
      }
      if (notes.length) draw = capitalize(notes.join(', '));
    }
    return { name: name, draw: draw };
  }

  // ------------------------------------------------------------- equity

  function remainingDeck(known) {
    var used = new Uint8Array(52);
    for (var i = 0; i < known.length; i++) used[known[i]] = 1;
    var d = [];
    for (i = 0; i < 52; i++) if (!used[i]) d.push(i);
    return d;
  }

  /**
   * equity(hole, board, numOpponents, trials, rng)
   * Monte Carlo estimate of hero's chances against numOpponents random hands.
   * Returns { win, tie, lose, trials, stderr } with win/tie/lose as fractions
   * and stderr = sqrt(win * (1 - win) / trials), the standard error of the
   * win estimate.
   */
  function equity(hole, board, numOpponents, trials, rng) {
    rng = rng || Math.random;
    trials = trials || 20000;
    numOpponents = numOpponents || 1;
    var deck = remainingDeck(hole.concat(board));
    var deckLen = deck.length;
    var boardNeed = 5 - board.length;
    var drawCount = numOpponents * 2 + boardNeed;

    var hero = new Array(7);
    var opp = new Array(7);
    hero[0] = hole[0]; hero[1] = hole[1];
    for (var i = 0; i < board.length; i++) { hero[2 + i] = board[i]; opp[2 + i] = board[i]; }

    var wins = 0, ties = 0, losses = 0;
    for (var t = 0; t < trials; t++) {
      // Partial Fisher-Yates: the first drawCount entries are a uniform sample.
      for (i = 0; i < drawCount; i++) {
        var j = i + Math.floor(rng() * (deckLen - i));
        var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
      }
      var k = 0;
      for (i = 0; i < boardNeed; i++) {
        var c = deck[k++];
        hero[2 + board.length + i] = c;
        opp[2 + board.length + i] = c;
      }
      var heroScore = evaluate7(hero);
      var best = -1;
      for (var o = 0; o < numOpponents; o++) {
        opp[0] = deck[k++]; opp[1] = deck[k++];
        var s = evaluate7(opp);
        if (s > best) best = s;
      }
      if (heroScore > best) wins++;
      else if (heroScore === best) ties++;
      else losses++;
    }
    var win = wins / trials;
    return {
      win: win,
      tie: ties / trials,
      lose: losses / trials,
      trials: trials,
      stderr: Math.sqrt(win * (1 - win) / trials)
    };
  }

  /**
   * exactEquity(hole, board, numOpponents)
   * Exhaustive enumeration for the turn (4 board cards) and river (5).
   * Every remaining river card times every assignment of opponent hands.
   * With one opponent this is at most 46 * C(45,2) = 45,540 evaluations
   * on the turn. More opponents grow combinatorially; 2 is still fine,
   * 3 on the turn is very slow. Returns { win, tie, lose, trials, stderr: 0 }.
   */
  function exactEquity(hole, board, numOpponents) {
    numOpponents = numOpponents || 1;
    if (board.length < 4 || board.length > 5) {
      throw new Error('exactEquity supports only the turn or river (4 or 5 board cards)');
    }
    var deck = remainingDeck(hole.concat(board));
    var hero = hole.concat(board);
    var opp = [0, 0].concat(board);
    if (board.length === 4) { hero.push(0); opp.push(0); }

    var wins = 0, ties = 0, losses = 0, total = 0;
    var used = new Uint8Array(52);

    function runBoard() {
      var heroScore = evaluate7(hero);
      // Enumerate ordered opponent hands recursively.
      function rec(o, best) {
        if (o === numOpponents) {
          total++;
          if (heroScore > best) wins++;
          else if (heroScore === best) ties++;
          else losses++;
          return;
        }
        for (var a = 0; a < deck.length; a++) {
          var ca = deck[a];
          if (used[ca]) continue;
          used[ca] = 1;
          for (var b = a + 1; b < deck.length; b++) {
            var cb = deck[b];
            if (used[cb]) continue;
            used[cb] = 1;
            opp[0] = ca; opp[1] = cb;
            var s = evaluate7(opp);
            rec(o + 1, s > best ? s : best);
            used[cb] = 0;
          }
          used[ca] = 0;
        }
      }
      rec(0, -1);
    }

    if (board.length === 5) {
      runBoard();
    } else {
      for (var i = 0; i < deck.length; i++) {
        var river = deck[i];
        used[river] = 1;
        hero[6] = river; opp[6] = river;
        runBoard();
        used[river] = 0;
      }
    }
    return {
      win: wins / total,
      tie: ties / total,
      lose: losses / total,
      trials: total,
      stderr: 0
    };
  }

  /**
   * handMatrix(hole, board, rng, samplesPerClass)
   * Hero's equity against every possible opponent holding, grouped into the
   * standard 13 x 13 grid (169 classes: pairs on the diagonal, suited hands
   * above it, offsuit below). Returns an array of 169 cells in row-major
   * order, rows and columns both running A down to 2:
   *   { label, hi, lo, pair, suited, combos, win, tie, lose, exact }
   * win/tie/lose are fractions over every live combo of that class and
   * every runout. River and turn are exact; the flop enumerates all 990
   * runouts per combo (exact); preflop samples random boards
   * (exact = false), about samplesPerClass per class (default 600).
   * combos = 0 means the class is impossible given the known cards.
   */
  function handMatrix(hole, board, rng, samplesPerClass) {
    rng = rng || Math.random;
    samplesPerClass = samplesPerClass || 600;
    var known = hole.concat(board);
    var used = new Uint8Array(52);
    for (var i = 0; i < known.length; i++) used[known[i]] = 1;
    var boardNeed = 5 - board.length;
    var hero = hole.concat(board);
    var opp = [0, 0].concat(board);
    for (i = 0; i < boardNeed; i++) { hero.push(0); opp.push(0); }
    var exact = boardNeed <= 2;
    var cells = [];

    for (var a = 12; a >= 0; a--) {
      for (var b = 12; b >= 0; b--) {
        var pair = a === b, suited = a > b;
        var hi = a > b ? a : b, lo = a > b ? b : a;
        var label = RANK_CHARS[hi] + RANK_CHARS[lo] + (pair ? '' : suited ? 's' : 'o');
        var combos = [];
        var s1, s2;
        if (pair) {
          for (s1 = 0; s1 < 4; s1++) for (s2 = s1 + 1; s2 < 4; s2++) combos.push([s1 * 13 + a, s2 * 13 + a]);
        } else if (suited) {
          for (s1 = 0; s1 < 4; s1++) combos.push([s1 * 13 + hi, s1 * 13 + lo]);
        } else {
          for (s1 = 0; s1 < 4; s1++) for (s2 = 0; s2 < 4; s2++) if (s1 !== s2) combos.push([s1 * 13 + hi, s2 * 13 + lo]);
        }
        combos = combos.filter(function (c) { return !used[c[0]] && !used[c[1]]; });

        var wins = 0, ties = 0, losses = 0, total = 0;
        var perCombo = Math.ceil(samplesPerClass / Math.max(1, combos.length));
        for (var ci = 0; ci < combos.length; ci++) {
          opp[0] = combos[ci][0]; opp[1] = combos[ci][1];
          used[opp[0]] = 1; used[opp[1]] = 1;
          var deck = [];
          for (var c = 0; c < 52; c++) if (!used[c]) deck.push(c);
          var hs, os;
          if (boardNeed === 0) {
            hs = evaluate7(hero); os = evaluate7(opp); total++;
            if (hs > os) wins++; else if (hs === os) ties++; else losses++;
          } else if (boardNeed === 1) {
            for (var x = 0; x < deck.length; x++) {
              hero[6] = opp[6] = deck[x];
              hs = evaluate7(hero); os = evaluate7(opp); total++;
              if (hs > os) wins++; else if (hs === os) ties++; else losses++;
            }
          } else if (boardNeed === 2) {
            for (x = 0; x < deck.length; x++) {
              hero[5] = opp[5] = deck[x];
              for (var y = x + 1; y < deck.length; y++) {
                hero[6] = opp[6] = deck[y];
                hs = evaluate7(hero); os = evaluate7(opp); total++;
                if (hs > os) wins++; else if (hs === os) ties++; else losses++;
              }
            }
          } else {
            var n = deck.length;
            for (var t = 0; t < perCombo; t++) {
              for (var k = 0; k < boardNeed; k++) {
                var j = k + Math.floor(rng() * (n - k));
                var tmp = deck[k]; deck[k] = deck[j]; deck[j] = tmp;
                hero[2 + board.length + k] = opp[2 + board.length + k] = deck[k];
              }
              hs = evaluate7(hero); os = evaluate7(opp); total++;
              if (hs > os) wins++; else if (hs === os) ties++; else losses++;
            }
          }
          used[opp[0]] = 0; used[opp[1]] = 0;
        }
        cells.push({
          label: label, hi: hi, lo: lo, pair: pair, suited: suited,
          combos: combos.length,
          win: total ? wins / total : 0,
          tie: total ? ties / total : 0,
          lose: total ? losses / total : 0,
          exact: exact
        });
      }
    }
    return cells;
  }

  // Small seedable PRNG (mulberry32) for reproducible tests.
  function seededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    RANK_CHARS: RANK_CHARS,
    SUIT_CHARS: SUIT_CHARS,
    CATEGORY_NAMES: CATEGORY_NAMES,
    cardToString: cardToString,
    stringToCard: stringToCard,
    rankOf: rankOf,
    suitOf: suitOf,
    newDeck: newDeck,
    shuffle: shuffle,
    evaluate7: evaluate7,
    categoryOf: categoryOf,
    handName: handName,
    equity: equity,
    exactEquity: exactEquity,
    handMatrix: handMatrix,
    seededRandom: seededRandom
  };
});
