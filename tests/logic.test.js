// Code.gs の計算ロジックを Node で検証する（GASのサービスはスタブ）
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(process.argv[2], 'utf8');
const ctx = { Utilities: { formatDate: (d) => d.toISOString() }, console };
vm.createContext(ctx);
vm.runInContext(code, ctx);

// 評価基準の組み立て
const header = ctx.HEADERS[ctx.SHEET.CRITERIA];
const critRows = ctx.rowsToObjects_([header].concat(ctx.SEED_CRITERIA));
const criteria = ctx.buildCriteria_(critRows);
const c = criteria['新卒総合職_v1'];
assert.strictEqual(c.axes.length, 6, '軸は6つ');
assert.strictEqual(c.axes.reduce((s, a) => s + a.weight, 0), 100, '配点の合計は100');
assert.strictEqual(c.rankA, 80); assert.strictEqual(c.rankB, 65);
// 並びは「思いやり → 素直 → 前向き」
assert.deepStrictEqual(Array.from(c.axes, a => a.id), ['people', 'self_esteem', 'purpose', 'feedback', 'axis', 'pdca']);
assert.deepStrictEqual(Array.from(c.axes, a => a.kokoro), ['思いやり', '思いやり', '素直', '素直', '前向き', '前向き']);
// シートの表示順がバラバラでも、こころの順にまとまる
const shuffled = ctx.buildCriteria_(critRows.map(r => Object.assign({}, r, { '表示順': r['軸ID'] === 'pdca' ? 1 : r['軸ID'] === 'people' ? 9 : r['表示順'] })));
assert.deepStrictEqual(Array.from(shuffled['新卒総合職_v1'].axes, a => a.kokoro), ['思いやり', '思いやり', '素直', '素直', '前向き', '前向き']);

// 設問の軸IDがすべて評価基準に存在する
const ids = new Set(c.axes.map(a => a.id));
ctx.SEED_QUESTIONS.forEach(q => q[3].split(',').forEach(id => assert(ids.has(id), `未知の軸ID: ${id}`)));
// すべての軸が、各設問セットで少なくとも1つの設問から読み取られる
['新卒_v1', '経験者_v1'].forEach(set => {
  const covered = new Set(ctx.SEED_QUESTIONS.filter(q => q[0] === set).flatMap(q => q[3].split(',')));
  c.axes.forEach(a => assert(covered.has(a.id), `${set} で ${a.id} を読む設問がない`));
});

// 段階の解釈
assert.strictEqual(ctx.parseLevel_(4), 4);
assert.strictEqual(ctx.parseLevel_('5'), 5);
assert.strictEqual(ctx.parseLevel_('記述不足'), null);
assert.strictEqual(ctx.parseLevel_(''), null);
assert.strictEqual(ctx.parseLevel_(7), null);

// 総合点：山田さんの例 5,4,5,4,3,4 → 25+16+20+12+6+8 = 87 → A
const det = (lv) => ['people', 'purpose', 'axis', 'self_esteem', 'feedback', 'pdca'].map((id, i) => ({ '軸ID': id, '段階': lv[i] }));
const row = { '応募ID': 'ES-2026-0001', '氏名': '山田 花子', '評価基準': '新卒総合職_v1', '処理状態': '採点済み', '強み': '・人が好き・出会いを大切にする\n一貫した軸' };
let a = ctx.buildApplicant_(row, det([5, 4, 5, 4, 3, 4]), criteria);
assert.strictEqual(a.total, 87); assert.strictEqual(a.rank, 'A');
assert.deepStrictEqual(Array.from(a.strengths), ['人が好き・出会いを大切にする', '一貫した軸'], '「・」を含む強みが分割されない');

// 記述不足は段階3として計算：5,4,5,4,記述不足,4 → 87（3→6点で同じ）
a = ctx.buildApplicant_(row, det([5, 4, 5, 4, '記述不足', 4]), criteria);
assert.strictEqual(a.total, 87); assert.strictEqual(a.axes.find(x => x.id === 'feedback').missing, true);

