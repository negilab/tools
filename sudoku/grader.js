// 人間の手筋だけで数独を解き、どの手筋まで必要だったかを返す（難しさの判定に使う）
// 手筋はパターン集（patterns.html）と対応している。
//   1: 残り1マス / 行と列で挟む / 周りに8つそろう / 行の中でそこだけ（シングル）
//   3: 2マスで2つの数字 / ブロックの中で1列に並ぶ / 行からブロックへ
//   4: 隠れた2つ（3つ） / 3マスで3つの数字 / X-ウイング / スカイスクレイパー
//   5: Y-ウイング（XYZ-ウイング） / ソードフィッシュ / ユニーク・レクタングル
//   解けなければ 6（このアプリでは出題しない）
(function (root) {
  'use strict';
  const row = (i) => (i / 9) | 0, col = (i) => i % 9, box = (i) => ((row(i) / 3) | 0) * 3 + ((col(i) / 3) | 0);
  const ROWS = [...Array(9)].map(() => []), COLS = [...Array(9)].map(() => []), BOXES = [...Array(9)].map(() => []);
  for (let i = 0; i < 81; i++) { ROWS[row(i)].push(i); COLS[col(i)].push(i); BOXES[box(i)].push(i); }
  const UNITS = [...ROWS, ...COLS, ...BOXES];
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const s = new Set([...ROWS[row(i)], ...COLS[col(i)], ...BOXES[box(i)]]); s.delete(i); PEERS.push([...s]);
  }
  const pop = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
  const bits = (m) => { const a = []; for (let n = 1; n <= 9; n++) if (m & (1 << n)) a.push(n); return a; };
  const combos = (arr, k, start = 0, cur = [], out = []) => {
    if (cur.length === k) { out.push(cur.slice()); return out; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
    return out;
  };

  function grade(puz) {
    const val = puz.slice();
    const c = new Array(81).fill(0);
    for (let i = 0; i < 81; i++) if (!val[i]) {
      let used = 0; for (const p of PEERS[i]) if (val[p]) used |= 1 << val[p];
      c[i] = 0x3fe & ~used;
    }
    const place = (i, n) => { val[i] = n; c[i] = 0; for (const p of PEERS[i]) c[p] &= ~(1 << n); };
    const remove = (cells, mask) => { let ch = false; for (const i of cells) { if (!val[i] && (c[i] & mask)) { c[i] &= ~mask; ch = true; } } return ch; };
    let hardest = 0;
    const used = new Set();

    // --- レベル1: シングル ---
    function singles() {
      for (let i = 0; i < 81; i++) if (!val[i] && pop(c[i]) === 1) { place(i, bits(c[i])[0]); return true; }
      for (const u of UNITS) for (let n = 1; n <= 9; n++) {
        let where = -1, cnt = 0;
        for (const i of u) { if (val[i] === n) { cnt = -1; break; } if (c[i] & (1 << n)) { cnt++; where = i; } }
        if (cnt === 1) { place(where, n); return true; }
      }
      return false;
    }
    // --- 2マスで2つ / 3マスで3つ（裸のサブセット） ---
    function nakedSubset(k) {
      for (const u of UNITS) {
        const empt = u.filter((i) => !val[i] && pop(c[i]) >= 2 && pop(c[i]) <= k);
        for (const cs of combos(empt, k)) {
          const m = cs.reduce((a, i) => a | c[i], 0);
          if (pop(m) !== k) continue;
          if (remove(u.filter((i) => !cs.includes(i)), m)) return true;
        }
      }
      return false;
    }
    // --- 隠れたサブセット（k個の数字がk個のマスにしか入れない） ---
    function hiddenSubset(k) {
      for (const u of UNITS) {
        const free = bits(u.reduce((a, i) => a | (val[i] ? 0 : c[i]), 0));
        for (const ds of combos(free, k)) {
          const mask = ds.reduce((a, n) => a | (1 << n), 0);
          const cells = u.filter((i) => !val[i] && (c[i] & mask));
          if (cells.length !== k) continue;
          let ch = false;
          for (const i of cells) if (c[i] & ~mask) { c[i] &= mask; ch = true; }
          if (ch) return true;
        }
      }
      return false;
    }
    // --- ブロックの中で1列に並ぶ（ブロック → 行・列） ---
    function pointing() {
      for (const b of BOXES) for (let n = 1; n <= 9; n++) {
        const cells = b.filter((i) => !val[i] && (c[i] & (1 << n)));
        if (cells.length < 2) continue;
        const r = row(cells[0]), cc = col(cells[0]);
        if (cells.every((i) => row(i) === r) && remove(ROWS[r].filter((i) => !b.includes(i)), 1 << n)) return true;
        if (cells.every((i) => col(i) === cc) && remove(COLS[cc].filter((i) => !b.includes(i)), 1 << n)) return true;
      }
      return false;
    }
    // --- 行からブロックへ（行・列 → ブロック） ---
    function claiming() {
      for (const line of [...ROWS, ...COLS]) for (let n = 1; n <= 9; n++) {
        const cells = line.filter((i) => !val[i] && (c[i] & (1 << n)));
        if (cells.length < 2) continue;
        const b = box(cells[0]);
        if (cells.every((i) => box(i) === b) && remove(BOXES[b].filter((i) => !line.includes(i)), 1 << n)) return true;
      }
      return false;
    }
    // --- X-ウイング（k=2）/ ソードフィッシュ（k=3） ---
    function fish(k) {
      for (let n = 1; n <= 9; n++) for (const [lines, cross, idx] of [[ROWS, COLS, col], [COLS, ROWS, row]]) {
        const cand = lines.map((u) => u.filter((i) => !val[i] && (c[i] & (1 << n))));
        const usable = [...Array(9).keys()].filter((l) => cand[l].length >= 2 && cand[l].length <= k);
        for (const ls of combos(usable, k)) {
          const cover = new Set(); for (const l of ls) for (const i of cand[l]) cover.add(idx(i));
          if (cover.size !== k) continue;
          const lineSet = new Set(ls);
          let ch = false;
          for (const x of cover) ch = remove(cross[x].filter((i) => !lineSet.has(lines === ROWS ? row(i) : col(i))), 1 << n) || ch;
          if (ch) return true;
        }
      }
      return false;
    }
    // --- Y-ウイング（XY-wing） ---
    function xyWing() {
      const two = []; for (let i = 0; i < 81; i++) if (!val[i] && pop(c[i]) === 2) two.push(i);
      for (const p of two) {
        const [a, b] = bits(c[p]);
        const wingsA = two.filter((w) => w !== p && PEERS[p].includes(w) && (c[w] & (1 << a)) && !(c[w] & (1 << b)));
        const wingsB = two.filter((w) => w !== p && PEERS[p].includes(w) && (c[w] & (1 << b)) && !(c[w] & (1 << a)));
        for (const w1 of wingsA) for (const w2 of wingsB) {
          const z = c[w1] & c[w2] & ~(1 << a) & ~(1 << b);
          if (!z || w1 === w2) continue;
          const targets = PEERS[w1].filter((i) => i !== p && i !== w2 && PEERS[w2].includes(i));
          if (remove(targets, z)) return true;
        }
      }
      return false;
    }

    // --- XYZ-ウイング（候補3つの軸 + 2つの羽） ---
    function xyzWing() {
      for (let p = 0; p < 81; p++) {
        if (val[p] || pop(c[p]) !== 3) continue;
        const wings = PEERS[p].filter((w) => !val[w] && pop(c[w]) === 2 && (c[w] & ~c[p]) === 0);
        for (const w1 of wings) for (const w2 of wings) {
          if (w1 >= w2) continue;
          const z = c[w1] & c[w2];
          if (pop(z) !== 1 || (c[w1] | c[w2]) !== c[p]) continue;
          const targets = PEERS[p].filter((i) => i !== w1 && i !== w2 && PEERS[w1].includes(i) && PEERS[w2].includes(i));
          if (remove(targets, z)) return true;
        }
      }
      return false;
    }
    // --- スカイスクレイパー（1つの数字の、強いつながり2本） ---
    function skyscraper() {
      for (let n = 1; n <= 9; n++) {
        const links = [];
        for (const u of UNITS) { const cs = u.filter((i) => !val[i] && (c[i] & (1 << n))); if (cs.length === 2) links.push(cs); }
        for (const [a, b] of links) for (const [cc, d] of links) {
          for (const [x, y, z, w] of [[a, b, cc, d], [a, b, d, cc], [b, a, cc, d], [b, a, d, cc]]) {
            // x-y が強いつながり、z-w が強いつながり、y と z が同じ行・列・ブロック（違うマス）
            if (y === z || x === w || x === z || y === w) continue;
            if (!PEERS[y].includes(z)) continue;
            const targets = PEERS[x].filter((i) => i !== y && i !== z && i !== w && PEERS[w].includes(i));
            if (remove(targets, 1 << n)) return true;
          }
        }
      }
      return false;
    }
    // --- ユニーク・レクタングル（答えが1通りであることを使う）---
    function uniqueRectangle() {
      for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
        const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
        if (cells.some((i) => val[i])) continue;
        if (new Set(cells.map(box)).size !== 2) continue;
        const two = cells.filter((i) => pop(c[i]) === 2);
        if (two.length !== 3) continue;
        const m = c[two[0]];
        if (two.some((i) => c[i] !== m)) continue;
        const other = cells.find((i) => pop(c[i]) !== 2);
        if ((c[other] & m) !== m) continue;
        if (remove([other], m)) return true;
      }
      return false;
    }

    const steps = [
      [1, 'single', singles],
      [3, 'nakedPair', () => nakedSubset(2)],
      [3, 'pointing', pointing],
      [3, 'claiming', claiming],
      [4, 'hiddenPair', () => hiddenSubset(2)],
      [4, 'nakedTriple', () => nakedSubset(3)],
      [4, 'xWing', () => fish(2)],
      [4, 'hiddenTriple', () => hiddenSubset(3)],
      [4, 'skyscraper', skyscraper],
      [5, 'yWing', xyWing],
      [5, 'xyzWing', xyzWing],
      [5, 'swordfish', () => fish(3)],
      [5, 'uniqueRectangle', uniqueRectangle],
    ];
    for (let guard = 0; guard < 2000; guard++) {
      if (val.every(Boolean)) {
        const clues = puz.filter(Boolean).length;
        const level = hardest <= 1 ? (clues >= 36 ? 1 : 2) : hardest;
        return { level, hardest, used: [...used], clues, solved: true, grid: val };
      }
      let progressed = false;
      for (const [lv, name, fn] of steps) {
        if (fn()) { hardest = Math.max(hardest, lv); used.add(name); progressed = true; break; }
      }
      if (!progressed) return { level: 6, hardest, used: [...used], clues: puz.filter(Boolean).length, solved: false };
    }
    return { level: 6, hardest, used: [...used], solved: false };
  }

  root.SudokuGrader = { grade };
})(typeof window !== 'undefined' ? window : globalThis);
