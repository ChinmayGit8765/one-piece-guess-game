# One Piece Guess ☠️

Wordle, but for One Piece. Guess the daily character — every wrong guess tells
you how close you are on **gender, crew, devil fruit, haki, bounty, height,
origin and debut saga**, with arrows when you're over or under. Hints unlock as
you struggle. New pirate every morning, **picked by a GitHub Actions cron**.

**Play it:** https://chinmaygit8765.github.io/one-piece-guess-game/

Pure static site. No framework, no build step, no backend, no dependencies.

```
index.html               the game page
assets/style.css         wanted-poster design — parchment, ink, bounty red
assets/game.js           game engine — compare logic, hints, share grid, stats
data/characters.json     the roster (~85 characters) — add your own!
data/daily.json          today's pick — written by the cron, don't edit by hand
data/history.json        every past pick — keeps the cron from repeating
scripts/pick_daily.py    the picker (stdlib-only Python)
.github/workflows/       daily cron + GitHub Pages deploy
```

## How the game works

- Type a name, pick from the autocomplete, and each guess renders a row of
  eight attribute tiles: 🟩 exact match, 🟨 close (haki overlap, Zoan-family
  fruit), ⬛ wrong. Bounty, height and debut get 🔼 / 🔽 arrows pointing at
  where the answer sits.
- Three hints unlock after 3 / 6 / 9 wrong guesses: epithet, devil fruit,
  first letter.
- Daily progress and win-streak stats live in `localStorage`. Free-play mode
  gives you unlimited random characters without touching your stats.
- The share button copies a Wordle-style emoji grid.

Data is fan-curated and lightly simplified (unconfirmed haki is omitted,
sub-arcs are grouped into their saga). Spot an error? Edit
`data/characters.json` and PR it — the schema is one flat object per character.

## Run locally

```sh
npm run dev        # npx serve, open http://localhost:3000
# or: python -m http.server 3000
```

(`fetch()` needs http — opening `index.html` straight from disk won't load the
data. If `daily.json` is missing or stale the game falls back to a
deterministic pick seeded by the date, so local dev always works.)

Force a new daily pick:

```sh
npm run pick       # = python scripts/pick_daily.py
```

---

# How to build your own daily-anything game (the cron guide)

The whole trick is three moving parts. Steal them.

### 1. A picker script that's *idempotent*

`scripts/pick_daily.py` is ~60 lines of stdlib Python:

1. Compute "today" in **your** timezone (the day should tick over when your
   players wake up, not at UTC midnight).
2. If `history.json` already has a pick for today, **exit without writing
   anything**. This is the important bit — it makes re-runs, manual dispatches
   and workflow retries completely safe.
3. Otherwise pick randomly, excluding the last 30 picks so the daily doesn't
   repeat, append to `history.json`, and write `daily.json` with the date, a
   running puzzle number, and the answer (base64-encoded so it isn't sitting
   in plaintext in the network tab — Wordle rules: cheaters only cheat
   themselves).

### 2. A workflow that picks, commits, and deploys

`.github/workflows/daily.yml` runs on three triggers:

```yaml
on:
  push:            # deploy on every push
    branches: [main]
  schedule:
    - cron: "15 21 * * *"   # daily — 21:15 UTC ≈ 7am Melbourne
  workflow_dispatch:         # manual "run it now" button
```

On cron/manual runs it executes the picker, then commits the result back:

```yaml
- run: python3 scripts/pick_daily.py
- run: |
    git config user.name "one-piece-guess-bot"
    git config user.email "actions@users.noreply.github.com"
    git add data/
    git diff --cached --quiet || (git commit -m "daily: new character [skip ci]" && git push)
```

Notes that save you an afternoon of debugging:

- `permissions: contents: write` is required or the push is rejected.
- `[skip ci]` in the commit message stops the push from re-triggering the
  workflow in an infinite loop.
- The same job then deploys to Pages (`upload-pages-artifact` +
  `deploy-pages`), so the pick and the deploy can never race each other.
- GitHub cron is best-effort — it can fire minutes late. Design for "roughly
  morning", not "exactly 7:00:00".
- Scheduled workflows get **disabled after 60 days of repo inactivity**. The
  daily commit from the bot conveniently counts as activity, so this setup
  keeps itself alive.

### 3. A client that trusts the JSON but has a fallback

The page fetches `data/daily.json` and plays whatever it says. If the fetch
fails (local dev) it falls back to a deterministic hash of today's date, so
the game never breaks — the cron just makes it *better* (true randomness,
no-repeat memory, a stable puzzle number).

### Ship it

1. Fork/clone, push to `main` on a new GitHub repo.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Done. Every push deploys; every morning the cron picks, commits, deploys.

To reskin it for another fandom: replace `characters.json` with your own
roster, adjust the columns in `compare()` in `assets/game.js`, and change the
cron time to your timezone. Everything else carries over untouched.

---

Fan project. Not affiliated with Eiichiro Oda, Shueisha, or Toei Animation.
Built by [Exaryn ✳](https://chinmaygit8765.github.io/exaryn-studio/)
