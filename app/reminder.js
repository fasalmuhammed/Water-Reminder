const $ = (id) => document.getElementById(id);
const scene = $('scene');
const bubble = $('bubble');
const stage = $('stage');
const askActions = $('askActions');
const doneActions = $('doneActions');
const drankBtn = $('drankBtn');
const snoozeBtn = $('snoozeBtn');
const okBtn = $('okBtn');

// ---------- frames ----------

const FRAME_COUNTS = { reminder: 9, drank: 2, snooze: 2 };
const frameSrc = (name, n) => `assets/frames/${name}_${String(n).padStart(2, '0')}.png`;

// Preload every frame so swaps are instant.
for (const [name, count] of Object.entries(FRAME_COUNTS)) {
  for (let n = 1; n <= count; n++) new Image().src = frameSrc(name, n);
}

// Two stacked <img>s crossfade into each other, which smooths the jump
// between still poses.
let front = $('frameA');
let back = $('frameB');

function showFrame(src) {
  back.src = src;
  back.classList.add('front');
  front.classList.remove('front');
  [front, back] = [back, front];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let playId = 0;

// steps: [[animationName, frameNumber, durationMs], ...]
async function play(steps) {
  const id = ++playId;
  stage.classList.remove('idle');
  for (const [name, n, ms] of steps) {
    if (id !== playId) return false;
    showFrame(frameSrc(name, n));
    await sleep(ms);
  }
  if (id === playId) stage.classList.add('idle');
  return id === playId;
}

// neutral → wave, wave → lift glass → point at it → raise the glass
const REMIND_STEPS = [
  ['reminder', 1, 450],
  ['reminder', 2, 320], ['reminder', 3, 320],
  ['reminder', 2, 320], ['reminder', 3, 420],
  ['reminder', 4, 520],
  ['reminder', 5, 380], ['reminder', 6, 380], ['reminder', 7, 380],
  ['reminder', 8, 520],
  ['reminder', 9, 0],
];
const REPEAT_STEPS = REMIND_STEPS.slice(5);

const DRANK_STEPS = [['drank', 1, 1500], ['drank', 2, 0]];
const SNOOZE_STEPS = [
  ['snooze', 1, 280], ['snooze', 2, 280],
  ['snooze', 1, 280], ['snooze', 2, 280],
  ['snooze', 1, 0],
];

// ---------- sound: two soft water drops ----------

function playDrops() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((delay) => {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(1350, t + 0.12);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {}
}

// ---------- bubble & buttons ----------

function say(title, sub) {
  $('title').textContent = title;
  $('sub').textContent = sub;
  bubble.classList.remove('pop');
  void bubble.offsetWidth; // restart the pop animation
  bubble.classList.add('pop');
}

function showButtons(which) {
  askActions.classList.toggle('hidden', which !== 'ask');
  doneActions.classList.toggle('hidden', which !== 'done');
  drankBtn.disabled = snoozeBtn.disabled = false;
}

// ---------- flow ----------

let info = { remindMinutes: 30, snoozeMinutes: 10, glasses: 0, snoozed: false, unit: 'minutes' };
// Test mode runs on seconds, so the wording follows the unit main.js reports.
const shortUnit = () => (info.unit === 'seconds' ? 'sec' : 'min');
let repeatTimer = null;
let closeTimer = null;

function clearTimers() {
  clearInterval(repeatTimer);
  clearTimeout(closeTimer);
}

window.reminder.onStart((startInfo) => {
  info = startInfo;
  clearTimers();
  snoozeBtn.textContent = `⏰ Snooze ${info.snoozeMinutes} ${shortUnit()}`;

  if (info.snoozed) {
    say("I'm back! 💧", 'Snooze is over. Time for that glass of water.');
  } else {
    const count = info.glasses ? ` You've had ${info.glasses} today.` : '';
    say('Time to drink water! 💧', `Stay hydrated, have a glass now.${count}`);
  }
  showButtons('ask');

  scene.classList.remove('leave');
  void scene.offsetWidth;
  scene.classList.add('enter');
  playDrops();
  play(REMIND_STEPS);
  // Replay the "point at the glass" part every so often to catch the eye.
  repeatTimer = setInterval(() => play(REPEAT_STEPS), 15000);
});

function leave() {
  clearTimers();
  playId++;
  scene.classList.remove('enter');
  scene.classList.add('leave');
  setTimeout(() => {
    window.reminder.setInteractive(false);
    window.reminder.hide();
  }, 380);
}

drankBtn.addEventListener('click', async () => {
  drankBtn.disabled = snoozeBtn.disabled = true;
  clearTimers();
  const glasses = await window.reminder.drank();
  say('Great job! 🎉', `That's glass #${glasses} today. I'll remind you again in ${info.remindMinutes} ${info.unit}.`);
  okBtn.textContent = `👍 Okay, see you in ${info.remindMinutes} ${shortUnit()}`;
  showButtons('done');
  play(DRANK_STEPS);
  closeTimer = setTimeout(leave, 8000);
});

snoozeBtn.addEventListener('click', async () => {
  drankBtn.disabled = snoozeBtn.disabled = true;
  clearTimers();
  await window.reminder.snooze();
  say('No problem! 😉', `I'll be back in ${info.snoozeMinutes} ${info.unit}.`);
  showButtons('none');
  await play(SNOOZE_STEPS);
  closeTimer = setTimeout(leave, 1200);
});

okBtn.addEventListener('click', leave);

// ---------- click-through ----------
// The window is transparent; only the bubble, character and buttons take clicks.

let interactive = false;
document.addEventListener('mousemove', (e) => {
  const now = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('.hit');
  if (now !== interactive) {
    interactive = now;
    window.reminder.setInteractive(now);
  }
});
document.documentElement.addEventListener('mouseleave', () => {
  if (interactive) {
    interactive = false;
    window.reminder.setInteractive(false);
  }
});
