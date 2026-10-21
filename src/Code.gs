/**
 * ES採点ビューア ― 株式会社アワーズ 採用チーム
 *
 * 単独の Apps Script プロジェクトとして動き、Config.gs の SPREADSHEET_ID のスプレッドシートを読み書きします。
 *   1. Apps Script のエディタで関数「setupSpreadsheet」を選んで実行（シートの作成）
 *   2. 「デプロイ」→「ウェブアプリ」で閲覧アプリを公開
 *      （実行ユーザー：自分 ／ アクセスできるユーザー：組織内の全員）
 *   実際に誰が使えるかは「権限」シートで管理します。
 */

// ───────────────────────── 定数 ─────────────────────────

var SHEET = {
  RESULTS: '採点結果',
  DETAILS: '根拠詳細',
  SEGMENTS: '選考区分',
  CRITERIA: '評価基準',
  QUESTIONS: '設問',
  ACCESS: '権限',
  RUNS: '採点記録'
};

var HEADERS = {};
HEADERS[SHEET.RESULTS] = ['応募ID', '氏名', '選考区分', '評価基準', '総合点', 'ランク', '総評', '強み',
  '次の選考で確認したい点', '記述不足の軸', 'ステータス', '担当者メモ', 'PDFファイルID', 'PDFリンク',
  '処理日時', '処理状態', '要確認の理由'];
HEADERS[SHEET.DETAILS] = ['応募ID', '評価基準', '軸ID', '軸名', '段階', '得点', '判定理由', 'ES原文の引用', '引用元の設問'];
HEADERS[SHEET.SEGMENTS] = ['区分ID', '区分名', 'ESフォルダのURL', '評価基準', '設問セット', '状態', '備考'];
HEADERS[SHEET.CRITERIA] = ['評価基準', '軸ID', '軸名', '略称', 'こころ', '配点', '見るポイント',
  '段階5', '段階4', '段階3', '段階2', '段階1', '表示順'];
HEADERS[SHEET.QUESTIONS] = ['設問セット', '番号', '設問', '主に読み取る軸ID'];
HEADERS[SHEET.ACCESS] = ['メールアドレス', '氏名', '役割', '備考'];
HEADERS[SHEET.RUNS] = ['記録ID', '開始日時', '完了日時', '実行方法', '状態', '結果'];

var STATUS_OPTIONS = ['未確認', '確認済み', '通過', '見送り'];
var PROCESS_STATES = ['採点済み', '要確認'];
var SEGMENT_STATES = ['受付中', '準備中', '終了'];
var ROLES = ['管理者', '評価者', '閲覧者', '停止'];
var EDIT_ROLES = ['管理者', '評価者'];
var RUN_STATES = ['処理中', '完了', 'エラー'];

/**
 * 自動採点のスケジュール（画面に表示するだけ）。
 * 実際の実行時刻はClaudeのスケジュールタスクで決まるので、変更するときは両方をそろえる（docs/定時採点タスク.md）。
 */
var AUTO_SCORING = { label: '毎日 6:00ごろ' };

/** 関連する記述が見当たらない軸の段階。得点計算では段階3（中間）として扱う */
var NO_EVIDENCE = '記述不足';
var NO_EVIDENCE_LEVEL = 3;
var DEFAULT_RANK_A = 80;
var DEFAULT_RANK_B = 65;
var MEMO_MAX_LENGTH = 2000;

// ───────────────────────── 初期データ ─────────────────────────

