# このリポジトリについて

株式会社アワーズ採用チームの「ES採点システム」です。ES（PDF）をClaudeが採点し、Googleスプレッドシートに保存、GASのWebアプリ「ESチェッカー」で閲覧します。

- 仕様：`docs/仕様.md`（**コードを変更する前に必ず読む**）
- 導入手順：`docs/導入手順.md`、自動デプロイ：`docs/自動デプロイ設定.md`、定時採点：`docs/定時採点タスク.md`

## 構成

| パス | 内容 |
| --- | --- |
| `src/Config.gs` | 読み書きするスプレッドシート「ES自動評価アプリ」のID（SPREADSHEET_ID） |
| `src/Code.gs` | GASのサーバー側。シートの初期設定（setupSpreadsheet）、Webアプリ、API（apiLoad / apiUpdate / apiGetPdf）。単独のスクリプトとして動き、スプレッドシートはIDで開く |
| `src/Index.html` | 閲覧アプリの画面（一覧・詳細・比較）。外部ライブラリなし |
| `src/appsscript.json` | GASのマニフェスト（Webアプリ：実行ユーザー＝デプロイした人、アクセス＝組織内） |
| `skill/SKILL.md` | ES採点スキル。claude.ai に保存して使う（このファイルが原本） |
| `tests/` | `logic.test.js`（計算ロジック）、`make-preview.js` + `shoot.js`（サンプルデータで画面を描画） |
| `.github/workflows/deploy.yml` | main への push でテスト → clasp push → Webアプリ更新 |
| `.github/scripts/normalize-clasprc.js` | Secrets の `.clasprc.json`（clasp 2系・3系）を clasp 2.4.2 の形式にそろえる |

## 作業のルール

- **mainへの反映（＝自動デプロイ）は、利用者の承認を得てから行う**。変更は作業用ブランチ（例：`feature/…`）にコミットして push し（このときはテストだけが動く）、変更点を一覧にして利用者に示し、「デプロイしてよいか」を確認する（選択式の質問＝ボタンで確認してよい）。承認後に main へマージして push する

- やり取り・コメント・ドキュメントはすべて日本語。画面の文言は短くはっきり書く
- 仕様に関わる変更をしたら、同じコミットで `docs/仕様.md`（本文と変更履歴）も更新する
- シートの列を変えるときは、`HEADERS`・`skill/SKILL.md` の書き込み形式・`docs/仕様.md` の3か所をそろえる。既存の運用中シートは自動で列が増えないため、移行手順も `docs/` に書く
- 評価基準を変えるときは既存の基準を書き換えず、新しい基準名（例：新卒総合職_v2）で追加する
- `skill/SKILL.md` を変更したら、claude.ai でスキルを保存し直す必要があることを利用者に伝える
- 画面に出す値は必ず `esc()` を通す（ESの内容やメモに任意の文字列が入るため）
- 認証情報・スクリプトID・デプロイIDをコードやドキュメントに書かない（GitHub の Secrets を使う）。スプレッドシートIDは設定として `src/Config.gs` に置く
- 実在の応募者のデータをリポジトリ・テスト・スクリーンショットに含めない。テストはサンプルデータだけを使う
- GASのエディタで直接編集しない（次の自動デプロイで上書きされる）
- `SpreadsheetApp.getActiveSpreadsheet()` や `getUi()` に頼らない（単独のスクリプトでは使えない）。シートは `getSpreadsheet_()`、メッセージは `notify_()` を使う

## 確認方法

```
node tests/logic.test.js src/Code.gs
node tests/clasprc.test.js
node tests/make-preview.js src/Index.html /tmp/preview.html && node tests/shoot.js /tmp/preview.html /tmp/shots
```

画面を変えたら、デスクトップ（1280px）とスマホ（390px）のスクリーンショットで、横スクロールが出ないことを確認する。