// ランク境界：ちょうど80はA、79はB、65はB、64はC
const at = (lv) => ctx.buildApplicant_(row, det(lv), criteria);
assert.strictEqual(at([4, 4, 4, 4, 4, 4]).total, 80); assert.strictEqual(at([4, 4, 4, 4, 4, 4]).rank, 'A');
assert.strictEqual(at([3, 4, 4, 4, 4, 4]).total, 75); assert.strictEqual(at([3, 4, 4, 4, 4, 4]).rank, 'B');
assert.strictEqual(at([1, 1, 1, 1, 1, 1]).total, 20); assert.strictEqual(at([1, 1, 1, 1, 1, 1]).rank, 'C');

// 要確認の行は点数なし
a = ctx.buildApplicant_(Object.assign({}, row, { '処理状態': '要確認' }), [], criteria);
assert.strictEqual(a.total, null); assert.strictEqual(a.rank, ''); assert.strictEqual(a.needsCheck, true);

// 空行は読み飛ばす
const objs = ctx.rowsToObjects_([['a', 'b'], ['', ''], ['1', '']]);
assert.strictEqual(objs.length, 1); assert.strictEqual(objs[0]._row, 3);

// フォルダURLからのID取り出し
assert.strictEqual(ctx.folderIdFromUrl_('https://drive.google.com/drive/folders/1AbC_d-EfGhIjKlMn?usp=sharing'), '1AbC_d-EfGhIjKlMn');
assert.strictEqual(ctx.folderIdFromUrl_('https://drive.google.com/open?id=1AbC_d-EfGhIjKlMn'), '1AbC_d-EfGhIjKlMn');
assert.strictEqual(ctx.folderIdFromUrl_('1AbC_d-EfGhIjKlMn'), '1AbC_d-EfGhIjKlMn');
assert.strictEqual(ctx.folderIdFromUrl_(''), '');
assert.strictEqual(ctx.folderIdFromUrl_('フォルダ'), '');

// 採点記録：処理中のうち最も新しいもの
const runs = [{ '記録ID': 'R1', '状態': '完了' }, { '記録ID': 'R2', '状態': '処理中' }, { '記録ID': 'R3', '状態': '処理中' }];
assert.strictEqual(ctx.findRunning_(runs)['記録ID'], 'R3');
assert.strictEqual(ctx.findRunning_([{ '状態': '完了' }, { '状態': 'エラー' }]), null);

// シートの見出しと入力規則の対象列が一致している
Object.keys(ctx.HEADERS).forEach(name => assert(new Set(ctx.HEADERS[name]).size === ctx.HEADERS[name].length, `${name} の見出しが重複`));
['ステータス', '処理状態'].forEach(h => assert(ctx.HEADERS['採点結果'].includes(h)));
assert(ctx.HEADERS['採点記録'].includes('状態'));
assert.strictEqual(ctx.SHEET.REQUESTS, undefined, '採点依頼シートは廃止済み');

console.log('OK: すべての検証に合格しました');

// ── 新卒総合職_v2 ──
const v2 = criteria['新卒総合職_v2'];
assert(v2, 'v2 がある');
assert.deepStrictEqual(Array.from(v2.axes, x => x.id), Array.from(c.axes, x => x.id), 'v2 の軸と並びは v1 と同じ');
assert.deepStrictEqual(Array.from(v2.axes, x => x.weight), Array.from(c.axes, x => x.weight), 'v2 の配点は v1 と同じ');
assert.strictEqual(v2.rankA, 80); assert.strictEqual(v2.rankB, 65);
// v1 の行は変えていない（基準は書き換えず追加する）
assert.strictEqual(ctx.SEED_CRITERIA.filter(r => r[0] === '新卒総合職_v1').length, 8);
// v2 は5段階すべての文言がある
ctx.SEED_CRITERIA.filter(r => r[0] === '新卒総合職_v2' && !/^RANK_/.test(r[1]))
  .forEach(r => r.slice(6, 12).forEach((t, i) => assert(String(t).length > 0, `${r[1]} の${i ? '段階' + (6 - i) : '見るポイント'}が空`)));
