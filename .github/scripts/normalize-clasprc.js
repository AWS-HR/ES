// GitHub Secrets の CLASPRC_JSON を、clasp 2.4.2 が読める形式にそろえる。
//   clasp 2 の形式：{ "token": { "access_token", "refresh_token", ... }, "oauth2ClientSettings": { ... } }
//   clasp 3 の形式：{ "tokens": { "default": { "client_id", "client_secret", "refresh_token", ... } } }
// 使い方：printf '%s' "$CLASPRC_JSON" | node .github/scripts/normalize-clasprc.js > ~/.clasprc.json
// 認証情報の中身はログに出さない（形式の名前とキー名だけを出す）。
'use strict';

function fail(msg) {
  console.error('::error::' + msg);
  process.exit(1);
}

function normalize(raw) {
  let j;
  try {
    j = JSON.parse(String(raw).trim());
  } catch (e) {
    return { error: 'CLASPRC_JSON をJSONとして読めません。.clasprc.json の中身を「{」から「}」まで、すべて貼り付けてください。' };
  }
  if (!j || typeof j !== 'object') return { error: 'CLASPRC_JSON の中身が空です。' };

  // clasp 2 の形式（そのまま使う。期限切れのアクセストークンは自動で更新させる）
  if (j.token && j.token.refresh_token) {
    const out = JSON.parse(JSON.stringify(j));
    out.token.expiry_date = 1;
    return { format: 'clasp 2', value: out };
  }

  // clasp 3 の形式（clasp 2 の形式に変換する）
  if (j.tokens && typeof j.tokens === 'object') {
    const t = j.tokens.default || Object.values(j.tokens)[0];
    if (!t || !t.refresh_token || !t.client_id || !t.client_secret) {
      return { error: 'CLASPRC_JSON（clasp 3 の形式）に refresh_token / client_id / client_secret が見つかりません。clasp login をやり直してから貼り直してください。' };
    }
    return {
      format: 'clasp 3（clasp 2 用に変換）',
      value: {
        token: {
          access_token: t.access_token || '',
          refresh_token: t.refresh_token,
          scope: t.scope || '',
          token_type: t.token_type || 'Bearer',
          expiry_date: 1
        },
        oauth2ClientSettings: { clientId: t.client_id, clientSecret: t.client_secret, redirectUri: 'http://localhost' },
        isLocalCreds: false
      }
    };
  }

  return { error: 'CLASPRC_JSON の形式を判別できません（最上位のキー：' + Object.keys(j).join(', ') + '）。.clasprc.json の中身をそのまま貼り付けてください。' };
}

if (require.main === module) {
  const raw = require('fs').readFileSync(0, 'utf8');
  const r = normalize(raw);
  if (r.error) fail(r.error);
  console.error('CLASPRC_JSON の形式：' + r.format);
  process.stdout.write(JSON.stringify(r.value));
}

module.exports = { normalize };
