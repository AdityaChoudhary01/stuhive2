import { drizzle } from 'drizzle-orm/d1';
import * as schema from '@/db/schema';

// 🚨 FIX: Strict ESM packages must be imported at the top, not required inside functions!
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * 🔐 Smart Cloudflare Context Loader
 * Uses next-on-pages locally, and OpenNext in production.
 */
function getEnv() {
  try {
    if (process.env.NODE_ENV === 'development') {
      // 💻 LOCAL DEV: Use the local Next-on-Pages emulator
      const { env } = getRequestContext();
      if (!env) throw new Error("Local Cloudflare env object is undefined.");
      return env;
    } else {
      // ☁️ PRODUCTION: Use the optimized OpenNext context
      const { env } = getCloudflareContext();
      if (!env) throw new Error("Production Cloudflare env object is undefined.");
      return env;
    }
  } catch (error) {
    console.error('❌ Failed to get Cloudflare context:', error.message);
    throw new Error('Environment bindings not available.');
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