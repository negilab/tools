(() => {
'use strict';

const HOLD_MS = 420;          // 長押し判定（CSSの --hold と合わせる）
const MOVE_CANCEL_PX = 12;    // 指がこれ以上動いたら長押しキャンセル
const STORAGE_KEY = 'yawaraka-sudoku-v1';
// 難しさは「解くのに必要な手筋」で決める（grader.js）。パターン集の順番と対応
//   1 入門:       シングルだけで解ける。ヒント多め（40個）
//   2 やさしい:   シングルだけで解ける。ヒント少なめ（30個）
//   3 ふつう:     2マスで2つの数字 / ブロックの中で1列に並ぶ / 行からブロックへ が必要
//   4 むずかしい: 隠れた2つ / 3マスで3つの数字 / X-ウイング / スカイスクレイパー が必要
//   5 激ムズ:     Y-ウイング / ソードフィッシュ / ユニーク・レクタングル が必要
const DIFF = {
  1: { label: '入門',       clues: 40 },
  2: { label: 'やさしい',   clues: 30 },
  3: { label: 'ふつう',     clues: 17 },
  4: { label: 'むずかしい', clues: 17 },
  5: { label: '激ムズ',     clues: 17 },
};
const GEN_BUDGET_MS = 3000;   // 狙いの段階が出るまで作り直す時間の上限

const $ = (s) => document.querySelector(s);
const boardEl = $('#board');
const paletteEl = $('#palette');
const timeEl = $('#time');
const mistakesEl = $('#mistakes');
const statusEl = $('#status');
const diffSel = $('#difficulty');
const confirmEl = $('#confirm');
const optEls = { assist: $('#opt-assist'), tapSwitch: $('#opt-tapswitch'), holdCommit: $('#opt-hold'), dblCommit: $('#opt-dbl') };

const doneEl = $('#done');

// ---------- 盤面の基礎 ----------
const row = (i) => (i / 9) | 0;
const col = (i) => i % 9;
const box = (i) => ((row(i) / 3) | 0) * 3 + ((col(i) / 3) | 0);
const PEERS = [];
const ROWS = [...Array(9)].map(() => []), COLS = [...Array(9)].map(() => []), BOXES = [...Array(9)].map(() => []);
for (let i = 0; i < 81; i++) { ROWS[row(i)].push(i); COLS[col(i)].push(i); BOXES[box(i)].push(i); }
for (let i = 0; i < 81; i++) {
  const list = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) list.push(j);
  }
  PEERS.push(list);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 問題生成 ----------
function fillGrid(g) {
  const i = g.indexOf(0);
  if (i < 0) return true;
  for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (PEERS[i].every((p) => g[p] !== n)) {
      g[i] = n;
      if (fillGrid(g)) return true;
      g[i] = 0;
    }
  }
  return false;
}

function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

// 黒丸にする数字を返す（長押し／ダブルタップでそのまま確定できる）
// 決まりはひとつだけ:
//   そのマスの行・列・ブロックのどれかで、その数字を置ける空きマスがそこしかない。
//   かつ、そのマスのメモにその数字がある。
// 「置ける」は盤面に確定している数字だけで判断する。答えは見ない。
function canTake(k, n) {
  return !S.val[k] && !PEERS[k].some((p) => S.val[p] === n);
}
function sureDigit(i) {
  if (!settings.assist || !S || S.val[i] || !S.memos[i]) return 0;
  for (let n = 1; n <= 9; n++) {
    if (!(S.memos[i] & (1 << n)) || !canTake(i, n)) continue;
    for (const unit of [ROWS[row(i)], COLS[col(i)], BOXES[box(i)]]) {
      if (unit.every((k) => k === i || !canTake(k, n))) return n;
    }
  }
  return 0;
}

// 解の個数を limit まで数える（候補が最も少ないマスから埋める）
function countSolutions(g, limit) {
  let best = -1, bestMask = 0, bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (g[i]) continue;
    let mask = 0x3fe;
    for (const p of PEERS[i]) if (g[p]) mask &= ~(1 << g[p]);
    const cnt = popcount(mask);
    if (cnt === 0) return 0;
    if (cnt < bestCount) { bestCount = cnt; best = i; bestMask = mask; if (cnt === 1) break; }
  }
  if (best < 0) return 1;
  let total = 0;
  for (let n = 1; n <= 9; n++) {
    if (bestMask & (1 << n)) {
      g[best] = n;
      total += countSolutions(g, limit);
      g[best] = 0;
      if (total >= limit) return total;
    }
  }
  return total;
}

