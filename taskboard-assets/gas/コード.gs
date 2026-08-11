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
    // ファイルを動かしたあとや、たどり直しを確かめたいときの逃げ道。
    // 覚えた読み替えを捨ててから読む(合言葉が要るので誰でも押せるわけではない)。
    if (e && e.parameter && e.parameter.relink === '1') {
      const forgot = forgetLinks_();
      console.log('添付の覚え書きを ' + forgot + ' 件消しました');
      cache.remove('board');
    }
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
    const board = rowsOf_(ss.getSheetByName(CONFIG.BOARD_SHEET));

    // 添付の読み替えでしくじっても、ボードは必ず返す。
    // 見たいのはまず項目そのもので、リンクはその付け足しなので。
    let links = {};
    try {
      links = resolveLinks_(board);
    } catch (err) {
      console.warn('添付の読み替えをまとめて諦めました: ' + err);
    }

    return {
      ok: true,
      fetchedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm'),
      board: board,
      done: rowsOf_(ss.getSheetByName(CONFIG.DONE_SHEET)).slice(0, CONFIG.DONE_LIMIT),
      // 「添付」の列に書かれた場所のうち、ドライブの中にあるものを
      // 携帯から開けるURLに読み替えたもの。{場所: URL}
      links: links,
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


// ---------------------------------------------------------------- 添付をドライブのURLに読み替える
//
// PC側は「添付」の列に「ラベル|場所」を1行ずつ書く。場所はPCから見た道
// (G:\マイドライブ\… / G:\共有ドライブ\<ドライブ名>\…)なので、携帯からは開けない。
// ここで名前をたどってファイルIDを見つけ、ブラウザで開けるURLに読み替える。
//
// たどるのは1件につき階層のぶんだけAPIを呼ぶので、結果は覚えておく。
// 見つかったものは消えるまで(スクリプトのプロパティ)、
// 見つからなかったものは10分だけ(キャッシュ)覚える。あとで置かれることがあるため。

const LINK_ROOT_MY = 'マイドライブ';
const LINK_ROOT_SHARED = '共有ドライブ';

// しくじった場所を、次に試すまで待つ時間。
// 長くすると、たまたま1回失敗しただけの場所がその間ずっと出てこない。
const LINK_MISS_SEC = 60;

// 1回の読み取りで「新しくたどる」数の上限。
// たどるのは1件につき階層のぶんだけAPIを呼ぶので、添付の多いボードで
// 全部を一度にやると返事が遅くなり、携帯が待ちきれない。
// 溢れたぶんは覚えないだけで、次の読み取り(1分ごとの自動更新)で続きをやる。
const LINK_NEW_PER_CALL = 5;

/**
 * ボードの行から場所を集めて、{場所: URL} を返す。
 *
 * **1件ずつ独立して扱う。** 1つたどれなくても、ほかの添付は返す。
 * 一度たどれたものはスクリプトのプロパティに覚えるので、2回目からは
 * APIを1回も呼ばずに必ず返る。
 */
function resolveLinks_(rows) {
  const out = {};
  const paths = collectLinkPaths_(rows);
  let budget = LINK_NEW_PER_CALL;

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    try {
      const known = storedLink_(path);
      if (known) {
        out[path] = known;
        continue;
      }
      if (budget <= 0) continue;          // 続きは次の読み取りで
      if (recentlyMissed_(path)) continue;
      budget--;

      const url = driveUrlForPath_(path);
      if (url) {
        rememberLink_(path, url);
        out[path] = url;
      } else {
        rememberMiss_(path);
      }
    } catch (err) {
      // ここで止めない。1件の失敗で添付が全部消えるほうが困る。
      console.warn('添付をたどれませんでした(' + path + '): ' + err);
      rememberMiss_(path);
    }
  }
  return out;
}

/** ボードの「添付」列から、場所だけを重複なく集める */
function collectLinkPaths_(rows) {
  const seen = {};
  const out = [];
  (rows || []).forEach(function (r) {
    String((r && r['添付']) || '').split('\n').forEach(function (line) {
      const path = linkPathOf_(line);
      if (path && !seen[path]) {
        seen[path] = true;
        out.push(path);
      }
    });
  });
  return out;
}

