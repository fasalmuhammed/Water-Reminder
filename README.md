# Water Reminder

A desktop character that pops up every 30 minutes to remind you to drink water.

- **Yes, I drank water**: he takes a sip, counts the glass, and comes back in 30 minutes.
- **Snooze**: he waves and comes back in 10 minutes.
- The tray icon (near the clock) has *Remind me now*, *Pause*, *Start with Windows*, and *Quit*.

## Install

Run `dist/Water Reminder Setup 1.0.0.exe`.

## Develop

```
npm install
node node_modules/electron/install.js   # only if npm skipped Electron's download
npm start                                # normal intervals (30 min / 10 min)
npm run test-mode                        # 30 s / 10 s, for trying the flow quickly
npm run dist                             # build the installer into dist/
```

Intervals are set at the top of `app/main.js` (`REMIND_MINUTES`, `SNOOZE_MINUTES`).

## Changing the character art

The animation frames in `app/assets/frames/` are generated from the green-screen
sheets in `assets/` by:

```
python tools/process_frames.py
```

Panel positions and the frame order for each animation are listed at the top of
that script. If you get a real video later, it can replace the frame animation
in `app/reminder.js`.
