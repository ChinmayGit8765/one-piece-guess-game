#!/usr/bin/env python3
"""Pick the character of the day. Stdlib only, no dependencies.

Run by GitHub Actions every morning (see .github/workflows/daily.yml).
Idempotent: if today's pick already exists in data/history.json it exits
without changing anything, so re-runs and manual dispatches are safe.

Outputs:
  data/daily.json    what the site reads — date, puzzle number, base64 name
  data/history.json  every past pick — used to avoid repeats
"""

import base64
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Don't repeat any of the last N picks. Keep this well below the roster size.
NO_REPEAT_WINDOW = 30


def game_date() -> str:
    """Today's date in Melbourne — the digest and the game tick over together."""
    try:
        from zoneinfo import ZoneInfo

        now = datetime.now(ZoneInfo("Australia/Melbourne"))
    except Exception:
        # Windows without tzdata: AEST fixed offset is close enough for a cron
        # that fires once a day.
        now = datetime.now(timezone(timedelta(hours=10)))
    return now.strftime("%Y-%m-%d")


def main() -> None:
    today = game_date()

    characters = json.loads((DATA / "characters.json").read_text(encoding="utf-8"))
    history_path = DATA / "history.json"
    history = (
        json.loads(history_path.read_text(encoding="utf-8"))
        if history_path.exists()
        else {"picks": []}
    )
    picks = history["picks"]

    if any(p["date"] == today for p in picks):
        print(f"pick for {today} already exists — nothing to do")
        return

    recent = {p["name"] for p in picks[-NO_REPEAT_WINDOW:]}
    pool = [c["name"] for c in characters if c["name"] not in recent]
    if not pool:  # roster smaller than the window — fall back to everyone
        pool = [c["name"] for c in characters]

    name = random.choice(pool)
    number = (picks[-1]["number"] + 1) if picks else 1

    picks.append({"date": today, "number": number, "name": name})
    history_path.write_text(
        json.dumps(history, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    daily = {
        "date": today,
        "number": number,
        # Lightly obscured so the answer doesn't sit in plaintext in the
        # network tab. Anyone determined can decode it — that's Wordle rules.
        "pick": base64.b64encode(name.encode("utf-8")).decode("ascii"),
    }
    (DATA / "daily.json").write_text(
        json.dumps(daily, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"daily #{number} ({today}): {name}")


if __name__ == "__main__":
    main()
