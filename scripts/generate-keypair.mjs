// Run ONCE to create your licensing keypair:  node scripts/generate-keypair.mjs
// - Paste the PUBLIC key into lib/license.js (PUBLIC_KEY_PEM) and commit it.
// - Save the PRIVATE key somewhere secret (NOT in the repo). You'll use it to
//   mint licenses. Anyone with the private key can issue valid licenses, so guard it.
import crypto from 'crypto';
import fs from 'fs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });

fs.writeFileSync('license-private.pem', priv);

console.log('\n=== PUBLIC KEY — paste into lib/license.js PUBLIC_KEY_PEM (commit this) ===\n');
console.log('`' + pub.trim() + '`');
console.log('\n=== PRIVATE KEY — saved to ./license-private.pem — KEEP SECRET, do NOT commit ===\n');
console.log('Add it to .gitignore now. Back it up somewhere safe.\n');
