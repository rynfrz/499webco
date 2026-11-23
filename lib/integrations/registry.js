// Integration provider registry: one lookup table built from the provider
// definitions. Adding an integration means adding one object to providers.js.
import { PROVIDERS, CATEGORIES } from './providers.js';

const byId = new Map(PROVIDERS.map(p => [p.id, p]));

export function getProvider(id) { return byId.get(id) || null; }
export function allProviders() { return PROVIDERS; }
export { CATEGORIES };