var SEED_CRITERIA = [
  ['新卒総合職_v1', 'people', '人が好き・出会いを大切にする', '人が好き', '思いやり', 25,
    '人との関わりを楽しみ、出会いや縁を大切にしている。話すことが好きで、周りを競争相手ではなく仲間として思いやれる',
    '人との関わりや出会いを大切にした具体的な行動が複数書かれ、相手の立場や気持ちに合わせて関わっている。周りを仲間として支えようとする姿勢が明確',
    '人との関わりを大切にした具体的な行動が書かれ、相手への配慮が読み取れる',
    '「人が好き」「話すのが好き」という記述はあるが、具体的な行動が少ない、または一般論にとどまる',
    '人との関わりについての記述がわずかで、自分の成果や都合が中心になっている',
    '周りを競争相手として見ている、または人との関わりを避ける考えが読み取れる', 1],
  ['新卒総合職_v1', 'purpose', '意味・目的を考える力', '目的思考', '素直', 20,
    '「なぜやるのか」を自分で考え、行動や選択の理由を自分の言葉で説明できる',
    '行動や選択の前に意味・目的を考え、その理由を自分の言葉で具体的に説明している。目的に照らして行動を変えた経験もある',
    '行動や選択の理由が自分の言葉で書かれ、目的を意識していることが読み取れる',
    '理由は書かれているが、表面的、または借りてきた言葉にとどまる',
    '行動の記述はあるが、なぜそうしたかの説明がほとんどない',
    '「言われたから」「なんとなく」など、目的を考えずに行動していることが読み取れる', 2],
  ['新卒総合職_v1', 'axis', '自分の軸', '自分の軸', '前向き', 20,
    '大切にしている価値観が明確で、行動や選択に一貫して表れている',
    '大切にしている価値観が明確で、それに基づいて選択・行動した具体的なエピソードが、複数の設問で一貫している',
    '価値観が明確で、それに基づく具体的な行動が書かれている',
    '価値観は書かれているが、行動との結び付きが弱い、または設問によって言っていることが変わる',
    '一般的な価値観の記述にとどまり、本人らしさが見えない',
    '価値観が設問ごとに矛盾しており、軸が読み取れない', 3],
  ['新卒総合職_v1', 'self_esteem', '自己肯定感', '自己肯定感', '思いやり', 15,
    '強みも課題も受け止めたうえで、自分を前向きに捉えている。謙虚な書き方を低く評価しない',
    '強みと課題の両方を具体的に捉え、課題も成長の途中として前向きに受け止めている。自分の良さを周りのために活かそうとしている',
    '強みと課題の両方が書かれ、自分を前向きに捉えている',
    '強みか課題のどちらかに偏っている、または捉え方が抽象的',
    '強みの誇張が中心で課題に触れていない、または課題ばかりで自分の良さが見えない',
    '自分を強く否定する記述が中心で、前向きな捉え方が見られない', 4],
  ['新卒総合職_v1', 'feedback', '他者の意見を受け入れる力', '意見受容', '素直', 10,
    'フィードバックや異なる意見を受け止め、行動を変えた経験がある',
    '指摘や異なる意見を受け止め、具体的に行動を変えた経験と、その結果や学びが書かれている',
    '指摘や異なる意見を受けて行動を変えた経験が書かれている',
    '他者の意見を大切にしたいという考えはあるが、具体的な経験が少ない',
    '自分の考えを通した経験が中心で、他者の意見への向き合い方が見えない',
    '他者の意見や指摘を退けた、受け入れなかったことが読み取れる', 5],
  ['新卒総合職_v1', 'pdca', 'PDCA・改善する力', 'PDCA', '前向き', 10,
    '振り返りから次の行動を考え、改善を続けている',
    '振り返り→改善→再挑戦の流れが具体的に書かれ、改善の結果も示されている',
    '振り返りをもとに次の行動を決めて試した経験が書かれている',
    '振り返りや反省はあるが、次の行動や改善までつながっていない',
    '結果だけの記述で、振り返りの過程が見えない',
    'うまくいかなかったことを他者や環境のせいにして終わっている', 6],
  ['新卒総合職_v1', 'RANK_A', 'ランクAの下限（この点数以上）', '', '', 80, '', '', '', '', '', '', 90],
  ['新卒総合職_v1', 'RANK_B', 'ランクBの下限（この点数以上）', '', '', 65, '', '', '', '', '', '', 91]
];

