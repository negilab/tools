/* PDF編集 — ブラウザ内で完結するPDFエディタ
   pdf.js (Apache-2.0) / pdf-lib (MIT) / fontkit (MIT) / Noto Sans CJK JP (OFL-1.1) */
(function () {
'use strict';

var ASSETS = './pdf-assets/';
pdfjsLib.GlobalWorkerOptions.workerSrc = ASSETS + 'pdf.worker.min.js';

var PL = PDFLib;
var FONT_STACK = '"PDFEditJP","Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif';

/* ============================== 小道具 ============================== */
var $ = function (s) { return document.querySelector(s); };
var _n = 0;
function uid(p) { return (p || 'a') + (++_n) + Math.random().toString(36).slice(2, 6); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function deep(o) { return JSON.parse(JSON.stringify(o)); }
function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function hex2rgb(h) {
  h = String(h || '#000').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
function pdfColor(h) { var c = hex2rgb(h); return PL.rgb(c.r, c.g, c.b); }
function rad(d) { return d * Math.PI / 180; }
function norm360(d) { return ((d % 360) + 360) % 360; }

var toastT;
function toast(msg, ms) {
  var t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 2600);
}
function busy(msg) { $('#busyMsg').textContent = msg || '処理中…'; $('#busy').classList.add('on'); }
function unbusy() { $('#busy').classList.remove('on'); }
function status(msg) { $('#status').textContent = msg || ''; }

/* ============================== 状態 ============================== */
var S = {
  docs: {},        // docId -> {name, bytes, pdfjs, libDoc}
  pages: [],       // {pid, docId, srcIndex, baseRot, extraRot, w0, h0, bw, bh}
  anns: {},        // pid -> [ann]
  images: {},      // key -> dataURL
  view: {},        // pid -> {el, inner, cvs, ov, mul, tlayer, hit, iact, scale, hitReady}
  sel: null,
  tool: 'select',
  zoom: 1,
  cur: 0,
  fileName: 'document.pdf',
  hist: [], hi: -1,
  style: { color: '#e0322a', fill: 'none', lw: 2, size: 14, bold: false, hl: '#ffe14d', op: 1, lh: 1.4 },
  eraseOnly: false
};

/* ============================== 座標変換 ==============================
   基準ビューポート = pdf.js の viewport(scale:1, rotation: baseRot)
   左上原点・y下向き。注釈はすべてこの座標系で保持する。            */
function invMatrix(m) {
  var det = m[0] * m[3] - m[1] * m[2];
  if (!det) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
  (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
function applyM(m, x, y) { return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }; }
// ページ p の基準ビューポート座標 → PDFユーザー座標
function userMapper(p) {
  if (p.inv) return function (vx, vy) { return applyM(p.inv, vx, vy); };
  return function (vx, vy) { return vpToUser(p.baseRot, p.w0, p.h0, vx, vy); };
}
function vpToUser(rot, w0, h0, vx, vy) {
  rot = norm360(rot);
  if (rot === 90) return { x: vy, y: vx };
  if (rot === 180) return { x: w0 - vx, y: vy };
  if (rot === 270) return { x: w0 - vy, y: h0 - vx };
  return { x: vx, y: h0 - vy };
}
// 表示上の回転 extraRot を打ち消して、ポインタ座標→基準ビューポート座標
function ptFromEvent(p, ev) {
  var v = S.view[p.pid]; if (!v) return { x: 0, y: 0 };
  var r = v.el.getBoundingClientRect();
  var dx = ev.clientX - r.left, dy = ev.clientY - r.top;
  var W = p.bw * S.zoom, H = p.bh * S.zoom, E = norm360(p.extraRot), x, y;
  if (E === 90) { x = dy; y = H - dx; }
  else if (E === 180) { x = W - dx; y = H - dy; }
  else if (E === 270) { x = W - dy; y = dx; }
  else { x = dx; y = dy; }
  return { x: x / S.zoom, y: y / S.zoom };
}

/* ============================== フォント ============================== */
var FONT = { bytes: null, ready: false, loading: false, name: 'Noto Sans JP (同梱)' };
function fontHint() {
  var h = $('#fontHint');
  if (FONT.ready) h.innerHTML = '文字は<b>検索できるテキスト</b>として埋め込まれます（' + FONT.name + '）。<br>チェックを入れると画像化して焼き込みます。';
  else if (FONT.loading) h.textContent = '日本語フォントを読み込み中…';
  else h.innerHTML = 'フォント未読込のため、文字は<b>画像として</b>焼き込まれます。<button class="btn" id="bFont" style="margin-top:6px;height:26px">フォントを指定</button>';
  var b = $('#bFont'); if (b) b.onclick = function () { $('#fFont').click(); };
}
async function loadFont(buf, label) {
  FONT.bytes = new Uint8Array(buf);
  try {
    var ff = new FontFace('PDFEditJP', buf.slice(0));
    await ff.load(); document.fonts.add(ff);
    FONT.ready = true; FONT.name = label || FONT.name;
  } catch (e) { FONT.ready = false; console.warn('FontFace失敗', e); }
  FONT.loading = false; fontHint(); relayoutText();
}
async function initFont() {
  if (FONT.loading || FONT.ready) return;
  FONT.loading = true; fontHint();
  try {
    var r = await fetch(ASSETS + 'NotoSansJP-Regular-jp.otf');
    if (!r.ok) throw new Error(r.status);
    await loadFont(await r.arrayBuffer(), 'Noto Sans JP (同梱)');
  } catch (e) { FONT.loading = false; FONT.ready = false; fontHint(); console.warn('同梱フォント読込失敗', e); }
}
var _mc = document.createElement('canvas').getContext('2d');
function fmetrics(size) {
  _mc.font = size + 'px ' + FONT_STACK;
  var m = _mc.measureText('あAgぱ');
  var A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
  if (!isFinite(A) || !A) { A = size * 1.16; D = size * 0.32; }
  return { A: A, D: D };
}
function measureLine(txt, size) { _mc.font = size + 'px ' + FONT_STACK; return _mc.measureText(txt).width; }
// テキスト行の「1行目ベースライン位置」(要素上端からの距離)
function baselineOffset(size, lh) {
  var LH = size * lh, m = fmetrics(size);
  return (LH - (m.A + m.D)) / 2 + m.A;
}

var _fontkit = null;
function loadScript(src) {
  return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function getFontkit() {
  if (_fontkit) return _fontkit;
  if (!window.fontkit) await loadScript(ASSETS + 'fontkit.umd.min.js');
  _fontkit = window.fontkit; return _fontkit;
}

/* ============================== ドキュメント読込 ============================== */
async function openPdf(file, append) {
  busy('PDFを読み込んでいます…');
  try {
    var buf = await file.arrayBuffer();
    var bytes = new Uint8Array(buf);
    var doc = await pdfjsLib.getDocument({
      data: bytes.slice(0),
      cMapUrl: ASSETS + 'cmaps/', cMapPacked: true,
      standardFontDataUrl: ASSETS + 'standard_fonts/'
    }).promise;
    var docId = uid('d');
    S.docs[docId] = { name: file.name, bytes: bytes, pdfjs: doc, libDoc: null };
    if (!append) { S.pages = []; S.anns = {}; S.view = {}; $('#viewer').innerHTML = ''; S.fileName = file.name; }
    for (var i = 1; i <= doc.numPages; i++) {
      var pg = await doc.getPage(i);
      var vp = pg.getViewport({ scale: 1 });
      var un = pg.getViewport({ scale: 1, rotation: 0 });
      S.pages.push({
        pid: uid('p'), docId: docId, srcIndex: i - 1,
        baseRot: norm360(pg.rotate), extraRot: 0,
        w0: un.width, h0: un.height, bw: vp.width, bh: vp.height,
        inv: invMatrix(vp.transform)
      });
    }
    S.sel = null;
    rebuild(); pushHist();
    $('#empty').style.display = 'none';
    $('#bAdd').disabled = false; $('#bSave').disabled = false;
    status(S.fileName + '（' + S.pages.length + 'ページ）');
    if (!append) fitWidth();
    initFont();
  } catch (e) {
    console.error(e);
    alert('PDFを読み込めませんでした。\n' + (e && e.message ? e.message : '') + '\nパスワード付きPDFは、先に解除してからお試しください。');
  }
  unbusy();
}
async function getPdfPage(p) { return S.docs[p.docId].pdfjs.getPage(p.srcIndex + 1); }
async function getLibDoc(docId) {
  var d = S.docs[docId];
  if (!d.libDoc) {
    d.libDoc = await PL.PDFDocument.load(d.bytes, { ignoreEncryption: true });
    // 入力欄付きPDFは、見た目どおりに保存できるよう内容を固定する
    try {
      var form = d.libDoc.getForm();
      if (form && form.getFields().length) { form.flatten(); d.flattened = true; }
    } catch (e) { console.warn('入力欄の固定に失敗:', e); }
  }
  return d.libDoc;
}

/* ============================== ページDOM ============================== */
function rebuild() {
  var viewer = $('#viewer');
  var frag = document.createDocumentFragment();
  S.pages.forEach(function (p) {
    var v = S.view[p.pid];
    if (!v) { v = buildPageEl(p); S.view[p.pid] = v; }
    frag.appendChild(v.el);
  });
  viewer.innerHTML = ''; viewer.appendChild(frag);
  // 使われなくなったビューを掃除
  var live = {}; S.pages.forEach(function (p) { live[p.pid] = 1; });
  Object.keys(S.view).forEach(function (k) { if (!live[k]) delete S.view[k]; });
  layoutAll(); buildThumbs(); renderVisible(); syncUI();
}

function buildPageEl(p) {
  var pel = el('div', 'page'); pel.dataset.pid = p.pid;
  var inner = el('div', 'page-inner');
  var cvs = document.createElement('canvas');
  var mul = document.createElement('canvas'); mul.className = 'mul';
  var ov = document.createElement('canvas');
  var tlayer = el('div', 'layer tlayer');
  var hit = el('div', 'layer hitlayer');
  var iact = el('div', 'iact');
  inner.appendChild(cvs); inner.appendChild(mul); inner.appendChild(ov);
  inner.appendChild(hit); inner.appendChild(iact); inner.appendChild(tlayer);
  pel.appendChild(inner);
  var v = { el: pel, inner: inner, cvs: cvs, ov: ov, mul: mul, tlayer: tlayer, hit: hit, iact: iact, scale: 0, hitReady: false };
  bindPage(p, v);
  return v;
}

function layoutAll() { S.pages.forEach(layoutPage); }
function layoutPage(p) {
  var v = S.view[p.pid]; if (!v) return;
  var W = p.bw * S.zoom, H = p.bh * S.zoom, E = norm360(p.extraRot);
  v.inner.style.width = W + 'px'; v.inner.style.height = H + 'px';
  if (E === 90) { v.el.style.width = H + 'px'; v.el.style.height = W + 'px'; v.inner.style.transform = 'translate(' + H + 'px,0) rotate(90deg)'; }
  else if (E === 180) { v.el.style.width = W + 'px'; v.el.style.height = H + 'px'; v.inner.style.transform = 'translate(' + W + 'px,' + H + 'px) rotate(180deg)'; }
  else if (E === 270) { v.el.style.width = H + 'px'; v.el.style.height = W + 'px'; v.inner.style.transform = 'translate(0,' + W + 'px) rotate(270deg)'; }
  else { v.el.style.width = W + 'px'; v.el.style.height = H + 'px'; v.inner.style.transform = 'none'; }
  [v.cvs, v.mul, v.ov].forEach(function (c) { c.style.width = W + 'px'; c.style.height = H + 'px'; });
  drawOverlay(p); layoutText(p);
  if (v.hitReady) placeHitboxes(p);
}

async function renderPage(p) {
  var v = S.view[p.pid]; if (!v) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  var scale = S.zoom * dpr;
  if (v.scale === scale) return;
  v.scale = scale;
  try {
    var pg = await getPdfPage(p);
    var vp = pg.getViewport({ scale: scale, rotation: p.baseRot });
    var w = Math.max(1, Math.round(vp.width)), h = Math.max(1, Math.round(vp.height));
    [v.cvs, v.mul, v.ov].forEach(function (c) { c.width = w; c.height = h; });
    if (v.task) { try { v.task.cancel(); } catch (e) { } }
    var ctx = v.cvs.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    v.task = pg.render({ canvasContext: ctx, viewport: vp });
    await v.task.promise; v.task = null;
    drawOverlay(p);
  } catch (e) { if (!e || e.name !== 'RenderingCancelledException') console.warn(e); v.scale = 0; }
}
function renderVisible() {
  var wrap = $('#viewerWrap'), H = wrap.clientHeight;
  var top = wrap.scrollTop - 400, bot = wrap.scrollTop + H + 800;
  var ftop = wrap.scrollTop - H * 3, fbot = wrap.scrollTop + H * 4;
  S.pages.forEach(function (p, i) {
    var v = S.view[p.pid]; if (!v) return;
    var y = v.el.offsetTop, y2 = y + v.el.offsetHeight;
    if (y2 > top && y < bot) { renderPage(p); if (S.tool === 'edittext') prepareHitboxes(p); }
    else if (v.scale && (y2 < ftop || y > fbot)) freePage(p);
    if (y <= wrap.scrollTop + 60 && y2 > wrap.scrollTop + 60) setCur(i);
  });
}
// 遠くのページはキャンバスを畳んでメモリを返す（注釈データは保持）
function freePage(p) {
  var v = S.view[p.pid]; if (!v) return;
  if (v.task) { try { v.task.cancel(); } catch (e) { } v.task = null; }
  [v.cvs, v.mul, v.ov].forEach(function (c) { c.width = 1; c.height = 1; });
  v.scale = 0;
}
function setCur(i) {
  if (S.cur === i) return; S.cur = i;
  Array.prototype.forEach.call($('#thumbList').children, function (c, k) { c.classList.toggle('cur', k === i); });
}

/* ============================== 注釈の描画（画面） ============================== */
function anns(pid) { return (S.anns[pid] = S.anns[pid] || []); }

function drawOverlay(p) {
  var v = S.view[p.pid]; if (!v || !v.ov.width) return;
  var k = v.ov.width / p.bw;
  [[v.ov, false], [v.mul, true]].forEach(function (pair) {
    var ctx = pair[0].getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pair[0].width, pair[0].height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    anns(p.pid).forEach(function (a) {
      if (a.type === 'text') return;
      if ((a.type === 'hl') !== pair[1]) return;
      drawAnnCanvas(ctx, a);
    });
  });
  // 選択枠
  var ctx = v.ov.getContext('2d');
  var sel = findAnn(S.sel);
  if (sel && sel.pid === p.pid && sel.a.type !== 'text') {
    var b = annBox(sel.a);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.strokeStyle = '#2f6feb'; ctx.lineWidth = 1.2 / S.zoom; ctx.setLineDash([4 / S.zoom, 3 / S.zoom]);
    ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); ctx.setLineDash([]);
    ctx.fillStyle = '#2f6feb';
    handlePts(b).forEach(function (h) { ctx.fillRect(h.x - 3.2 / S.zoom, h.y - 3.2 / S.zoom, 6.4 / S.zoom, 6.4 / S.zoom); });
  }
}
function drawAnnCanvas(ctx, a) {
  ctx.globalAlpha = a.op != null ? a.op : 1;
  switch (a.type) {
    case 'white':
      ctx.fillStyle = a.color; ctx.fillRect(a.x, a.y, a.w, a.h); break;
    case 'hl':
      ctx.fillStyle = a.color; ctx.fillRect(a.x, a.y, a.w, a.h); break;
    case 'rect':
      if (a.fill && a.fill !== 'none') { ctx.fillStyle = a.fill; ctx.fillRect(a.x, a.y, a.w, a.h); }
      if (a.lw > 0) { ctx.strokeStyle = a.color; ctx.lineWidth = a.lw; ctx.strokeRect(a.x, a.y, a.w, a.h); }
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, Math.abs(a.w / 2), Math.abs(a.h / 2), 0, 0, Math.PI * 2);
      if (a.fill && a.fill !== 'none') { ctx.fillStyle = a.fill; ctx.fill(); }
      if (a.lw > 0) { ctx.strokeStyle = a.color; ctx.lineWidth = a.lw; ctx.stroke(); }
      break;
    case 'line': case 'arrow':
      ctx.strokeStyle = a.color; ctx.lineWidth = a.lw;
      ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke();
      if (a.type === 'arrow') { arrowHead(ctx, a).forEach(function (seg) { ctx.beginPath(); ctx.moveTo(seg[0], seg[1]); ctx.lineTo(seg[2], seg[3]); ctx.stroke(); }); }
      break;
    case 'pen':
      ctx.strokeStyle = a.color; ctx.lineWidth = a.lw;
      ctx.beginPath();
      a.pts.forEach(function (q, i) { i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      if (a.pts.length === 1) { ctx.lineTo(a.pts[0][0] + .1, a.pts[0][1]); }
      ctx.stroke(); break;
    case 'image':
      var im = imgEl(a.key); if (im && im.complete) ctx.drawImage(im, a.x, a.y, a.w, a.h);
      break;
  }
  ctx.globalAlpha = 1;
}
function arrowHead(ctx, a) {
  var ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = Math.max(7, a.lw * 4.2), s = 0.42;
  return [
    [a.x2, a.y2, a.x2 - L * Math.cos(ang - s), a.y2 - L * Math.sin(ang - s)],
    [a.x2, a.y2, a.x2 - L * Math.cos(ang + s), a.y2 - L * Math.sin(ang + s)]
  ];
}
var _imgs = {};
function imgEl(key) {
  if (!S.images[key]) return null;
  if (!_imgs[key]) { var i = new Image(); i.onload = function () { S.pages.forEach(drawOverlay); }; i.src = S.images[key]; _imgs[key] = i; }
  return _imgs[key];
}
function annBox(a) {
  if (a.type === 'line' || a.type === 'arrow') return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  if (a.type === 'pen') {
    var xs = a.pts.map(function (q) { return q[0]; }), ys = a.pts.map(function (q) { return q[1]; });
    return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
  }
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}
function handlePts(b) {
  return [{ x: b.x, y: b.y, k: 'nw' }, { x: b.x + b.w / 2, y: b.y, k: 'n' }, { x: b.x + b.w, y: b.y, k: 'ne' },
  { x: b.x + b.w, y: b.y + b.h / 2, k: 'e' }, { x: b.x + b.w, y: b.y + b.h, k: 'se' },
  { x: b.x + b.w / 2, y: b.y + b.h, k: 's' }, { x: b.x, y: b.y + b.h, k: 'sw' }, { x: b.x, y: b.y + b.h / 2, k: 'w' }];
}
function findAnn(id) {
  if (!id) return null;
  for (var pid in S.anns) { var arr = S.anns[pid]; for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return { pid: pid, a: arr[i], i: i }; }
  return null;
}

/* ============================== テキスト注釈（DOM） ============================== */
function layoutText(p) {
  var v = S.view[p.pid]; if (!v) return;
  var have = {};
  anns(p.pid).forEach(function (a) {
    if (a.type !== 'text') return;
    have[a.id] = 1;
    var d = v.tlayer.querySelector('[data-id="' + a.id + '"]');
    if (!d) { d = makeTextEl(p, a); v.tlayer.appendChild(d); }
    styleTextEl(d, a);
  });
  Array.prototype.slice.call(v.tlayer.children).forEach(function (c) { if (!have[c.dataset.id]) c.remove(); });
}
function relayoutText() { S.pages.forEach(layoutText); }
function styleTextEl(d, a) {
  var z = S.zoom;
  d.style.left = (a.x * z) + 'px'; d.style.top = (a.y * z) + 'px';
  d.style.fontSize = (a.size * z) + 'px';
  d.style.lineHeight = (a.size * a.lh * z) + 'px';
  d.style.color = a.color;
  d.style.transform = a.rot ? 'rotate(' + a.rot + 'deg)' : 'none';
  d.style.transformOrigin = '0 0';
  d.style.opacity = a.op != null ? a.op : 1;
  d.classList.toggle('bold', !!a.bold);
  d.classList.toggle('sel', S.sel === a.id);
  if (d.dataset.txt !== a.text) { d.textContent = a.text; d.dataset.txt = a.text; }
}
function makeTextEl(p, a) {
  var d = el('div', 'tann'); d.dataset.id = a.id;
  d.addEventListener('pointerdown', function (ev) {
    if (S.tool !== 'select') return;
    ev.stopPropagation();
    select(a.id);
    if (d.classList.contains('editing')) return;
    startDragText(p, a, ev, d);
  });
  d.addEventListener('dblclick', function (ev) { ev.stopPropagation(); editText(d, a); });
  d.addEventListener('blur', function () {
    d.classList.remove('editing'); d.contentEditable = 'false';
    a.text = d.innerText.replace(/ /g, ' ').replace(/\n$/, '');
    d.dataset.txt = a.text;
    if (!a.text.trim()) { removeAnn(a.id); return; }
    if (d.dataset.orig !== a.text) pushHist();
  });
  d.addEventListener('input', function () { a.text = d.innerText.replace(/ /g, ' ').replace(/\n$/, ''); d.dataset.txt = a.text; });
  d.addEventListener('paste', function (ev) {
    ev.preventDefault();
    var t = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  });
  d.addEventListener('keydown', function (ev) {
    ev.stopPropagation();
    if (ev.key === 'Escape') { d.blur(); }
  });
  return d;
}
function editText(d, a) {
  try { d.contentEditable = 'plaintext-only'; } catch (e) { d.contentEditable = 'true'; }
  if (d.contentEditable !== 'plaintext-only') d.contentEditable = 'true';
  d.classList.add('editing'); d.dataset.orig = a.text; d.focus();
  var r = document.createRange(); r.selectNodeContents(d);
  var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
}
function startDragText(p, a, ev, d) {
  var st = ptFromEvent(p, ev), ox = a.x, oy = a.y, moved = false;
  d.setPointerCapture(ev.pointerId);
  function mv(e) {
    var q = ptFromEvent(p, e);
    a.x = ox + (q.x - st.x); a.y = oy + (q.y - st.y);
    if (Math.abs(q.x - st.x) + Math.abs(q.y - st.y) > 1) moved = true;
    styleTextEl(d, a);
  }
  function up() {
    d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up);
    if (moved) pushHist();
  }
  d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up);
}

/* ============================== 操作 ============================== */
function bindPage(p, v) {
  v.iact.addEventListener('pointerdown', function (ev) { onDown(p, v, ev); });
  v.el.addEventListener('click', function () { var i = S.pages.indexOf(p); if (i >= 0) setCur(i); });
}

function onDown(p, v, ev) {
  if (ev.button === 2) return;
  var q = ptFromEvent(p, ev);
  var t = S.tool;
  v.iact.setPointerCapture(ev.pointerId);

  if (t === 'select') {
    var hit = hitAnn(p, q);
    if (!hit) { select(null); startPan(v, ev); return; }
    select(hit.a.id);
    var h = hitHandle(hit.a, q);
    if (h) startResize(p, v, hit.a, h, ev); else startMove(p, v, hit.a, ev);
    return;
  }
  if (t === 'text') {
    // ページを回して使っている時も、画面上で正立して見えるようにする
    var a = { id: uid('t'), type: 'text', x: q.x, y: q.y - baselineOffset(S.style.size, S.style.lh),
      size: S.style.size, color: S.style.color, bold: S.style.bold, lh: S.style.lh,
      rot: norm360(-p.extraRot), op: 1, text: '' };
    anns(p.pid).push(a); layoutText(p); select(a.id);
    var d = v.tlayer.querySelector('[data-id="' + a.id + '"]');
    setTool('select'); setTimeout(function () { editText(d, a); }, 0);
    return;
  }
  if (t === 'image') { pendingImagePage = { p: p, q: q }; $('#fImg').click(); return; }
  if (t === 'pen') { startPen(p, v, q, ev); return; }
  startShape(p, v, q, ev, t);
}

// 何もない所をドラッグ＝スクロール
function startPan(v, ev) {
  var wrap = $('#viewerWrap'), sx = ev.clientX, sy = ev.clientY;
  var l0 = wrap.scrollLeft, t0 = wrap.scrollTop;
  function mv(e) { wrap.scrollLeft = l0 - (e.clientX - sx); wrap.scrollTop = t0 - (e.clientY - sy); }
  endWith(v, mv, function () { });
}
function hitAnn(p, q) {
  var arr = anns(p.pid);
  for (var i = arr.length - 1; i >= 0; i--) {
    var a = arr[i]; if (a.type === 'text') continue;
    var b = annBox(a), pad = Math.max(4, (a.lw || 0));
    if (q.x >= b.x - pad && q.x <= b.x + b.w + pad && q.y >= b.y - pad && q.y <= b.y + b.h + pad) return { a: a, i: i };
  }
  return null;
}
function hitHandle(a, q) {
  if (a.type === 'pen') return null;
  var tol = 7 / S.zoom;
  if (a.type === 'line' || a.type === 'arrow') {
    if (Math.hypot(q.x - a.x1, q.y - a.y1) < tol) return 'p1';
    if (Math.hypot(q.x - a.x2, q.y - a.y2) < tol) return 'p2';
    return null;
  }
  var hs = handlePts(annBox(a));
  for (var i = 0; i < hs.length; i++) if (Math.abs(q.x - hs[i].x) < tol && Math.abs(q.y - hs[i].y) < tol) return hs[i].k;
  return null;
}
function startMove(p, v, a, ev) {
  var st = ptFromEvent(p, ev), o = deep(a), moved = false;
  function mv(e) {
    var q = ptFromEvent(p, e), dx = q.x - st.x, dy = q.y - st.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) moved = true;
    if (a.type === 'line' || a.type === 'arrow') { a.x1 = o.x1 + dx; a.y1 = o.y1 + dy; a.x2 = o.x2 + dx; a.y2 = o.y2 + dy; }
    else if (a.type === 'pen') { a.pts = o.pts.map(function (t) { return [t[0] + dx, t[1] + dy]; }); }
    else { a.x = o.x + dx; a.y = o.y + dy; }
    drawOverlay(p);
  }
  endWith(v, mv, function () { if (moved) pushHist(); });
}
function startResize(p, v, a, k, ev) {
  var o = deep(a);
  function mv(e) {
    var q = ptFromEvent(p, e);
    if (k === 'p1') { a.x1 = q.x; a.y1 = q.y; }
    else if (k === 'p2') { a.x2 = q.x; a.y2 = q.y; }
    else {
      var x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (k.indexOf('w') >= 0) x1 = q.x; if (k.indexOf('e') >= 0) x2 = q.x;
      if (k.indexOf('n') >= 0) y1 = q.y; if (k.indexOf('s') >= 0) y2 = q.y;
      a.x = Math.min(x1, x2); a.y = Math.min(y1, y2); a.w = Math.abs(x2 - x1); a.h = Math.abs(y2 - y1);
    }
    drawOverlay(p);
  }
  endWith(v, mv, function () { pushHist(); });
}
function startPen(p, v, q, ev) {
  var a = { id: uid('k'), type: 'pen', pts: [[q.x, q.y]], color: S.style.color, lw: S.style.lw, op: S.style.op };
  anns(p.pid).push(a);
  function mv(e) {
    var t = ptFromEvent(p, e), l = a.pts[a.pts.length - 1];
    if (Math.hypot(t.x - l[0], t.y - l[1]) > 1.2 / S.zoom) { a.pts.push([t.x, t.y]); drawOverlay(p); }
  }
  endWith(v, mv, function () { simplify(a); drawOverlay(p); select(a.id); pushHist(); });
}
function simplify(a) {
  if (a.pts.length < 3) return;
  var out = [a.pts[0]];
  for (var i = 1; i < a.pts.length - 1; i++) {
    var p0 = out[out.length - 1], p1 = a.pts[i], p2 = a.pts[i + 1];
    var d = Math.abs((p2[0] - p0[0]) * (p0[1] - p1[1]) - (p0[0] - p1[0]) * (p2[1] - p0[1])) / (Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) || 1);
    if (d > 0.35) out.push(p1);
  }
  out.push(a.pts[a.pts.length - 1]); a.pts = out;
}
function startShape(p, v, q, ev, t) {
  var a;
  if (t === 'line' || t === 'arrow') a = { id: uid('s'), type: t, x1: q.x, y1: q.y, x2: q.x, y2: q.y, color: S.style.color, lw: S.style.lw, op: S.style.op };
  else if (t === 'hl') a = { id: uid('s'), type: 'hl', x: q.x, y: q.y, w: 0, h: 0, color: S.style.hl, op: 1 };
  else if (t === 'white') a = { id: uid('s'), type: 'white', x: q.x, y: q.y, w: 0, h: 0, color: '#ffffff', op: 1 };
  else a = { id: uid('s'), type: t, x: q.x, y: q.y, w: 0, h: 0, color: S.style.color, fill: S.style.fill, lw: S.style.lw, op: S.style.op };
  anns(p.pid).push(a);
  function mv(e) {
    var r = ptFromEvent(p, e);
    if (a.type === 'line' || a.type === 'arrow') {
      a.x2 = r.x; a.y2 = r.y;
      if (e.shiftKey) { if (Math.abs(r.x - a.x1) > Math.abs(r.y - a.y1)) a.y2 = a.y1; else a.x2 = a.x1; }
    } else {
      a.x = Math.min(q.x, r.x); a.y = Math.min(q.y, r.y);
      a.w = Math.abs(r.x - q.x); a.h = Math.abs(r.y - q.y);
      if (e.shiftKey && a.type === 'hl') a.h = Math.min(a.h, S.style.size * 1.2);
    }
    drawOverlay(p);
  }
  endWith(v, mv, function () {
    var b = annBox(a);
    if ((a.type === 'line' || a.type === 'arrow') ? (b.w + b.h < 2) : (b.w < 2 || b.h < 2)) { removeAnn(a.id, true); return; }
    select(a.id); pushHist();   // ツールは保ったまま＝続けて描ける
  });
}
function endWith(v, mv, done) {
  function up() {
    v.iact.removeEventListener('pointermove', mv);
    v.iact.removeEventListener('pointerup', up);
    v.iact.removeEventListener('pointercancel', up);
    done();
  }
  v.iact.addEventListener('pointermove', mv);
  v.iact.addEventListener('pointerup', up);
  v.iact.addEventListener('pointercancel', up);
}

// 画面上の回転を打ち消す向きにビットマップ自体を回す
function rotateImage(img, extraDeg) {
  var deg = norm360(-extraDeg), sw = img.width, sh = img.height;
  var c = document.createElement('canvas');
  var swap = (deg === 90 || deg === 270);
  c.width = swap ? sh : sw; c.height = swap ? sw : sh;
  var ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate(rad(deg));
  ctx.drawImage(img, -sw / 2, -sh / 2);
  return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
}
var pendingImagePage = null;
$('#fImg').addEventListener('change', function (e) {
  var f = e.target.files[0]; e.target.value = '';
  if (!f || !pendingImagePage) return;
  var rd = new FileReader();
  rd.onload = function () {
    var img = new Image();
    img.onload = function () {
      var p = pendingImagePage.p, q = pendingImagePage.q; pendingImagePage = null;
      var src = rd.result, iw = img.width, ih = img.height;
      var E = norm360(p.extraRot);
      if (E) { var r2 = rotateImage(img, E); src = r2.url; iw = r2.w; ih = r2.h; }
      var key = uid('i'); S.images[key] = src; delete _imgs[key];
      var maxw = Math.min(p.bw * 0.35, 220), sc = Math.min(1, maxw / iw);
      var a = { id: uid('m'), type: 'image', key: key, x: q.x, y: q.y, w: iw * sc, h: ih * sc, op: 1 };
      anns(p.pid).push(a); imgEl(key); drawOverlay(p); setTool('select'); select(a.id); pushHist();
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
});

function select(id) {
  S.sel = id;
  S.pages.forEach(function (p) { drawOverlay(p); layoutText(p); });
  syncProps();
}
function removeAnn(id, silent) {
  var f = findAnn(id); if (!f) return;
  S.anns[f.pid].splice(f.i, 1);
  if (S.sel === id) S.sel = null;
  var p = S.pages.find(function (x) { return x.pid === f.pid; });
  if (p) { drawOverlay(p); layoutText(p); }
  syncProps(); if (!silent) pushHist();
}

/* ============================== 既存文字の差し替え ============================== */
async function prepareHitboxes(p) {
  var v = S.view[p.pid]; if (!v || v.hitReady) return;
  var pg = await getPdfPage(p);
  var tc = await pg.getTextContent();
  var vp1 = pg.getViewport({ scale: 1, rotation: p.baseRot });
  var boxes = [];
  tc.items.forEach(function (it) {
    if (!it.str || !it.str.trim()) return;
    var m = pdfjsLib.Util.transform(vp1.transform, it.transform);
    var fs = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]);
    if (!fs) return;
    var ang = Math.atan2(m[1], m[0]);
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var A = fs * 0.88, D = fs * 0.26, w = it.width || measureLine(it.str, fs);
    var pts = [[0, -A], [w, -A], [w, D], [0, D]].map(function (q) {
      return [m[4] + q[0] * ca - q[1] * sa, m[5] + q[0] * sa + q[1] * ca];
    });
    var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
    boxes.push({
      str: it.str, size: fs, ang: ang, bx: m[4], by: m[5], w: w,
      x: Math.min.apply(null, xs), y: Math.min.apply(null, ys),
      bw: Math.max.apply(null, xs) - Math.min.apply(null, xs),
      bh: Math.max.apply(null, ys) - Math.min.apply(null, ys)
    });
  });
  v.boxes = boxes; v.hitReady = true; placeHitboxes(p);
}
function visiblePages() {
  var wrap = $('#viewerWrap'), top = wrap.scrollTop - 200, bot = wrap.scrollTop + wrap.clientHeight + 400;
  return S.pages.filter(function (p) {
    var v = S.view[p.pid]; if (!v) return false;
    return v.el.offsetTop + v.el.offsetHeight > top && v.el.offsetTop < bot;
  });
}
async function prepareVisibleHitboxes() {
  var list = visiblePages();
  for (var i = 0; i < list.length; i++) await prepareHitboxes(list[i]);
  var any = list.some(function (p) { var v = S.view[p.pid]; return v && v.boxes && v.boxes.length; });
  if (list.length && !any) toast('このページには文字データがありません（スキャン画像のPDFなど）', 3800);
}
function placeHitboxes(p) {
  var v = S.view[p.pid]; if (!v || !v.boxes) return;
  v.hit.innerHTML = '';
  var z = S.zoom, frag = document.createDocumentFragment();
  v.boxes.forEach(function (b, i) {
    var d = el('div', 'hitbox');
    d.style.left = (b.x * z) + 'px'; d.style.top = (b.y * z) + 'px';
    d.style.width = (b.bw * z) + 'px'; d.style.height = (b.bh * z) + 'px';
    d.title = b.str;
    d.addEventListener('click', function (ev) { ev.stopPropagation(); replaceText(p, b); });
    frag.appendChild(d);
  });
  v.hit.appendChild(frag);
}
function sampleBg(p, b) {
  var v = S.view[p.pid]; if (!v || !v.cvs.width) return '#ffffff';
  var k = v.cvs.width / p.bw, ctx = v.cvs.getContext('2d');
  var counts = {}, best = '#ffffff', bn = 0;
  var pad = Math.max(2, b.bh * 0.35);
  var samples = [];
  for (var t = 0; t <= 8; t++) {
    var fx = b.x + (b.bw * t / 8);
    samples.push([fx, b.y - pad], [fx, b.y + b.bh + pad]);
  }
  samples.push([b.x - pad, b.y + b.bh / 2], [b.x + b.bw + pad, b.y + b.bh / 2]);
  samples.forEach(function (s) {
    var px = Math.round(s[0] * k), py = Math.round(s[1] * k);
    if (px < 0 || py < 0 || px >= v.cvs.width || py >= v.cvs.height) return;
    try {
      var d = ctx.getImageData(px, py, 1, 1).data;
      var hex = '#' + [d[0], d[1], d[2]].map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
      counts[hex] = (counts[hex] || 0) + 1;
      if (counts[hex] > bn) { bn = counts[hex]; best = hex; }
    } catch (e) { }
  });
  return best;
}
function sampleInk(p, b) {
  var v = S.view[p.pid]; if (!v || !v.cvs.width) return '#000000';
  var k = v.cvs.width / p.bw, ctx = v.cvs.getContext('2d');
  try {
    var x0 = Math.max(0, Math.round(b.x * k)), y0 = Math.max(0, Math.round(b.y * k));
    var w = Math.min(v.cvs.width - x0, Math.round(b.bw * k)), h = Math.min(v.cvs.height - y0, Math.round(b.bh * k));
    if (w < 1 || h < 1) return '#000000';
    var d = ctx.getImageData(x0, y0, w, h).data, best = null, bl = 1e9;
    for (var i = 0; i < d.length; i += 4) {
      var l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (l < bl) { bl = l; best = [d[i], d[i + 1], d[i + 2]]; }
    }
    if (!best) return '#000000';
    return '#' + best.map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
  } catch (e) { return '#000000'; }
}
function replaceText(p, b) {
  var bg = sampleBg(p, b);
  var pad = Math.max(0.6, b.size * 0.06);
  anns(p.pid).push({ id: uid('w'), type: 'white', x: b.x - pad, y: b.y - pad, w: b.bw + pad * 2, h: b.bh + pad * 2, color: bg, op: 1 });
  if (!S.eraseOnly) {
    var degAng = b.ang * 180 / Math.PI;
    if (Math.abs(degAng) < 2) degAng = 0;
    var ink = sampleInk(p, b);
    // 元のベースライン上に、新しい文字のベースラインが乗るように上端を決める
    var off = baselineOffset(b.size, S.style.lh);
    var ca = Math.cos(b.ang), sa = Math.sin(b.ang);
    var tx = b.bx + off * sa, ty = b.by - off * ca;
    var a = { id: uid('t'), type: 'text', x: tx, y: ty, size: b.size, color: ink, bold: false, lh: S.style.lh, rot: degAng, op: 1, text: b.str };
    anns(p.pid).push(a);
    drawOverlay(p); layoutText(p); select(a.id);
    var d = S.view[p.pid].tlayer.querySelector('[data-id="' + a.id + '"]');
    setTool('select'); setTimeout(function () { if (d) editText(d, a); }, 0);
  } else { drawOverlay(p); }
  pushHist();
}

/* ============================== サムネイル / ページ操作 ============================== */
async function buildThumbs() {
  var list = $('#thumbList'); list.innerHTML = '';
  $('#pgCount').textContent = S.pages.length ? S.pages.length + 'p' : '';
  S.pages.forEach(function (p, i) {
    var t = el('div', 'thumb' + (i === S.cur ? ' cur' : ''));
    t.draggable = true; t.dataset.i = i;
    var c = document.createElement('canvas'); c.width = 10; c.height = 14;
    t.appendChild(c);
    t.appendChild(el('span', 'no', String(i + 1)));
    var ops = el('div', 'ops');
    ops.innerHTML = '<button title="90°回転">⟳</button><button title="複製">⧉</button><button class="del" title="削除">✕</button>';
    ops.children[0].onclick = function (e) { e.stopPropagation(); rotatePage(i, 90); };
    ops.children[1].onclick = function (e) { e.stopPropagation(); dupPage(i); };
    ops.children[2].onclick = function (e) { e.stopPropagation(); delPage(i); };
    t.appendChild(ops);
    t.onclick = function () { scrollToPage(i); };
    t.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; });
    t.addEventListener('dragover', function (e) { e.preventDefault(); t.classList.add('dragover'); });
    t.addEventListener('dragleave', function () { t.classList.remove('dragover'); });
    t.addEventListener('drop', function (e) {
      e.preventDefault(); t.classList.remove('dragover');
      var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(from) && from !== i) movePage(from, i);
    });
    list.appendChild(t);
    renderThumb(p, c);
  });
}
async function renderThumb(p, c) {
  try {
    var pg = await getPdfPage(p);
    var rot = norm360(p.baseRot + p.extraRot);
    var v0 = pg.getViewport({ scale: 1, rotation: rot });
    var W = 128 * Math.min(window.devicePixelRatio || 1, 2);
    var sc = W / v0.width;
    var vp = pg.getViewport({ scale: sc, rotation: rot });
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  } catch (e) { }
}
function scrollToPage(i) {
  var v = S.view[S.pages[i].pid]; if (!v) return;
  $('#viewerWrap').scrollTo({ top: v.el.offsetTop - 14, behavior: 'smooth' });
  setCur(i); closeMobile();
}
function movePage(from, to) { var p = S.pages.splice(from, 1)[0]; S.pages.splice(to, 0, p); rebuild(); pushHist(); }
function rotatePage(i, d) {
  S.pages[i].extraRot = norm360(S.pages[i].extraRot + d);
  layoutPage(S.pages[i]); buildThumbs(); pushHist();
}
function delPage(i) {
  if (S.pages.length <= 1) { toast('最後の1ページは削除できません'); return; }
  var p = S.pages.splice(i, 1)[0]; delete S.anns[p.pid]; delete S.view[p.pid];
  if (S.cur >= S.pages.length) S.cur = S.pages.length - 1;
  rebuild(); pushHist();
}
function dupPage(i) {
  var p = S.pages[i], np = Object.assign({}, p, { pid: uid('p') });
  S.anns[np.pid] = deep(anns(p.pid)).map(function (a) { a.id = uid('c'); return a; });
  S.pages.splice(i + 1, 0, np); rebuild(); pushHist();
}

