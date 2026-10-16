// api/_webpush.js — Web Push（ブラウザへの通知）を、外部ライブラリなしで送るための部品
// （ファイル名が _ で始まるので、これ自体はAPIとして公開されない）
//
//   - VAPID（RFC 8292）: 送り主を証明する署名（ES256 の JWT）
//   - aes128gcm（RFC 8188 / RFC 8291）: 通知の中身の暗号化
//
// どちらも Node.js の crypto だけで作っている。

import crypto from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url");

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

/** 新しい VAPID の鍵の組を作る（publicKey は通知を受け取る側に渡す、65バイトの生の公開鍵） */
export function generateVapidKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const pub = ecdh.getPublicKey();
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: b64u(pub.subarray(1, 33)),
    y: b64u(pub.subarray(33, 65)),
    d: b64u(ecdh.getPrivateKey()),
  };
  return { publicKey: b64u(pub), privateJwk: jwk };
}

/** 送り先（プッシュサービス）ごとの、送り主の証明 */
function vapidHeader(endpoint, keys, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: keys.privateJwk, format: "jwk" });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

/** 通知の中身を、受け取る端末だけが読めるように暗号化する（aes128gcm） */
export function encrypt(payload, p256dh, auth) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("bad subscription keys");

  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const plain = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]); // 最後の記録の印
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/**
 * 1台に通知を送る。戻り値は HTTP のステータス（404/410 はもう届かない端末）。
 * subscription: ブラウザの PushSubscription を JSON にしたもの
 */
export async function sendPush(subscription, payload, keys, { subject = "https://www.viva-mc.net", ttl = 6 * 3600, urgency = "high" } = {}) {
  const { endpoint } = subscription;
  const body = encrypt(JSON.stringify(payload), subscription.keys.p256dh, subscription.keys.auth);
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidHeader(endpoint, keys, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  return r.status;
}

/** プッシュサービスとして受け付ける送り先（それ以外のURLには送らない） */
export function isPushEndpoint(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|push\.api\.chromium\.org)$/.test(u.hostname);
  } catch {
    return false;
  }
}