var SEED_QUESTIONS = [
  ['新卒_v1', 1, '説明会で特に印象に残っていることは何ですか？', 'purpose,people'],
  ['新卒_v1', 2, '自分の「ここが強み」「ここはまだ未熟・課題だと感じているところ」を、客観的にどう捉えていますか？', 'self_esteem,feedback,pdca'],
  ['新卒_v1', 3, 'あなたが大切にしている考えや価値観について教えてください。', 'axis,people'],
  ['新卒_v1', 4, 'アワーズの価値観と共感しているところを教えてください。', 'axis,purpose'],
  ['新卒_v1', 5, '自分が苦手だと感じることや、初めての環境に飛び込む時、どんな気持ちで向き合うことが多いですか？', 'self_esteem,pdca,purpose'],
  ['新卒_v1', 6, 'あなたはアワーズの社員です。普段明るい同期がどこか元気がありません。あなたはその同期にどのように関わりますか？', 'people'],
  ['経験者_v1', 1, 'あなたが大切にしている考え方や想いを教えてください。その考え方や想いを当社でどのように活かしていきたいですか？', 'axis,purpose'],
  ['経験者_v1', 2, 'あなたが転職先として株式会社アワーズに興味を持ってくださったきっかけを教えてください。', 'purpose,people'],
  ['経験者_v1', 3, 'あなたが共感する株式会社アワーズの考え・価値観は何ですか？理由も含めて記入してください。', 'axis,purpose'],
  ['経験者_v1', 4, 'あなたの考える思いやりのある行動とはどのような行動でしょうか？', 'people'],
  ['経験者_v1', 5, 'あなたの考える最高のチームとはどの様なチームですか？その理由も含めて記入してください。', 'people,feedback'],
  ['経験者_v1', 6, 'あなたが持っている「スキル」や「経験」を、当社や働く仲間にどのように発揮していただけますか？', 'self_esteem,pdca'],
  ['経験者_v1', 7, 'あなたは「アドベンチャーワールドのゲスト」ではなく「株式会社アワーズの社員」になりたいと考える理由は何ですか？また、社員として実現したいことは何ですか？', 'purpose,axis']
];

var SEED_SEGMENTS = [
  ['R2028', '2028年卒 新卒（総合職）', '', '新卒総合職_v1', '新卒_v1', '準備中', 'フォルダを作成したらURLを貼り、状態を「受付中」にする'],
  ['R2029', '2029年卒 新卒（総合職）', '', '新卒総合職_v1', '新卒_v1', '準備中', ''],
  ['CAREER', '経験者採用', '', '新卒総合職_v1', '経験者_v1', '準備中', '書類選考は新卒と同じ評価基準を使う']
];

// ───────────────────────── メニュー・初期設定 ─────────────────────────

/** スプレッドシートに付属するスクリプトとして使う場合だけ、メニューを表示する（単独のスクリプトでは動かない） */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ES採点')
    .addItem('初期設定（シートの作成）', 'setupSpreadsheet')
    .addItem('総合点とランクを再計算', 'recalculateTotals')
    .addToUi();
}

/**
 * 7枚のシートを作成し、見出し・入力規則・初期データを設定する。
 * すでにデータが入っているシートは上書きしない（何度実行しても安全）。
 * Apps Script のエディタで、関数「setupSpreadsheet」を選んで「実行」する。
 */