// 初期設定の選考区分は v2 を使う
ctx.SEED_SEGMENTS.forEach(s => assert.strictEqual(s[3], ctx.CURRENT_CRITERIA));
// 運用中シートへの追加：v1 だけあるシートには v2 の8行だけを追加。両方あれば何も追加しない
let add = ctx.criteriaToAdd_(critRows.filter(r => r['評価基準'] === '新卒総合職_v1'));
assert.deepStrictEqual(Array.from(add.names), ['新卒総合職_v2', '新卒総合職_v3']);
assert.strictEqual(add.rows.length, 17);
add = ctx.criteriaToAdd_(critRows);
assert.strictEqual(add.names.length, 0);
console.log('v2 のテスト OK');

// ── 新卒総合職_v3 ──
const v3 = criteria['新卒総合職_v3'];
assert(v3, 'v3 がある');
assert.strictEqual(ctx.CURRENT_CRITERIA, '新卒総合職_v3');
assert.deepStrictEqual(Array.from(v3.axes, x => x.id), Array.from(c.axes, x => x.id), 'v3 の軸と並びは v1 と同じ');
assert.deepStrictEqual(Array.from(v3.axes, x => x.weight), Array.from(c.axes, x => x.weight), 'v3 の配点は v1 と同じ');
ctx.SEED_CRITERIA.filter(r => r[0] === '新卒総合職_v3' && !/^RANK_/.test(r[1]))
  .forEach(r => r.slice(6, 12).forEach((t, i) => assert(String(t).length > 0, `v3 ${r[1]} の文言が空`)));
// v2 の行は変えていない
assert.strictEqual(ctx.SEED_CRITERIA.filter(r => r[0] === '新卒総合職_v2').length, 8);
// 参考チェックの列（点数には含めない）
const ref = ctx.buildApplicant_(Object.assign({}, row, { '評価基準': '新卒総合職_v3', '文章の気になる点': '話し言葉「やっぱり」\n敬語の誤り', 'AI作成の可能性': 'ある' }), det([4, 4, 4, 4, 4, 4]), criteria);
assert.deepStrictEqual(Array.from(ref.writingNotes), ['話し言葉「やっぱり」', '敬語の誤り']);
assert.strictEqual(ref.aiLikely, 'ある');
assert.strictEqual(ref.total, 80, '参考チェックは点数に影響しない');
assert.strictEqual(ctx.buildApplicant_(Object.assign({}, row, { 'AI作成の可能性': 'たぶん' }), [], criteria).aiLikely, '', 'ある／ない以外は空');
console.log('v3 のテスト OK');

// ── ランクS（v3）：91以上 S、81以上 A、66以上 B、それ未満 C。v1・v2 は従来どおり ──
assert.strictEqual(v3.rankS, 91); assert.strictEqual(v3.rankA, 81); assert.strictEqual(v3.rankB, 66);
assert.strictEqual(c.rankS, null, 'v1 にSはない');
const r3 = (t) => ctx.rankOf_(t, v3);
assert.deepStrictEqual([r3(100), r3(91), r3(90), r3(81), r3(80), r3(66), r3(65), r3(0)], ['S', 'S', 'A', 'A', 'B', 'B', 'C', 'C']);
assert.strictEqual(ctx.rankOf_(95, c), 'A', 'v1 は95点でもA');
const s14 = ctx.buildApplicant_(Object.assign({}, row, { '評価基準': '新卒総合職_v3' }), det([5, 5, 5, 5, 4, 5]), criteria);
assert.strictEqual(s14.total, 98); assert.strictEqual(s14.rank, 'S');
// AI作成の根拠：「ある」のときだけ表示用に返す
const ai1 = ctx.buildApplicant_(Object.assign({}, row, { 'AI作成の可能性': 'ある', 'AI作成の根拠': '一般論が続く（Q8）\n同じ構成の繰り返し' }), [], criteria);
assert.deepStrictEqual(Array.from(ai1.aiReasons), ['一般論が続く（Q8）', '同じ構成の繰り返し']);
const ai0 = ctx.buildApplicant_(Object.assign({}, row, { 'AI作成の可能性': 'ない', 'AI作成の根拠': '何か' }), [], criteria);
assert.strictEqual(ai0.aiReasons.length, 0);
console.log('ランクS・AI作成の根拠のテスト OK');
