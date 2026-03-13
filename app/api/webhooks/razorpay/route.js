export const runtime = "edge";

import { getDb } from "@/lib/db";
import { users, notes, collections, transactions, purchases, collectionNotes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createNotification } from "@/actions/notification.actions";

/**
 * 🔐 Verify Razorpay Signature using Edge-compatible Web Crypto API
 */
async function verifyRazorpaySignature(bodyText, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyText));
  const generatedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
    
  return generatedSignature === signature;
}

export async function POST(req) {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) return new Response("Webhook secret not configured", { status: 500 });

    const isValid = await verifyRazorpaySignature(bodyText, signature, webhookSecret);
    if (!isValid) {
      console.error("🚨 Invalid Razorpay Webhook Signature Detected!");
      return new Response("Invalid signature", { status: 400 });
    }

    const event = JSON.parse(bodyText);

    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      const { itemId, itemType, buyerId } = payment.notes || {};

      if (!itemId || !buyerId) return new Response("OK", { status: 200 });

      const db = getDb();

      // 1. IDEMPOTENCY CHECK
      const existingTxRows = await db.select().from(transactions).where(eq(transactions.razorpayOrderId, payment.order_id));
      if (existingTxRows.length > 0 && existingTxRows[0].status === "completed") {
        return new Response("OK", { status: 200 });
      }

      const isBundle = itemType === "bundle";
      let item, sellerId, itemTitle, itemSlug;

      // 2. Fetch Item and Seller
      if (isBundle) {
        const bundleRows = await db.select().from(collections).where(eq(collections.id, itemId));
        item = bundleRows[0];
        if (item) {
          itemTitle = item.name;
          itemSlug = item.slug;
          sellerId = item.userId;
        }
      } else {
        const noteRows = await db.select().from(notes).where(eq(notes.id, itemId));
        item = noteRows[0];
        if (item) {
          itemTitle = item.title;
          itemSlug = item.slug;
          sellerId = item.userId;
        }
      }

      if (!item) return new Response("Item not found", { status: 404 });

      // 🚀 3. BUNDLE SNAPSHOT LOGIC
      let notesSnapshot = [];
      if (isBundle) {
          const colNotes = await db.select({ noteId: collectionNotes.noteId }).from(collectionNotes).where(eq(collectionNotes.collectionId, itemId));
          notesSnapshot = colNotes.map(n => n.noteId);
      }

      // Calculate payout & 7-day Escrow
      const amountInRupees = payment.amount / 100;
      const creatorEarnings = amountInRupees * 0.80;
      const availableDate = new Date();
      availableDate.setDate(availableDate.getDate() + 7);

      // 4. Grant Access to the Primary Item
      await db.insert(purchases).values({
        id: crypto.randomUUID(),
        userId: buyerId,
        itemId: itemId,
        itemType: isBundle ? 'collection' : 'note',
        amount: amountInRupees,
        notesSnapshot: JSON.stringify(notesSnapshot)
      });

      // 🚀 5. UNLOCK INDIVIDUAL NOTES (If it's a bundle)
      if (isBundle && notesSnapshot.length > 0) {
          for (const nId of notesSnapshot) {
              // Give the buyer explicit access to every note in the bundle
              await db.insert(purchases).values({
                  id: crypto.randomUUID(),
                  userId: buyerId,
                  itemId: nId,
                  itemType: 'note',
                  amount: 0,
                  notesSnapshot: '[]'
              }).catch(() => {}); // Catch and ignore if they somehow already own it
              
              // Increment sales count for the individual notes
              const targetNote = await db.select({ salesCount: notes.salesCount }).from(notes).where(eq(notes.id, nId)).limit(1);
              if (targetNote.length > 0) {
                  await db.update(notes).set({ salesCount: (targetNote[0].salesCount || 0) + 1 }).where(eq(notes.id, nId));
              }
          }
      } else if (!isBundle) {
          // Increment single note sales count
          await db.update(notes).set({ salesCount: (item.salesCount || 0) + 1 }).where(eq(notes.id, itemId));
      }

      // 6. Update Seller Wallet (Escrow)
      const sellerRows = await db.select().from(users).where(eq(users.id, sellerId));
      const seller = sellerRows[0];
      
      const currentSchedule = seller.payoutSchedule ? JSON.parse(seller.payoutSchedule) : [];
      currentSchedule.push({ amount: creatorEarnings, availableDate: availableDate.toISOString(), status: 'pending' });

      await db.update(users)
        .set({ 
          pendingBalance: (seller.pendingBalance || 0) + creatorEarnings,
          payoutSchedule: JSON.stringify(currentSchedule)
        })
        .where(eq(users.id, sellerId));

      // 7. Update Transaction Status
      await db.update(transactions)
        .set({ status: "completed", razorpayPaymentId: payment.id })
        .where(eq(transactions.razorpayOrderId, payment.order_id));

      // 8. Notifications
      await Promise.all([
        createNotification({
          recipientId: sellerId,
          type: 'SYSTEM',
          message: `Sale Confirmed! Your ${isBundle ? 'bundle' : 'note'} "${itemTitle}" was purchased. ₹${creatorEarnings.toFixed(2)} added to pending balance (7-day hold).`,
          link: `/wallet`
        }),
        createNotification({
          recipientId: buyerId,
          type: 'SYSTEM',
          message: `Payment successful! "${itemTitle}" is now unlocked in your library forever.`,
          link: isBundle ? `/shared-collections/${itemSlug}` : `/notes/${itemSlug}`
        })
      ]);
    }

    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}