function setupSpreadsheet() {
  var ss = getSpreadsheet_();

  var order = [SHEET.RESULTS, SHEET.DETAILS, SHEET.SEGMENTS, SHEET.CRITERIA, SHEET.QUESTIONS, SHEET.ACCESS, SHEET.RUNS];
  var seeds = {};
  seeds[SHEET.CRITERIA] = SEED_CRITERIA;
  seeds[SHEET.QUESTIONS] = SEED_QUESTIONS;
  seeds[SHEET.SEGMENTS] = SEED_SEGMENTS;
  var me = Session.getActiveUser().getEmail();
  seeds[SHEET.ACCESS] = me ? [[me, '', '管理者', '初期設定を実行した人']] : [];

  order.forEach(function (name, i) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name, i);
    if (sh.getLastRow() > 0) return; // 既存データは触らない
    var header = HEADERS[name];
    sh.getRange(1, 1, 1, header.length).setValues([header])
      .setFontWeight('bold').setBackground('#E8EEFB').setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    var seed = seeds[name];
    if (seed && seed.length) {
      sh.getRange(2, 1, seed.length, header.length).setValues(seed);
    }
    formatSheet_(sh, name);
  });

  // 空の既定シート（「シート1」など）があれば削除
  ss.getSheets().forEach(function (sh) {
    if (order.indexOf(sh.getName()) < 0 && sh.getLastRow() === 0 && ss.getSheets().length > order.length) {
      ss.deleteSheet(sh);
    }
  });

  notify_(
    '初期設定が完了しました（' + ss.getName() + '）。\n\n' +
    '次の作業：\n' +
    '1.「選考区分」シートに、ESフォルダのURLを貼り付ける\n' +
    '2.「権限」シートに、閲覧アプリを使う人を追加する\n' +
    '3.「デプロイ」から閲覧アプリを公開する');
}

function formatSheet_(sh, name) {
  var header = HEADERS[name];
  var col = function (label) { return header.indexOf(label) + 1; };
  var rows = 2000;
  var list = function (label, values) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
    sh.getRange(2, col(label), rows, 1).setDataValidation(rule);
  };
  var wrap = function (labels, width) {
    labels.forEach(function (label) {
      sh.setColumnWidth(col(label), width);
      sh.getRange(1, col(label), rows, 1).setWrap(true);
    });
  };

  if (name === SHEET.RESULTS) {
    list('ステータス', STATUS_OPTIONS);
    list('処理状態', PROCESS_STATES);
    wrap(['総評', '強み', '次の選考で確認したい点', '担当者メモ', '要確認の理由'], 260);
    sh.setColumnWidth(col('PDFファイルID'), 120);
  } else if (name === SHEET.DETAILS) {
    wrap(['判定理由', 'ES原文の引用'], 320);
  } else if (name === SHEET.SEGMENTS) {
    list('状態', SEGMENT_STATES);
    sh.setColumnWidth(col('区分名'), 200);
    sh.setColumnWidth(col('ESフォルダのURL'), 320);
    wrap(['備考'], 280);
  } else if (name === SHEET.CRITERIA) {
    wrap(['見るポイント', '段階5', '段階4', '段階3', '段階2', '段階1'], 240);
    sh.setColumnWidth(col('軸名'), 180);
    sh.getRange(1, 1).setNote('評価基準を見直すときは、既存の行を書き換えず、新しい名前（例：新卒総合職_v2）で行を追加してください。\n軸ID が RANK_A / RANK_B の行は、ランクの下限点（配点の列）です。');
  } else if (name === SHEET.QUESTIONS) {
    wrap(['設問'], 420);
    sh.setColumnWidth(col('主に読み取る軸ID'), 180);
  } else if (name === SHEET.ACCESS) {
    list('役割', ROLES);
    sh.setColumnWidth(col('メールアドレス'), 260);
    sh.getRange(1, 1).setNote('管理者：閲覧・ステータス・メモ入力\n評価者：閲覧・ステータス・メモ入力\n閲覧者：閲覧のみ\n停止：アクセス不可（履歴として行を残す）');
  } else if (name === SHEET.RUNS) {
    list('状態', RUN_STATES);
    sh.setColumnWidth(col('実行方法'), 160);
    wrap(['結果'], 360);
    sh.getRange(1, 1).setNote('Claudeが採点を実行した記録です（定時採点・手動の依頼）。Claudeが書き込むので、手で編集する必要はありません。');
  }
}