// 答えが1通りのまま、ヒントが clues 個になるまで数字を抜く（17 なら抜けるだけ抜く）
function digPuzzle(clues) {
  const sol = new Array(81).fill(0);
  fillGrid(sol);
  const puz = sol.slice();
  let remaining = 81;
  for (const i of shuffle([...Array(81).keys()])) {
    if (remaining <= clues) break;
    const keep = puz[i];
    puz[i] = 0;
    if (countSolutions(puz.slice(), 2) === 1) remaining--;
    else puz[i] = keep;
  }
  return { puz, sol };
}

// 狙いの段階になるまで作り直す。時間内に出なければ、いちばん近い段階のものを使う
function makePuzzle(level) {
  const deadline = Date.now() + GEN_BUDGET_MS;
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const cand = digPuzzle(DIFF[level].clues);
    const g = SudokuGrader.grade(cand.puz);
    cand.grade = { level: g.level, used: g.used };
    if (g.level === level) return cand;
    if (g.solved && (!best || Math.abs(g.level - level) < Math.abs(best.grade.level - level))) best = cand;
    if (Date.now() > deadline) break;
  }
  return best || makePuzzle(1);
}

// ---------- 状態 ----------
let S = null;          // { diff, puz, sol, val, memos, elapsed, mistakes, done }
let history = [];      // [{ val, memos }]
let sel = -1;          // 選択中のマス
let num = 0;           // パレットで選択中の数字（0 = なし）
let eraser = false;

// ---------- 設定 ----------
const SETTINGS_KEY = 'yawaraka-sudoku-settings';
const settings = {
  assist: false,      // 黒丸メモ
  tapSwitch: true,    // 数字の入ったマスをタップでその数字に切り替え
  holdCommit: true,   // 長押しで確定
  dblCommit: true,    // ダブルタップで確定
};
function loadSettings() {
  try {
    const d = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (d) for (const k of Object.keys(settings)) if (typeof d[k] === 'boolean') settings[k] = d[k];
  } catch (_) {}
  if (!settings.holdCommit && !settings.dblCommit) settings.holdCommit = true;
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
}
function renderSettings() {
  for (const k of Object.keys(optEls)) optEls[k].checked = settings[k];
  // 確定方法はどちらか一方は残す
  optEls.holdCommit.disabled = settings.holdCommit && !settings.dblCommit;
  optEls.dblCommit.disabled = settings.dblCommit && !settings.holdCommit;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ S, history: history.slice(-50), sel, num })); } catch (_) {}
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!d || !d.S || !Array.isArray(d.S.puz) || d.S.puz.length !== 81) return false;
    S = d.S; history = d.history || []; sel = d.sel ?? -1; num = d.num || 0;
    if (!DIFF[S.diff]) S.diff = { easy: 2, normal: 3, hard: 4 }[S.diff] || 3;   // 以前の保存形式
    return true;
  } catch (_) { return false; }
}
function snapshot() {
  history.push({ val: S.val.slice(), memos: S.memos.slice() });
  if (history.length > 200) history.shift();
}

// ---------- DOM 構築 ----------
const cells = [], valEls = [], memoEls = [];
for (let i = 0; i < 81; i++) {
  const c = document.createElement('div');
  c.className = 'cell';
  c.dataset.i = i;
  if (col(i) % 3 === 2 && col(i) < 8) c.classList.add('br');
  if (row(i) % 3 === 2 && row(i) < 8) c.classList.add('bb');
  c.innerHTML = '<span class="val"></span><div class="memos">' + '<span></span>'.repeat(9) + '</div>';
  boardEl.appendChild(c);
  cells.push(c);
  valEls.push(c.firstElementChild);
  memoEls.push(c.lastElementChild.children);
}
const numBtns = [];
for (let n = 1; n <= 9; n++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'num';
  b.dataset.n = n;
  b.textContent = n;
  b.setAttribute('aria-label', `${n}を選ぶ`);
  paletteEl.appendChild(b);
  numBtns.push(b);
}

// ---------- 描画 ----------
function fmtTime(s) { return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }

