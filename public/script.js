const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- Toast ---------- */
const toast = $('#toast');
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ---------- Theme toggle ---------- */
const themeBtn = $('#themeBtn');
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? '☀︎' : '⏾';
}
setTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
themeBtn.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

/* ---------- Mobile menu ---------- */
const menuBtn = $('#menuBtn'), nav = $('#nav');
menuBtn.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', open);
});
$$('#nav a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));

/* ---------- YouTube mute / unmute ---------- */
const player = $('#ytPlayer'), muteBtn = $('#muteBtn');
let muted = true;
function ytCommand(func) {
  player.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
}
muteBtn.addEventListener('click', () => {
  muted = !muted;
  ytCommand(muted ? 'mute' : 'unMute');
  muteBtn.textContent = muted ? 'Unmute video' : 'Mute video';
});
$('#watchBtn').addEventListener('click', () => {
  $('.video-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
  ytCommand('playVideo');
});

/* ---------- Like button (shared, real-time) ---------- */
const likeBtn = $('#likeBtn'), likeCount = $('#likeCount'), heart = $('.heart', likeBtn);
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
let liked = false;

function getClientId() {
  try {
    let id = localStorage.getItem('likeClientId');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) ||
           Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('likeClientId', id);
    }
    return id;
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
const clientId = getClientId();

function renderLikes(count) {
  likeCount.textContent = compact.format(count);
  likeBtn.title = count.toLocaleString() + ' likes';
}
function renderLiked() {
  likeBtn.classList.toggle('liked', liked);
  likeBtn.setAttribute('aria-pressed', liked);
  heart.textContent = liked ? '♥' : '♡';
}

// Whether this browser already liked
fetch('/api/likes?clientId=' + encodeURIComponent(clientId))
  .then(r => r.json())
  .then(d => { liked = d.liked; renderLiked(); renderLikes(d.count); })
  .catch(() => {});

// Live count from every visitor
const stream = new EventSource('/api/likes/stream');
stream.onmessage = e => renderLikes(JSON.parse(e.data).count);

likeBtn.addEventListener('click', async () => {
  const next = !liked;
  liked = next;                 // update instantly, then confirm with the server
  renderLiked();
  try {
    const r = await fetch('/api/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, liked: next })
    });
    if (!r.ok) throw new Error();
    const d = await r.json();
    renderLikes(d.count);
    if (next) showToast('Thanks for the love!');
  } catch {
    liked = !next;              // undo if the server couldn't be reached
    renderLiked();
    showToast('Could not save your like. Try again.');
  }
});

/* ---------- Copy link ---------- */
$('#copyBtn')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    showToast('Link copied');
  } catch {
    showToast('Copy failed. Copy it from the address bar.');
  }
});

/* ---------- Carousels (food + team share this code) ---------- */
function initCarousel(root) {
  const track = $('.track', root);
  const slides = $$('.slide', root);
  const dotsBox = $('.dots', root);
  const playPause = $('.playpause', root);
  const interval = Number(root.dataset.interval) || 4000;
  let index = 0, timer;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  slides.forEach((_, i) => {
    const d = document.createElement('button');
    d.setAttribute('aria-label', `Go to slide ${i + 1}`);
    d.addEventListener('click', () => { goTo(i); restart(); });
    dotsBox.appendChild(d);
  });
  const dots = $$('button', dotsBox);

  function goTo(i) {
    index = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((d, n) => d.classList.toggle('active', n === index));
  }
  function restart() {
    clearInterval(timer);
    if (playing) timer = setInterval(() => goTo(index + 1), interval);
  }
  function renderPlay() {
    playPause.textContent = playing ? '⏸' : '▶';
    playPause.setAttribute('aria-label', playing ? 'Pause slideshow' : 'Play slideshow');
  }

  $('.prev', root).addEventListener('click', () => { goTo(index - 1); restart(); });
  $('.next', root).addEventListener('click', () => { goTo(index + 1); restart(); });
  playPause.addEventListener('click', () => { playing = !playing; renderPlay(); restart(); });

  root.tabIndex = 0;
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { goTo(index - 1); restart(); }
    if (e.key === 'ArrowRight') { goTo(index + 1); restart(); }
  });

  // swipe support
  let startX = null;
  root.addEventListener('touchstart', e => startX = e.touches[0].clientX, { passive: true });
  root.addEventListener('touchend', e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) { goTo(index + (dx < 0 ? 1 : -1)); restart(); }
    startX = null;
  });

  renderPlay();
  goTo(0);
  restart();
}
$$('.carousel').forEach(initCarousel);

/* ---------- Tabs ---------- */
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $$('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('#' + tab.dataset.tab).classList.add('active');
  });
});

/* ---------- FAQ: only one open at a time ---------- */
$$('details').forEach(d => {
  d.addEventListener('toggle', () => {
    if (d.open) $$('details').forEach(o => { if (o !== d) o.open = false; });
  });
});

/* ---------- Newsletter form ---------- */
const form = $('#newsForm'), email = $('#email'), msg = $('#formMsg');
form.addEventListener('submit', e => {
  e.preventDefault();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
  msg.className = 'msg ' + (ok ? 'ok' : 'err');
  msg.textContent = ok
    ? "You're in! Check your inbox on Friday."
    : 'Enter a valid email, like name@example.com.';
  if (ok) form.reset();
});

/* ---------- Back to top ---------- */
const toTop = $('#toTop');
addEventListener('scroll', () => toTop.classList.toggle('show', scrollY > 500), { passive: true });
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));