/** 「ラベル|場所」から場所だけ取り出す */
function linkPathOf_(line) {
  const s = String(line == null ? '' : line).trim();
  if (!s) return '';
  const i = s.indexOf('|');
  return (i < 0 ? s : s.slice(i + 1)).trim();
}

/** 覚え書きの見出し。長さが変わらないよう、道そのものではなく指紋を使う。 */
function linkKey_(path) {
  const d = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(path), Utilities.Charset.UTF_8);
  return 'link:' + d.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

// 覚え書きの読み書きは、どれもここで失敗を受け止める。
// プロパティやキャッシュ側の不調で、添付が丸ごと消えないようにするため。
function storedLink_(path) {
  try {
    return PropertiesService.getScriptProperties().getProperty(linkKey_(path)) || '';
  } catch (err) {
    return '';
  }
}

function rememberLink_(path, url) {
  try {
    PropertiesService.getScriptProperties().setProperty(linkKey_(path), url);
  } catch (err) {
    console.warn('添付の覚え書きに失敗: ' + err);
  }
}

function recentlyMissed_(path) {
  try {
    return CacheService.getScriptCache().get(linkKey_(path)) === 'miss';
  } catch (err) {
    return false;
  }
}

function rememberMiss_(path) {
  try {
    CacheService.getScriptCache().put(linkKey_(path), 'miss', LINK_MISS_SEC);
  } catch (err) {
    // 覚えられなくても、次の読み取りでもう一度たどるだけ
  }
}

/** 覚えた読み替えを全部忘れる(ファイルを動かしたとき・確認したいとき) */
function forgetLinks_() {
  let n = 0;
  try {
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('link:') === 0 || k.indexOf('drive:') === 0) {
        props.deleteProperty(k);
        n++;
      }
    });
  } catch (err) {
    console.warn('覚え書きを消せませんでした: ' + err);
  }
  return n;
}

/** G:\マイドライブ\a\b.pdf のような道を、開けるURLに読み替える。無ければ空。 */
function driveUrlForPath_(path) {
  const parts = String(path).replace(/\//g, '\\').split('\\').filter(String);

  let at = parts.indexOf(LINK_ROOT_MY);
  let parentId = null;
  if (at >= 0) {
    parentId = 'root';
  } else {
    at = parts.indexOf(LINK_ROOT_SHARED);
    if (at < 0) return '';               // ドライブの外(PCの中のもの)
    const driveName = parts[at + 1];
    if (!driveName) return '';
    parentId = sharedDriveId_(driveName);
    if (!parentId) return '';
    at += 1;                              // ドライブ名まで読み終えた
  }

  const rest = parts.slice(at + 1);
  if (!rest.length) return '';

  let id = parentId;
  for (let i = 0; i < rest.length; i++) {
    id = childIdByName_(id, rest[i]);
    if (!id) return '';
  }
  const meta = Drive.Files.get(id, { fields: 'webViewLink', supportsAllDrives: true });
  return (meta && meta.webViewLink) || '';
}

/** 共有ドライブを名前で探す。名前は変わらないので、見つけたら覚えておく。 */
function sharedDriveId_(name) {
  const key = 'drive:' + name;
  const props = PropertiesService.getScriptProperties();
  try {
    const hit = props.getProperty(key);
    if (hit) return hit;
  } catch (err) {
    // 覚え書きが読めなくても、たどり直せばよい
  }
  const res = Drive.Drives.list({ q: "name = '" + escapeQuery_(name) + "'", pageSize: 10 });
  const list = (res && res.drives) || [];
  const id = list.length ? list[0].id : '';
  if (id) {
    try {
      props.setProperty(key, id);
    } catch (err) {
      // 覚えられなくても動く
    }
  }
  return id;
}

/** 親の中から名前で1つ探す(フォルダでもファイルでもよい) */
function childIdByName_(parentId, name) {
  const res = Drive.Files.list({
    q: "'" + parentId + "' in parents and name = '" + escapeQuery_(name) + "' and trashed = false",
    fields: 'files(id)',
    pageSize: 2,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const files = (res && res.files) || [];
  return files.length ? files[0].id : '';
}

function escapeQuery_(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
