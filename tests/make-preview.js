// Index.html に google.script.run のスタブとサンプルデータを差し込んだプレビューを作る
const fs = require('fs');
const [, , src, out] = process.argv;
const html = fs.readFileSync(src, 'utf8');

const AX = [
  ['people', '人が好き・出会いを大切にする', '人が好き', '思いやり', 25],
  ['purpose', '意味・目的を考える力', '目的思考', '素直', 20],
  ['axis', '自分の軸', '自分の軸', '前向き', 20],
  ['self_esteem', '自己肯定感', '自己肯定感', '思いやり', 15],
  ['feedback', '他者の意見を受け入れる力', '意見受容', '素直', 10],
  ['pdca', 'PDCA・改善する力', 'PDCA', '前向き', 10]
];
function person(id, name, seg, lv, status, extra) {
  let sum = 0;
  const axes = AX.map(([aid, n, s, k, w], i) => {
    const level = lv[i] === 'x' ? null : lv[i];
    const score = w * (level == null ? 3 : level) / 5; sum += score;
    return { id: aid, name: n, short: s, kokoro: k, weight: w, level, missing: level == null, score,
      reason: 'サンプルの判定理由です。ESの記述をもとに、ルーブリックの段階に当てはめました。',
      quote: level == null ? '' : 'サンプルの引用です。ESの原文をそのまま抜き出して表示します。', source: '設問③：大切にしている考えや価値観' };
  });
  const total = Math.round(sum);
  return Object.assign({ id, name, segment: seg, criteria: '新卒総合職_v1', total, rank: total >= 80 ? 'A' : total >= 65 ? 'B' : 'C',
    summary: '人との出会いを大切にする姿勢と、一貫した自分の軸が強みです。他者の意見を受け入れた経験は記述が短いため、次の選考で確認してください。',
    strengths: ['人や出会いを大切にする姿勢', '一貫した自分の軸'], checks: ['フィードバックの受け止め方'],
    status, memo: '', hasPdf: true, processedAt: '2026/10/20 16:30', needsCheck: false, issue: '', axes }, extra || {});
}
const S = '2028年卒 新卒（総合職）', C = '経験者採用';
const data = {
  user: { email: 'a@example.com', name: '採用 太郎', role: '管理者' }, canEdit: true,
  statusOptions: ['未確認', '確認済み', '通過', '見送り'],
  scoring: { schedule: { dailyTime: '18:00', checkEveryMinutes: 60, checkHours: '8〜20時' }, unscored: 12, open: null,
    last: { state: '完了', finishedAt: '2026/10/20 18:12', result: '採点済み 8件、要確認 1件、残り 0件' } },
  segments: [{ id: 'R2028', name: S, state: '受付中' }, { id: 'R2029', name: '2029年卒 新卒（総合職）', state: '準備中' }, { id: 'CAREER', name: C, state: '受付中' }],
  applicants: [
    person('ES-2026-0001', '山田 花子', S, [5, 4, 5, 4, 3, 4], '確認済み'),
    person('ES-2026-0004', '鈴木 美咲', S, [4, 5, 4, 4, 4, 3], '未確認'),
    person('ES-2026-0006', '高橋 翔', C, [4, 4, 4, 3, 'x', 4], '未確認'),
    person('ES-2026-0002', '佐藤 健太', S, [5, 3, 3, 4, 4, 3], '通過'),
    person('ES-2026-0003', '渡辺 大輝', S, [3, 3, 3, 3, 3, 3], '未確認'),
    person('ES-2026-0005', '中村 優', S, [2, 3, 2, 3, 3, 3], '見送り'),
    Object.assign(person('ES-2026-0007', '伊藤 さくら', C, [3, 3, 3, 3, 3, 3], '未確認'), { needsCheck: true, total: null, rank: '', issue: '画像のみのPDFで文字を読み取れませんでした' })
  ]
};
const stub = `<script>
window.google = { script: { run: (function make(ok, ng) {
  const api = {
    withSuccessHandler: f => make(f, ng), withFailureHandler: f => make(ok, f),
    apiLoad: () => setTimeout(() => ok(${JSON.stringify(data)}), 0),
    apiUpdate: (id, p) => setTimeout(() => ok(p), 0),
    apiGetPdf: () => {},
    apiRequestScoring: () => setTimeout(() => ok(Object.assign({}, ${JSON.stringify(data)}.scoring,
      { open: { id: 'REQ-1', state: '待機中', requestedAt: '2026/10/21 12:20', by: '採用 太郎' } })), 0)
  };
  return api;
})() } };
</script>`;
fs.writeFileSync(out, html.replace('<script>', stub + '\n<script>'));