function update() {
  if (!S) return;
  const hi = num || (sel >= 0 ? S.val[sel] : 0);   // 強調する数字
  const sr = sel >= 0 ? row(sel) : -1, sc = sel >= 0 ? col(sel) : -1, sb = sel >= 0 ? box(sel) : -1;
  // 強調する数字が置かれている行・列・ブロック（その数字が入れない場所を薄く示す）
  const lineRows = new Set(), lineCols = new Set(), lineBoxes = new Set();
  if (hi) for (let i = 0; i < 81; i++) if (S.val[i] === hi) { lineRows.add(row(i)); lineCols.add(col(i)); lineBoxes.add(box(i)); }
  for (let i = 0; i < 81; i++) {
    const c = cells[i], v = S.val[i], given = !!S.puz[i];
    c.classList.toggle('given', given);
    c.classList.toggle('has-val', v > 0);
    c.classList.toggle('sel', i === sel);
    c.classList.toggle('peer', sel >= 0 && i !== sel && (row(i) === sr || col(i) === sc || box(i) === sb));
    c.classList.toggle('same', hi > 0 && v === hi);
    // 数字を選んでいる間は、その数字を置けないマス（行・列・ブロックが重なる場所と、すでに埋まっているマス）を薄く塗る
    c.classList.toggle('line', hi > 0 && (v > 0 || lineRows.has(row(i)) || lineCols.has(col(i)) || lineBoxes.has(box(i))));
    valEls[i].textContent = v || '';
    const m = S.memos[i], spans = memoEls[i], sure = sureDigit(i);
    for (let n = 1; n <= 9; n++) {
      const on = !v && !!(m & (1 << n));
      spans[n - 1].textContent = on ? n : '';
      spans[n - 1].classList.toggle('on', on);
      spans[n - 1].classList.toggle('hit', on && n === hi);
      spans[n - 1].classList.toggle('sure', on && n === sure);
    }
  }
  const counts = new Array(10).fill(0);
  for (const v of S.val) counts[v]++;
  for (let n = 1; n <= 9; n++) {
    const b = numBtns[n - 1];
    b.classList.toggle('on', num === n);
    b.classList.toggle('done', counts[n] >= 9);
  }
  mistakesEl.textContent = S.mistakes;
  timeEl.textContent = fmtTime(S.elapsed);
  diffSel.value = S.diff;
  boardEl.classList.toggle('done', !!S.done);
}

// ---------- 演出 ----------
function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function once(el, cls, ms) {
  restartAnim(el, cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (_) {} }
function dist(a, b) { return Math.max(Math.abs(row(a) - row(b)), Math.abs(col(a) - col(b))); }

function animateCommit(i, n, cleared) {
  const c = cells[i];
  once(c, 'pop', 600);
  const ring = document.createElement('span');
  ring.className = 'ring';
  c.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove());
  for (const p of PEERS[i]) {
    const pc = cells[p];
    pc.style.setProperty('--delay', `${dist(i, p) * 45}ms`);
    once(pc, 'wave', 1200);
  }
  const clearedSet = new Set(cleared);
  for (const p of clearedSet) {
    const out = document.createElement('span');
    out.className = 'memo-out';
    out.textContent = n;
    out.style.setProperty('--delay', `${dist(i, p) * 45 + 60}ms`);
    out.style.left = `${((n - 1) % 3) * 33.33}%`;
    out.style.top = `${(((n - 1) / 3) | 0) * 33.33}%`;
    cells[p].appendChild(out);
    out.addEventListener('animationend', () => out.remove());
  }
  vibrate(12);
}
function animateNine(i, n) {
  const same = [];
  for (let k = 0; k < 81; k++) if (S.val[k] === n) same.push(k);
  same.sort((a, b) => dist(i, a) - dist(i, b));
  same.forEach((k, idx) => {
    cells[k].style.setProperty('--delay', `${250 + idx * 70}ms`);
    once(cells[k], 'nine', 2000);
  });
  setTimeout(() => once(numBtns[n - 1], 'complete', 1000), 300);
  setTimeout(() => { once(boardEl, 'flash', 800); vibrate([15, 30, 15, 30, 50]); }, 250 + same.length * 70);
}
function animateReject(i, n) {
  const c = cells[i];
  once(c, 'wrong', 500);
  const g = document.createElement('span');
  g.className = 'ghost';
  g.textContent = n;
  c.appendChild(g);
  g.addEventListener('animationend', () => g.remove());
  once(numBtns[n - 1], 'shake', 450);
  vibrate([30, 40, 30]);
}
function wobble(i) { once(cells[i], 'wobble', 450); }

function confetti() {
  const box = $('#confetti');
  box.innerHTML = '';
  for (let k = 0; k < 28; k++) {
    const i = document.createElement('i');
    i.style.setProperty('--o', String(0.25 + ((k * 7) % 10) / 12));
    i.style.setProperty('--x', `${Math.random() * 100}%`);
    i.style.setProperty('--dur', `${1.8 + Math.random() * 1.6}s`);
    i.style.setProperty('--delay', `${Math.random() * 2}s`);
    box.appendChild(i);
  }
}

