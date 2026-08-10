/**
 * タスクボード連携スクリプト（Google Apps Script）
 *
 * iPhone のタスクボード画面と、Googleドライブ上の「タスクボード.xlsx」をつなぐ係。
 *
 *   読み取り … xlsx を一時的にGoogleスプレッドシート形式へ複製して中身を読み、
 *              読み終わったら複製を消す。台帳そのものには一切書き込まない。
 *   書き込み … 台帳には直接書かず、「タスクボード_受信箱」フォルダへ
 *              小さなファイルを1件ずつ置くだけ。PC側がそれを読んで台帳へ反映し、
 *              終わったらそのファイルを消す。
 *
 * 台帳を直接書き換えないのは、PC側が同じ瞬間に台帳を書いていると
 * 片方の変更が消えてしまうため。受信箱をはさむことでその事故を防いでいる。
 * 1件1ファイルにしているのは、同時に複数の回答が来ても混ざらないようにするため。
 *
 * 設置手順は taskboard-assets/gas/README.md を参照。
 */

const CONFIG = {
  // 「タスクボード.xlsx」のファイルID（ドライブのURLの /d/ と /view の間）
  MASTER_FILE_ID: '1aVFxeyLOb0edBFYjmZSatJKDs9WJpWzO',

  // 合言葉。必ず長いランダムな文字列に書き換えること。
  // これを知っている人だけが台帳の中身を見られる。
  TOKEN: 'ここを長いランダムな文字列に書き換える',

  // 受信箱フォルダの名前（台帳と同じ場所に自動で作られる）
  INBOX_NAME: 'タスクボード_受信箱',

  BOARD_SHEET: 'ボード',
  DONE_SHEET: '完了ずみ',

  // 読み取り結果を何秒とっておくか。連打しても台帳を何度も複製しないための緩衝。
  CACHE_SECONDS: 15,

  // 完了ずみを何件まで返すか
  DONE_LIMIT: 30,

  TIMEZONE: 'Asia/Tokyo',
};


// ---------------------------------------------------------------- 入口

function doGet(e) {
  return reply_(safely_(function () {
    checkToken_(e);
    const cache = CacheService.getScriptCache();
    const fresh = e && e.parameter && e.parameter.fresh === '1';
    if (!fresh) {
      const hit = cache.get('board');
      if (hit) return JSON.parse(hit);
    }
    const data = readMaster_();
    cache.put('board', JSON.stringify(data), CONFIG.CACHE_SECONDS);
    return data;
  }));
}

function doPost(e) {
  return reply_(safely_(function () {
    checkToken_(e);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!body.id) throw new Error('IDがありません');

    const now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    let record;

    if (body.kind === 'done' || body.kind === 'answer') {
      record = {
        受信日時: now,
        ID: String(body.id),
        種別: body.kind === 'done' ? '済' : '回答',
        回答: String(body.answer || ''),
        補足: String(body.note || ''),
      };
    } else if (body.kind === 'check') {
      // 検収チェックポイントの1つを入り／切りする。番号は画面と同じく1から数える。
      const num = parseInt(body.number, 10);
      if (!(num >= 1)) throw new Error('チェック番号が不正です');
      record = {
        受信日時: now,
        ID: String(body.id),
        種別: 'チェック',
        チェック番号: num,
        状態: String(body.state) === '未' ? '未' : '済',
      };
    } else {
      throw new Error('種別が不正です');
    }

    const saved = dropToInbox_(record);

    // 次の読み取りで最新が返るように、とっておいた結果を捨てる
    CacheService.getScriptCache().remove('board');
    return { ok: true, file: saved };
  }));
}


// ---------------------------------------------------------------- 台帳を読む

function readMaster_() {
  // xlsx はそのままでは読めないので、スプレッドシート形式の複製を一時的に作る
  const copy = Drive.Files.copy(
    { name: '__タスクボード_一時__', mimeType: MimeType.GOOGLE_SHEETS },
    CONFIG.MASTER_FILE_ID
  );
  try {
    const ss = SpreadsheetApp.openById(copy.id);
    return {
      ok: true,
      fetchedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm'),
      board: rowsOf_(ss.getSheetByName(CONFIG.BOARD_SHEET)),
      done: rowsOf_(ss.getSheetByName(CONFIG.DONE_SHEET)).slice(0, CONFIG.DONE_LIMIT),
    };
  } finally {
    try {
      Drive.Files.remove(copy.id);
    } catch (err) {
      // 消せなくても読み取り結果は返す（ゴミが残るだけなので握りつぶす）
      console.warn('一時ファイルを消せませんでした: ' + err);
    }
  }
}

/** 1行目を見出しとして、各行を {見出し: 値} の形に変える */
function rowsOf_(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const head = values[0].map(function (v) { return String(v == null ? '' : v).trim(); });
  const out = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const blank = row.every(function (c) { return String(c == null ? '' : c).trim() === ''; });
    if (blank) continue;

    const obj = {};
    head.forEach(function (h, idx) {
      if (h) obj[h] = cellText_(row[idx]);
    });
    out.push(obj);
  }
  return out;
}

function cellText_(v) {
  if (v == null) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
  }
  return String(v).trim();
}


// ---------------------------------------------------------------- 受信箱

/** 受信箱フォルダに1件分のファイルを置き、ファイル名を返す */
function dropToInbox_(record) {
  const name = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd_HHmmss')
    + '_' + record.ID.replace(/[^0-9A-Za-z_-]/g, '') + '.json';

  inboxFolder_().createFile(name, JSON.stringify(record, null, 2), MimeType.PLAIN_TEXT);
  return name;
}

/** 受信箱フォルダを返す。無ければ台帳と同じ場所に作る。 */
function inboxFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('INBOX_FOLDER_ID');

  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (err) {
      console.warn('受信箱フォルダが開けないので作り直します: ' + err);
    }
  }

  // 台帳と同じフォルダの中に作る（PCのドライブ同期でそのまま見えるように）
  let parent = DriveApp.getRootFolder();
  try {
    const parents = DriveApp.getFileById(CONFIG.MASTER_FILE_ID).getParents();
    if (parents.hasNext()) parent = parents.next();
  } catch (err) {
    console.warn('台帳の場所が分からないのでマイドライブ直下に作ります: ' + err);
  }

  // 同名フォルダが既にあれば使い回す
  const existing = parent.getFoldersByName(CONFIG.INBOX_NAME);
  const folder = existing.hasNext() ? existing.next() : parent.createFolder(CONFIG.INBOX_NAME);
  props.setProperty('INBOX_FOLDER_ID', folder.getId());
  return folder;
}


// ---------------------------------------------------------------- 共通

function checkToken_(e) {
  if (!CONFIG.TOKEN || CONFIG.TOKEN.indexOf('ここを') === 0) {
    throw new Error('合言葉が未設定です。コード.gs の TOKEN を書き換えてください');
  }
  const given = e && e.parameter && e.parameter.token;
  if (given !== CONFIG.TOKEN) throw new Error('合言葉が違います');
}

function safely_(fn) {
  try {
    return fn();
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function reply_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ---------------------------------------------------------------- 動作確認用

/**
 * エディタ上で実行して、台帳が読めるか確かめるためのもの。
 * 実行ログに件数と1件目が出れば設置は成功。
 */
function 動作確認() {
  const data = readMaster_();
  console.log('ボード: ' + data.board.length + '件 / 完了ずみ: ' + data.done.length + '件');
  if (data.board.length) console.log(JSON.stringify(data.board[0], null, 2));
  console.log('受信箱フォルダ: ' + inboxFolder_().getUrl());
}