/* ============================== 履歴 ============================== */
function snap() { return JSON.stringify({ pages: S.pages, anns: S.anns, images: Object.keys(S.images) }); }
function pushHist() {
  var s = snap();
  if (S.hi >= 0 && S.hist[S.hi] === s) return;
  S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(s);
  if (S.hist.length > 60) S.hist.shift();
  S.hi = S.hist.length - 1; syncUI();
}
function applyHist() {
  var o = JSON.parse(S.hist[S.hi]);
  S.pages = o.pages; S.anns = o.anns; S.sel = null;
  var live = {}; S.pages.forEach(function (p) { live[p.pid] = 1; });
  Object.keys(S.view).forEach(function (k) { if (!live[k]) delete S.view[k]; });
  S.pages.forEach(function (p) { if (S.view[p.pid]) { S.view[p.pid].tlayer.innerHTML = ''; } });
  rebuild(); syncUI();
}
function undo() { if (S.hi > 0) { S.hi--; applyHist(); } }
function redo() { if (S.hi < S.hist.length - 1) { S.hi++; applyHist(); } }

/* ============================== 書き出し ============================== */
function hasText() {
  for (var pid in S.anns) if (S.anns[pid].some(function (a) { return a.type === 'text' && a.text.trim(); })) return true;
  return false;
}
// ページ全体を画像に置き換える（元の文字データごと消す）
async function rasterizePage(out, p) {
  var DPI = 170, k = DPI / 72;
  var pg = await getPdfPage(p);
  var vp = pg.getViewport({ scale: k, rotation: p.baseRot });
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  var list = anns(p.pid);
  await Promise.all(list.filter(function (a) { return a.type === 'image'; })
    .map(function (a) { return loadImg(a.key); }));
  ctx.save();
  ctx.setTransform(c.width / p.bw, 0, 0, c.height / p.bh, 0, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  list.filter(function (a) { return a.type !== 'text'; }).forEach(function (a) {
    if (a.type === 'hl') { ctx.save(); ctx.globalCompositeOperation = 'multiply'; drawAnnCanvas(ctx, a); ctx.restore(); }
    else drawAnnCanvas(ctx, a);
  });
  list.filter(function (a) { return a.type === 'text' && a.text.trim(); }).forEach(function (a) { paintText(ctx, a); });
  ctx.restore();
  var img = await out.embedJpg(c.toDataURL('image/jpeg', 0.92));
  var page = out.addPage([p.bw, p.bh]);
  page.setRotation(PL.degrees(norm360(p.extraRot)));
  page.drawImage(img, { x: 0, y: 0, width: p.bw, height: p.bh });
}
function loadImg(key) {
  return new Promise(function (res) {
    var im = imgEl(key);
    if (!im || im.complete) return res();
    im.onload = im.onerror = function () { res(); };
  });
}
async function save() {
  if (!S.pages.length) return;
  busy('PDFを書き出しています…');
  try {
    var out = await PL.PDFDocument.create();
    if ($('#optFlat').checked) {
      for (var fi = 0; fi < S.pages.length; fi++) {
        busy('ページを画像化しています… (' + (fi + 1) + '/' + S.pages.length + ')');
        await rasterizePage(out, S.pages[fi]);
      }
      var fb = await out.save({ useObjectStreams: true });
      download(fb, S.fileName.replace(/\.pdf$/i, '') + '_編集.pdf');
      toast('保存しました（全ページを画像化：元の文字は残りません）', 4000);
      unbusy(); return;
    }
    var raster = $('#optRaster').checked || (hasText() && !FONT.ready);
    var jpFont = null;
    if (hasText() && !raster) {
      var fk = await getFontkit();
      out.registerFontkit(fk);
      jpFont = await out.embedFont(FONT.bytes, { subset: true });
    }
    // ページを元PDFごとにまとめてコピー（リソース重複を防ぐ）
    var byDoc = {};
    S.pages.forEach(function (p, i) {
      (byDoc[p.docId] = byDoc[p.docId] || { idx: [], slot: [] });
      byDoc[p.docId].idx.push(p.srcIndex); byDoc[p.docId].slot.push(i);
    });
    var slots = new Array(S.pages.length);
    for (var docId in byDoc) {
      var src = await getLibDoc(docId);
      var copied = await out.copyPages(src, byDoc[docId].idx);
      byDoc[docId].slot.forEach(function (s, k) { slots[s] = copied[k]; });
    }
    for (var i = 0; i < S.pages.length; i++) {
      var p = S.pages[i];
      var page = out.addPage(slots[i]);
      page.setRotation(PL.degrees(norm360(p.baseRot + p.extraRot)));
      await drawAnnsPdf(out, page, p, jpFont, raster);
    }
    var bytes = await out.save({ useObjectStreams: true });
    download(bytes, S.fileName.replace(/\.pdf$/i, '') + '_編集.pdf');
    var flat = Object.keys(S.docs).some(function (k) { return S.docs[k].flattened; });
    toast((raster ? '保存しました（文字は画像として埋め込み）' : '保存しました') +
      (flat ? '／入力欄は内容を固定しました' : ''), flat ? 4200 : 2600);
  } catch (e) {
    console.error(e);
    alert('保存に失敗しました。\n' + (e && e.message ? e.message : ''));
  }
  unbusy();
}
function download(bytes, name) {
  var blob = new Blob([bytes], { type: 'application/pdf' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

async function drawAnnsPdf(out, page, p, font, raster) {
  var R = p.baseRot;
  var U = userMapper(p);
  // 画面では文字レイヤーが常に最前面なので、書き出しでも同じ順序にそろえる
  var raw = anns(p.pid);
  var list = raw.filter(function (a) { return a.type !== 'text'; })
                .concat(raw.filter(function (a) { return a.type === 'text'; }));
  for (var i = 0; i < list.length; i++) {
    var a = list[i], op = a.op != null ? a.op : 1;
    if (a.type === 'white' || a.type === 'hl' || a.type === 'rect') {
      var an = U(a.x, a.y + a.h);
      var o = { x: an.x, y: an.y, width: a.w, height: a.h, rotate: PL.degrees(R), opacity: op, borderWidth: 0 };
      if (a.type === 'rect') {
        if (a.fill && a.fill !== 'none') o.color = pdfColor(a.fill);
        if (a.lw > 0) { o.borderColor = pdfColor(a.color); o.borderWidth = a.lw; o.borderOpacity = op; }
        if (!o.color) o.color = undefined;
      } else {
        o.color = pdfColor(a.color);
        if (a.type === 'hl') { o.blendMode = PL.BlendMode.Multiply; }
      }
      page.drawRectangle(o);
    } else if (a.type === 'ellipse') {
      var c = U(a.x + a.w / 2, a.y + a.h / 2);
      var sw = (R === 90 || R === 270) ? a.h / 2 : a.w / 2;
      var sh = (R === 90 || R === 270) ? a.w / 2 : a.h / 2;
      var eo = { x: c.x, y: c.y, xScale: sw, yScale: sh, opacity: op, borderWidth: 0 };
      if (a.fill && a.fill !== 'none') eo.color = pdfColor(a.fill);
      if (a.lw > 0) { eo.borderColor = pdfColor(a.color); eo.borderWidth = a.lw; eo.borderOpacity = op; }
      page.drawEllipse(eo);
    } else if (a.type === 'line' || a.type === 'arrow') {
      var s = U(a.x1, a.y1), e2 = U(a.x2, a.y2);
      page.drawLine({ start: s, end: e2, thickness: a.lw, color: pdfColor(a.color), opacity: op });
      if (a.type === 'arrow') {
        arrowHead(null, a).forEach(function (sg) {
          var q1 = U(sg[0], sg[1]), q2 = U(sg[2], sg[3]);
          page.drawLine({ start: q1, end: q2, thickness: a.lw, color: pdfColor(a.color), opacity: op });
        });
      }
    } else if (a.type === 'pen') {
      for (var k = 1; k < a.pts.length; k++) {
        var q1 = U(a.pts[k - 1][0], a.pts[k - 1][1]), q2 = U(a.pts[k][0], a.pts[k][1]);
        page.drawLine({ start: q1, end: q2, thickness: a.lw, color: pdfColor(a.color), opacity: op, lineCap: PL.LineCapStyle.Round });
      }
    } else if (a.type === 'image') {
      var dataUrl = S.images[a.key]; if (!dataUrl) continue;
      var img = await embedDataUrl(out, dataUrl);
      var an2 = U(a.x, a.y + a.h);
      page.drawImage(img, { x: an2.x, y: an2.y, width: a.w, height: a.h, rotate: PL.degrees(R), opacity: op });
    } else if (a.type === 'text' && a.text.trim()) {
      if (raster || !font) await drawTextRaster(out, page, a, U, R);
      else drawTextVector(page, a, font, U, R);
    }
  }
}
async function embedDataUrl(out, dataUrl) {
  if (!out.__imgCache) out.__imgCache = {};
  if (out.__imgCache[dataUrl]) return out.__imgCache[dataUrl];
  var img = /^data:image\/png/i.test(dataUrl) ? await out.embedPng(dataUrl) : await out.embedJpg(dataUrl);
  out.__imgCache[dataUrl] = img; return img;
}
function drawTextVector(page, a, font, U, R) {
  var lines = a.text.split('\n');
  var LH = a.size * a.lh, off0 = baselineOffset(a.size, a.lh);
  var ang = rad(a.rot || 0), ca = Math.cos(ang), sa = Math.sin(ang);
  var col = pdfColor(a.color), op = a.op != null ? a.op : 1;
  var eps = a.bold ? a.size * 0.028 : 0;
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    var oy = i * LH + off0;
    var bx = a.x - oy * sa, by = a.y + oy * ca;
    var offs = a.bold ? [[0, 0], [eps, 0], [0, eps], [eps, eps]] : [[0, 0]];
    for (var k = 0; k < offs.length; k++) {
      var dx = offs[k][0] * ca - offs[k][1] * sa, dy = offs[k][0] * sa + offs[k][1] * ca;
      var u = U(bx + dx, by + dy);
      page.drawText(lines[i], { x: u.x, y: u.y, size: a.size, font: font, color: col, opacity: op, rotate: PL.degrees(R - (a.rot || 0)) });
    }
  }
}
// 文字注釈を canvas に描く（プレビュー・画像化の両方で同じ計算を使う）
function paintText(ctx, a, atOrigin) {
  var lines = a.text.split('\n'), LH = a.size * a.lh, off0 = baselineOffset(a.size, a.lh);
  ctx.save();
  if (!atOrigin) { ctx.translate(a.x, a.y); if (a.rot) ctx.rotate(rad(a.rot)); }
  ctx.font = a.size + 'px ' + FONT_STACK;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = a.color;
  ctx.globalAlpha = a.op != null ? a.op : 1;
  if (a.bold) { ctx.strokeStyle = a.color; ctx.lineWidth = a.size * 0.035; }
  lines.forEach(function (l, i) {
    var y = i * LH + off0;
    ctx.fillText(l, 0, y);
    if (a.bold) ctx.strokeText(l, 0, y);
  });
  ctx.restore();
}
function textBlockSize(a) {
  var lines = a.text.split('\n'), W = 2;
  lines.forEach(function (l) { W = Math.max(W, measureLine(l, a.size) + a.size * 0.12); });
  return { w: W, h: a.size * a.lh * lines.length };
}
async function drawTextRaster(out, page, a, U, R) {
  var sz = textBlockSize(a), W = sz.w, H = sz.h;
  var K = 6;
  var c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(W * K)); c.height = Math.max(2, Math.ceil(H * K));
  var ctx = c.getContext('2d');
  ctx.scale(K, K);
  paintText(ctx, a, true);
  var img = await embedDataUrl(out, c.toDataURL('image/png'));
  var ang = rad(a.rot || 0), ca = Math.cos(ang), sa = Math.sin(ang);
  var bx = a.x - H * sa, by = a.y + H * ca;   // 表示上の左下隅
  var u = U(bx, by);
  page.drawImage(img, { x: u.x, y: u.y, width: W, height: H, rotate: PL.degrees(R - (a.rot || 0)), opacity: a.op != null ? a.op : 1 });
}

/* ============================== UI ============================== */
var TOOLS = [
  { k: 'select', n: '選択', i: 'M4 3l14 7-6 1.6L9.6 18z' },
  { k: 'text', n: '文字', i: 'M5 5h12M11 5v13M8.5 18h5' },
  { k: 'edittext', n: '文字差替', i: 'M4 6h8M4 11h11M4 16h5M14 15.5l4.5-4.5 1.6 1.6L15.6 17H14z' },
  { k: 'pen', n: 'ペン', i: 'M4 18l1-4 9-9 3 3-9 9z' },
  { k: 'line', n: '直線', i: 'M4 17L18 5' },
  { k: 'arrow', n: '矢印', i: 'M4 17L18 5M18 5h-5M18 5v5' },
  { k: 'rect', n: '四角', i: 'M4 5h14v12H4z' },
  { k: 'ellipse', n: '楕円', i: 'M11 6c4 0 7 2.2 7 5s-3 5-7 5-7-2.2-7-5 3-5 7-5z' },
  { k: 'hl', n: 'マーカー', i: 'M4 15h14M6 12l6-7 3 3-6 7z' },
  { k: 'white', n: '白塗り', i: 'M4 5h14v12H4zM4 5l14 12' },
  { k: 'image', n: '画像', i: 'M4 5h14v12H4zM4 14l4-4 3 3 3-3 4 4' }
];
function buildTools() {
  var box = $('#tools'); box.innerHTML = '';
  TOOLS.forEach(function (t) {
    var b = el('button', 'tool' + (S.tool === t.k ? ' on' : ''));
    b.innerHTML = '<svg viewBox="0 0 22 22"><path d="' + t.i + '"/></svg><span>' + t.n + '</span>';
    b.onclick = function () { setTool(t.k); };
    box.appendChild(b);
  });
}
function setTool(k) {
  S.tool = k;
  document.querySelectorAll('.page').forEach(function (e) { });
  S.pages.forEach(function (p) {
    var v = S.view[p.pid]; if (!v) return;
    v.el.className = 'page mode-' + k;
  });
  if (k === 'edittext') { prepareVisibleHitboxes(); }
  buildTools(); syncProps();
}

var PALETTE = ['#e0322a', '#1f2328', '#2f6feb', '#1e9e57', '#e8912a', '#8b46c8', '#ffffff'];
var HLS = ['#ffe14d', '#a9f08a', '#8fd3ff', '#ffb3d1', '#ffd0a0'];
function syncProps() {
  var box = $('#props'); var t = S.tool;
  var sel = findAnn(S.sel);
  var a = sel ? sel.a : null;
  var st = S.style;
  var h = '';
  var isText = (t === 'text') || (a && a.type === 'text');
  var isHl = (t === 'hl') || (a && a.type === 'hl');
  var isShape = ['pen', 'line', 'arrow', 'rect', 'ellipse'].indexOf(t) >= 0 || (a && ['pen', 'line', 'arrow', 'rect', 'ellipse'].indexOf(a.type) >= 0);
  var isWhite = (t === 'white') || (a && a.type === 'white');

  if (t === 'edittext') {
    h += '<div class="grp"><h4>文字の差し替え</h4><div class="hint">ページ上の<b>青い枠</b>をクリックすると、その文字を塗りつぶして書き換えられます。<br>元のフォントは再現されないので、見え方は変わります。</div>';
    h += '<label class="chk" style="margin-top:8px"><input type="checkbox" id="pEraseOnly"' + (S.eraseOnly ? ' checked' : '') + '> 消すだけ（書き換えない）</label></div>';
  }
  if (isText) {
    h += '<div class="grp"><h4>文字</h4>';
    h += '<div class="row"><label>サイズ</label><input type="range" id="pSize" min="6" max="72" step="1" value="' + (a ? a.size : st.size) + '"><input type="number" id="pSizeN" value="' + Math.round(a ? a.size : st.size) + '"></div>';
    h += '<div class="row"><label>色</label><div class="swatches" id="pColors"></div><input type="color" id="pColorPick" value="' + toHex(a ? a.color : st.color) + '"></div>';
    h += '<label class="chk"><input type="checkbox" id="pBold"' + ((a ? a.bold : st.bold) ? ' checked' : '') + '> 太字</label>';
    h += '<div class="hint">改行はEnter。文字をダブルクリックで再編集できます。</div></div>';
  }
  if (isHl) {
    h += '<div class="grp"><h4>マーカー</h4><div class="row"><label>色</label><div class="swatches" id="pHls"></div></div></div>';
  }
  if (isWhite) {
    h += '<div class="grp"><h4>白塗り</h4><div class="row"><label>色</label><input type="color" id="pWhite" value="' + toHex(a ? a.color : '#ffffff') + '"></div>' +
      '<div class="hint">背景に合わせて色を変えられます。</div></div>';
  }
  if (isShape) {
    h += '<div class="grp"><h4>線と図形</h4>';
    h += '<div class="row"><label>線の太さ</label><input type="range" id="pLw" min="0" max="12" step="0.5" value="' + (a && a.lw != null ? a.lw : st.lw) + '"><input type="number" id="pLwN" step="0.5" value="' + (a && a.lw != null ? a.lw : st.lw) + '"></div>';
    h += '<div class="row"><label>線の色</label><div class="swatches" id="pColors"></div><input type="color" id="pColorPick" value="' + toHex(a ? a.color : st.color) + '"></div>';
    if (['rect', 'ellipse'].indexOf(t) >= 0 || (a && ['rect', 'ellipse'].indexOf(a.type) >= 0))
      h += '<div class="row"><label>塗り</label><div class="swatches" id="pFills"></div></div>';
    h += '<div class="row"><label>不透明度</label><input type="range" id="pOp" min="0.1" max="1" step="0.05" value="' + (a && a.op != null ? a.op : st.op) + '"></div>';
    h += '</div>';
  }
  if (a) {
    h += '<div class="grp"><h4>選択中</h4><div class="row" style="gap:6px">' +
      '<button class="btn" id="pFront" style="flex:1">前面へ</button>' +
      '<button class="btn" id="pBack" style="flex:1">背面へ</button></div>' +
      '<button class="btn" id="pDel" style="width:100%;color:var(--danger)">削除（Delete）</button></div>';
  }
  h += '<div class="grp"><h4>ページ</h4><div class="row" style="gap:6px">' +
    '<button class="btn" id="pRotAll" style="flex:1">全ページ90°回転</button></div></div>';
  box.innerHTML = h;

  var swWrap = $('#pColors');
  if (swWrap) PALETTE.forEach(function (c) {
    var b = el('button', 'sw' + (toHex(a ? a.color : st.color) === c ? ' on' : ''));
    b.style.background = c; b.onclick = function () { setColor(c); };
    swWrap.appendChild(b);
  });
  var fw = $('#pFills');
  if (fw) ['none'].concat(PALETTE).forEach(function (c) {
    var cur = a ? (a.fill || 'none') : st.fill;
    var b = el('button', 'sw' + (c === 'none' ? ' none' : '') + (cur === c ? ' on' : ''));
    if (c !== 'none') b.style.background = c;
    b.onclick = function () { if (a) { a.fill = c; redrawSel(); } st.fill = c; syncProps(); pushHist(); };
    fw.appendChild(b);
  });
  var hw = $('#pHls');
  if (hw) HLS.forEach(function (c) {
    var b = el('button', 'sw' + ((a ? a.color : st.hl) === c ? ' on' : ''));
    b.style.background = c;
    b.onclick = function () { st.hl = c; if (a && a.type === 'hl') { a.color = c; redrawSel(); pushHist(); } syncProps(); };
    hw.appendChild(b);
  });
  bind('#pSize', 'input', function (e) { var v = +e.target.value; $('#pSizeN').value = Math.round(v); applyStyle({ size: v }); });
  bind('#pSizeN', 'change', function (e) { var v = clamp(+e.target.value, 4, 200); $('#pSize').value = v; applyStyle({ size: v }); });
  bind('#pBold', 'change', function (e) { applyStyle({ bold: e.target.checked }); });
  bind('#pColorPick', 'input', function (e) { setColor(e.target.value); });
  bind('#pLw', 'input', function (e) { var v = +e.target.value; $('#pLwN').value = v; applyStyle({ lw: v }); });
  bind('#pLwN', 'change', function (e) { var v = clamp(+e.target.value, 0, 40); $('#pLw').value = v; applyStyle({ lw: v }); });
  bind('#pOp', 'input', function (e) { applyStyle({ op: +e.target.value }); });
  bind('#pWhite', 'input', function (e) { if (a) { a.color = e.target.value; redrawSel(); } });
  bind('#pDel', 'click', function () { removeAnn(S.sel); });
  bind('#pFront', 'click', function () { zorder(1); });
  bind('#pBack', 'click', function () { zorder(-1); });
  bind('#pRotAll', 'click', function () { S.pages.forEach(function (p) { p.extraRot = norm360(p.extraRot + 90); }); layoutAll(); buildThumbs(); pushHist(); });
  bind('#pEraseOnly', 'change', function (e) { S.eraseOnly = e.target.checked; });
}
function bind(sel, ev, fn) { var e = $(sel); if (e) e.addEventListener(ev, fn); }
function toHex(c) { return (c || '#000000').toLowerCase(); }
function setColor(c) {
  S.style.color = c;
  var f = findAnn(S.sel);
  if (f) { f.a.color = c; redrawSel(); pushHist(); }
  syncProps();
}
function applyStyle(o) {
  Object.keys(o).forEach(function (k) { S.style[k] = o[k]; });
  var f = findAnn(S.sel); if (!f) return;
  var a = f.a, SHAPE = ['rect', 'ellipse', 'line', 'arrow', 'pen'];
  Object.keys(o).forEach(function (k) {
    if (k === 'size' || k === 'bold' || k === 'lh') { if (a.type === 'text') a[k] = o[k]; }
    else if (k === 'lw') { if (SHAPE.indexOf(a.type) >= 0) a.lw = o[k]; }
    else if (k === 'op') { a.op = o[k]; }
  });
  redrawSel();
}
var _nudgeT;
function nudge(dx, dy) {
  var f = findAnn(S.sel); if (!f) return;
  var a = f.a;
  if (a.type === 'line' || a.type === 'arrow') { a.x1 += dx; a.y1 += dy; a.x2 += dx; a.y2 += dy; }
  else if (a.type === 'pen') { a.pts = a.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; }); }
  else { a.x += dx; a.y += dy; }
  redrawSel();
  clearTimeout(_nudgeT); _nudgeT = setTimeout(pushHist, 400);
}
function redrawSel() {
  var f = findAnn(S.sel); if (!f) return;
  var p = S.pages.find(function (x) { return x.pid === f.pid; });
  if (p) { drawOverlay(p); layoutText(p); }
}
function zorder(dir) {
  var f = findAnn(S.sel); if (!f) return;
  var arr = S.anns[f.pid], i = f.i, j = dir > 0 ? arr.length - 1 : 0;
  arr.splice(i, 1); arr.splice(j, 0, f.a);
  var p = S.pages.find(function (x) { return x.pid === f.pid; });
  if (p) { drawOverlay(p); layoutText(p); }
  pushHist();
}
function syncUI() {
  $('#bUndo').disabled = S.hi <= 0;
  $('#bRedo').disabled = S.hi >= S.hist.length - 1;
  $('#zoomLabel').textContent = Math.round(S.zoom * 100) + '%';
}