/** 根拠詳細の段階から総合点とランクを計算し直し、採点結果シートに書き戻す */
function recalculateTotals() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEET.RESULTS);
  var criteria = buildCriteria_(readTable_(SHEET.CRITERIA));
  var detailsById = groupBy_(readTable_(SHEET.DETAILS), '応募ID');
  var header = HEADERS[SHEET.RESULTS];
  var cTotal = header.indexOf('総合点') + 1;
  var cRank = header.indexOf('ランク') + 1;
  var updated = 0;
  readTable_(SHEET.RESULTS).forEach(function (r) {
    if (!r['応募ID'] || r['処理状態'] === '要確認') return;
    var a = buildApplicant_(r, detailsById[r['応募ID']] || [], criteria);
    if (a.total == null) return;
    sh.getRange(r._row, cTotal).setValue(a.total);
    sh.getRange(r._row, cRank).setValue(a.rank);
    updated++;
  });
  notify_(updated + '件の総合点とランクを更新しました。');
}

// ───────────────────────── Webアプリ ─────────────────────────

function doGet() {
  var user = getCurrentUser_();
  if (!user) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 16px;line-height:1.8">' +
      '<h1 style="font-size:20px">ES採点ビューア</h1>' +
      '<p>このアプリを利用する権限がありません。利用が必要な場合は、採用チームの管理者に連絡してください。</p></div>')
      .setTitle('ES採点ビューア')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('ES採点ビューア')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 画面の表示に必要なデータをまとめて返す */
function apiLoad() {
  var user = requireUser_();
  var criteria = buildCriteria_(readTable_(SHEET.CRITERIA));
  var detailsById = groupBy_(readTable_(SHEET.DETAILS), '応募ID');
  var segments = readTable_(SHEET.SEGMENTS)
    .filter(function (r) { return r['区分名']; })
    .map(function (r) { return { id: str_(r['区分ID']), name: str_(r['区分名']), state: str_(r['状態']) }; });
  var applicants = readTable_(SHEET.RESULTS)
    .filter(function (r) { return r['応募ID']; })
    .map(function (r) { return buildApplicant_(r, detailsById[r['応募ID']] || [], criteria); });
  return {
    user: user,
    canEdit: EDIT_ROLES.indexOf(user.role) >= 0,
    statusOptions: STATUS_OPTIONS,
    segments: segments,
    applicants: applicants,
    scoring: getScoringStatus_()
  };
}

/** 画面に表示する採点の状況：未採点の件数、実行中の採点、前回の結果、スケジュール */
function getScoringStatus_() {
  var runs = readTable_(SHEET.RUNS);
  var running = findRunning_(runs);
  var done = runs.filter(function (r) { return r['状態'] === '完了' || r['状態'] === 'エラー'; });
  var last = done.length ? done[done.length - 1] : null;
  return {
    schedule: AUTO_SCORING,
    unscored: countUnscored_(),
    running: running ? { startedAt: formatDate_(running['開始日時']), how: str_(running['実行方法']) } : null,
    last: last ? { state: str_(last['状態']), finishedAt: formatDate_(last['完了日時']), result: str_(last['結果']) } : null
  };
}

/** 処理中の採点記録のうち最も新しいもの */
function findRunning_(rows) {
  var list = rows.filter(function (r) { return r['状態'] === '処理中'; });
  return list.length ? list[list.length - 1] : null;
}

/** 受付中の区分のフォルダにあるPDFのうち、まだ採点結果にないものの件数（数えられない場合は null） */
function countUnscored_() {
  try {
    var scored = {};
    readTable_(SHEET.RESULTS).forEach(function (r) { var id = str_(r['PDFファイルID']); if (id) scored[id] = true; });
    var count = 0;
    readTable_(SHEET.SEGMENTS).forEach(function (s) {
      if (str_(s['状態']) !== '受付中') return;
      var folderId = folderIdFromUrl_(s['ESフォルダのURL']);
      if (!folderId) return;
      var files = DriveApp.getFolderById(folderId).getFilesByType(MimeType.PDF);
      while (files.hasNext()) { if (!scored[files.next().getId()]) count++; }
    });
    return count;
  } catch (e) {
    return null;
  }
}

/** フォルダのURL（…/folders/ID?…）またはIDそのものからフォルダIDを取り出す */
function folderIdFromUrl_(value) {
  var s = str_(value);
  if (!s) return '';
  var m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
}

