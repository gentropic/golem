// Signing what golem exports, and checking what it opens (SPEC 13: things you can trust). One signature format for both
// homes, ECDSA P-256 over SHA-256, the signature raw (r‖s) and the public key as SPKI, both base64: inside the lead-acid
// app the phone's hardware key signs (lead-acid's attest plugin: StrongBox, else the TEE); in a browser, a WebCrypto key
// pair made once and kept in IndexedDB, its private half not extractable. A signature says the file has not changed
// since a key signed it; who holds the key is for the person to know (the fingerprint is shown under Packs).
import { shell } from '../vendor/leadacid.js';

const ALG = 'ECDSA-P256-SHA256', P256 = { name: 'ECDSA', namedCurve: 'P-256' }, SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const canSign = () => !!(shell.present || (globalThis.crypto && crypto.subtle && globalThis.indexedDB));

// the browser's key: made on first use, kept in its own IndexedDB store (a CryptoKey is stored as itself)
function idb() {
  return new Promise((ok, no) => { const r = indexedDB.open('golem-sign', 1); r.onupgradeneeded = () => r.result.createObjectStore('keys'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
}
async function browserKey() {
  const db = await idb(), get = () => new Promise((ok, no) => { const q = db.transaction('keys').objectStore('keys').get('device'); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
  let k = await get();
  if (!k) {
    k = await crypto.subtle.generateKey(P256, false, ['sign', 'verify']);
    await new Promise((ok, no) => { const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').put(k, 'device'); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
  }
  return k;
}
// a new key in place of the browser's (Settings, What golem keeps): files signed before still check, by the key each
// carries; only new signatures change. In the app the key lives in the phone's hardware and is not replaced here.
export const canReplaceKey = () => !shell.present && !!(globalThis.crypto && crypto.subtle && globalThis.indexedDB);
export async function replaceKey() {
  const db = await idb(), k = await crypto.subtle.generateKey(P256, false, ['sign', 'verify']);
  await new Promise((ok, no) => { const tx = db.transaction('keys', 'readwrite'); tx.objectStore('keys').put(k, 'device'); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
  return deviceKey();
}
// the public half as a PEM file, to give to whoever checks the signatures
export const pemOf = pub => `-----BEGIN PUBLIC KEY-----\n${pub.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
// this device's key: { pub, security, fingerprint }
export async function deviceKey() {
  if (shell.present) { const i = await shell.attest.keyinfo(); return { pub: i.pub, security: i.security, fingerprint: await fingerprint(i.pub) }; }
  const k = await browserKey(), pub = b64(await crypto.subtle.exportKey('spki', k.publicKey));
  return { pub, security: 'browser (WebCrypto, kept in IndexedDB)', fingerprint: await fingerprint(pub) };
}
export async function sign(bytes) {
  if (shell.present) { const a = await shell.attest.sign(bytes); return { alg: a.alg || ALG, sig: a.sig, pub: a.pub, security: a.security, signedAt: new Date().toISOString() }; }
  const k = await browserKey(), sig = await crypto.subtle.sign(SIGN, k.privateKey, bytes);
  return { alg: ALG, sig: b64(sig), pub: b64(await crypto.subtle.exportKey('spki', k.publicKey)), security: 'browser (WebCrypto, kept in IndexedDB)', signedAt: new Date().toISOString() };
}
// true when the bytes are what the key signed
export async function verify(s, bytes) {
  if (!s || s.alg !== ALG || !s.sig || !s.pub) return false;
  try { const key = await crypto.subtle.importKey('spki', unb64(s.pub), P256, false, ['verify']); return await crypto.subtle.verify(SIGN, key, unb64(s.sig), bytes); }
  catch (e) { return false; }
}
// the key, short enough to compare by eye: the first 8 bytes of the SHA-256 of its SPKI, in groups of four hex digits
export async function fingerprint(pubB64) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', unb64(pubB64)));
  return [...h.slice(0, 8)].map(x => x.toString(16).padStart(2, '0')).join('').match(/.{4}/g).join(' ');
}
