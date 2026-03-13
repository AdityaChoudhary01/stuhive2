'use server';

import { getDb } from "@/lib/db";
import { notes, collections, users, transactions, purchases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// ─────────────────────────────────────────────
// EDGE-SAFE HMAC SIGNATURE GENERATOR
// ─────────────────────────────────────────────
async function generateSignature(body, secret) {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────
// BUILD CLEAN BASIC AUTH HEADER
// No unescape/encodeURIComponent tricks needed —
// Razorpay keys are always ASCII.
// ─────────────────────────────────────────────
function buildBasicAuth(keyId, keySecret) {
  // Buffer is available in Node.js (server actions are NOT edge runtime)
  const credentials = `${keyId}:${keySecret}`;
  const encoded =
    typeof Buffer !== "undefined"
      ? Buffer.from(credentials).toString("base64")
      : btoa(credentials); // fallback for edge (though this file is Node.js)
  return `Basic ${encoded}`;
}

// ─────────────────────────────────────────────
// CREATE RAZORPAY ORDER
// ─────────────────────────────────────────────
export async function createRazorpayOrder(itemId, itemType = "note") {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Unauthorized" };

    const db = getDb();
    let item, sellerId, price;

    if (itemType === "bundle") {
      const bundleRows = await db
        .select()
        .from(collections)
        .where(eq(collections.id, itemId))
        .limit(1);
      if (bundleRows.length === 0 || !bundleRows[0].isPremium)
        return { success: false, error: "Invalid premium bundle" };
      item = bundleRows[0];
      sellerId = item.userId;
      price = item.price;
    } else {
      const noteRows = await db
        .select()
        .from(notes)
        .where(eq(notes.id, itemId))
        .limit(1);
      if (noteRows.length === 0 || !noteRows[0].isPaid)
        return { success: false, error: "Invalid premium note" };
      item = noteRows[0];
      sellerId = item.userId;
      price = item.price;
    }

    const amountInPaise = Math.round(price * 100);

    // Strip accidental quotes from .env values
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.replace(/['"]/g, "").trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.replace(/['"]/g, "").trim();

    if (!keyId || !keySecret) {
      console.error("❌ Razorpay keys missing from environment variables");
      return { success: false, error: "Payment gateway not configured" };
    }

    // ✅ FIX 1: Use native fetch with NO User-Agent override.
    //    Next.js server actions run in Node.js — just use cache:'no-store'
    //    to prevent Next.js from caching this external POST request.
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: buildBasicAuth(keyId, keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
        notes: {
          itemId: String(item.id),
          itemType: String(itemType),
          buyerId: String(userId),
        },
      }),
      // Prevents Next.js fetch cache from deduplicating/caching this call
      cache: "no-store",
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Razorpay API Error [${response.status}]:`, errText);
      return {
        success: false,
        error: `Razorpay API returned ${response.status}: ${errText}`,
      };
    }

    const order = await response.json();

    const adminFee = price * 0.2;
    const sellerEarnings = price * 0.8;

    await db.insert(transactions).values({
      id: globalThis.crypto.randomUUID(),
      buyerId: userId,
      sellerId: sellerId,
      noteId: itemType === "note" ? item.id : null,
      bundleId: itemType === "bundle" ? item.id : null,
      amount: price,
      adminFee,
      sellerEarnings,
      razorpayOrderId: order.id,
      status: "pending",
    });

    return { success: true, order };
  } catch (error) {
    console.error("❌ createRazorpayOrder Exception:", error.message);
    return { success: false, error: error.message };
  }
}

// ─────────────────────────────────────────────
// VERIFY PAYMENT + GRANT ACCESS
// This runs immediately after Razorpay modal closes.
// The webhook is a backup — don't rely on it for UX.
// ─────────────────────────────────────────────
export async function verifyPayment(paymentData) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Unauthorized" };

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      paymentData;
    const db = getDb();

    // ── IDEMPOTENCY: already completed? ──────────────
    const txRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.razorpayOrderId, razorpay_order_id))
      .limit(1);

    if (txRows.length > 0 && txRows[0].status === "completed") {
      const userPurchases = await db
        .select({ itemId: purchases.itemId })
        .from(purchases)
        .where(eq(purchases.userId, userId));
      return {
        success: true,
        purchasedNotes: userPurchases.map((p) => p.itemId),
      };
    }

    // ── SIGNATURE VERIFICATION ────────────────────────
    const secret = process.env.RAZORPAY_KEY_SECRET?.replace(/['"]/g, "").trim();
    const expectedSignature = await generateSignature(
      `${razorpay_order_id}|${razorpay_payment_id}`,
      secret
    );

    if (expectedSignature !== razorpay_signature) {
      // Mark transaction failed
      await db
        .update(transactions)
        .set({ status: "failed" })
        .where(eq(transactions.razorpayOrderId, razorpay_order_id));
      return { success: false, error: "Invalid payment signature" };
    }

    // ── ✅ FIX 2: Mark transaction COMPLETED ──────────
    await db
      .update(transactions)
      .set({
        status: "completed",
        razorpayPaymentId: razorpay_payment_id,
      })
      .where(eq(transactions.razorpayOrderId, razorpay_order_id));

    // ── ✅ FIX 3: INSERT PURCHASE ROW (don't rely solely on webhook) ──
    const tx = txRows[0];
    if (tx) {
      const itemId = tx.noteId || tx.bundleId;
      const itemType = tx.noteId ? "note" : "bundle";

      // Check if purchase already exists (webhook might have already written it)
      const existingPurchase = await db
        .select({ id: purchases.id })
        .from(purchases)
        .where(eq(purchases.userId, userId))
        .limit(1);

      // Only insert if this exact purchase doesn't exist yet
      const alreadyOwns = existingPurchase.some(
        (p) => p.itemId === itemId
      );

      if (!alreadyOwns && itemId) {
        await db.insert(purchases).values({
          id: globalThis.crypto.randomUUID(),
          userId: userId,
          itemId: itemId,
          itemType: itemType === "bundle" ? "collection" : "note",
          amount: tx.amount,
          notesSnapshot: "[]",
        });
      }
    }

    // ── Return all purchased items for session update ──
    const userPurchases = await db
      .select({ itemId: purchases.itemId })
      .from(purchases)
      .where(eq(purchases.userId, userId));

    return {
      success: true,
      purchasedNotes: userPurchases.map((p) => p.itemId),
    };
  } catch (error) {
    console.error("❌ verifyPayment Exception:", error);
    return { success: false, error: error.message };
  }
}