/* ============================== ズーム / 表示 ============================== */
function setZoom(z) {
  S.zoom = clamp(z, 0.2, 5);
  S.pages.forEach(function (p) { var v = S.view[p.pid]; if (v) v.scale = 0; });
  layoutAll(); renderVisible(); syncUI();
}
function fitWidth() {
  if (!S.pages.length) return;
  var wrap = $('#viewerWrap'), p = S.pages[S.cur] || S.pages[0];
  var E = norm360(p.extraRot), w = (E === 90 || E === 270) ? p.bh : p.bw;
  setZoom((wrap.clientWidth - 44) / w);
}
function closeMobile() { $('#thumbs').classList.remove('open'); $('#side').classList.remove('open'); }

/* ============================== イベント ============================== */
$('#bOpen').onclick = function () { $('#fPdf').click(); };
$('#bAdd').onclick = function () { $('#fAdd').click(); };
$('#fPdf').addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) openPdf(f, false); });
$('#fAdd').addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) openPdf(f, true); });
$('#fFont').addEventListener('change', async function (e) {
  var f = e.target.files[0]; e.target.value = ''; if (!f) return;
  busy('フォントを読み込み中…');
  try { await loadFont(await f.arrayBuffer(), f.name); toast('フォントを設定しました'); }
  catch (err) { alert('このフォントは使えませんでした（.ttf / .otf のみ）'); }
  unbusy();
});
$('#bSave').onclick = save;
$('#bUndo').onclick = undo;
$('#bRedo').onclick = redo;
$('#bZoomIn').onclick = function () { setZoom(S.zoom * 1.2); };
$('#bZoomOut').onclick = function () { setZoom(S.zoom / 1.2); };
$('#bFit').onclick = fitWidth;
$('#tgThumbs').onclick = function () { $('#side').classList.remove('open'); $('#thumbs').classList.toggle('open'); };
$('#tgSide').onclick = function () { $('#thumbs').classList.remove('open'); $('#side').classList.toggle('open'); };
$('#optRaster').addEventListener('change', fontHint);
$('#mZoomIn').onclick = function () { setZoom(S.zoom * 1.2); };
$('#mZoomOut').onclick = function () { setZoom(S.zoom / 1.2); };
$('#mFit').onclick = function () { fitWidth(); closeMobile(); };
$('#mAdd').onclick = function () { $('#fAdd').click(); };

