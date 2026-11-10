const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'likes.json');

/* ---------- State: a set of anonymous client IDs who liked ---------- */
let likers = new Set();
try {
  likers = new Set(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).likers || []);
} catch { /* first run */ }

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify({ likers: [...likers] }), () => {});
  }, 500);
}

/* ---------- Live connections ---------- */
const clients = new Set();
function broadcast() {
  const msg = `data: ${JSON.stringify({ count: likers.size })}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

/* ---------- Basic rate limit: 30 likes per minute per IP ---------- */
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 30;
}
setInterval(() => hits.clear(), 10 * 60 * 1000);

app.set('trust proxy', 1);
app.use(express.json({ limit: '1kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const validId = id => typeof id === 'string' && /^[\w-]{8,64}$/.test(id);

/* Current count + whether this client already liked */
app.get('/api/likes', (req, res) => {
  res.json({ count: likers.size, liked: validId(req.query.clientId) && likers.has(req.query.clientId) });
});

/* Live stream of the count */
app.get('/api/likes/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n');
  res.write(`data: ${JSON.stringify({ count: likers.size })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

/* Like / unlike */
app.post('/api/like', (req, res) => {
  const { clientId, liked } = req.body || {};
  if (!validId(clientId) || typeof liked !== 'boolean') {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (limited(req.ip)) return res.status(429).json({ error: 'Too many requests' });

  const had = likers.has(clientId);
  if (liked && !had) likers.add(clientId);
  if (!liked && had) likers.delete(clientId);
  if (liked !== had) { save(); broadcast(); }

  res.json({ count: likers.size, liked: likers.has(clientId) });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});