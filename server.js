const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const EMPTY_WINNER = '? (승자)';
const RESET_PASSWORD = 'reset!';

let state = {
  teamsHtml: '',
  rounds: [],
  thirdPlaceResult: null,
  updatedAt: null,
};

app.use(express.static(path.join(__dirname, 'public')));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findMatch(rounds, matchId) {
  for (let r = 0; r < rounds.length; r++) {
    const mIdx = rounds[r].findIndex((m) => m.id === matchId);
    if (mIdx !== -1) return { match: rounds[r][mIdx], rIdx: r, mIdx };
  }
  return null;
}

function updateBracketNames(rounds) {
  for (let r = 1; r < rounds.length; r++) {
    rounds[r].forEach((m) => {
      const prevM1 = rounds[r - 1].find((pm) => pm.id === m.t1.sourceMatchId);
      if (prevM1) m.t1.name = prevM1.winner;

      if (!m.isBye) {
        const prevM2 = rounds[r - 1].find((pm) => pm.id === m.t2.sourceMatchId);
        if (prevM2) m.t2.name = prevM2.winner;
      }

      if (!m.isBye) {
        if (m.winner !== EMPTY_WINNER && m.winner !== m.t1.name && m.winner !== m.t2.name) {
          m.winner = EMPTY_WINNER;
        }
      } else {
        m.winner = m.t1.name;
      }
    });
  }
}

function clearThirdPlace() {
  state.thirdPlaceResult = null;
}

function broadcast() {
  state.updatedAt = new Date().toISOString();
  io.emit('state:update', clone(state));
}

function resetTournamentState() {
  state.teamsHtml = '';
  state.rounds = [];
  state.thirdPlaceResult = null;
  state.updatedAt = null;
}

io.on('connection', (socket) => {
  socket.emit('state:update', clone(state));

  socket.on('bracket:create', (payload) => {
    if (!payload || !Array.isArray(payload.rounds)) return;
    state.rounds = clone(payload.rounds);
    state.teamsHtml = String(payload.teamsHtml || '');
    state.thirdPlaceResult = null;
    updateBracketNames(state.rounds);
    broadcast();
  });

  socket.on('winner:select', ({ matchId, slot }) => {
    if (!state.rounds.length) return;
    const found = findMatch(state.rounds, matchId);
    if (!found) return;

    const match = found.match;
    if (match.isBye) return;
    if (match.winner !== EMPTY_WINNER) return; // 이미 승자가 있으면 다른 클릭은 무시

    const clickedName = slot === 1 ? match.t1.name : match.t2.name;
    if (!clickedName || clickedName.includes('?') || clickedName === '부전승 (Bye)') return;

    match.winner = clickedName;
    clearThirdPlace();
    updateBracketNames(state.rounds);
    broadcast();
  });

  socket.on('winner:reset', ({ matchId }) => {
    if (!state.rounds.length) return;
    const found = findMatch(state.rounds, matchId);
    if (!found) return;

    const match = found.match;
    if (match.isBye) return;
    if (match.winner === EMPTY_WINNER) return;

    match.winner = EMPTY_WINNER;
    clearThirdPlace();
    updateBracketNames(state.rounds);
    broadcast();
  });

  socket.on('third:select', ({ third, fourth, first, second }) => {
    if (!third || !fourth || !first || !second) return;
    state.thirdPlaceResult = { third, fourth, first, second };
    broadcast();
  });

  socket.on('tournament:reset', ({ password }) => {
    if (password !== RESET_PASSWORD) {
      socket.emit('reset:failed');
      return;
    }
    resetTournamentState();
    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Live tournament server running on port ${PORT}`);
});
