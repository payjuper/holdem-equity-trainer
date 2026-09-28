// worker.js - runs the simulations off the main thread.
// Messages in:
//   { type: 'equity', id, hole, board, numOpponents, trials }
//   { type: 'matrix', id, hole, board }
// Messages out: the same object shape plus the results, echoing type and id.
importScripts('poker.js');

self.onmessage = function (e) {
  var m = e.data;
  var result;
  if (m.type === 'matrix') {
    result = { type: 'matrix', cells: Poker.handMatrix(m.hole, m.board) };
  } else {
    result = Poker.equity(m.hole, m.board, m.numOpponents || 1, m.trials || 20000);
    result.type = 'equity';
  }
  result.id = m.id;
  self.postMessage(result);
};
