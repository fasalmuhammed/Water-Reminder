const { app, BrowserWindow, Tray, Menu, ipcMain, screen, Notification, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

// `npm run test-mode` shortens the intervals so the flow can be tried quickly.
const TEST_MODE = process.argv.includes('--test');
const MINUTE = TEST_MODE ? 1000 : 60 * 1000;
const REMIND_MINUTES = 30;
const SNOOZE_MINUTES = 10;

const WIN_W = 380;
const WIN_H = 620;
const MARGIN = 12;

let tray = null;
let reminderWin = null;
let reminderLoaded = null;
let nextReminderAt = 0;
let paused = false;
let reminderShowing = false;
let lastWasSnooze = false;

// ---------- persisted state (glasses drunk today) ----------

const statePath = () => path.join(app.getPath('userData'), 'state.json');
const today = () => new Date().toISOString().slice(0, 10);

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    if (s.date === today()) return s;
  } catch {}
  return { date: today(), glasses: 0 };
}

function saveState(s) {
  try {
    fs.writeFileSync(statePath(), JSON.stringify(s));
  } catch {}
}

let state;

function glassesToday() {
  if (state.date !== today()) state = { date: today(), glasses: 0 };
  return state.glasses;
}

// ---------- scheduling ----------

function scheduleIn(minutes) {
  nextReminderAt = Date.now() + minutes * MINUTE;
  refreshTray();
}

// A wall-clock check (instead of one long setTimeout) keeps working correctly
// after the PC sleeps or hibernates.
function tick() {
  if (!paused && !reminderShowing && Date.now() >= nextReminderAt) showReminder();
}

// ---------- reminder window ----------

function createReminderWindow() {
  reminderWin = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });
  reminderWin.setAlwaysOnTop(true, 'screen-saver');
  reminderLoaded = reminderWin.loadFile(path.join(__dirname, 'reminder.html'));
}

function positionWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  reminderWin.setBounds({
    x: workArea.x + workArea.width - WIN_W - MARGIN,
    y: workArea.y + workArea.height - WIN_H,
    width: WIN_W,
    height: WIN_H,
  });
}

async function showReminder() {
  if (reminderShowing) return;
  reminderShowing = true;
  await reminderLoaded;
  positionWindow();
  // Transparent areas let clicks through until the pointer is over the character or buttons.
  reminderWin.setIgnoreMouseEvents(true, { forward: true });
  reminderWin.showInactive();
  reminderWin.webContents.send('reminder:start', {
    snoozed: lastWasSnooze,
    glasses: glassesToday(),
    remindMinutes: REMIND_MINUTES,
    snoozeMinutes: SNOOZE_MINUTES,
    unit: TEST_MODE ? 'seconds' : 'minutes',
  });
  refreshTray();
}

function hideReminder() {
  reminderShowing = false;
  reminderWin.hide();
  refreshTray();
}

ipcMain.handle('reminder:drank', () => {
  glassesToday();
  state.glasses += 1;
  saveState(state);
  lastWasSnooze = false;
  scheduleIn(REMIND_MINUTES);
  return state.glasses;
});

ipcMain.handle('reminder:snooze', () => {
  lastWasSnooze = true;
  scheduleIn(SNOOZE_MINUTES);
});

ipcMain.on('reminder:hide', hideReminder);

ipcMain.on('reminder:mouse', (_e, interactive) => {
  if (!reminderWin) return;
  if (interactive) reminderWin.setIgnoreMouseEvents(false);
  else reminderWin.setIgnoreMouseEvents(true, { forward: true });
});

// ---------- tray ----------

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function refreshTray() {
  if (!tray) return;
  let status;
  if (paused) status = 'Reminders paused';
  else if (reminderShowing) status = 'Reminder on screen';
  else status = `Next reminder at ${timeLabel(nextReminderAt)}`;

  const glasses = glassesToday();
  const loginSettings = app.getLoginItemSettings(loginItemOptions());

  tray.setToolTip(`Water Reminder: ${status}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: status, enabled: false },
      { label: `Glasses today: ${glasses}`, enabled: false },
      { type: 'separator' },
      {
        label: 'Remind me now',
        enabled: !reminderShowing,
        click: () => showReminder(),
      },
      {
        label: paused ? 'Resume reminders' : 'Pause reminders',
        click: () => {
          paused = !paused;
          if (!paused) scheduleIn(REMIND_MINUTES);
          refreshTray();
        },
      },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: loginSettings.openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: item.checked });
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
}

// In development Electron needs the app folder as an argument; the installed app doesn't.
function loginItemOptions() {
  return app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] };
}

// ---------- startup ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showReminder());

  app.whenReady().then(() => {
    app.setAppUserModelId('in.finprov.waterreminder');
    state = loadState();

    tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
    tray.on('click', () => tray.popUpContextMenu());
    createReminderWindow();
    scheduleIn(REMIND_MINUTES);

    setInterval(tick, 5000);
    setInterval(refreshTray, 30 * 1000);
    powerMonitor.on('resume', tick);

    if (Notification.isSupported()) {
      new Notification({
        title: 'Water Reminder is running',
        body: `I'll remind you every ${REMIND_MINUTES} ${TEST_MODE ? 'seconds (test mode)' : 'minutes'}. Find me in the system tray.`,
        icon: path.join(__dirname, 'assets', 'icon.png'),
      }).show();
    }
  });

  // Keep running in the tray when the reminder window is hidden.
  app.on('window-all-closed', () => {});
}
