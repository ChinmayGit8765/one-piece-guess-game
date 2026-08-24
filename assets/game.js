/* One Piece Guess — daily character riddle.
   Data-driven and framework-free: characters.json is the roster,
   daily.json (written by the GitHub Actions cron) names today's answer.
   Guess comparison, hints, share grid, stats — all client-side. */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Story sagas in order — powers the DEBUT earlier/later arrows. */
const SAGAS = [
  "East Blue", "Alabasta", "Sky Island", "Water 7", "Thriller Bark",
  "Summit War", "Fish-Man Island", "Dressrosa", "Whole Cake Island",
  "Wano", "Egghead",
];

const HINT_UNLOCKS = { epithet: 3, fruit: 6, letter: 9 };
const SITE_URL = "https://chinmaygit8765.github.io/one-piece-guess-game/";

let ROSTER = [];
let daily = null;          // {date, number, pick}
let answer = null;
let guesses = [];          // character objects, oldest first
let finished = false;
let mode = "daily";        // "daily" | "free"

/* ---------- data ---------- */

async function loadData() {
  const res = await fetch("data/characters.json");
  ROSTER = await res.json();
  try {
    const d = await fetch("data/daily.json");
    if (!d.ok) throw new Error(d.status);
    daily = await d.json();
  } catch {
    // Cron hasn't run / local file dev — fall back to a deterministic pick
    // seeded by today's UTC date so everyone still gets the same character.
    const day = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    daily = { date: day, number: 0, pick: btoa(ROSTER[h % ROSTER.length].name) };
  }
}

const byName = (name) => ROSTER.find((c) => c.name === name);

function dailyAnswer() {
  try {
    return byName(atob(daily.pick)) || ROSTER[0];
  } catch {
    return ROSTER[0];
  }
}

/* ---------- formatting ---------- */

const compact = (n) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(n);

const fmtBounty = (b) => (b == null ? "Unknown" : `฿${compact(b)}`);
const fmtHaki = (h) => (h.length ? h.join(" · ") : "None");

/* ---------- comparison ---------- */

function compare(guess, ans) {
  const cells = [];
  const st = (ok) => (ok ? "exact" : "wrong");

  cells.push({ label: guess.gender, state: st(guess.gender === ans.gender) });
  cells.push({ label: guess.crew, state: st(guess.crew === ans.crew) });

  // Fruit: exact type match is green; any two Zoan-family types are close.
  const zoan = (t) => t.endsWith("Zoan");
  cells.push({
    label: guess.fruitType,
    state:
      guess.fruitType === ans.fruitType
        ? "exact"
        : zoan(guess.fruitType) && zoan(ans.fruitType)
          ? "close"
          : "wrong",
  });

  // Haki: same set green, any overlap yellow.
  const overlap = guess.haki.filter((h) => ans.haki.includes(h)).length;
  const sameHaki = guess.haki.length === ans.haki.length && overlap === guess.haki.length;
  cells.push({
    label: fmtHaki(guess.haki),
    state: sameHaki ? "exact" : overlap ? "close" : "wrong",
  });

  // Bounty / height: arrows point at where the answer sits.
  if (guess.bounty == null || ans.bounty == null) {
    cells.push({
      label: fmtBounty(guess.bounty),
      state: st(guess.bounty == null && ans.bounty == null),
      sub: guess.bounty == null && ans.bounty == null ? "" : "?",
    });
  } else {
    cells.push({
      label: fmtBounty(guess.bounty),
      state: st(guess.bounty === ans.bounty),
      arrow: guess.bounty === ans.bounty ? "" : ans.bounty > guess.bounty ? "↑" : "↓",
    });
  }

  cells.push({
    label: `${guess.height}cm`,
    state: st(guess.height === ans.height),
    arrow: guess.height === ans.height ? "" : ans.height > guess.height ? "↑" : "↓",
  });

  cells.push({ label: guess.origin, state: st(guess.origin === ans.origin) });

  const gi = SAGAS.indexOf(guess.debut);
  const ai = SAGAS.indexOf(ans.debut);
  cells.push({
    label: guess.debut,
    state: st(gi === ai),
    arrow: gi === ai ? "" : ai > gi ? "↑" : "↓",
  });

  return cells;
}

/* ---------- rendering ---------- */

function renderGuess(guess) {
  const cells = compare(guess, answer);
  const row = document.createElement("div");
  row.className = "guess-row";
  row.innerHTML =
    `<div class="cell name">${esc(guess.name)}</div>` +
    cells
      .map(
        (c) => `
        <div class="cell ${c.state}">
          <span>${esc(c.label)}</span>
          ${c.arrow ? `<span class="arrow">${c.arrow}</span>` : ""}
          ${c.sub ? `<span class="sub">${esc(c.sub)}</span>` : ""}
        </div>`
      )
      .join("");
  $("#rows").prepend(row); // newest on top
  $("#board-head").hidden = false;
}

