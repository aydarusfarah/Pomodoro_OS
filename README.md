# Pomodoro OS

A focus timer and study planner for students. It has no dependencies and needs no build step. Your data stays in your browser (localStorage).

## Run it

Double-click `index.html`, or serve the folder:

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Features

- **Focus timer**: focus, short-break and long-break modes with a progress ring. Auto-start is optional, the timer keeps running after a page refresh, and the countdown shows in the tab title. A chime and desktop notifications tell you when a session ends.
- **Focus sounds**: soft rain and brown, pink or white noise, generated in the browser. They play only while a focus session is running.
- **Tasks**: subjects, priority, due dates, pomodoro estimates (tracked as done/estimated), notes and checklists.
- **Quick add**: `Read chapter 4 #physics !high ~3 @tomorrow`
  - `#subject` picks a subject. The name can be partial, and a new subject is created if none matches.
  - `!high` / `!med` / `!low` sets the priority.
  - `~3` sets the estimated number of pomodoros.
  - `@today`, `@tomorrow`, `@fri`, `@+3` or `@2026-12-01` sets the due date.
- **Today's plan**: shows your daily goal, time left in the plan, a streak counter and a countdown to your next exam.
- **Weekly planner**: drag tasks between days. Each day has a bar comparing the pomodoros you planned with your daily goal. The planner also has an exam and deadline tracker and a tray for tasks without a date.
- **Stats**: focus time per day against your goal, a breakdown by subject, your most productive hours and a heatmap of the last 20 weeks.
- **Zen mode**: a full-screen, distraction-free timer.
- **Themes**: 13 themes, each with its own timer colours. The dark ones are Midnight, Ocean, Forest, Sunset, Aurora, Nord, Dracula and Coffee. The light ones are Daylight, Sakura, Paper, Mint and Lavender, and Auto follows your device. Pick one in Settings, or use the palette button in the sidebar or the `T` key.
- **Settings**: durations, daily goal, sounds, managing subjects, and JSON backup export and import.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Start or pause |
| R | Reset |
| S | Skip |
| N | New task |
| Z | Zen mode |
| T | Themes |
| 1–5 | Switch pages |
| ? | Show shortcuts |