/** ステータスと担当者メモを保存する（管理者・評価者のみ） */
function apiUpdate(applicantId, patch) {
  var user = requireUser_();
  if (EDIT_ROLES.indexOf(user.role) < 0) throw new Error('この操作を行う権限がありません。');
  patch = patch || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = getSpreadsheet_().getSheetByName(SHEET.RESULTS);
    var header = HEADERS[SHEET.RESULTS];
    var row = findRow_(SHEET.RESULTS, '応募ID', applicantId);
    if (!row) throw new Error('応募者が見つかりません。画面を再読み込みしてください。');
    var result = {};
    if (patch.status != null) {
      if (STATUS_OPTIONS.indexOf(patch.status) < 0) throw new Error('ステータスの値が正しくありません。');
      sh.getRange(row._row, header.indexOf('ステータス') + 1).setValue(patch.status);
      result.status = patch.status;
    }
    if (patch.memo != null) {
      var memo = String(patch.memo).slice(0, MEMO_MAX_LENGTH);
      // 先頭が = + - @ の文字列は数式として解釈されないようにする
      if (/^[=+\-@]/.test(memo)) memo = "'" + memo;
      sh.getRange(row._row, header.indexOf('担当者メモ') + 1).setValue(memo);
      result.memo = String(patch.memo).slice(0, MEMO_MAX_LENGTH);
    }
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** 採点結果に登録されたESのPDFだけを返す（それ以外のファイルは開けない） */
function apiGetPdf(applicantId) {
  requireUser_();
  var row = findRow_(SHEET.RESULTS, '応募ID', applicantId);
  if (!row || !row['PDFファイルID']) throw new Error('このESのPDFは登録されていません。');
  var file = DriveApp.getFileById(str_(row['PDFファイルID']));
  var blob = file.getBlob();
  if (blob.getContentType() !== 'application/pdf') throw new Error('登録されているファイルがPDFではありません。');
  return { name: file.getName(), base64: Utilities.base64Encode(blob.getBytes()) };
}

// ───────────────────────── 権限 ─────────────────────────

function getCurrentUser_() {
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return null;
  var hit = readTable_(SHEET.ACCESS).filter(function (r) {
    return str_(r['メールアドレス']).toLowerCase() === email;
  })[0];
  if (!hit) return null;
  var role = str_(hit['役割']);
  if (role === '停止' || ROLES.indexOf(role) < 0) return null;
  return { email: email, name: str_(hit['氏名']) || email, role: role };
}

function requireUser_() {
  var user = getCurrentUser_();
  if (!user) throw new Error('このアプリを利用する権限がありません。');
  return user;
}

// ───────────────────────── データの組み立て（純粋関数） ─────────────────────────

/** 評価基準シートの行から、基準名ごとの { axes, rankA, rankB } を作る */
function buildCriteria_(rows) {
  var map = {};
  rows.forEach(function (r) {
    var name = str_(r['評価基準']);
    var id = str_(r['軸ID']);
    if (!name || !id) return;
    var c = map[name] || (map[name] = { name: name, axes: [], rankA: DEFAULT_RANK_A, rankB: DEFAULT_RANK_B });
    if (id === 'RANK_A') { c.rankA = Number(r['配点']) || DEFAULT_RANK_A; return; }
    if (id === 'RANK_B') { c.rankB = Number(r['配点']) || DEFAULT_RANK_B; return; }
    c.axes.push({
      id: id,
      name: str_(r['軸名']),
      short: str_(r['略称']) || str_(r['軸名']),
      kokoro: str_(r['こころ']),
      weight: Number(r['配点']) || 0,
      order: Number(r['表示順']) || 999
    });
  });
  Object.keys(map).forEach(function (k) {
    map[k].axes.sort(function (a, b) { return a.order - b.order; });
  });
  return map;
}

/** 段階の値を 1〜5 の整数に。記述不足・空欄・範囲外は null */
function parseLevel_(value) {
  var n = Number(String(value).trim());
  if (String(value).trim() === '' || isNaN(n)) return null;
  n = Math.round(n);
  return n >= 1 && n <= 5 ? n : null;
}

function rankOf_(total, crit) {
  if (total == null) return '';
  if (total >= crit.rankA) return 'A';
  if (total >= crit.rankB) return 'B';
  return 'C';
}

/** 採点結果の1行と根拠詳細から、画面表示用の応募者データを作る */
function buildApplicant_(r, details, criteria) {
  var critName = str_(r['評価基準']);
  var crit = criteria[critName] || { name: critName, axes: [], rankA: DEFAULT_RANK_A, rankB: DEFAULT_RANK_B };
  var needsCheck = str_(r['処理状態']) === '要確認';
  var byAxis = {};
  details.forEach(function (d) { byAxis[str_(d['軸ID'])] = d; });

  var sum = 0;
  var axes = crit.axes.map(function (ax) {
    var d = byAxis[ax.id] || {};
    var level = parseLevel_(d['段階']);
    var effective = level == null ? NO_EVIDENCE_LEVEL : level;
    var score = ax.weight * effective / 5;
    sum += score;
    return {
      id: ax.id, name: ax.name, short: ax.short, kokoro: ax.kokoro, weight: ax.weight,
      level: level, missing: level == null, score: Math.round(score * 10) / 10,
      reason: str_(d['判定理由']), quote: str_(d['ES原文の引用']), source: str_(d['引用元の設問'])
    };
  });
  var hasDetails = details.length > 0;
  var total = (!needsCheck && hasDetails && axes.length) ? Math.round(sum) : null;

  return {
    id: str_(r['応募ID']),
    name: str_(r['氏名']),
    segment: str_(r['選考区分']),
    criteria: critName,
    total: total,
    rank: rankOf_(total, crit),
    summary: str_(r['総評']),
    strengths: splitLines_(r['強み']),
    checks: splitLines_(r['次の選考で確認したい点']),
    status: str_(r['ステータス']) || '未確認',
    memo: str_(r['担当者メモ']),
    hasPdf: !!str_(r['PDFファイルID']),
    processedAt: formatDate_(r['処理日時']),
    needsCheck: needsCheck,
    issue: str_(r['要確認の理由']),
    axes: axes
  };
}

// ───────────────────────── シートの読み書き ─────────────────────────

/** 読み書きするスプレッドシート（Config.gs の SPREADSHEET_ID） */
function getSpreadsheet_() {
  if (typeof SPREADSHEET_ID === 'string' && SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートが設定されていません。Config.gs の SPREADSHEET_ID を確認してください。');
  return ss;
}

/** 完了メッセージ：スプレッドシートの画面から実行したときはダイアログ、エディタから実行したときは実行ログに出す */
function notify_(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

/** シートを「見出し → 値」のオブジェクトの配列として読む（_row は行番号） */
function readTable_(name) {
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  return rowsToObjects_(values);
}

function rowsToObjects_(values) {
  var header = values[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = { _row: i + 1 };
    var empty = true;
    header.forEach(function (h, j) {
      if (!h) return;
      o[h] = values[i][j];
      if (values[i][j] !== '' && values[i][j] != null) empty = false;
    });
    if (!empty) out.push(o);
  }
  return out;
}

function findRow_(sheetName, key, value) {
  var target = str_(value);
  if (!target) return null;
  return readTable_(sheetName).filter(function (r) { return str_(r[key]) === target; })[0] || null;
}

function groupBy_(rows, key) {
  var map = {};
  rows.forEach(function (r) {
    var k = str_(r[key]);
    if (!k) return;
    (map[k] = map[k] || []).push(r);
  });
  return map;
}

// ───────────────────────── 小さな道具 ─────────────────────────

function str_(v) { return v == null ? '' : String(v).trim(); }

function splitLines_(v) {
  // 1行に1項目。行頭の「・」「-」は取り除く
  return str_(v).split(/\r?\n/).map(function (s) { return s.replace(/^[・\-\s]+/, '').trim(); }).filter(Boolean);
}

function formatDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  return str_(v);
}
