export const runtime = "edge";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { notes, collections, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { itemId, itemType = "note" } = await req.json();
    if (!itemId) {
      return NextResponse.json({ success: false, error: "itemId is required" }, { status: 400 });
    }

    const db = getDb();
    let item, sellerId, price;

    if (itemType === "bundle") {
      const rows = await db.select().from(collections).where(eq(collections.id, itemId)).limit(1);
      if (!rows[0]?.isPremium) return NextResponse.json({ success: false, error: "Invalid premium bundle" }, { status: 404 });
      item = rows[0];
      sellerId = item.userId;
      price = item.price;
    } else {
      const rows = await db.select().from(notes).where(eq(notes.id, itemId)).limit(1);
      if (!rows[0]?.isPaid) return NextResponse.json({ success: false, error: "Invalid premium note" }, { status: 404 });
      item = rows[0];
      sellerId = item.userId;
      price = item.price;
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.replace(/['"]/g, "").trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.replace(/['"]/g, "").trim();

    if (!keyId || !keySecret) {
      return NextResponse.json({ success: false, error: "Payment gateway not configured" }, { status: 500 });
    }

    const requestBody = JSON.stringify({
      amount: Math.round(price * 100),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: {
        itemId: String(item.id),
        itemType: String(itemType),
        buyerId: String(userId),
      },
    });

    const headers = new Headers();
    headers.set("Authorization", `Basic ${btoa(`${keyId}:${keySecret}`)}`);
    headers.set("Content-Type", "application/json");

    const razorpayRes = await fetch("https://api.razorpay.com", {
      method: "POST",
      headers: headers,
      body: requestBody,
    });

    const responseText = await razorpayRes.text();

    if (!razorpayRes.ok) {
      console.error(`❌ Razorpay ${razorpayRes.status}:`, responseText);
      return NextResponse.json({ success: false, error: `Razorpay Error: ${razorpayRes.status}` }, { status: 500 });
    }

    const order = JSON.parse(responseText);

    await db.insert(transactions).values({
      id: crypto.randomUUID(), // Works globally in Edge
      buyerId: userId,
      sellerId,
      noteId: itemType === "note" ? item.id : null,
      bundleId: itemType === "bundle" ? item.id : null,
      amount: price,
      adminFee: price * 0.2,
      sellerEarnings: price * 0.8,
      razorpayOrderId: order.id,
      status: "pending",
    });

    return NextResponse.json({ success: true, order });
  } catch (err) {
    console.error("❌ create-order exception:", err?.message || err);
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