function renderHints() {
  const wrong = guesses.filter((g) => g.name !== answer.name).length;
  const defs = [
    ["hint-epithet", "EPITHET", HINT_UNLOCKS.epithet, () => `"${answer.epithet}"`],
    ["hint-fruit", "DEVIL FRUIT", HINT_UNLOCKS.fruit, () => answer.fruit || "No devil fruit"],
    ["hint-letter", "FIRST LETTER", HINT_UNLOCKS.letter, () => `Starts with "${answer.name[0]}"`],
  ];
  for (const [id, name, at, reveal] of defs) {
    const btn = $("#" + id);
    if (btn.classList.contains("revealed")) continue;
    if (finished || wrong >= at) {
      btn.disabled = false;
      btn.classList.add("unlocked");
      btn.textContent = `💡 ${name} — TAP TO REVEAL`;
      btn.onclick = () => {
        btn.classList.add("revealed");
        btn.textContent = reveal();
      };
    } else {
      btn.textContent = `🔒 ${name} — ${at - wrong} MORE`;
    }
  }
}

function renderMeta() {
  $("#puzzle-label").textContent =
    mode === "daily"
      ? `DAILY #${daily.number || "?"} · ${daily.date}`
      : "FREE PLAY";
  $("#mode-label").textContent = mode === "daily" ? "DAILY MODE" : "PRACTICE — NO STATS";
}

function renderStats() {
  const s = stats();
  $("#stats").innerHTML =
    `<span>PLAYED <b>${s.plays}</b></span>` +
    `<span>SOLVED <b>${s.wins}</b></span>` +
    `<span>STREAK <b>${s.streak}</b></span>` +
    `<span>BEST <b>${s.maxStreak}</b></span>`;
}

function shareText() {
  const n = guesses.length;
  const grid = guesses
    .map((g) =>
      compare(g, answer)
        .map((c) =>
          c.arrow === "↑" ? "🔼" : c.arrow === "↓" ? "🔽"
          : c.state === "exact" ? "🟩" : c.state === "close" ? "🟨" : "⬛")
        .join("")
    )
    .join("\n");
  const head =
    mode === "daily"
      ? `ONE PIECE GUESS #${daily.number} · ${daily.date}`
      : "ONE PIECE GUESS · FREE PLAY";
  return `${head}\nFound them in ${n} ${n === 1 ? "guess" : "guesses"}\n${grid}\n${SITE_URL}`;
}

function renderResult(won) {
  const el = $("#result");
  el.hidden = false;
  const facts = [
    answer.crew,
    answer.fruit ? answer.fruit : "no devil fruit",
    `bounty ${fmtBounty(answer.bounty).toLowerCase()}`,
    `debuted in the ${answer.debut} saga`,
  ].join(" · ");
  el.innerHTML = `
    <div class="verdict ${won ? "win" : "lose"}">${won ? "CAPTURED!" : "THEY GOT AWAY…"}</div>
    <div class="answer-name">${esc(answer.name)}</div>
    <div class="answer-epithet">"${esc(answer.epithet)}"</div>
    <p class="answer-facts">${esc(facts)}</p>
    <div class="share-row">
      ${won ? `<button class="share-btn" id="share-btn">SHARE RESULT ⚓</button>` : ""}
      ${mode === "free" ? `<button class="share-btn secondary" id="again-btn">PLAY AGAIN ↻</button>` : ""}
    </div>
    ${mode === "daily" ? `<div class="countdown">NEXT PIRATE IN <b id="countdown">--:--:--</b></div>` : ""}
  `;
  $("#share-btn")?.addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(shareText());
      e.target.textContent = "COPIED TO CLIPBOARD ✓";
    } catch {
      prompt("Copy your result:", shareText());
    }
  });
  $("#again-btn")?.addEventListener("click", startFreePlay);
  if (mode === "daily") tickCountdown();
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* Next pick lands at 21:15 UTC — same moment the cron fires. */
function tickCountdown() {
  const el = $("#countdown");
  if (!el) return;
  const next = new Date();
  next.setUTCHours(21, 15, 0, 0);
  if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
  const update = () => {
    const ms = next - new Date();
    if (ms <= 0) { el.textContent = "REFRESH THE PAGE!"; return; }
    const h = String(Math.floor(ms / 3.6e6)).padStart(2, "0");
    const m = String(Math.floor((ms % 3.6e6) / 6e4)).padStart(2, "0");
    const s = String(Math.floor((ms % 6e4) / 1e3)).padStart(2, "0");
    el.textContent = `${h}:${m}:${s}`;
    setTimeout(update, 1000);
  };
  update();
}

/* ---------- persistence ---------- */

const stateKey = () => `opg:day:${daily.date}`;

function stats() {
  try {
    return {
      plays: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDate: "",
      ...JSON.parse(localStorage.getItem("opg:stats") || "{}"),
    };
  } catch {
    return { plays: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDate: "" };
  }
}

