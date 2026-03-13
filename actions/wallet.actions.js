"use server";

import { getDb } from "@/lib/db";
import { collections, notes, transactions, users } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { parseJsonField } from "@/lib/edge-action-utils";

function parseSchedule(value) {
  const schedule = parseJsonField(value, []);
  return Array.isArray(schedule) ? schedule : [];
}

export async function getWalletData() {
  const session = await auth();
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const db = getDb();
    const userRows = await db.select({
      id: users.id,
      walletBalance: users.walletBalance,
      pendingBalance: users.pendingBalance,
      payoutSchedule: users.payoutSchedule,
      payoutDetails: users.payoutDetails,
      role: users.role,
    }).from(users).where(eq(users.id, session.user.id)).limit(1);

    const user = userRows[0];
    if (!user) throw new Error("User not found");

    let walletBalance = user.walletBalance || 0;
    let pendingBalance = user.pendingBalance || 0;
    const payoutSchedule = parseSchedule(user.payoutSchedule);
    const now = new Date();
    let hasChanges = false;
    let amountToClear = 0;

    for (const item of payoutSchedule) {
      if (item.status === "pending" && item.availableDate && new Date(item.availableDate) <= now) {
        item.status = "cleared";
        amountToClear += Number(item.amount || 0);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      walletBalance += amountToClear;
      pendingBalance = Math.max(0, pendingBalance - amountToClear);

      await db.update(users).set({
        walletBalance,
        pendingBalance,
        payoutSchedule: JSON.stringify(payoutSchedule),
      }).where(eq(users.id, session.user.id));
    }

    const salesRows = await db.select().from(transactions)
      .where(and(eq(transactions.sellerId, session.user.id), eq(transactions.status, "completed")))
      .orderBy(desc(transactions.createdAt));

    const buyerIds = [...new Set(salesRows.map((sale) => sale.buyerId).filter(Boolean))];
    const noteIds = [...new Set(salesRows.map((sale) => sale.noteId).filter(Boolean))];
    const bundleIds = [...new Set(salesRows.map((sale) => sale.bundleId).filter(Boolean))];

    const [buyerRows, noteRows, bundleRows] = await Promise.all([
      buyerIds.length
        ? db.select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
        }).from(users).where(inArray(users.id, buyerIds))
        : [],
      noteIds.length
        ? db.select({
          id: notes.id,
          title: notes.title,
          price: notes.price,
          slug: notes.slug,
          thumbnailKey: notes.thumbnailKey,
          isPaid: notes.isPaid,
        }).from(notes).where(inArray(notes.id, noteIds))
        : [],
      bundleIds.length
        ? db.select({
          id: collections.id,
          name: collections.name,
          price: collections.price,
          slug: collections.slug,
          isPremium: collections.isPremium,
        }).from(collections).where(inArray(collections.id, bundleIds))
        : [],
    ]);

    const buyerMap = new Map(buyerRows.map((item) => [item.id, item]));
    const noteMap = new Map(noteRows.map((item) => [item.id, item]));
    const bundleMap = new Map(bundleRows.map((item) => [item.id, item]));

    const sales = salesRows.map((sale) => ({
      ...sale,
      _id: sale.id,
      buyer: buyerMap.get(sale.buyerId)
        ? { ...buyerMap.get(sale.buyerId), _id: sale.buyerId }
        : null,
      note: sale.noteId && noteMap.get(sale.noteId)
        ? { ...noteMap.get(sale.noteId), _id: sale.noteId }
        : null,
      bundle: sale.bundleId && bundleMap.get(sale.bundleId)
        ? { ...bundleMap.get(sale.bundleId), _id: sale.bundleId }
        : null,
    }));

    const performanceMap = sales.reduce((acc, sale) => {
      const isBundle = Boolean(sale.bundle);
      const item = isBundle ? sale.bundle : sale.note;
      if (!item) return acc;

      const itemId = item._id;
      if (!acc[itemId]) {
        acc[itemId] = {
          itemId,
          type: isBundle ? "Bundle" : "Note",
          title: isBundle ? item.name : item.title,
          slug: item.slug,
          price: sale.amount,
          totalCopiesSold: 0,
          totalEarnings: 0,
          buyers: [],
        };
      }

      acc[itemId].totalCopiesSold += 1;
      acc[itemId].totalEarnings += Number(sale.sellerEarnings || 0);
      acc[itemId].buyers.push({
        _id: sale._id,
        buyerName: sale.buyer?.name || "Unknown User",
        buyerEmail: sale.buyer?.email || "Hidden",
        buyerAvatar: sale.buyer?.avatar || null,
        purchasedAt: sale.createdAt,
        earnings: Number(sale.sellerEarnings || 0),
      });

      return acc;
    }, {});

    const performanceByItem = Object.values(performanceMap).sort((a, b) => b.totalEarnings - a.totalEarnings);

    return {
      success: true,
      walletBalance,
      pendingBalance,
      payoutDetails: parseJsonField(user.payoutDetails, {}),
      sales,
      performanceByItem,
      isAdmin: user.role === "admin",
    };
  } catch (error) {
    console.error("Wallet Data Fetch Error:", error);
    return { success: false, error: error.message };
  }
}

export async function updatePayoutDetails(data) {
  const session = await auth();
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const db = getDb();
    await db.update(users).set({
      payoutDetails: JSON.stringify({
        upiId: data.upiId || "",
        bankName: data.bankName || "",
        accountNumber: data.accountNumber || "",
        ifscCode: data.ifscCode || "",
      }),
    }).where(eq(users.id, session.user.id));

    revalidatePath("/wallet");
    return { success: true };
  } catch (error) {
    console.error("Update Payout Error:", error);
    return { success: false, error: error.message };
  }
}