// ---------- 操作 ----------
function selectCell(i) { sel = i; update(); save(); }

function toggleMemo(i, n) {
  if (S.done || S.puz[i] || S.val[i]) return;
  snapshot();
  S.memos[i] ^= (1 << n);
  update(); save();
}

function eraseCell(i) {
  if (S.done) return;
  if (S.puz[i]) { wobble(i); return; }
  if (!S.val[i] && !S.memos[i]) return;
  snapshot();
  S.val[i] = 0; S.memos[i] = 0;
  update(); save();
}

function commit(i, n) {
  if (S.done) return;
  if (S.puz[i]) { wobble(i); return; }
  if (S.val[i] === n) {               // 自分で入れた数字をもう一度長押し → 取り消し
    snapshot(); S.val[i] = 0; update(); save(); return;
  }
  if (S.sol[i] !== n) {               // 間違い → 入力拒否
    S.mistakes++;
    animateReject(i, n);
    update(); save();
    return;
  }
  snapshot();
  S.val[i] = n; S.memos[i] = 0;
  const cleared = [];
  for (const p of PEERS[i]) {
    if (S.memos[p] & (1 << n)) { S.memos[p] &= ~(1 << n); cleared.push(p); }
  }
  update();
  animateCommit(i, n, cleared);
  const complete = S.val.every((v, k) => v === S.sol[k]);
  if (!complete && S.val.filter((v) => v === n).length === 9) animateNine(i, n);
  if (complete) finish();
  save();
}

function finish() {
  S.done = true;
  for (let i = 0; i < 81; i++) cells[i].style.setProperty('--delay', `${(row(i) + col(i)) * 45}ms`);
  update();
  vibrate([20, 30, 20, 30, 60]);
  setTimeout(() => {
    $('#done-time').textContent = fmtTime(S.elapsed);
    $('#done-sub').textContent = `${DIFF[S.diff].label} ／ まちがい ${S.mistakes} 回`;
    confetti();
    doneEl.hidden = false;
  }, 1100);
}

function undo() {
  const h = history.pop();
  if (!h || S.done) return;
  S.val = h.val; S.memos = h.memos;
  update(); save();
}

// ---------- タップ / 長押し ----------
let press = null;
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
boardEl.addEventListener('pointerdown', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell || !S || press) return;
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  const i = +cell.dataset.i;
  press = { i, x: e.clientX, y: e.clientY, done: false, timer: 0 };
  // 数字を選んでいる間（メモ／確定）と、タップでその数字に切り替えるマスは選択状態にしない
  if (!num && !eraser && (!S.val[i] || !settings.tapSwitch)) selectCell(i);
  const sure = eraser ? 0 : sureDigit(i);
  const willCommit = settings.holdCommit && !S.done && !S.puz[i] && (eraser || num > 0 || sure > 0 || S.val[i] > 0 || S.memos[i] > 0);
  if (willCommit) {
    restartAnim(cell, 'holding');
    press.timer = setTimeout(() => {
      press.done = true;
      cell.classList.remove('holding');
      if (eraser) eraseCell(i);
      else if (sure) commit(i, sure);          // 候補が1つに絞れたメモはそのまま確定
      else if (num) commit(i, num);
      else eraseCell(i);
    }, HOLD_MS);
  }
});
function cancelHold() {
  if (!press) return;
  clearTimeout(press.timer);
  cells[press.i].classList.remove('holding');
}
window.addEventListener('pointermove', (e) => {
  if (!press || press.done) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_CANCEL_PX) { cancelHold(); press.moved = true; }
});
window.addEventListener('pointerup', (e) => {
  if (!press) return;
  cancelHold();
  const p = press; press = null;
  if (p.done || p.moved) return;
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.cell');
  if (!target || +target.dataset.i !== p.i) return;
  tap(p.i);
});
window.addEventListener('pointercancel', () => { cancelHold(); press = null; });

const DOUBLE_TAP_MS = 320;
let lastTap = { i: -1, t: 0, memoToggled: false };

