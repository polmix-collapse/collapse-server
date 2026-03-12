const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling']
});

// КОНФИГУРАЦИЯ
const START_ZONE = { position: [53.160066, 24.491418], radius: 7 };

const SAFE_TREES = [
  { id: 'tree_1', position: [53.158571, 24.491794], radius: 4.5 },
  { id: 'tree_2', position: [53.159110, 24.491706], radius: 4.5 },
  { id: 'tree_3', position: [53.159214, 24.491703], radius: 4.5 },
  { id: 'tree_4', position: [53.159408, 24.491648], radius: 4.5 },
  { id: 'tree_5', position: [53.159913, 24.491792], radius: 4.5 },
  { id: 'tree_6', position: [53.160092, 24.491695], radius: 4.5 }
];

const HAUNTER_VARIANTS = {
  'обычный': { name: 'Страшноезд', sound: 'scaryride.mp3', reactionTime: 10 },
  'нетороп': { name: 'Нетороп', sound: 'slower.mp3', reactionTime: 30 },
  'поспех': { name: 'Поспех', sound: 'rusher.mp3', reactionTime: 5 }
};

const START_MUSIC = ['start_1.mp3', 'start_2.mp3', 'start_3.mp3', 'start_4.mp3', 'start_5.mp3'];
const DEATH_SOUND = 'death.mp3';

// СОСТОЯНИЕ
let gameStarted = false;
let players = new Map();
let haunterTimer = null;
let gameId = 'game_' + Date.now();

// ФУНКЦИИ
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)*Math.sin(Δφ/2) + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)*Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function isInStartZone(pos) {
  return calculateDistance(pos[0], pos[1], START_ZONE.position[0], START_ZONE.position[1]) <= START_ZONE.radius;
}

function isPlayerSafe(pos) {
  for (let tree of SAFE_TREES) {
    if (calculateDistance(pos[0], pos[1], tree.position[0], tree.position[1]) <= tree.radius) return true;
  }
  return false;
}

function getAlivePlayers() {
  return Array.from(players.values()).filter(p => p.alive);
}

function broadcastSound(sound) {
  io.emit('play_sound', { sound, gameId });
}

function killPlayer(playerId, type) {
  let p = players.get(playerId);
  if (!p || !p.alive) return;
  p.alive = false;
  io.to(playerId).emit('play_sound', { sound: DEATH_SOUND, gameId });
  io.emit('player_died', { playerId, playerName: p.name, cause: type, gameId });
  setTimeout(() => {
    if (players.has(playerId)) { 
      players.get(playerId).alive = true; 
      io.to(playerId).emit('respawned'); 
    }
  }, 30000);
}

function checkHaunterSurvival(type) {
  getAlivePlayers().forEach(p => { 
    if (!isPlayerSafe(p.position)) killPlayer(p.id, type); 
  });
}

function spawnHaunter() {
  let types = Object.keys(HAUNTER_VARIANTS);
  let rand = types[Math.floor(Math.random() * types.length)];
  let h = HAUNTER_VARIANTS[rand];
  broadcastSound(h.sound);
  setTimeout(() => checkHaunterSurvival(rand), h.reactionTime * 1000);
  let delay = (Math.random() * 60 + 30) * 1000;
  if (haunterTimer) clearTimeout(haunterTimer);
  haunterTimer = setTimeout(spawnHaunter, delay);
}

function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  gameId = 'game_' + Date.now();
  broadcastSound(START_MUSIC[Math.floor(Math.random() * START_MUSIC.length)]);
  let delay = (Math.random() * 60 + 30) * 1000;
  haunterTimer = setTimeout(spawnHaunter, delay);
}

// ROUTES
app.get('/', (req, res) => res.send('✅ Collapse Research Center Server Online'));
app.get('/status', (req, res) => res.json({ gameStarted, gameId, players: players.size, alive: getAlivePlayers().length }));
// SOCKET
io.on('connection', (socket) => {
  players.set(socket.id, { 
    id: socket.id, 
    position: null, 
    alive: true, 
    name: 'Игрок_' + Math.floor(Math.random()*1000) 
  });
  
  socket.emit('game_config', { 
    startZone: START_ZONE, 
    safeTrees: SAFE_TREES, 
    haunterVariants: HAUNTER_VARIANTS, 
    gameId 
  });
  
  socket.on('update_position', (pos) => {
    let p = players.get(socket.id);
    if (p) { 
      p.position = pos; 
      if (!gameStarted && isInStartZone(pos)) startGame(); 
    }
  });
  
  socket.on('disconnect', () => { 
    players.delete(socket.id); 
    if (players.size === 0) { 
      gameStarted = false; 
      if (haunterTimer) clearTimeout(haunterTimer); 
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Сервер на порту ' + PORT);
});
