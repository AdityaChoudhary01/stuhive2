import { drizzle } from 'drizzle-orm/d1';
import { getRequestContext } from '@cloudflare/next-on-pages';
import * as schema from '@/db/schema';

/**
 * 🔐 Helper to securely access Cloudflare bindings (D1, R2, KV).
 * In dev, this is powered by `setupDevPlatform` in next.config.mjs.
 * In prod, it connects to your real Cloudflare Pages bindings.
 */
function getEnv() {
  try {
    const { env } = getRequestContext();
    if (!env) throw new Error("Cloudflare env object is undefined.");
    return env;
  } catch (error) {
    console.error('❌ Failed to get Cloudflare context:', error.message);
    throw new Error('Environment bindings not available. If local, ensure setupDevPlatform is running.');
  }
}

/**
 * 🗄️ Get the Drizzle DB instance connected to Cloudflare D1.
 */
export function getDb() {
  const env = getEnv();
  
  if (!env.DB) {
    throw new Error('❌ D1 database binding "DB" is missing from the environment.');
  }
  
  return drizzle(env.DB, { schema });
}

/**
 * 🪣 Helper to get the Cloudflare R2 Bucket.
 */
export function getR2Bucket() {
  const env = getEnv();
  
  if (!env.R2_BUCKET) {
    throw new Error('❌ R2 bucket binding "R2_BUCKET" is missing from the environment.');
  }
  
  return env.R2_BUCKET;
}

/**
 * ⚡ Helper to get the Cloudflare KV Cache namespace.
 */
export function getKVCache() {
  const env = getEnv();
  
  if (!env.KV_CACHE) {
    throw new Error('❌ KV namespace binding "KV_CACHE" is missing from the environment.');
  }
  
  return env.KV_CACHE;
}