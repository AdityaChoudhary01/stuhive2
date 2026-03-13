
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { transactions, purchases } from "@/db/schema";
import { eq } from "drizzle-orm";

// Edge-safe HMAC using Web Crypto API
async function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${orderId}|${paymentId}`)
  );
  const computed = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signature;
}

export async function POST(req) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ success: false, error: "Missing payment fields" }, { status: 400 });
    }

    const db = getDb();
    const secret = process.env.RAZORPAY_KEY_SECRET?.replace(/['"]/g, "").trim();

    // 1. Verify Signature
    const isValid = await verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      secret
    );

    if (!isValid) {
      await db.update(transactions).set({ status: "failed" }).where(eq(transactions.razorpayOrderId, razorpay_order_id));
      return NextResponse.json({ success: false, error: "Invalid payment signature" }, { status: 400 });
    }

    // 2. Process Success
    const txRows = await db.select().from(transactions).where(eq(transactions.razorpayOrderId, razorpay_order_id)).limit(1);
    const tx = txRows[0];

    if (tx && tx.status !== "completed") {
      await db.update(transactions)
        .set({ status: "completed", razorpayPaymentId: razorpay_payment_id })
        .where(eq(transactions.razorpayOrderId, razorpay_order_id));

      const itemId = tx.noteId || tx.bundleId;
      const itemType = tx.noteId ? "note" : "collection";

      await db.insert(purchases).values({
        id: crypto.randomUUID(),
        userId,
        itemId,
        itemType,
        amount: tx.amount,
        notesSnapshot: "[]",
      });
    }

    const allPurchases = await db.select({ itemId: purchases.itemId }).from(purchases).where(eq(purchases.userId, userId));

    return NextResponse.json({
      success: true,
      purchasedNotes: allPurchases.map((p) => p.itemId),
    });
  } catch (err) {
    console.error("❌ verify-payment exception:", err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