$('#viewerWrap').addEventListener('scroll', function () { clearTimeout(window._st); window._st = setTimeout(renderVisible, 60); });
window.addEventListener('resize', function () { clearTimeout(window._rt); window._rt = setTimeout(renderVisible, 120); });

document.addEventListener('keydown', function (e) {
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (S.sel) { e.preventDefault(); removeAnn(S.sel); } return; }
  if (S.sel && e.key.indexOf('Arrow') === 0) {
    e.preventDefault();
    var nd = e.shiftKey ? 10 : 1;
    nudge(e.key === 'ArrowLeft' ? -nd : e.key === 'ArrowRight' ? nd : 0,
          e.key === 'ArrowUp' ? -nd : e.key === 'ArrowDown' ? nd : 0);
    return;
  }
  if (e.key === 'Escape') { select(null); setTool('select'); return; }
  var map = { v: 'select', t: 'text', e: 'edittext', p: 'pen', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', h: 'hl', w: 'white' };
  if (map[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) setTool(map[e.key.toLowerCase()]);
});

var dragN = 0;
window.addEventListener('dragenter', function (e) { e.preventDefault(); dragN++; $('#drop').classList.add('on'); });
window.addEventListener('dragover', function (e) { e.preventDefault(); });
window.addEventListener('dragleave', function () { if (--dragN <= 0) { dragN = 0; $('#drop').classList.remove('on'); } });
window.addEventListener('drop', function (e) {
  e.preventDefault(); dragN = 0; $('#drop').classList.remove('on');
  var f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && /\.pdf$/i.test(f.name)) openPdf(f, S.pages.length > 0 && e.shiftKey);
});

/* ============================== 起動 ============================== */
buildTools(); syncProps(); fontHint(); syncUI();
window.__PDFAPP = {
  S: S, save: save, openPdf: openPdf, setTool: setTool, vpToUser: vpToUser, anns: anns,
  baselineOffset: baselineOffset, FONT: FONT, setZoom: setZoom, layoutAll: layoutAll,
  rebuild: rebuild, drawOverlay: drawOverlay, layoutText: layoutText, select: select,
  rotatePage: rotatePage, movePage: movePage, delPage: delPage, dupPage: dupPage,
  prepareHitboxes: prepareHitboxes, pushHist: pushHist, undo: undo, redo: redo
};
})();
