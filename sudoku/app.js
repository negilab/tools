(() => {
'use strict';

const HOLD_MS = 420;          // 長押し判定（CSSの --hold と合わせる）
const MOVE_CANCEL_PX = 12;    // 指がこれ以上動いたら長押しキャンセル
const STORAGE_KEY = 'yawaraka-sudoku-v1';
const DIFF = {
  easy:   { label: 'やさしい',   clues: 42 },
  normal: { label: 'ふつう',     clues: 34 },
  hard:   { label: 'むずかしい', clues: 27 },
};

const $ = (s) => document.querySelector(s);
const boardEl = $('#board');
const paletteEl = $('#palette');
const timeEl = $('#time');
const mistakesEl = $('#mistakes');
const statusEl = $('#status');
const eraserBtn = $('#eraser');
const undoBtn = $('#undo');
const diffSel = $('#difficulty');
const confirmEl = $('#confirm');
const doneEl = $('#done');

// ---------- 盤面の基礎 ----------
const row = (i) => (i / 9) | 0;
const col = (i) => i % 9;
const box = (i) => ((row(i) / 3) | 0) * 3 + ((col(i) / 3) | 0);
const PEERS = [];
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
// 条件: そのマスのメモが1つだけ、かつ 同じ行・列・ブロックのほかのマスに その数字のメモがない
// （見るのはプレイヤーのメモだけ。盤面の数字も答えも読まない。「2はこのどれか」と複数のマスに
//   2を書いている間は黒丸にならない。ほかの数字のメモを足しても黒丸は変わらない）
function sureDigit(i) {
  if (!S || S.val[i] || S.puz[i]) return 0;
  const m = S.memos[i];
  if (!m || (m & (m - 1))) return 0;          // ビットが1つだけか
  for (const p of PEERS[i]) if (!S.val[p] && (S.memos[p] & m)) return 0;
  return 31 - Math.clz32(m);
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

function makePuzzle(clues) {
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

// ---------- 状態 ----------
let S = null;          // { diff, puz, sol, val, memos, elapsed, mistakes, done }
let history = [];      // [{ val, memos }]
let sel = -1;          // 選択中のマス
let num = 0;           // パレットで選択中の数字（0 = なし）
let eraser = false;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ S, history: history.slice(-50), sel, num })); } catch (_) {}
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!d || !d.S || !Array.isArray(d.S.puz) || d.S.puz.length !== 81) return false;
    S = d.S; history = d.history || []; sel = d.sel ?? -1; num = d.num || 0;
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
  eraserBtn.setAttribute('aria-pressed', String(eraser));
  undoBtn.disabled = history.length === 0 || S.done;
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
  // 数字を選んでいる間（メモ／確定）と、数字が入っているマス（タップでその数字に切り替え）は選択状態にしない
  if (!num && !eraser && !S.val[i]) selectCell(i);
  const sure = eraser ? 0 : sureDigit(i);
  const willCommit = !S.done && !S.puz[i] && (eraser || num > 0 || sure > 0 || S.val[i] > 0 || S.memos[i] > 0);
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
  if (S.val[i]) {                      // 数字が入っているマス → その数字に切り替え
    num = S.val[i]; sel = -1;
    update(); save();
    lastTap = { i: -1, t: 0, memoToggled: false };
    return;
  }
  const now = Date.now();
  const isDouble = lastTap.i === i && now - lastTap.t < DOUBLE_TAP_MS;
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
eraserBtn.addEventListener('click', () => { eraser = !eraser; if (eraser) num = 0; lastTap = { i: -1, t: 0, memoToggled: false }; update(); save(); });
undoBtn.addEventListener('click', () => { lastTap = { i: -1, t: 0, memoToggled: false }; undo(); });

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
    const { puz, sol } = makePuzzle(DIFF[diff].clues);
    S = { diff, puz, sol, val: puz.slice(), memos: new Array(81).fill(0), elapsed: 0, mistakes: 0, done: false };
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
if (load()) {
  update();
  if (S.done) { doneEl.hidden = false; $('#done-time').textContent = fmtTime(S.elapsed); $('#done-sub').textContent = `${DIFF[S.diff].label} ／ まちがい ${S.mistakes} 回`; confetti(); }
} else {
  startNew('normal');
}
})();