function recordFinish(won) {
  if (mode !== "daily") return;
  const s = stats();
  s.plays += 1;
  if (won) {
    const y = new Date(new Date(daily.date) - 864e5).toISOString().slice(0, 10);
    s.streak = s.lastWinDate === y ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.wins += 1;
    s.lastWinDate = daily.date;
  } else {
    s.streak = 0;
  }
  localStorage.setItem("opg:stats", JSON.stringify(s));
}

function saveDay() {
  if (mode !== "daily") return;
  localStorage.setItem(
    stateKey(),
    JSON.stringify({ guesses: guesses.map((g) => g.name), finished })
  );
}

function restoreDay() {
  try {
    const saved = JSON.parse(localStorage.getItem(stateKey()) || "null");
    if (!saved) return;
    for (const name of saved.guesses) {
      const c = byName(name);
      if (!c) continue;
      guesses.push(c);
      renderGuess(c);
    }
    if (saved.finished) {
      finished = true;
      $("#guess-input").disabled = true;
      renderResult(guesses.some((g) => g.name === answer.name));
    }
  } catch { /* corrupted state — start fresh */ }
}

/* ---------- guessing ---------- */

function submitGuess(character) {
  if (finished || guesses.some((g) => g.name === character.name)) return;
  guesses.push(character);
  renderGuess(character);
  const won = character.name === answer.name;
  if (won) {
    finished = true;
    $("#guess-input").disabled = true;
    recordFinish(true);
    renderResult(true);
  }
  renderHints();
  renderStats();
  saveDay();
  $("#guess-input").value = "";
  hideSuggestions();
}

/* ---------- autocomplete ---------- */

let focusedIdx = -1;

function hideSuggestions() {
  $("#suggestions").hidden = true;
  focusedIdx = -1;
}

function showSuggestions(query) {
  const box = $("#suggestions");
  const q = query.trim().toLowerCase();
  if (!q) return hideSuggestions();
  const guessed = new Set(guesses.map((g) => g.name));
  const hits = ROSTER.filter(
    (c) =>
      !guessed.has(c.name) &&
      (c.name.toLowerCase().includes(q) || c.epithet.toLowerCase().includes(q))
  ).slice(0, 8);
  if (!hits.length) return hideSuggestions();
  box.innerHTML = hits
    .map(
      (c, i) => `<li><button data-name="${esc(c.name)}" data-i="${i}">
        <span>${esc(c.name)}</span><span class="ep">${esc(c.epithet)}</span>
      </button></li>`
    )
    .join("");
  box.hidden = false;
  focusedIdx = -1;
}

function wireInput() {
  const input = $("#guess-input");
  input.addEventListener("input", () => showSuggestions(input.value));
  input.addEventListener("keydown", (e) => {
    const btns = $$("#suggestions button");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!btns.length) return;
      focusedIdx =
        e.key === "ArrowDown"
          ? (focusedIdx + 1) % btns.length
          : (focusedIdx - 1 + btns.length) % btns.length;
      btns.forEach((b, i) => b.classList.toggle("focused", i === focusedIdx));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = btns[focusedIdx >= 0 ? focusedIdx : 0];
      if (pick) submitGuess(byName(pick.dataset.name));
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });
  $("#suggestions").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) submitGuess(byName(btn.dataset.name));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".guess-box")) hideSuggestions();
  });
}

/* ---------- modes ---------- */

function resetBoard() {
  guesses = [];
  finished = false;
  $("#rows").innerHTML = "";
  $("#board-head").hidden = true;
  $("#result").hidden = true;
  $("#guess-input").disabled = false;
  $("#guess-input").value = "";
  for (const id of ["hint-epithet", "hint-fruit", "hint-letter"]) {
    const b = $("#" + id);
    b.disabled = true;
    b.classList.remove("unlocked", "revealed");
    b.onclick = null;
  }
  renderHints();
}

function startDaily() {
  mode = "daily";
  $("#mode-daily").classList.add("active");
  $("#mode-free").classList.remove("active");
  $("#new-free").hidden = true;
  resetBoard();
  answer = dailyAnswer();
  renderMeta();
  restoreDay();
  renderStats();
}

function startFreePlay() {
  mode = "free";
  $("#mode-free").classList.add("active");
  $("#mode-daily").classList.remove("active");
  $("#new-free").hidden = false;
  resetBoard();
  const pool = ROSTER.filter((c) => c.name !== dailyAnswer().name); // never spoil today
  answer = pool[Math.floor(Math.random() * pool.length)];
  renderMeta();
  renderStats();
}

/* ---------- boot ---------- */

(async function init() {
  // ?embed=1 — chromeless mode for iframing (e.g. on the Exaryn site)
  if (new URLSearchParams(location.search).has("embed")) {
    document.querySelector(".site-header")?.remove();
  }
  await loadData();
  wireInput();
  $("#mode-daily").addEventListener("click", () => mode !== "daily" && startDaily());
  $("#mode-free").addEventListener("click", () => mode !== "free" && startFreePlay());
  $("#new-free").addEventListener("click", startFreePlay);
  startDaily();
})();
