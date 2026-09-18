/* 体験版の「偽のサーバー」。本物の GAS（doPost）の代わりに、架空の中身を返します。
   謎の中身・地名・人名は、すべて作りものです。
   参加者の進みぐあいは、このブラウザの中（localStorage）に置きます。
   だから、参加者の画面で答えると、運営の画面にも出ます。閉じて「はじめに戻す」を押せば消えます。 */
(function () {
  'use strict';

  var PKEY = 'demo_nazo_players_v2';
  var SKEY = 'demo_nazo_scen_v2';
  var PASS_OK = 'demo';
  var NG = '合言葉が違います。';

  /* ---------- 架空のシナリオ（謎は5問） ---------- */
  /* スタンプ。参加者が問いに答えると、朱の丸印が押される。
     絵は回答画面が描く（朱の二重丸＋中の字）。chars がその字。 */
  var ASSETS = {
    stamps: [
      { key: 'st1', name: '門のスタンプ', chars: '門' },
      { key: 'st2', name: '花時計のスタンプ', chars: '時' },
      { key: 'st3', name: 'ベンチのスタンプ', chars: '座' },
      { key: 'st4', name: '花だんのスタンプ', chars: '花' },
      { key: 'st5', name: '分かれ道のスタンプ', chars: '道' }
    ]
  };
  function seedScenario() {
    var S = 'D001';
    var scenario = {
      id: S, title: 'みどり公園の たからさがし', eventName: 'たからさがし（体験版）', theme: 'washi',
      logoUrl: '', startNodeId: S + '-n00', description: '公園をひとまわりしながら、5つの謎をとく 40分ほどのあそびです。',
      entryMode: 'name', staffPin: '', showRoute: true, textsJson: '', assetsJson: JSON.stringify(ASSETS),
      assignMode: 'manual', assignPin: '', assignMax: '', adminOn: false,
      status: 'published', passcode: '', updatedAt: '2026-09-15 11:20'
    };
    var n = function (id, kind, answerType, title, body, o) {
      o = o || {};
      return { id: S + '-' + id, order: o.order || 0, kind: kind, title: title, body: body, imageUrl: '',
        answerType: answerType, nextNodeId: o.next ? S + '-' + o.next : '', wrongText: o.wrongText || '',
        hintAfter: o.hintAfter || 0, hintText: o.hintText || '',
        wrongNextNodeId: '', endingCode: o.endingCode || '', qrOnly: false, score: o.score || 0,
        correctNodeId: o.correct ? S + '-' + o.correct : '', wrongNodeId: o.wrong ? S + '-' + o.wrong : '',
        mode: '', giveUpAfter: o.giveUpAfter || 0,
        routeNo: (o.routeNo === undefined ? '' : o.routeNo), place: o.place || '',
        blocksJson: o.blocks ? JSON.stringify(o.blocks) : '' };
    };
    /* 正解したときに押されるスタンプと、そのあとに出る一文 */
    var ok = function (key, story) { return { after: { stampKey: key, story: story } }; };
    var nodes = [
      n('n00', 'start', 'none', '', '', { order: 1, next: 'n01' }),
      n('n01', 'info', 'none', 'みどり公園へ ようこそ',
        '受付でもらった地図には、公園の絵と、こんな一文が書いてある。\n\n「たからは、いちばん長く日の当たる場所で待っている」\n\nまずは正面の門から入ろう。',
        { order: 2, next: 'n02', routeNo: 0, place: '受付' }),
      n('n02', 'question', 'choice', '【1】三つの門',
        '公園には門が三つある。地図のすみに、こう書きそえてあった。\n\n「朝いちばんに ひらく門から入ること」\n\nどの門から入る？',
        { order: 3, correct: 'n03', wrong: 'w1', hintAfter: 90, hintText: '朝日はどちらからのぼる？',
          routeNo: 1, place: '正面の門', blocks: ok('st1', 'かんぬきが外れ、朝の光が道をまっすぐ照らした。') }),
      n('n03', 'question', 'text', '【2】時計の針',
        '花時計の前に立った。針は 3時40分 を指したまま止まっている。\n台座に小さな字で「針のあいだの角度を こたえよ（数字だけ）」とある。',
        { order: 4, correct: 'n04', wrong: 'w2', hintAfter: 120,
          hintText: '長針は 8 の位置。短針は 3 と 4 のあいだ、3 から 3分の2 のところ。',
          routeNo: 2, place: '花時計', blocks: ok('st2', '台座の引き出しがひらき、色のあせた公園の図が出てきた。') }),
      n('n04', 'question', 'choice', '【3】ベンチのならび',
        '池のまわりに、ベンチが 赤・青・赤・青・赤 とならんでいる。\nその先、木のかげにもう一つベンチがある。何色？',
        { order: 5, correct: 'n05', hintAfter: 60, hintText: 'ならびをそのまま先へのばしてみる。',
          routeNo: 3, place: '池のほとり', blocks: ok('st3', '色のならびを見ぬいたとたん、池の面がすっと静かになった。') }),
      n('n05', 'question', 'text', '【4】花だんの札',
        'いちばん大きな花だんに、札が四つ立っている。\n\n　「み」「ど」「り」「？」\n\n公園の名前を思い出そう。「？」に入る一字は？',
        { order: 6, correct: 'n06', wrong: 'w3', hintAfter: 90, hintText: 'この公園の名前を、声に出して言ってみる。',
          routeNo: 4, place: '花だん', blocks: ok('st4', '花だんの土がすこし盛り上がり、石の矢印が顔を出した。') }),
      n('n06', 'question', 'choice', '【5】さいごの分かれ道',
        '道が二つに分かれた。はじめの一文を思い出す。\n\n「たからは、いちばん長く日の当たる場所で待っている」\n\nどちらへ行く？',
        { order: 7, hintAfter: 60, hintText: '木のしげった道と、ひらけた道。日が当たるのは？',
          routeNo: 5, place: '分かれ道', blocks: ok('st5', '選んだ道の先から、かすかに水の音が聞こえてくる。') }),
      n('e1', 'ending', 'none', '泉の結末',
        'ひらけた道の先、丸い泉のまんなかに 小さな石の箱があった。\nふたを開けると、金色の札が一枚。\n\n「よくここまで来た。たからは、歩いた道のりそのものだ」\n\nおつかれさまでした。受付に戻って、この画面を見せてください。',
        { order: 8, endingCode: 'MIZU-01', routeNo: 6, place: '泉',
          blocks: { ending: { certificate: true } } }),
      n('e2', 'ending', 'none', '木かげの結末',
        '木かげの道は、古い東屋にたどり着いた。\n柱に彫られた文字がある。\n\n「急がぬ者よ、ここで休め。たからは また明日」\n\nこれはこれで、悪くない終わりかた。おつかれさまでした。',
        { order: 9, endingCode: 'KAGE-02', routeNo: 6, place: '東屋',
          blocks: { ending: { certificate: true } } }),
      n('w1', 'wrong', 'none', '門はかたく閉じている', 'かぎがかかっていて開かない。\n地図をもう一度見よう。', { order: 10, next: 'n02' }),
      n('w2', 'wrong', 'none', '花時計は動かない', '針はぴくりともしない。\n数えかたを、もう一度。', { order: 11, next: 'n03' }),
      n('w3', 'wrong', 'none', '札がかたむいた', '風で札がかたむいただけだった。\nもう一度、四つならべて読んでみよう。', { order: 12, next: 'n05' })
    ];
    var c = function (id, nodeId, order, label, keywords, ok, next, feedback, score) {
      return { id: S + '-' + id, nodeId: S + '-' + nodeId, order: order, label: label, keywords: keywords || '',
        isCorrect: !!ok, nextNodeId: next ? S + '-' + next : '', feedback: feedback || '', score: score || 0 };
    };
    var choices = [
      c('c01', 'n02', 1, '東の門', '', true, '', 'かんぬきが すっと外れた。', 2),
      c('c02', 'n02', 2, '西の門', '', false, '', 'かぎがかかっている。', 0),
      c('c03', 'n02', 3, '北の門', '', false, '', '工事中の札がさがっている。', 0),
      c('c04', 'n03', 1, '130', '130,１３０,130度,130ど', true, '', '台座がかちりと鳴り、引き出しが開いた。', 3),
      c('c05', 'n04', 1, '赤', '', true, '', 'たしかに赤。ならびのとおりだ。', 2),
      c('c06', 'n04', 2, '青', '', false, '', 'ちがった。もう一度ならびを見よう。', 0),
      c('c07', 'n04', 3, '白', '', false, '', 'そんな色のベンチは無い。', 0),
      c('c08', 'n05', 1, 'の', 'の,ノ,ﾉ', true, '', '四つならんで「みどりの」。花だんの土がすこし盛り上がった。', 3),
      c('c09', 'n06', 1, 'ひらけた道', '', true, 'e1', '日ざしがまぶしい。', 3),
      c('c10', 'n06', 2, '木かげの道', '', true, 'e2', 'ひんやりとした風がふく。', 1)
    ];
    return { scenario: scenario, nodes: nodes, choices: choices };
  }

  /* ---------- 入れ物 ---------- */
  var SC = null;
  function scen() {
    if (SC) return SC;
    try { var s = localStorage.getItem(SKEY); if (s) { SC = JSON.parse(s); return SC; } } catch (e) {}
    SC = seedScenario();
    try { localStorage.setItem(SKEY, JSON.stringify(SC)); } catch (e) {}
    return SC;
  }
  function saveScen() { try { localStorage.setItem(SKEY, JSON.stringify(SC)); } catch (e) {} }
  function players() {
    try { var s = localStorage.getItem(PKEY); if (s) return JSON.parse(s); } catch (e) {}
    return {};
  }
  function savePlayers(o) { try { localStorage.setItem(PKEY, JSON.stringify(o)); } catch (e) {} }
  window.demoReset = function () {
    try { localStorage.removeItem(PKEY); localStorage.removeItem(SKEY); } catch (e) {}
    try { for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (k && k.indexOf('nazotoki_') === 0) localStorage.removeItem(k); } } catch (e2) {}
    location.reload();
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function gate(p) { if (String(p) !== PASS_OK) throw new Error(NG); }
  function pack(d) {
    var bin = new TextEncoder().encode(JSON.stringify(d));
    var s = '';
    for (var i = 0; i < bin.length; i++) s += String.fromCharCode(bin[i]);
    return btoa(s);
  }
  function nowText() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function nodeTitle(id) {
    var ns = scen().nodes;
    for (var i = 0; i < ns.length; i++) if (ns[i].id === id) return ns[i].title || ns[i].id;
    return id;
  }
  function scenList() {
    var s = scen().scenario;
    return [{ id: s.id, title: s.title, theme: s.theme, nodes: scen().nodes.length,
      updatedAt: s.updatedAt, status: s.status, adminOn: s.adminOn, eventName: s.eventName }];
  }

  /* ---------- api ---------- */
  var API = {
    /* --- 参加者の画面 --- */
    apiGetScenario: function (id, pass) {
      var d = scen();
      if (String(id) !== d.scenario.id) throw new Error('このなぞときは見つかりません。');
      return { ver: String(d.scenario.updatedAt || '1'), packed: pack(d) };
    },
    apiPreviewScenario: function (id, tok) { return API.apiGetScenario(id); },
    apiCover: function (id) { return null; },
    apiTicketState: function () { return { state: 'ready', serial: 'DEMO-0001' }; },
    apiAllocate: function () { return { serial: 'DEMO-0001', code: '0000' }; },
    apiActivate: function () { return { ok: true, serial: 'DEMO-0001' }; },
    apiPrizeConfirm: function () { return { ok: true, text: '受け取りました。（体験版）' }; },
    apiLog: function (p) {
      p = p || {};
      var all = players(), id = String(p.playerId || 'p1');
      var cur = all[id] || { id: id, startedAt: nowText(), events: 0, wrong: 0, hint: 0, nodes: {} };
      cur.name = p.name || cur.name || '';
      cur.currentNodeId = p.currentNodeId || cur.currentNodeId || '';
      cur.finishedAt = p.finishedAt || cur.finishedAt || '';
      cur.endingNodeId = p.endingNodeId || cur.endingNodeId || '';
      cur.updatedAt = nowText();
      (p.events || []).forEach(function (e) {
        cur.events++;
        var t = String((e && (e.type || e.kind)) || '');
        var nid = String((e && (e.nodeId || e.node)) || '');
        if (nid) cur.nodes[nid] = (cur.nodes[nid] || 0) + 1;
        if (t.indexOf('wrong') >= 0) cur.wrong++;
        if (t.indexOf('hint') >= 0) cur.hint++;
      });
      all[id] = cur;
      savePlayers(all);
      return { ok: true, saved: (p.events || []).length };
    },

    /* --- 運営の画面 --- */
    apiAdminLogin: function (pass) {
      gate(pass);
      var u = '';
      try { u = new URL('../play/', location.href).href; } catch (e) { u = '../play/'; }
      return { me: 'demo@example.invalid', url: u, scenarios: scenList(), ver: '体験版' };
    },
    apiGetScenarioAdmin: function (pass, id) {
      gate(pass);
      var d = scen();
      if (String(id) !== d.scenario.id) throw new Error('このなぞときは見つかりません。');
      return clone(d);
    },
    apiSaveScenario: function (pass, sc) {
      gate(pass);
      var d = scen();
      for (var k in sc) if (sc[k] !== '' && sc[k] !== undefined) d.scenario[k] = sc[k];
      d.scenario.updatedAt = nowText();
      saveScen();
      return { ok: true, list: scenList(), id: d.scenario.id };
    },
    apiSaveNodes: function (pass, id, nodes, choices) {
      gate(pass);
      var d = scen();
      if (nodes) d.nodes = clone(nodes);
      if (choices) d.choices = clone(choices);
      d.scenario.updatedAt = nowText();
      saveScen();
      return { ok: true, saved: d.nodes.length };
    },
    apiPublish: function (pass, id, on) {
      gate(pass);
      var d = scen();
      d.scenario.status = on ? 'published' : 'draft';
      d.scenario.updatedAt = nowText();
      saveScen();
      return { ok: true, list: scenList() };
    },
    apiSetAdminOn: function (pass, id, to) {
      gate(pass);
      scen().scenario.adminOn = !!to; saveScen();
      return { ok: true, list: scenList(), adminOn: !!to };
    },
    apiDuplicateScenario: function (pass) { gate(pass); return { ok: true, list: scenList() }; },
    apiDeleteScenario: function (pass) { gate(pass); throw new Error('体験版では、なぞときを消すことはできません。'); },
    apiImportScenario: function (pass) { gate(pass); throw new Error('体験版では、読み込みはできません。'); },
    apiExportScenario: function (pass) {
      gate(pass);
      return { name: 'demo-scenario.json', text: JSON.stringify(clone(scen()), null, 2) };
    },
    apiImportSheetRows: function (pass) { gate(pass); throw new Error('体験版では、表からの読み込みはできません。'); },
    apiExportSheetTable: function (pass) { gate(pass); return { rows: [], name: 'demo.csv' }; },
    apiUploadImage: function (pass) { gate(pass); throw new Error('体験版では、絵を入れることはできません。'); },
    apiPreviewToken: function (pass, id, nodeId) {
      gate(pass);
      return { token: 'demo', url: (function () { try { return new URL('../play/?s=' + id, location.href).href; } catch (e) { return '../play/?s=' + id; } })() };
    },
    apiListPlayers: function (pass, id) {
      gate(pass);
      var all = players(), out = [];
      for (var k in all) {
        var p = all[k];
        out.push({ id: p.id, name: p.name || '', startedAt: p.startedAt || '', updatedAt: p.updatedAt || '',
          finishedAt: p.finishedAt || '', endingTitle: p.endingNodeId ? nodeTitle(p.endingNodeId) : '',
          currentNodeId: p.currentNodeId || '', currentNodeTitle: p.currentNodeId ? nodeTitle(p.currentNodeId) : '' });
      }
      out.sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : -1; });
      return out;
    },
    apiResetPlayer: function (pass, pid) {
      gate(pass);
      var all = players();
      delete all[pid];
      savePlayers(all);
      return { ok: true };
    },
    apiStats: function (pass, id, from, to) {
      gate(pass);
      var all = players(), joined = 0, cleared = 0, hit = {};
      for (var k in all) {
        joined++;
        if (all[k].finishedAt) cleared++;
        for (var nid in (all[k].nodes || {})) hit[nid] = (hit[nid] || 0) + 1;
      }
      var nodes = scen().nodes.filter(function (n) { return n.kind === 'question'; }).map(function (n, i) {
        var reached = hit[n.id] || 0;
        return { id: n.id, title: n.title || n.id, routeNo: String(i + 1), reached: reached,
          correct: reached, wrong: 0, near: 0, hint1: 0, hint2: 0, hint3: 0, rescued: 0, left: 0 };
      });
      return { from: from || '', to: to || '',
        players: { joined: joined, cleared: cleared, clearRate: joined ? Math.round(cleared * 100 / joined) : 0,
          medianMin: cleared ? 32 : 0, prize: cleared },
        nodes: nodes };
    },
    apiIssueTickets: function (pass) { gate(pass); throw new Error('体験版では、QRの発行はできません。'); },
    apiListTickets: function (pass) { gate(pass); return { tickets: [], list: [] }; },
    apiUnlockTicket: function (pass) { gate(pass); return { ok: true }; },
    apiAssignKey: function () { return { key: 'demo' }; }
  };

  /* ---------- google.script.run の代役 ----------
     dist 版の call() は、google.script.run があれば そちらを使う作りなので、
     fetch を差し替えるのではなく、google.script.run のふりをします。 */
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
        }, 100);
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
