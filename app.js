// app.js - UI for the equity trainer. All poker logic lives in poker.js.
(function () {
  'use strict';

  var TRIALS = 20000;
  var STREETS = ['preflop', 'flop', 'turn', 'river'];
  var BOARD_COUNT = [0, 3, 4, 5];
  var SUIT_SYMBOLS = ['♣', '♦', '♥', '♠']; // c d h s
  var SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];

  // ------------------------------------------------------------ state
  var state = {
    hole: [],
    opponents: [],     // array of [card, card]
    board: [],         // all five, revealed progressively
    street: 0,         // 0 preflop .. 3 river
    equities: [null, null, null, null],   // {win,tie,lose,stderr} per street
    matrix: null,      // 169 cells for the current street
    numOpponents: 1,
    guessMode: false,
    awaitingGuess: false,
    computing: false,
    showdownDone: false,
    requestId: 0,
    guessed: [false, false, false, false], // streets already guessed this hand
    errors: []         // absolute guess errors this session, in percentage points
  };

  // ------------------------------------------------------------ dom
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    opponentsSelect: $('opponents'),
    guessMode: $('guessMode'),
    opponentsRow: $('opponents-row'),
    streetLabel: $('street-label'),
    board: $('board'),
    showdown: $('showdown'),
    hole: $('hole'),
    deal: $('deal'),
    newHand: $('new'),
    bigPct: $('big-pct'),
    bigNum: $('big-pct').querySelector('.num'),
    guessBox: $('guess-box'),
    guessInput: $('guess-input'),
    guessSubmit: $('guess-submit'),
    barWin: $('bar-win'),
    barTie: $('bar-tie'),
    winPct: $('win-pct'),
    tiePct: $('tie-pct'),
    losePct: $('lose-pct'),
    guessResult: $('guess-result'),
    matrix: $('matrix'),
    matrixVeil: $('matrix-veil'),
    matrixFoot: $('matrix-foot'),
    handName: $('hand-name'),
    handDraw: $('hand-draw'),
    chart: $('chart'),
    chartNote: $('chart-note'),
    footTrials: $('foot-trials'),
    footMae: $('foot-mae'),
    footErr: $('foot-err')
  };

  // ------------------------------------------------------------ worker
  var worker = null;
  var workerBroken = false;
  function startWorker() {
    try {
      worker = new Worker('worker.js');
      worker.onmessage = function (e) {
        if (e.data.type === 'matrix') onMatrixResult(e.data); else onEquityResult(e.data);
      };
      worker.onerror = function (err) {
        // Typically file:// in Chrome, which blocks workers. Fall back to
        // computing on the main thread (20k trials takes a few ms anyway).
        console.warn('Worker unavailable, computing on main thread instead.', err && err.message);
        workerBroken = true;
        worker = null;
        if (state.computing) computeInline(state.requestId);
      };
    } catch (e) {
      workerBroken = true;
      worker = null;
    }
  }

  function computeInline(id) {
    setTimeout(function () {
      var visible = state.board.slice(0, BOARD_COUNT[state.street]);
      var r = Poker.equity(state.hole, visible, state.numOpponents, TRIALS);
      r.id = id;
      onEquityResult(r);
      setTimeout(function () {
        onMatrixResult({ id: id, cells: Poker.handMatrix(state.hole, visible) });
      }, 0);
    }, 0);
  }

  function requestEquity() {
    state.requestId++;
    state.computing = true;
    var msg = {
      id: state.requestId,
      hole: state.hole,
      board: state.board.slice(0, BOARD_COUNT[state.street]),
      numOpponents: state.numOpponents,
      trials: TRIALS
    };
    state.matrix = null;
    renderMatrix();
    renderStats();
    if (worker && !workerBroken) {
      msg.type = 'equity';
      worker.postMessage(msg);
      worker.postMessage({ type: 'matrix', id: msg.id, hole: msg.hole, board: msg.board });
    } else {
      computeInline(msg.id);
    }
  }

  function onMatrixResult(r) {
    if (r.id !== state.requestId) return;
    state.matrix = r.cells;
    renderMatrix();
  }

  function onEquityResult(r) {
    if (r.id !== state.requestId) return; // stale result from an old hand
    state.computing = false;
    state.equities[state.street] = r;
    if (state.guessMode) {
      state.awaitingGuess = true;
      el.guessResult.textContent = '';
      el.guessResult.className = 'guess-result';
    }
    renderStats();
    renderChart();
    renderMatrix();
    updateButtons();
    if (state.guessMode) {
      el.guessInput.value = '';
      el.guessInput.focus();
    } else if (state.street === 3) {
      showdown();
    }
  }

  // ------------------------------------------------------------ hand flow
  function newHand() {
    var deck = Poker.shuffle(Poker.newDeck());
    var k = 0;
    state.hole = [deck[k++], deck[k++]];
    state.opponents = [];
    for (var i = 0; i < state.numOpponents; i++) state.opponents.push([deck[k++], deck[k++]]);
    state.board = deck.slice(k, k + 5);
    state.street = 0;
    state.equities = [null, null, null, null];
    state.guessed = [false, false, false, false];
    state.awaitingGuess = false;
    state.showdownDone = false;
    el.showdown.hidden = true;
    el.guessResult.textContent = '';
    el.guessResult.className = 'guess-result';
    el.chartNote.textContent = 'Watch how the number moves as each card lands.';
    renderTable();
    renderHand();
    renderChart();
    updateButtons();
    requestEquity();
  }

  function dealNext() {
    if (state.street >= 3 || state.awaitingGuess || state.computing) return;
    state.street++;
    renderTable();
    renderHand();
    updateButtons();
    requestEquity();
  }

  function showdown() {
    if (state.showdownDone) return;
    state.showdownDone = true;
    var heroScore = Poker.evaluate7(state.hole.concat(state.board));
    var best = heroScore;
    var oppScores = state.opponents.map(function (h) {
      var s = Poker.evaluate7(h.concat(state.board));
      if (s > best) best = s;
      return s;
    });
    var heroWins = heroScore === best;
    var winners = [];
    oppScores.forEach(function (s, i) { if (s === best) winners.push(i); });

    // Flip opponent cards.
    var opps = el.opponentsRow.querySelectorAll('.opponent');
    state.opponents.forEach(function (h, i) {
      var node = opps[i];
      var cards = node.querySelector('.cards');
      cards.innerHTML = '';
      cards.appendChild(cardNode(h[0], 'small'));
      cards.appendChild(cardNode(h[1], 'small'));
      node.querySelector('.result').textContent = Poker.handName(h.concat(state.board)).name;
      if (oppScores[i] === best) node.classList.add('winner');
    });

    var msg;
    var heroName = Poker.handName(state.hole.concat(state.board)).name;
    if (heroWins && winners.length === 0) {
      msg = 'You win with ' + heroName.toLowerCase();
      el.showdown.className = 'showdown win';
      el.hole.parentNode.classList.add('winner');
    } else if (heroWins) {
      msg = 'Chop with ' + winners.map(function (i) { return 'opponent ' + (i + 1); }).join(' and ');
      el.showdown.className = 'showdown';
      el.hole.parentNode.classList.add('winner');
    } else {
      var w = winners.length === 1 ? 'Opponent ' + (winners[0] + 1) + ' wins' :
        'Opponents ' + winners.map(function (i) { return i + 1; }).join(' and ') + ' chop';
      msg = w + ' with ' + Poker.handName(state.opponents[winners[0]].concat(state.board)).name.toLowerCase();
      el.showdown.className = 'showdown';
    }
    el.showdown.textContent = msg;
    el.showdown.hidden = false;
  }

  // ------------------------------------------------------------ guessing
  function submitGuess() {
    if (!state.awaitingGuess) return;
    var v = parseFloat(el.guessInput.value);
    if (isNaN(v)) { el.guessInput.focus(); return; }
    v = Math.max(0, Math.min(100, v));
    var actual = state.equities[state.street].win * 100;
    var err = Math.abs(v - actual);
    state.errors.push(err);
    state.guessed[state.street] = true;
    state.awaitingGuess = false;
    var cls = err <= 5 ? 'good' : err >= 15 ? 'bad' : '';
    el.guessResult.className = 'guess-result ' + cls;
    el.guessResult.innerHTML = 'You guessed <strong>' + v.toFixed(1) + '%</strong>, actual ' +
      actual.toFixed(1) + '%, off by <strong>' + err.toFixed(1) + '</strong> points.';
    renderStats();
    renderChart();
    renderMatrix();
    updateButtons();
    if (state.street === 3) showdown();
    el.deal.focus();
  }

  // ------------------------------------------------------------ rendering
  function cardNode(card, sizeClass) {
    var d = document.createElement('div');
    var rank = Poker.rankOf(card), suit = Poker.suitOf(card);
    d.className = 'card ' + (sizeClass || '') + ((suit === 1 || suit === 2) ? ' red' : '');
    var rc = Poker.RANK_CHARS[rank] === 'T' ? '10' : Poker.RANK_CHARS[rank];
    d.setAttribute('aria-label', rc + ' of ' + SUIT_NAMES[suit]);
    d.innerHTML = '<div class="rank">' + rc + '</div><div class="suit">' + SUIT_SYMBOLS[suit] + '</div>';
    return d;
  }

  function backNode(sizeClass) {
    var d = document.createElement('div');
    d.className = 'card back ' + (sizeClass || '');
    d.setAttribute('aria-label', 'face-down card');
    return d;
  }

  function slotNode(label) {
    var d = document.createElement('div');
    d.className = 'slot';
    d.textContent = label;
    return d;
  }

  function renderTable() {
    // Opponents (face down until showdown).
    el.opponentsRow.innerHTML = '';
    state.opponents.forEach(function (h, i) {
      var node = document.createElement('div');
      node.className = 'opponent';
      var who = document.createElement('div');
      who.className = 'who';
      who.textContent = state.opponents.length === 1 ? 'Opponent' : 'Opponent ' + (i + 1);
      var cards = document.createElement('div');
      cards.className = 'cards';
      cards.appendChild(backNode('small'));
      cards.appendChild(backNode('small'));
      var res = document.createElement('div');
      res.className = 'result';
      node.appendChild(who); node.appendChild(cards); node.appendChild(res);
      el.opponentsRow.appendChild(node);
    });
    el.hole.parentNode.classList.remove('winner');

    // Board.
    el.streetLabel.textContent = 'Board · ' + STREETS[state.street];
    var shown = BOARD_COUNT[state.street];
    var existing = el.board.children.length;
    // Rebuild fully on a new hand (street 0), otherwise only swap slots
    // for cards so already-shown cards do not re-animate.
    if (state.street === 0 || existing !== 5) {
      el.board.innerHTML = '';
      for (var i = 0; i < 5; i++) {
        el.board.appendChild(i < shown ? cardNode(state.board[i]) : slotNode(i < 3 ? 'flop' : i === 3 ? 'turn' : 'river'));
      }
    } else {
      for (i = 0; i < shown; i++) {
        if (el.board.children[i].classList.contains('slot')) {
          el.board.replaceChild(cardNode(state.board[i]), el.board.children[i]);
        }
      }
    }

    // Hero.
    if (state.street === 0) {
      el.hole.innerHTML = '';
      el.hole.appendChild(cardNode(state.hole[0], 'big'));
      el.hole.appendChild(cardNode(state.hole[1], 'big'));
    }
  }

  function renderHand() {
    var cards = state.hole.concat(state.board.slice(0, BOARD_COUNT[state.street]));
    var h = Poker.handName(cards);
    el.handName.textContent = h.name;
    el.handDraw.textContent = h.draw;
  }

  function cellColor(e) {
    // e = hero equity vs this hand, 0..1. Red when behind, grey at 50%, green ahead.
    // Vivid red at 0%, flat amber across the 45-55% coin-flip band, vivid
    // green at 100%. Same stops as the legend bar in style.css.
    var t = Math.max(0, Math.min(1, e));
    var stops = [
      [0.00, [200, 16, 46]],
      [0.30, [176, 58, 40]],
      [0.45, [196, 150, 40]],
      [0.55, [196, 150, 40]],
      [0.70, [96, 158, 60]],
      [1.00, [22, 194, 106]]
    ];
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i];
        var k = (t - a[0]) / (b[0] - a[0]);
        var c = [0, 1, 2].map(function (j) { return Math.round(a[1][j] + (b[1][j] - a[1][j]) * k); });
        return 'rgb(' + c.join(',') + ')';
      }
    }
    return 'rgb(22,194,106)';
  }

  function renderMatrix() {
    var cells = state.matrix;
    // In guess-first mode keep the cover up from the moment a street is dealt
    // until its guess is in, so nothing flashes underneath.
    el.matrixVeil.hidden = !(state.guessMode && !state.guessed[state.street]);
    if (!cells) {
      if (!el.matrix.children.length) {
        for (var i = 0; i < 169; i++) {
          var d = document.createElement('div');
          d.className = 'cell pending';
          el.matrix.appendChild(d);
        }
      } else {
        for (i = 0; i < 169; i++) { el.matrix.children[i].className = 'cell pending'; el.matrix.children[i].style.background = ''; el.matrix.children[i].title = ''; }
      }
      el.matrixFoot.textContent = state.computing ? 'Computing\u2026' : '';
      return;
    }
    var ahead = 0, behind = 0, flip = 0, total = 0;
    for (i = 0; i < 169; i++) {
      var c = cells[i];
      var node = el.matrix.children[i];
      node.textContent = c.label;
      if (c.combos === 0) {
        node.className = 'cell dead' + (c.pair ? ' pair' : '');
        node.style.background = '';
        node.title = c.label + ': impossible, those cards are already out';
        continue;
      }
      var e = c.win + c.tie / 2;
      node.className = 'cell' + (c.pair ? ' pair' : '');
      node.style.background = cellColor(e);
      node.title = c.label + ' \u00b7 ' + c.combos + (c.combos === 1 ? ' combo' : ' combos') +
        '\nyou win ' + (c.win * 100).toFixed(1) + '%  tie ' + (c.tie * 100).toFixed(1) + '%  lose ' + (c.lose * 100).toFixed(1) + '%';
      total += c.combos;
      if (e > 0.55) ahead += c.combos; else if (e < 0.45) behind += c.combos; else flip += c.combos;
    }
    var pct = function (n) { return Math.round(n / total * 100) + '%'; };
    el.matrixFoot.innerHTML = 'Ahead of <strong>' + pct(ahead) + '</strong> of hands, behind <strong>' + pct(behind) +
      '</strong>, coin flip vs <strong>' + pct(flip) + '</strong> (' + total + ' combos, ' +
      (cells[0].exact ? 'exact' : 'sampled') + ').';
  }

  function renderStats() {
    var e = state.equities[state.street];
    var hidden = state.awaitingGuess;
    el.guessBox.hidden = !hidden;
    el.bigPct.classList.toggle('hidden-value', hidden);

    if (state.computing || !e) {
      el.bigPct.classList.add('pending');
      el.bigNum.textContent = '…';
      el.winPct.textContent = el.tiePct.textContent = el.losePct.textContent = '--';
      el.footErr.textContent = '±--';
    } else if (hidden) {
      el.winPct.textContent = el.tiePct.textContent = el.losePct.textContent = '?';
      el.barWin.style.width = '0%';
      el.barTie.style.width = '0%';
      el.footErr.textContent = '±' + (e.stderr * 100).toFixed(2) + '%';
    } else {
      el.bigPct.classList.remove('pending');
      el.bigNum.textContent = (e.win * 100).toFixed(1);
      el.winPct.textContent = (e.win * 100).toFixed(1) + '%';
      el.tiePct.textContent = (e.tie * 100).toFixed(1) + '%';
      el.losePct.textContent = (e.lose * 100).toFixed(1) + '%';
      el.barWin.style.width = (e.win * 100) + '%';
      el.barTie.style.width = (e.tie * 100) + '%';
      el.footErr.textContent = '±' + (e.stderr * 100).toFixed(2) + '%';
    }
    if (state.computing || !e) {
      el.barWin.style.width = '0%';
      el.barTie.style.width = '0%';
    }
    el.footTrials.textContent = (workerBroken ? 'Monte Carlo (main thread) · ' : 'Monte Carlo · ') +
      TRIALS.toLocaleString() + ' trials';
    if (state.errors.length) {
      var sum = 0;
      state.errors.forEach(function (x) { sum += x; });
      el.footMae.textContent = 'Guess MAE ' + (sum / state.errors.length).toFixed(1) + ' pts (n=' + state.errors.length + ')';
    } else {
      el.footMae.textContent = '';
    }
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    var n = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function renderChart() {
    var svg = el.chart;
    svg.innerHTML = '';
    var xs = [50, 140, 230, 320];
    var yOf = function (p) { return 120 - p * 100; };
    [0, 0.5, 1].forEach(function (p, i) {
      svg.appendChild(svgEl('line', { x1: 20, y1: yOf(p), x2: 330, y2: yOf(p), stroke: i === 0 ? '#333c40' : '#262d30', 'stroke-width': 1 }));
      svg.appendChild(svgEl('text', { x: 0, y: yOf(p) + 4, 'font-size': 10, fill: '#6f7b77' }, String(p * 100)));
    });
    var pts = [];
    state.equities.forEach(function (e, i) {
      var revealed = e && !(state.awaitingGuess && i === state.street);
      if (revealed) pts.push(xs[i] + ',' + yOf(e.win));
    });
    if (pts.length > 1) {
      svg.appendChild(svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: '#e0b458', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
    }
    state.equities.forEach(function (e, i) {
      var revealed = e && !(state.awaitingGuess && i === state.street);
      if (revealed) {
        var y = yOf(e.win);
        svg.appendChild(svgEl('circle', { cx: xs[i], cy: y, r: 5, fill: '#e0b458' }));
        var above = y > 40;
        svg.appendChild(svgEl('text', { x: xs[i], y: above ? y - 12 : y + 18, 'font-size': 11, fill: '#e9ecea', 'text-anchor': 'middle' }, Math.round(e.win * 100) + '%'));
      } else {
        svg.appendChild(svgEl('circle', { cx: xs[i], cy: 120, r: 5, fill: '#181d20', stroke: '#6f7b77', 'stroke-width': 2 }));
      }
      svg.appendChild(svgEl('text', { x: xs[i], y: 140, 'font-size': 11, fill: revealed ? '#9aa5a1' : '#6f7b77', 'text-anchor': 'middle' }, STREETS[i]));
    });

    // Note about the latest move.
    var s = state.street;
    if (s > 0 && state.equities[s] && state.equities[s - 1] && !state.awaitingGuess) {
      var delta = (state.equities[s].win - state.equities[s - 1].win) * 100;
      var abs = Math.abs(delta).toFixed(0);
      var note;
      if (Math.abs(delta) < 3) note = 'The ' + STREETS[s] + ' barely moved your equity.';
      else if (delta > 0) note = 'The ' + STREETS[s] + ' raised your equity by ' + abs + ' points.';
      else note = 'The ' + STREETS[s] + ' cut your equity by ' + abs + ' points.';
      el.chartNote.textContent = note;
    }
  }

  function updateButtons() {
    var labels = ['Deal flop', 'Deal turn', 'Deal river', 'Showdown'];
    el.deal.textContent = labels[state.street];
    el.deal.disabled = state.street >= 3 || state.awaitingGuess || state.computing;
  }

  // ------------------------------------------------------------ events
  el.deal.addEventListener('click', dealNext);
  el.newHand.addEventListener('click', newHand);
  el.opponentsSelect.addEventListener('change', function () {
    state.numOpponents = parseInt(el.opponentsSelect.value, 10);
    newHand();
  });
  el.guessMode.addEventListener('change', function () {
    state.guessMode = el.guessMode.checked;
    var e = state.equities[state.street];
    if (!state.guessMode && state.awaitingGuess) {
      // Turned off mid-guess: reveal the value right away.
      state.awaitingGuess = false;
      if (state.street === 3) showdown();
    } else if (state.guessMode && e && !state.computing && !state.guessed[state.street]) {
      // Turned on with a value already showing: hide it and ask for a guess.
      state.awaitingGuess = true;
      el.guessResult.textContent = '';
      el.guessResult.className = 'guess-result';
      el.guessInput.value = '';
      setTimeout(function () { el.guessInput.focus(); }, 0);
    }
    renderStats();
    renderChart();
    renderMatrix();
    updateButtons();
  });
  // Only allow a number from 0 to 100 with at most one decimal place.
  el.guessInput.addEventListener('input', function () {
    var v = el.guessInput.value.replace(/[^0-9.]/g, '');
    var parts = v.split('.');
    var whole = parts[0].slice(0, 3);
    var frac = parts.length > 1 ? parts[1].slice(0, 1) : null;
    if (whole && parseInt(whole, 10) > 100) whole = '100';
    v = frac === null ? whole : whole + '.' + frac;
    if (whole === '100' && frac) v = '100';
    if (v !== el.guessInput.value) el.guessInput.value = v;
  });
  el.guessSubmit.addEventListener('click', submitGuess);
  el.guessInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = (t.tagName || '').toLowerCase();
    if (tag === 'select' || tag === 'textarea' || (tag === 'input' && t.type !== 'checkbox')) return;
    if (tag === 'input' && e.key === ' ') return; // let Space toggle the checkbox
    if (e.key === ' ') { e.preventDefault(); dealNext(); }
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newHand(); }
  });
  // A focused button would also "click" on Space; keep a single deal per press.
  document.addEventListener('keyup', function (e) {
    if (e.key === ' ' && (e.target.tagName || '').toLowerCase() === 'button') e.preventDefault();
  });

  // ------------------------------------------------------------ boot
  startWorker();
  state.numOpponents = parseInt(el.opponentsSelect.value, 10);
  state.guessMode = el.guessMode.checked;
  newHand();
})();
