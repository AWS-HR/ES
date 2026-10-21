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
assert.deepStrictEqual(Array.from(c.axes, a => a.id), ['people', 'purpose', 'axis', 'self_esteem', 'feedback', 'pdca']);

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
assert.strictEqual(a.total, 87); assert.strictEqual(a.axes[4].missing, true);

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

// 採点依頼：待機中・処理中のうち最も古いもの
const reqs = [{ '依頼ID': 'R1', '状態': '完了' }, { '依頼ID': 'R2', '状態': '待機中' }, { '依頼ID': 'R3', '状態': '待機中' }];
assert.strictEqual(ctx.findOpenRequest_(reqs)['依頼ID'], 'R2');
assert.strictEqual(ctx.findOpenRequest_([{ '状態': '完了' }, { '状態': 'エラー' }]), null);

// シートの見出しと入力規則の対象列が一致している
Object.keys(ctx.HEADERS).forEach(name => assert(new Set(ctx.HEADERS[name]).size === ctx.HEADERS[name].length, `${name} の見出しが重複`));
['ステータス', '処理状態'].forEach(h => assert(ctx.HEADERS['採点結果'].includes(h)));
assert(ctx.HEADERS['採点依頼'].includes('状態'));

console.log('OK: すべての検証に合格しました');