function tap(i) {
  if (S.done) return;
  if (eraser) { eraseCell(i); return; }
  if (S.val[i]) {                      // 数字が入っているマス → （設定がオンなら）その数字に切り替え
    if (settings.tapSwitch) { num = S.val[i]; sel = -1; update(); save(); }
    lastTap = { i: -1, t: 0, memoToggled: false };
    return;
  }
  const now = Date.now();
  const isDouble = settings.dblCommit && lastTap.i === i && now - lastTap.t < DOUBLE_TAP_MS;
  if (isDouble) {                      // ダブルタップ → 確定（1回目のタップで付けたメモは戻す）
    if (lastTap.memoToggled) undo();
    lastTap = { i: -1, t: 0, memoToggled: false };
    const sure = sureDigit(i);
    if (sure) commit(i, sure);
    else if (num > 0) commit(i, num);
    return;
  }
  const toggled = num > 0 && !S.puz[i];
  if (toggled) toggleMemo(i, num);
  lastTap = { i, t: now, memoToggled: toggled };
}

// ---------- パレット・ツール ----------
paletteEl.addEventListener('click', (e) => {
  const b = e.target.closest('.num');
  if (!b) return;
  const n = +b.dataset.n;
  num = num === n ? 0 : n;
  eraser = false;
  sel = -1;                       // マスの選択はいったん解除
  lastTap = { i: -1, t: 0, memoToggled: false };   // 数字を変えたら、直前のタップとは続けない
  update(); save();
});
for (const k of Object.keys(optEls)) {
  optEls[k].addEventListener('change', () => {
    settings[k] = optEls[k].checked;
    if (!settings.holdCommit && !settings.dblCommit) settings[k] = true;   // 確定方法は最低ひとつ残す
    renderSettings(); saveSettings(); update();
  });
}


window.addEventListener('keydown', (e) => {
  if (!S || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
  if (/^[1-9]$/.test(e.key)) { num = num === +e.key ? 0 : +e.key; eraser = false; sel = -1; lastTap = { i: -1, t: 0, memoToggled: false }; update(); save(); return; }
  if (e.key === 'Escape') { num = 0; eraser = false; update(); save(); return; }
  if (sel < 0) { if (e.key.startsWith('Arrow')) selectCell(40); return; }
  const r = row(sel), c = col(sel);
  if (e.key === 'ArrowUp')    { selectCell(((r + 8) % 9) * 9 + c); e.preventDefault(); }
  if (e.key === 'ArrowDown')  { selectCell(((r + 1) % 9) * 9 + c); e.preventDefault(); }
  if (e.key === 'ArrowLeft')  { selectCell(r * 9 + (c + 8) % 9); e.preventDefault(); }
  if (e.key === 'ArrowRight') { selectCell(r * 9 + (c + 1) % 9); e.preventDefault(); }
  if (e.key === 'Enter') { const sure = sureDigit(sel); if (sure) commit(sel, sure); else if (num) commit(sel, num); }
  if (e.key === ' ' && num) { toggleMemo(sel, num); e.preventDefault(); }
  if (e.key === 'Backspace' || e.key === 'Delete') eraseCell(sel);
  if (e.key === 'z' || e.key === 'u') undo();
});

// ---------- 新しい問題 ----------
function startNew(diff) {
  doneEl.hidden = true;
  confirmEl.hidden = true;
  statusEl.hidden = false;
  boardEl.classList.remove('done');
  setTimeout(() => {
    const { puz, sol, grade } = makePuzzle(+diff);
    S = { diff: +diff, puz, sol, val: puz.slice(), memos: new Array(81).fill(0), elapsed: 0, mistakes: 0, done: false, grade };
    history = []; sel = -1; num = 0; eraser = false;
    statusEl.hidden = true;
    update(); save();
  }, 30);
}
function hasProgress() {
  return S && !S.done && S.val.some((v, i) => v && !S.puz[i] || S.memos[i]);
}
$('#new').addEventListener('click', () => {
  if (hasProgress()) confirmEl.hidden = false;
  else startNew(diffSel.value);
});
$('#confirm-no').addEventListener('click', () => { confirmEl.hidden = true; });
$('#confirm-yes').addEventListener('click', () => startNew(diffSel.value));
$('#again').addEventListener('click', () => startNew(diffSel.value));

// ---------- タイマー ----------
setInterval(() => {
  if (!S || S.done || document.hidden || !doneEl.hidden) return;
  S.elapsed++;
  timeEl.textContent = fmtTime(S.elapsed);
  if (S.elapsed % 5 === 0) save();
}, 1000);

// ---------- 起動 ----------
loadSettings();
renderSettings();
if (load()) {
  update();
  if (S.done) { doneEl.hidden = false; $('#done-time').textContent = fmtTime(S.elapsed); $('#done-sub').textContent = `${DIFF[S.diff].label} ／ まちがい ${S.mistakes} 回`; confetti(); }
} else {
  startNew(3);
}
})();
