// clasp の認証情報の形式変換を検証する（値はすべて架空）
const assert = require('assert');
const { normalize } = require('../.github/scripts/normalize-clasprc.js');

// clasp 3 の形式 → clasp 2 の形式
let r = normalize(JSON.stringify({ tokens: { default: {
  client_id: 'cid', client_secret: 'csec', type: 'authorized_user', refresh_token: 'rt', access_token: 'at', token_type: 'Bearer', expiry_date: 9e12 } } }));
assert.strictEqual(r.format, 'clasp 3（clasp 2 用に変換）');
assert.strictEqual(r.value.token.refresh_token, 'rt');
assert.strictEqual(r.value.token.access_token, 'at');
assert.strictEqual(r.value.token.expiry_date, 1, '期限切れ扱いにして自動更新させる');
assert.strictEqual(r.value.oauth2ClientSettings.clientId, 'cid');
assert.strictEqual(r.value.oauth2ClientSettings.clientSecret, 'csec');

// clasp 2 の形式はそのまま（期限だけ更新）
r = normalize(JSON.stringify({ token: { access_token: 'at', refresh_token: 'rt', expiry_date: 9e12 }, oauth2ClientSettings: { clientId: 'c', clientSecret: 's', redirectUri: 'http://localhost' }, isLocalCreds: false }));
assert.strictEqual(r.format, 'clasp 2');
assert.strictEqual(r.value.token.expiry_date, 1);
assert.strictEqual(r.value.oauth2ClientSettings.clientId, 'c');

// 読めないもの
assert(normalize('').error);
assert(normalize('not json').error);
assert(normalize('{"tokens":{"default":{"client_id":"c"}}}').error);
const unknown = normalize('{"foo":1}');
assert(unknown.error.includes('foo'), 'キー名だけを示す');

console.log('OK: 認証情報の形式変換の検証に合格しました');
