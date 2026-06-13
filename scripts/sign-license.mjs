// Mint a license for a buyer after they pay.
// Usage:  node scripts/sign-license.mjs <domain> "<Buyer Name>" [expiresISO]
//   node scripts/sign-license.mjs buffalosites.com "Queen City Sites"
//   node scripts/sign-license.mjs acme.com "Acme" 2027-01-01   (optional expiry)
// Reads the private key from ./license-private.pem (or env LICENSE_PRIVATE_KEY).
// Prints the LICENSE_KEY the buyer pastes into their Vercel env var LICENSE_KEY.
import crypto from 'crypto';
import fs from 'fs';

const [domain, name, expiresISO] = process.argv.slice(2);
if (!domain) {
  console.error('Usage: node scripts/sign-license.mjs <domain> "<Buyer Name>" [expiresISO]');
  process.exit(1);
}
const pem = process.env.LICENSE_PRIVATE_KEY || (fs.existsSync('license-private.pem') && fs.readFileSync('license-private.pem', 'utf8'));
if (!pem) { console.error('No private key. Run generate-keypair.mjs first, or set LICENSE_PRIVATE_KEY.'); process.exit(1); }

const payload = {
  v: 1,
  domain: domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
  name: name || '',
  issued: Date.now(),
  ...(expiresISO ? { expires: Date.parse(expiresISO) } : {})
};
const data = Buffer.from(JSON.stringify(payload), 'utf8');
const sig = crypto.sign(null, data, crypto.createPrivateKey(pem));
const license = data.toString('base64url') + '.' + sig.toString('base64url');

console.log('\nLicense for', payload.domain, name ? `(${name})` : '', expiresISO ? `— expires ${expiresISO}` : '(no expiry)');
console.log('\nLICENSE_KEY=\n' + license + '\n');
