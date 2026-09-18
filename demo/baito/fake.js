/* 体験版の「偽のサーバー」。本物の GAS（3_Webアプリ側.gs）の代わりに、架空の中身を返します。
   会社名・人名・会場名は、すべて作りものです。
   保存はこのブラウザの中（localStorage）だけ。閉じて「はじめに戻す」を押せば消えます。 */
(function () {
  'use strict';

  var KEY = 'demo_baito_v1';
  var PASS_OK = 'demo';
  var NG = '合言葉が違います。';

  /* ---------- 架空の中身（たね） ---------- */
  function seed() {
    var people = [
      { name: '相原 ゆい', formal: '相原 ゆい', hidden: false },
      { name: '井口 だいき', formal: '井口 だいき', hidden: false },
      { name: '大村 しずか', formal: '大村 しずか', hidden: false },
      { name: '柏木 まこと', formal: '柏木 まこと', hidden: false },
      { name: '白石 りょう', formal: '白石 りょう', hidden: false },
      { name: '田所 あき', formal: '田所 あき', hidden: false },
      { name: '中原 はやと', formal: '中原 はやと', hidden: false },
      { name: '望月 えみ', formal: '望月 えみ', hidden: false }
    ];
    /* m: [なまえ, 始まり, 終わり, 時間, 状態, 駐車場] */
    var jobs = [
      { id: 'J-001', venue: 'みなと市民ホール', name: '音楽祭 会場設営', billing: '一式', amount: 180000,
        wage: 1300, trans: 600, memo: '搬入口は north 側。台車は主催者が用意。', date: '2026-09-05', end: '2026-09-05', need: 4,
        days: [{ date: '2026-09-05', start: '08:00', end: '17:00', need: 4, amount: '', memo: '' }],
        m: [
          ['2026-09-05', '相原 ゆい', '08:00', '17:00', 8, '支払済', 0],
          ['2026-09-05', '井口 だいき', '08:00', '17:00', 8, '支払済', 0],
          ['2026-09-05', '柏木 まこと', '08:00', '17:00', 8, '支払済', 1000],
          ['2026-09-05', '望月 えみ', '08:00', '15:00', 6, '支払済', 0]
        ] },
      { id: 'J-002', venue: '北山台メッセ', name: '産業展 搬入・搬出', billing: '一式', amount: 420000,
        wage: 1300, trans: 600, memo: '2日間。初日は搬入、2日目は撤去。', date: '2026-09-12', end: '2026-09-13', need: 5,
        days: [
          { date: '2026-09-12', start: '09:00', end: '18:00', need: 5, amount: '', memo: '搬入' },
          { date: '2026-09-13', start: '17:00', end: '22:00', need: 5, amount: '', memo: '撤去' }
        ],
        m: [
          ['2026-09-12', '相原 ゆい', '09:00', '18:00', 8, '支払済', 0],
          ['2026-09-12', '大村 しずか', '09:00', '18:00', 8, '未払い', 0],
          ['2026-09-12', '白石 りょう', '09:00', '18:00', 8, '未払い', 1200],
          ['2026-09-12', '中原 はやと', '09:00', '18:00', 8, '未払い', 0],
          ['2026-09-12', '望月 えみ', '09:00', '16:00', 6, '支払済', 0],
          ['2026-09-13', '大村 しずか', '17:00', '22:00', 5, '未払い', 0],
          ['2026-09-13', '白石 りょう', '17:00', '22:00', 5, '未払い', 1200],
          ['2026-09-13', '中原 はやと', '17:00', '22:00', 5, '未払い', 0]
        ] },
      { id: 'J-003', venue: 'さくら台体育館', name: '市民スポーツ大会 運営補助', billing: '一式', amount: 150000,
        wage: 1200, trans: 500, memo: '', date: '2026-09-20', end: '2026-09-20', need: 3,
        days: [{ date: '2026-09-20', start: '07:30', end: '16:30', need: 3, amount: '', memo: '' }],
        m: [
          ['2026-09-20', '井口 だいき', '07:30', '16:30', 8, '未払い', 0],
          ['2026-09-20', '田所 あき', '07:30', '16:30', 8, '未払い', 0],
          ['2026-09-20', '望月 えみ', '07:30', '16:30', 8, '未払い', 0]
        ] },
      { id: 'J-004', venue: 'みどりが丘公園', name: '秋まつり 設営・撤去', billing: '一式', amount: 260000,
        wage: 1300, trans: 600, memo: '雨天のときは翌週にのばす。', date: '2026-10-03', end: '2026-10-03', need: 4,
        days: [{ date: '2026-10-03', start: '08:00', end: '18:00', need: 4, amount: '', memo: '' }],
        m: [
          ['2026-10-03', '相原 ゆい', '08:00', '18:00', 9, '未払い', 0],
          ['2026-10-03', '柏木 まこと', '08:00', '18:00', 9, '未払い', 1000],
          ['2026-10-03', '白石 りょう', '08:00', '18:00', 9, '未払い', 0],
          ['2026-10-03', '田所 あき', '08:00', '14:00', 5, '未払い', 0]
        ] },
      { id: 'J-005', venue: '北山台メッセ', name: '物産展 会場運営', billing: '一式', amount: 380000,
        wage: 1300, trans: 600, memo: '', date: '2026-10-17', end: '2026-10-18', need: 4,
        days: [
          { date: '2026-10-17', start: '09:00', end: '18:00', need: 4, amount: '', memo: '' },
          { date: '2026-10-18', start: '09:00', end: '18:00', need: 4, amount: '', memo: '' }
        ],
        m: [
          ['2026-10-17', '井口 だいき', '09:00', '18:00', 8, '未払い', 0],
          ['2026-10-17', '大村 しずか', '09:00', '18:00', 8, '未払い', 0],
          ['2026-10-17', '中原 はやと', '09:00', '18:00', 8, '未払い', 0],
          ['2026-10-18', '井口 だいき', '09:00', '18:00', 8, '未払い', 0],
          ['2026-10-18', '大村 しずか', '09:00', '18:00', 8, '未払い', 0],
          ['2026-10-18', '望月 えみ', '09:00', '18:00', 8, '未払い', 0]
        ] }
    ];
    /* 出面の1行ずつに直す */
    var rec = 1, rows = [];
    jobs.forEach(function (j) {
      j.m.forEach(function (x) {
        rows.push({ rec: 'D' + String(1000 + rec++).slice(-4), jobId: j.id, date: x[0], venue: j.venue, jobName: j.name,
          name: x[1], start: x[2], end: x[3], hours: x[4], pay: '時給', price: j.wage, trans: j.trans,
          park: x[6] || 0, status: x[5], note: '' });
      });
      delete j.m;
    });
    return { people: people, jobs: jobs, rows: rows, wage: 1300, trans: 600, seq: rec };
  }

  /* ---------- 入れ物 ---------- */
  var DB = null;
  function load() {
    if (DB) return DB;
    try { var s = localStorage.getItem(KEY); if (s) { DB = JSON.parse(s); return DB; } } catch (e) {}
    DB = seed(); save(); return DB;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} }
  window.demoReset = function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function gate(p) { if (String(p) !== PASS_OK) throw new Error(NG); }
  function ym(d) { return String(d || '').slice(0, 7); }
  function money(r) {
    if (r.pay === '日給') return Number(r.price || 0) + Number(r.park || 0);
    return Number(r.price || 0) * Number(r.hours || 0) + Number(r.trans || 0) + Number(r.park || 0);
  }
  function jobGet(id) {
    var db = load();
    for (var i = 0; i < db.jobs.length; i++) if (db.jobs[i].id === String(id)) return db.jobs[i];
    return null;
  }
  function personOf(name) { return { key: String(name), label: String(name) }; }

  /* ---------- 画面に渡す形（本物の .gs に合わせる） ---------- */
  function rosterOut() {
    var db = load(), entries = [], plist = [];
    db.people.forEach(function (p) {
      if (!p.hidden) entries.push({ name: p.name, key: p.formal || p.name, label: p.formal || p.name });
      plist.push({ key: p.formal || p.name, label: p.formal || p.name, names: [p.name] });
    });
    return { entries: entries, people: plist };
  }
  function listsOut() {
    var db = load(), venues = [], names = [], sv = {}, sn = {};
    for (var i = db.jobs.length - 1; i >= 0; i--) {
      var j = db.jobs[i];
      if (j.venue && !sv[j.venue]) { sv[j.venue] = 1; venues.push(j.venue); }
      if (j.name && !sn[j.name]) { sn[j.name] = 1; names.push(j.name); }
    }
    return { venues: venues, names: names, holidays: ['2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23'] };
  }
  function configOut() {
    var db = load(), l = listsOut();
    return { roster: rosterOut(), venues: l.venues, names: l.names, holidays: l.holidays,
      wage: db.wage, trans: db.trans, mailTo: '', sheetUrl: '', helpUrl: '' };
  }
  function rowsOfJob(id) { return load().rows.filter(function (r) { return r.jobId === String(id); }); }

  function detailOf(id) {
    var j = jobGet(id), l = listsOut();
    if (!j) throw new Error('案件が見つかりません: ' + id);
    var members = rowsOfJob(id).map(function (r) {
      return { date: r.date, dayId: '', name: r.name, start: r.start, end: r.end,
        pay: r.pay, price: r.price, trans: Number(r.trans) > 0, park: Number(r.park) || '',
        status: r.status, note: r.note || '' };
    });
    return { id: j.id, isNew: false, roster: rosterOut().entries.map(function (e) { return e.name; }),
      venues: l.venues, names: l.names, holidays: l.holidays, stamp: String(j.updated || '1'),
      job: { venue: j.venue, name: j.name, billing: j.billing, amount: j.amount, wage: j.wage, trans: j.trans,
        memo: j.memo || '', date: j.date, end_date: j.end || j.date, need: j.need,
        pay: (members.length && members[0].pay) ? members[0].pay : '時給' },
      days: clone(j.days || []), members: members };
  }
  function newDetail() {
    var db = load(), l = listsOut();
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var t = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    return { id: '', isNew: true, roster: rosterOut().entries.map(function (e) { return e.name; }),
      venues: l.venues, names: l.names, holidays: l.holidays,
      job: { date: t, end_date: t, venue: '', name: '', start: '', end: '', need: '', billing: '一式',
        amount: '', pay: '時給', wage: db.wage, trans: db.trans, memo: '' },
      days: [], members: [] };
  }

  function jobListOut(month) {
    month = String(month || '');
    var db = load();
    var nowYm = (function () { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1); })();
    var months = [], sm = {};
    db.jobs.forEach(function (j) { var k = ym(j.date); if (k && !sm[k]) { sm[k] = 1; months.push(k); } });
    months.sort(); months.reverse();

    var all = db.jobs.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var jobs = [], sum = { count: 0, sales: 0, cost: 0, profit: 0, unpaid: 0 }, details = {};
    all.forEach(function (j) {
      if (month === 'FROM_NOW') { if (ym(j.date) < nowYm) return; }
      else if (month && ym(j.date) !== month) return;
      var rs = rowsOfJob(j.id), cost = 0, unpaid = 0, order = [], seen = {};
      rs.forEach(function (r) {
        var mo = money(r);
        cost += mo;
        if (r.status === '未払い') unpaid += mo;
        if (!seen[r.name]) { seen[r.name] = { person: personOf(r.name), unpaid: false, paid: false, off: false }; order.push(r.name); }
        if (r.status === '支払済') seen[r.name].paid = true;
        else if (r.status === '対象外') seen[r.name].off = true;
        else seen[r.name].unpaid = true;
      });
      var members = order.map(function (k) {
        var m = seen[k];
        return { person: m.person, status: m.unpaid ? '未払い' : (m.paid ? '支払済' : '対象外') };
      });
      jobs.push({ id: j.id, venue: j.venue, name: j.name, billing: j.billing, amount: Number(j.amount) || 0,
        wage: j.wage, trans: j.trans, memo: j.memo || '', date: j.date, end: j.end || j.date, month: ym(j.date),
        dayCount: (j.days || []).length || 1, need: Number(j.need) || 0, people: rs.length,
        sales: Number(j.amount) || 0, cost: cost, profit: (Number(j.amount) || 0) - cost, unpaid: unpaid,
        status: '', badge: '', badgeNg: false, members: members });
      sum.count += 1; sum.sales += Number(j.amount) || 0; sum.cost += cost;
      sum.profit += (Number(j.amount) || 0) - cost; sum.unpaid += unpaid;
      try { details[j.id] = detailOf(j.id); } catch (e) {}
    });
    return { month: month, months: months, jobs: jobs, sum: sum, details: details };
  }

  function unpaidOut() {
    var groups = {}, order = [], total = 0, flat = [];
    load().rows.forEach(function (r) {
      if (r.status !== '未払い') return;
      var mo = money(r);
      if (!mo) return;
      if (!groups[r.name]) { groups[r.name] = { person: personOf(r.name), rows: [], sum: 0 }; order.push(r.name); }
      var row = { rec: r.rec, date: r.date, ym: ym(r.date), jobId: r.jobId, venue: r.venue, jobName: r.jobName,
        place: r.venue + (r.jobName ? '（' + r.jobName + '）' : ''), wrote: r.name, person: personOf(r.name), money: mo };
      groups[r.name].rows.push(row); groups[r.name].sum += mo;
      flat.push(row); total += mo;
    });
    var list = order.map(function (k) { return groups[k]; });
    list.sort(function (a, b) { return b.sum - a.sum; });
    list.forEach(function (g) { g.rows.sort(function (a, b) { return a.date < b.date ? -1 : 1; }); });
    flat.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return { total: total, people: list, noMoney: 0, rows: flat };
  }

  function peopleOut() {
    var db = load(), count = {};
    db.rows.forEach(function (r) { count[r.name] = (count[r.name] || 0) + 1; });
    var list = db.people.map(function (p) {
      return { name: p.name, formal: p.formal || '', person: personOf(p.formal || p.name),
        count: count[p.name] || 0, also: [], hidden: !!p.hidden };
    });
    return { people: list, roster: rosterOut() };
  }

  function monthsOut() {
    var seen = {}, out = [];
    load().rows.forEach(function (r) { var k = ym(r.date); if (k && !seen[k]) { seen[k] = 1; out.push(k); } });
    out.sort(); out.reverse();
    return out;
  }

  function yen(n) { return '¥' + (Number(n) || 0).toLocaleString('ja-JP'); }
  function statementOut(target) {
    target = String(target || '');
    if (!target) throw new Error('年月を選んでください。');
    var people = {};
    load().rows.forEach(function (r) {
      if (ym(r.date) !== target) return;
      if (r.status === '対象外') return;
      var mo = money(r);
      if (!mo) return;
      if (!people[r.name]) people[r.name] = { person: personOf(r.name), lines: [], sum: 0, park: 0, unpaid: 0 };
      var p = people[r.name];
      var detail = (r.pay === '日給') ? ('日給 ' + yen(r.price))
        : (yen(r.price) + '×' + r.hours + 'h' + (Number(r.trans) > 0 ? ' ／交通費' + yen(r.trans) : ''));
      if (Number(r.park) > 0) detail += ' ／駐車場' + yen(r.park);
      p.lines.push({ date: r.date, place: r.venue + (r.jobName ? '（' + r.jobName + '）' : ''), detail: detail, money: mo });
      p.sum += mo; p.park += Number(r.park) || 0;
      if (r.status === '未払い') p.unpaid += mo;
    });
    var list = [], total = 0, totalUnpaid = 0;
    for (var k in people) list.push(people[k]);
    list.sort(function (a, b) {
      if ((a.unpaid > 0) !== (b.unpaid > 0)) return a.unpaid > 0 ? -1 : 1;
      return b.sum - a.sum;
    });
    list.forEach(function (p) {
      p.lines.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      total += p.sum; totalUnpaid += p.unpaid;
    });
    return { ym: target, month: Number(target.split('-')[1]) + '月', people: list, total: total, totalUnpaid: totalUnpaid, skipped: 0 };
  }

  function boot(month) {
    return { config: configOut(), jobs: jobListOut(month), unpaid: unpaidOut(),
      people: peopleOut(), months: monthsOut(), ver: '1', cached: false, took: 0 };
  }
  function monthArg(m) { return String(m || ''); }
  function noYet() { throw new Error('体験版では、PDFの書き出しとメール送信はできません。本番ではここで明細ができあがります。'); }

  /* ---------- api ---------- */
  var API = {
    apiBoot: function (pass, month) { gate(pass); return boot(month); },
    apiConfig: function (pass) { gate(pass); return configOut(); },
    apiRoster: function (pass) { gate(pass); return rosterOut(); },
    apiJobList: function (pass, month) { gate(pass); return jobListOut(month); },
    apiJob: function (pass, id) { gate(pass); return id ? detailOf(id) : newDetail(); },
    apiJobDetails: function (pass, ids) {
      gate(pass);
      var out = {};
      (ids || []).forEach(function (id) { try { out[id] = detailOf(id); } catch (e) {} });
      return out;
    },
    apiSaveJob: function (pass, p) {
      gate(pass);
      var db = load(), id = p.id, j = id ? jobGet(id) : null;
      if (!j) {
        id = 'J-' + String(900 + db.jobs.length).slice(-3);
        j = { id: id }; db.jobs.push(j);
      }
      var job = p.job || {};
      j.venue = job.venue || ''; j.name = job.name || ''; j.billing = job.billing || '一式';
      j.amount = Number(job.amount) || 0; j.wage = Number(job.wage) || db.wage; j.trans = Number(job.trans) || db.trans;
      j.memo = job.memo || ''; j.date = job.date || j.date; j.end = job.end_date || job.date || j.end;
      j.need = Number(job.need) || 0;
      j.days = (p.days || []).map(function (d) {
        return { date: d.date, start: d.start || '', end: d.end || '', need: d.need || '', amount: d.amount || '', memo: d.memo || '' };
      });
      if (!j.days.length) j.days = [{ date: j.date, start: '', end: '', need: j.need, amount: '', memo: '' }];
      /* 出面を入れ直す */
      db.rows = db.rows.filter(function (r) { return r.jobId !== id; });
      (p.days || []).forEach(function (d) {
        (d.members || []).forEach(function (m) {
          if (!m || !m.name) return;
          var h = Number(m.hours);
          if (!h && m.start && m.end) {
            var a = m.start.split(':'), b = m.end.split(':');
            h = Math.max(0, (Number(b[0]) + Number(b[1]) / 60) - (Number(a[0]) + Number(a[1]) / 60));
          }
          db.rows.push({ rec: 'D' + String(1000 + db.seq++).slice(-4), jobId: id, date: d.date, venue: j.venue,
            jobName: j.name, name: m.name, start: m.start || '', end: m.end || '', hours: h || 0,
            pay: m.pay || '時給', price: Number(m.price) || j.wage, trans: m.trans === false ? 0 : j.trans,
            park: Number(m.park) || 0, status: m.status || '未払い', note: m.note || '' });
        });
      });
      j.updated = String(Date.now());
      save();
      return { ok: true, text: id + ' を保存しました。', id: id, boot: boot(monthArg(p.month)) };
    },
    apiDeleteJob: function (pass, p) {
      gate(pass);
      var db = load(), id = p.id;
      db.jobs = db.jobs.filter(function (j) { return j.id !== id; });
      db.rows = db.rows.filter(function (r) { return r.jobId !== id; });
      save();
      return { ok: true, text: id + ' を取り消しました。', boot: boot(monthArg(p.month)) };
    },
    apiUnpaid: function (pass) { gate(pass); return unpaidOut(); },
    apiMarkPaid: function (pass, who) { gate(pass); return API.apiMarkPaidMany(pass, [who], who && who.month); },
    apiMarkPaidMany: function (pass, whos, month) {
      gate(pass);
      var db = load(), set = {}, n = 0;
      (whos || []).forEach(function (w) { set[(w && w.rec) ? w.rec : w] = 1; });
      db.rows.forEach(function (r) { if (set[r.rec] && r.status === '未払い') { r.status = '支払済'; n++; } });
      save();
      return { count: n, text: n + '件を支払済にしました。', boot: boot(monthArg(month)) };
    },
    apiUnmarkPaid: function (pass, recs, month) {
      gate(pass);
      var db = load(), set = {}, n = 0;
      (recs || []).forEach(function (w) { set[(w && w.rec) ? w.rec : w] = 1; });
      db.rows.forEach(function (r) { if (set[r.rec] && r.status === '支払済') { r.status = '未払い'; n++; } });
      save();
      return { count: n, text: n + '件を未払いに戻しました。', boot: boot(monthArg(month)) };
    },
    apiMonths: function (pass) { gate(pass); return monthsOut(); },
    apiStatement: function (pass, target) { gate(pass); return statementOut(target); },
    apiPdfBlob: function (pass) { gate(pass); return noYet(); },
    apiSendPdf: function (pass) { gate(pass); return noYet(); },
    apiPeople: function (pass) { gate(pass); return peopleOut(); },
    apiAddPerson: function (pass, p) {
      gate(pass);
      var db = load(), name = String((p && (p.name || p)) || '').trim();
      if (!name) throw new Error('なまえを入れてください。');
      var dup = false;
      db.people.forEach(function (x) { if (x.name === name) dup = true; });
      if (dup) throw new Error(name + ' さんは、もう名簿にいます。');
      db.people.push({ name: name, formal: (p && p.formal) || name, hidden: false });
      save();
      var out = peopleOut(); out.ok = true; out.text = name + ' さんを足しました。';
      return out;
    },
    apiRenamePerson: function (pass, p) {
      gate(pass);
      var db = load(), from = (p && (p.from || p.old || p.name)) || '', to = (p && (p.to || p.newName)) || '';
      db.people.forEach(function (x) { if (x.name === from) { x.name = to; x.formal = to; } });
      db.rows.forEach(function (r) { if (r.name === from) r.name = to; });
      save();
      var out = peopleOut(); out.ok = true; out.text = '名前を直しました。'; out.boot = boot('');
      return out;
    },
    apiRenameDisplay: function (pass, p) { return API.apiRenamePerson(pass, p); },
    apiHidePerson: function (pass, p) {
      gate(pass);
      var db = load(), name = (p && (p.name || p)) || '';
      db.people.forEach(function (x) { if (x.name === name) x.hidden = !(p && p.show); });
      save();
      var out = peopleOut(); out.ok = true; out.text = '名簿を直しました。';
      return out;
    }
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
