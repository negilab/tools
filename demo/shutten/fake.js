/* 体験版の「偽のサーバー」。本物の GAS（server.gs）の代わりに、架空の中身を返します。
   会社名・人名・イベント名・住所は、すべて作りものです。
   保存はこのブラウザの中（localStorage）だけ。閉じて「はじめに戻す」を押せば消えます。 */
(function () {
  'use strict';

  var KEY = 'demo_shutten_v1';
  var PASS_OK = 'demo';
  var NG = '合言葉が違います。';

  /* ---------- 架空の中身（たね） ---------- */
  function seed() {
    var q1 = [
      { id: 'q1', type: 'text', label: '出店者名（店名・団体名）', help: '', required: true, options: [], max: 5, role: 'store' },
      { id: 'q2', type: 'text', label: 'ご担当者のお名前', help: '', required: true, options: [], max: 5, role: '' },
      { id: 'q3', type: 'text', label: 'メールアドレス', help: '連絡はこちらに送ります。', required: true, options: [], max: 5, role: 'email' },
      { id: 'q4', type: 'text', label: '電話番号', help: '', required: true, options: [], max: 5, role: '' },
      { id: 'q5', type: 'radio', label: '出店の種類', help: '', required: true, options: ['飲食（調理あり）', '飲食（調理なし）', '物販', '体験・ワークショップ'], max: 5, role: '' },
      { id: 'q6', type: 'long', label: '売るもの・やることの中身', help: 'メニューや品物を書いてください。', required: true, options: [], max: 5, role: '' },
      { id: 'q7', type: 'check', label: '必要なもの', help: 'あてはまるものをぜんぶ選んでください。', required: false, options: ['電源（100V）', '水道', 'テント貸出', '机・いす貸出', 'とくになし'], max: 5, role: '' },
      { id: 'q8', type: 'select', label: '希望するスペースの広さ', help: '', required: true, options: ['3m × 3m', '3m × 6m', '6m × 6m'], max: 5, role: '' },
      { id: 'q9', type: 'photo', label: 'お店の様子がわかる写真', help: '前に出店したときの写真などがあれば。', required: false, options: [], max: 3, role: '' },
      { id: 'q10', type: 'note', label: 'お願い', help: '当日のごみは各自でお持ち帰りください。火を使う場合は消火器のご用意をお願いします。', required: false, options: [], max: 5, role: '' }
    ];
    var q2 = [
      { id: 'p1', type: 'text', label: '出店者名（店名・団体名）', help: '', required: true, options: [], max: 5, role: 'store' },
      { id: 'p2', type: 'text', label: 'ご担当者のお名前', help: '', required: true, options: [], max: 5, role: '' },
      { id: 'p3', type: 'text', label: 'メールアドレス', help: '', required: true, options: [], max: 5, role: 'email' },
      { id: 'p4', type: 'radio', label: '出品するもの', help: '', required: true, options: ['衣類', '本・CD', 'こども用品', '雑貨', 'その他'], max: 5, role: '' },
      { id: 'p5', type: 'long', label: 'ひとこと（お客さまへ）', help: '', required: false, options: [], max: 5, role: '' }
    ];
    var q3 = [
      { id: 'r1', type: 'text', label: '出店者名（店名・団体名）', help: '', required: true, options: [], max: 5, role: 'store' },
      { id: 'r2', type: 'text', label: 'ご担当者のお名前', help: '', required: true, options: [], max: 5, role: '' },
      { id: 'r3', type: 'text', label: 'メールアドレス', help: '', required: true, options: [], max: 5, role: 'email' },
      { id: 'r4', type: 'select', label: '出店する日', help: '', required: true, options: ['12月5日（土）', '12月6日（日）', '両日'], max: 5, role: '' }
    ];
    var forms = [
      { id: 'F001', name: '第12回 ひまわり通り夏まつり 出店申込', status: '受付中',
        title: '第12回 ひまわり通り夏まつり 出店申込', titleMode: 'custom',
        intro: 'ひまわり通り商店会の夏まつりに出店してくださる方を募集します。\n申込のしめきりは 7月10日（金）です。\nご不明な点は、ひまわり通り商店会事務局（架空）までお問い合わせください。',
        introMode: 'custom',
        eventName: 'ひまわり通り夏まつり', eventDate: '2026年8月8日（土）', eventDateIso: '2026-08-08',
        eventTime: '15:00〜21:00', venue: 'ひまわり通り商店街 特設会場（架空の場所）',
        contact: 'ひまわり通り商店会事務局 / info@example.invalid',
        header: '', acceptKey: '', thanks: 'お申し込みありがとうございました。\n内容を確認のうえ、3日以内にメールでご連絡します。',
        questions: q1, created: '2026-06-01 09:00', updated: '2026-06-20 14:12' },
      { id: 'F002', name: 'みどりが丘 秋のフリーマーケット 出店申込', status: '受付中',
        title: 'みどりが丘 秋のフリーマーケット 出店申込', titleMode: 'custom',
        intro: 'みどりが丘公園でひらくフリーマーケットの出店申込です。\n1区画 2,000円（架空）。雨天のときは翌週にのばします。',
        introMode: 'custom',
        eventName: 'みどりが丘 秋のフリーマーケット', eventDate: '2026年10月18日（日）', eventDateIso: '2026-10-18',
        eventTime: '10:00〜15:00', venue: 'みどりが丘公園 芝生広場（架空の場所）',
        contact: 'みどりが丘まちづくりの会 / green@example.invalid',
        header: '', acceptKey: '', thanks: 'お申し込みありがとうございました。',
        questions: q2, created: '2026-08-05 11:30', updated: '2026-09-02 10:04' },
      { id: 'F003', name: '駅前イルミネーション 屋台出店申込', status: '締切',
        title: '駅前イルミネーション 屋台出店申込', titleMode: 'custom',
        intro: 'ことしも駅前をあかりで飾ります。屋台の出店を募集します。',
        introMode: 'custom',
        eventName: '駅前イルミネーション', eventDate: '2026年12月5日（土）・6日（日）', eventDateIso: '2026-12-05',
        eventTime: '16:00〜20:00', venue: '北山台駅前ひろば（架空の場所）',
        contact: '北山台にぎわい実行委員会 / hikari@example.invalid',
        header: '', acceptKey: 'ひかり', thanks: 'お申し込みありがとうございました。',
        questions: q3, created: '2026-09-01 09:00', updated: '2026-09-10 16:45' }
    ];
    var ans = [
      { id: 'R20260620-01', formId: 'F001', at: '2026-06-20 10:12', store: 'たこ焼き かもめ亭', updated: '2026-06-20 10:12', deleted: '',
        answers: { q1: 'たこ焼き かもめ亭', q2: '海老原 さとし', q3: 'kamome@example.invalid', q4: '090-0000-0001',
          q5: '飲食（調理あり）', q6: 'たこ焼き（8個入）、ソース・しお の2種。ドリンクはラムネのみ。',
          q7: ['電源（100V）', 'テント貸出'], q8: '3m × 3m', q9: '0枚' }, photos: [] },
      { id: 'R20260621-01', formId: 'F001', at: '2026-06-21 18:40', store: '手づくり石けん そらいろ工房', updated: '2026-06-21 18:40', deleted: '',
        answers: { q1: '手づくり石けん そらいろ工房', q2: '倉田 みなみ', q3: 'sorairo@example.invalid', q4: '090-0000-0002',
          q5: '物販', q6: '手づくり石けん、入浴剤、小さな布ぶくろ。', q7: ['机・いす貸出'], q8: '3m × 3m', q9: '0枚' }, photos: [] },
      { id: 'R20260622-01', formId: 'F001', at: '2026-06-22 09:05', store: '珈琲 まめや', updated: '2026-06-22 09:05', deleted: '',
        answers: { q1: '珈琲 まめや', q2: '西野 たける', q3: 'mameya@example.invalid', q4: '090-0000-0003',
          q5: '飲食（調理なし）', q6: 'ドリップコーヒー、アイスコーヒー、豆の量り売り。', q7: ['電源（100V）', '水道'], q8: '3m × 6m', q9: '0枚' }, photos: [] },
      { id: 'R20260624-01', formId: 'F001', at: '2026-06-24 20:31', store: 'こども工作ひろば ぽけっと', updated: '2026-06-24 20:31', deleted: '',
        answers: { q1: 'こども工作ひろば ぽけっと', q2: '藤木 あゆ', q3: 'pocket@example.invalid', q4: '090-0000-0004',
          q5: '体験・ワークショップ', q6: '牛乳パックでつくる ぱたぱた鳥。所要10分、1回200円（架空）。', q7: ['机・いす貸出', 'テント貸出'], q8: '3m × 6m', q9: '0枚' }, photos: [] },
      { id: 'R20260701-01', formId: 'F001', at: '2026-07-01 12:58', store: '焼きそば 大空', updated: '2026-07-01 12:58', deleted: '',
        answers: { q1: '焼きそば 大空', q2: '大空 けんじ', q3: 'oozora@example.invalid', q4: '090-0000-0005',
          q5: '飲食（調理あり）', q6: '焼きそば（並・大）、フランクフルト。', q7: ['電源（100V）', '水道', 'テント貸出'], q8: '6m × 6m', q9: '0枚' }, photos: [] },
      { id: 'R20260906-01', formId: 'F002', at: '2026-09-06 13:20', store: 'ふるほん たぬき堂', updated: '2026-09-06 13:20', deleted: '',
        answers: { p1: 'ふるほん たぬき堂', p2: '田貫 のぶこ', p3: 'tanuki@example.invalid', p4: '本・CD', p5: '文庫本を1冊100円で並べます。' }, photos: [] },
      { id: 'R20260908-01', formId: 'F002', at: '2026-09-08 08:44', store: 'こども服リユース みつば', updated: '2026-09-08 08:44', deleted: '',
        answers: { p1: 'こども服リユース みつば', p2: '三葉 かおり', p3: 'mitsuba@example.invalid', p4: 'こども用品', p5: '80〜120cm のこども服が中心です。' }, photos: [] }
    ];
    var tmpl = [
      { id: 'T001', name: '受付のお知らせ', subject: '【{イベント名}】お申し込みを受け付けました', body: '{店名} さま\n\nお申し込みを受け付けました。\n開催日：{開催日}\n会場：{会場}\n\nくわしくは追ってご連絡します。', created: '2026-06-01 09:10' },
      { id: 'T002', name: '当日のご案内', subject: '【{イベント名}】当日のご案内', body: '{店名} さま\n\n当日の集合は 13:00、{会場} の受付テントです。\n車での搬入は 13:00〜14:00 のあいだにお願いします。', created: '2026-06-15 17:22' }
    ];
    var log = [
      { at: '2026-06-25 10:00', formId: 'F001', mode: '一斉', count: 4, subject: '【ひまわり通り夏まつり】お申し込みを受け付けました', failed: '' },
      { at: '2026-07-02 09:30', formId: 'F001', mode: '一斉', count: 5, subject: '【ひまわり通り夏まつり】当日のご案内', failed: '' }
    ];
    return { forms: forms, answers: ans, templates: tmpl, mailLog: log, seq: 1 };
  }

  /* ---------- 入れ物 ---------- */
  var DB = null;
  function load() {
    if (DB) return DB;
    try {
      var s = localStorage.getItem(KEY);
      if (s) { DB = JSON.parse(s); return DB; }
    } catch (e) {}
    DB = seed();
    save();
    return DB;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} }
  window.demoReset = function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function now() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function gate(pass) { if (String(pass) !== PASS_OK) throw new Error(NG); }
  function formGet(id) {
    var db = load();
    for (var i = 0; i < db.forms.length; i++) if (db.forms[i].id === String(id)) return db.forms[i];
    return null;
  }

  /* ---------- 画面に渡す形（本物の server.gs に合わせる） ---------- */
  function formsOut() {
    var db = load(), cnt = {};
    db.answers.forEach(function (a) { if (!a.deleted) cnt[a.formId] = (cnt[a.formId] || 0) + 1; });
    return db.forms.filter(function (f) { return f.status !== '削除'; }).map(function (f) {
      return { id: f.id, name: f.name, status: f.status, title: f.title || f.name, updated: f.updated,
        count: cnt[f.id] || 0, questions: f.questions.length, eventDate: f.eventDate || '' };
    }).reverse();
  }
  function templatesOut() {
    return load().templates.map(function (t) {
      return { id: t.id, name: t.name, subject: t.subject, body: t.body, created: t.created };
    }).reverse();
  }
  function answersOut(formId) {
    var f = formGet(formId);
    if (!f) throw new Error('フォーム ' + formId + ' がありません。');
    var rows = load().answers.filter(function (a) { return String(a.formId) === String(formId) && !a.deleted; })
      .map(function (a) {
        return { id: a.id, at: a.at, store: a.store, answers: clone(a.answers), photos: clone(a.photos || []), updated: a.updated };
      });
    return { form: clone(f), rows: rows };
  }
  function formPublic(f) {
    return { id: f.id, name: f.name, status: f.status, title: f.title || f.name, intro: f.intro || '',
      header: '', headerData: '', needKey: !!f.acceptKey, thanks: f.thanks || '', questions: clone(f.questions) };
  }
  /* 出店者の画面が使う、いま開いているフォーム */
  window.DEMO_FORM = (function () {
    var id = (new URLSearchParams(location.search).get('id') || 'F001');
    var f = formGet(id) || formGet('F001');
    return formPublic(f);
  })();

  function noYet() { throw new Error('体験版では、この書き出しはできません。本番では PDF や Excel ができあがります。'); }

  /* ---------- api ---------- */
  var API = {
    /* 管理画面の起動 */
    apiBoot: function (pass) {
      gate(pass);
      var u = '';
      try { u = new URL('form.html', location.href).href; } catch (e) { u = 'form.html'; }
      return { forms: formsOut(), templates: templatesOut(), me: 'demo@example.invalid', ver: '体験版', url: u, tourOff: true };
    },
    apiSetTour: function (pass) { gate(pass); return { ok: true }; },
    apiForms: function (pass) { gate(pass); return formsOut(); },
    apiForm: function (pass, id) {
      gate(pass);
      var f = formGet(id);
      if (!f) throw new Error('フォーム ' + id + ' がありません。');
      var o = clone(f); o.headerData = '';
      return o;
    },
    apiSaveForm: function (pass, f) {
      gate(pass);
      var db = load(), id = f.id, cur = id ? formGet(id) : null;
      if (!cur) {
        id = 'F' + String(900 + db.forms.length).slice(-3);
        cur = { id: id, created: now() };
        db.forms.push(cur);
      }
      ['name', 'title', 'intro', 'titleMode', 'introMode', 'acceptKey', 'thanks', 'eventName', 'eventDate',
        'eventDateIso', 'eventTime', 'venue', 'contact'].forEach(function (k) { cur[k] = f[k] || ''; });
      cur.name = String(f.name || f.title || '無題のフォーム').trim();
      cur.status = f.status || cur.status || '受付中';
      cur.header = '';
      cur.questions = (f.questions || []).map(function (q, i) {
        return { id: String(q.id || ('q' + (i + 1))), type: String(q.type || 'text'), label: String(q.label || ''),
          help: String(q.help || ''), required: !!q.required,
          options: (q.options || []).map(String).filter(function (s) { return s !== ''; }),
          max: Math.max(1, Math.min(10, Number(q.max) || 5)), role: String(q.role || '') };
      });
      cur.updated = now();
      save();
      return { id: id, forms: formsOut() };
    },
    apiDupForm: function (pass, id) {
      gate(pass);
      var f = formGet(id);
      if (!f) throw new Error('フォーム ' + id + ' がありません。');
      var c = clone(f); delete c.id; c.name = c.name + '（複製）'; c.status = '受付中';
      return API.apiSaveForm(pass, c);
    },
    apiSetStatus: function (pass, id, status) {
      gate(pass);
      var f = formGet(id);
      if (!f) throw new Error('フォーム ' + id + ' がありません。');
      f.status = (status === '締切') ? '締切' : '受付中';
      f.updated = now(); save();
      return formsOut();
    },
    apiDeleteForm: function (pass, id) {
      gate(pass);
      var f = formGet(id), db = load();
      if (!f) throw new Error('フォーム ' + id + ' がありません。');
      db.answers.forEach(function (a) { if (String(a.formId) === String(id)) a.deleted = now(); });
      f.status = '削除'; f.updated = now(); save();
      return formsOut();
    },
    apiHeaderImage: function (pass, formId, name, mime, b64) {
      gate(pass);
      return { fileId: 'demo-header', data: 'data:' + (mime || 'image/jpeg') + ';base64,' + b64 };
    },
    apiAnswers: function (pass, formId) { gate(pass); return answersOut(formId); },
    apiThumbs: function (pass) { gate(pass); return {}; },
    apiPhoto: function (pass) { gate(pass); return { data: '' }; },
    apiPhotoMid: function (pass) { gate(pass); return { data: '' }; },
    apiDeleteAnswer: function (pass, id) {
      gate(pass);
      var db = load(), fid = '';
      db.answers.forEach(function (a) { if (a.id === id) { a.deleted = now(); fid = a.formId; } });
      save();
      return answersOut(fid);
    },
    apiUpdateAnswer: function (pass, id, answers) {
      gate(pass);
      var db = load(), fid = '';
      db.answers.forEach(function (a) {
        if (a.id !== id) return;
        a.answers = answers || {}; a.updated = now(); fid = a.formId;
        var f = formGet(a.formId);
        if (f) f.questions.forEach(function (q) { if (q.role === 'store' && a.answers[q.id]) a.store = String(a.answers[q.id]); });
      });
      save();
      return answersOut(fid);
    },
    apiTemplates: function (pass) { gate(pass); return templatesOut(); },
    apiSaveTemplate: function (pass, t) {
      gate(pass);
      var db = load(), cur = null;
      db.templates.forEach(function (x) { if (t.id && x.id === t.id) cur = x; });
      if (!cur) { cur = { id: 'T' + String(900 + db.templates.length).slice(-3), created: now() }; db.templates.push(cur); }
      cur.name = t.name || '無題'; cur.subject = t.subject || ''; cur.body = t.body || '';
      save();
      return templatesOut();
    },
    apiDeleteTemplate: function (pass, id) {
      gate(pass);
      var db = load();
      db.templates = db.templates.filter(function (t) { return t.id !== id; });
      save();
      return templatesOut();
    },
    apiSendMail: function (pass, p) {
      gate(pass);
      var db = load();
      var n = (p && p.to && p.to.length) ? p.to.length : (p && p.count) || 1;
      db.mailLog.push({ at: now(), formId: (p && p.formId) || '', mode: '一斉', count: n, subject: (p && p.subject) || '', failed: '' });
      save();
      return { sent: n, failed: [], from: 'demo@example.invalid', text: n + '人に送りました。（体験版なので、実際には送っていません）' };
    },
    apiMailLog: function (pass, formId) {
      gate(pass);
      return load().mailLog.filter(function (l) { return !formId || String(l.formId) === String(formId); })
        .map(function (l) { return clone(l); }).reverse();
    },
    apiSetPhotoRot: function (pass) { gate(pass); return { ok: true }; },
    apiRemovePhoto: function (pass) { gate(pass); return { ok: true }; },
    apiSavePng: function (pass) { gate(pass); return noYet(); },
    apiFirePdf: function (pass) { gate(pass); return noYet(); },
    apiHokenXlsx: function (pass) { gate(pass); return noYet(); },

    /* 出店者の画面（合言葉なし） */
    apiPublicForm: function (formId) {
      var f = formGet(formId);
      if (!f) throw new Error('このフォームは見つかりません。');
      return formPublic(f);
    },
    apiSubmit: function (formId, key, answers) {
      var f = formGet(formId);
      if (!f) throw new Error('このフォームは見つかりません。');
      if (f.status === '締切') throw new Error('このフォームは受付を終えています。');
      if (f.acceptKey && String(key || '').trim() !== String(f.acceptKey).trim()) throw new Error('受付の合言葉が違います。');
      answers = answers || {};
      var store = '';
      f.questions.forEach(function (q) {
        var v = answers[q.id];
        if (q.type === 'photo' || q.type === 'note') return;
        var empty = v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');
        if (q.required && empty) throw new Error('「' + q.label + '」が入っていません。');
        if (q.role === 'store' && !empty) store = String(v).trim();
      });
      if (!store) {
        for (var i = 0; i < f.questions.length; i++) {
          var q = f.questions[i];
          if (q.type === 'text' && answers[q.id]) { store = String(answers[q.id]).trim(); break; }
        }
      }
      var db = load();
      var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
      var id = 'R' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(db.seq++);
      db.answers.push({ id: id, formId: String(formId), at: now(), store: store || '無名',
        answers: clone(answers), photos: [], updated: now(), deleted: '' });
      save();
      return { id: id, store: store };
    },
    apiPhotoChunk: function (p) { return { done: true, fileId: 'demo-photo' }; }
  };

  /* ---------- google.script.run の代役 ---------- */
  function runner() {
    var succ = null, failh = null;
    var box = {
      withSuccessHandler: function (f) { succ = f; return box; },
      withFailureHandler: function (f) { failh = f; return box; },
      withUserObject: function () { return box; }
    };
    Object.keys(API).forEach(function (name) {
      box[name] = function () {
        var args = [].slice.call(arguments), s = succ, f = failh;
        setTimeout(function () {
          var r;
          try { r = API[name].apply(null, args); }
          catch (e) { if (f) f(e); else if (window.console) console.warn(e); return; }
          if (s) s(r);
        }, 120);
      };
    });
    return box;
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: runner });
  window.google.script.host = { close: function () {}, setHeight: function () {}, setWidth: function () {} };
  window.google.script.url = { getLocation: function (cb) { cb({ parameter: {}, hash: '' }); } };
})();
