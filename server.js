const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const EMPTY_WINNER = '? (승자)';
const RESET_PASSWORD = 'reset!';

let state = {
  teamsHtml: '',
  rounds: [],
  thirdPlaceResult: null
};

app.use(express.static(path.join(__dirname, 'public')));

function findMatch(matchId) {
  for (const round of state.rounds) {
    for (const match of round) {
      if (match.id === matchId) return match;
    }
  }
  return null;
}

function updateBracketNames() {
  for (let r = 1; r < state.rounds.length; r++) {
    state.rounds[r].forEach((match) => {
      const prevM1 = state.rounds[r - 1].find((pm) => pm.id === match.t1.sourceMatchId);
      if (prevM1) match.t1.name = prevM1.winner;

      if (!match.isBye) {
        const prevM2 = state.rounds[r - 1].find((pm) => pm.id === match.t2.sourceMatchId);
        if (prevM2) match.t2.name = prevM2.winner;
      }

      if (!match.isBye) {
        if (match.winner !== EMPTY_WINNER && match.winner !== match.t1.name && match.winner !== match.t2.name) {
          match.winner = EMPTY_WINNER;
        }
      } else {
        match.winner = match.t1.name;
      }
    });
  }
}

function broadcastState() {
  io.emit('state:update', state);
}

io.on('connection', (socket) => {
  socket.emit('state:update', state);

  socket.on('bracket:create', ({ teamsHtml, rounds }) => {
    state = {
      teamsHtml: teamsHtml || '',
      rounds: Array.isArray(rounds) ? rounds : [],
      thirdPlaceResult: null
    };
    broadcastState();
  });

  socket.on('winner:select', ({ matchId, slot }) => {
    const match = findMatch(matchId);
    if (!match || match.isBye) return;
    if (match.winner !== EMPTY_WINNER) return;

    const selectedName = Number(slot) === 1 ? match.t1.name : match.t2.name;
    if (!selectedName || selectedName.includes('?') || selectedName === '부전승 (Bye)') return;

    match.winner = selectedName;
    state.thirdPlaceResult = null;
    updateBracketNames();
    broadcastState();
  });

  socket.on('winner:reset', ({ matchId }) => {
    const match = findMatch(matchId);
    if (!match || match.isBye) return;
    if (match.winner === EMPTY_WINNER) return;

    match.winner = EMPTY_WINNER;
    state.thirdPlaceResult = null;
    updateBracketNames();
    broadcastState();
  });

  socket.on('third:select', ({ third, fourth, first, second }) => {
    state.thirdPlaceResult = { third, fourth, first, second };
    broadcastState();
  });

  socket.on('tournament:reset', ({ password }) => {
    if (password !== RESET_PASSWORD) {
      socket.emit('reset:failed');
      return;
    }

    state = {
      teamsHtml: '',
      rounds: [],
      thirdPlaceResult: null
    };

    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Tournament server running on port ${PORT}`);
});
