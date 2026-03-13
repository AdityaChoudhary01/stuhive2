"use server";

import { getDb } from "@/lib/db";
import { collections, notes, siteAnalytics, transactions, userAnalytics, users } from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

async function isAdmin() {
  const session = await auth();
  return session?.user?.role === "admin";
}

async function hydrateTransactions(transactionRows) {
  if (transactionRows.length === 0) return [];

  const db = getDb();
  const buyerIds = [...new Set(transactionRows.map((item) => item.buyerId).filter(Boolean))];
  const sellerIds = [...new Set(transactionRows.map((item) => item.sellerId).filter(Boolean))];
  const noteIds = [...new Set(transactionRows.map((item) => item.noteId).filter(Boolean))];
  const bundleIds = [...new Set(transactionRows.map((item) => item.bundleId).filter(Boolean))];
  const userIds = [...new Set([...buyerIds, ...sellerIds])];

  const [userRows, noteRows, bundleRows] = await Promise.all([
    userIds.length
      ? db.select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
        }).from(users).where(inArray(users.id, userIds))
      : [],
    noteIds.length
      ? db.select({
          id: notes.id,
          title: notes.title,
          slug: notes.slug,
        }).from(notes).where(inArray(notes.id, noteIds))
      : [],
    bundleIds.length
      ? db.select({
          id: collections.id,
          name: collections.name,
          slug: collections.slug,
        }).from(collections).where(inArray(collections.id, bundleIds))
      : [],
  ]);

  const userMap = new Map(userRows.map((item) => [item.id, item]));
  const noteMap = new Map(noteRows.map((item) => [item.id, item]));
  const bundleMap = new Map(bundleRows.map((item) => [item.id, item]));

  return transactionRows.map((transaction) => ({
    ...transaction,
    _id: transaction.id,
    buyer: userMap.get(transaction.buyerId)
      ? { ...userMap.get(transaction.buyerId), _id: transaction.buyerId }
      : null,
    seller: userMap.get(transaction.sellerId)
      ? { ...userMap.get(transaction.sellerId), _id: transaction.sellerId }
      : null,
    note: transaction.noteId && noteMap.get(transaction.noteId)
      ? { ...noteMap.get(transaction.noteId), _id: transaction.noteId }
      : null,
    bundle: transaction.bundleId && bundleMap.get(transaction.bundleId)
      ? { ...bundleMap.get(transaction.bundleId), _id: transaction.bundleId }
      : null,
  }));
}

export async function trackCreatorEvent(creatorId, type) {
  if (!creatorId) return;

  try {
    const db = getDb();
    const dateStr = new Date().toISOString().split("T")[0];
    const existingRows = await db.select().from(userAnalytics)
      .where(and(eq(userAnalytics.userId, creatorId), eq(userAnalytics.date, dateStr)))
      .limit(1);

    if (existingRows.length > 0) {
      await db.update(userAnalytics).set({
        views: type === "views" ? (existingRows[0].views || 0) + 1 : existingRows[0].views || 0,
        downloads: type === "downloads" ? (existingRows[0].downloads || 0) + 1 : existingRows[0].downloads || 0,
      }).where(eq(userAnalytics.id, existingRows[0].id));
    } else {
      await db.insert(userAnalytics).values({
        id: crypto.randomUUID(),
        userId: creatorId,
        date: dateStr,
        views: type === "views" ? 1 : 0,
        downloads: type === "downloads" ? 1 : 0,
      });
    }
  } catch (error) {
    console.error(`Failed to track ${type} event:`, error);
  }
}

export async function getCreatorAnalytics(userId) {
  try {
    const db = getDb();
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const dateLimit = pastDate.toISOString().split("T")[0];

    return await db.select()
      .from(userAnalytics)
      .where(and(eq(userAnalytics.userId, userId), gte(userAnalytics.date, dateLimit)))
      .orderBy(asc(userAnalytics.date));
  } catch (error) {
    console.error("Failed to fetch analytics:", error);
    return [];
  }
}

export async function logPageView(path) {
  try {
    if (path.startsWith("/_next") || path.startsWith("/api") || path.includes(".")) return;

    const db = getDb();
    const dateStr = new Date().toISOString().split("T")[0];
    const existingRows = await db.select().from(siteAnalytics)
      .where(and(eq(siteAnalytics.path, path), eq(siteAnalytics.date, dateStr)))
      .limit(1);

    if (existingRows.length > 0) {
      await db.update(siteAnalytics)
        .set({ views: (existingRows[0].views || 0) + 1 })
        .where(eq(siteAnalytics.id, existingRows[0].id));
    } else {
      await db.insert(siteAnalytics).values({
        id: crypto.randomUUID(),
        path,
        date: dateStr,
        views: 1,
      });
    }
  } catch (error) {
    console.error("Failed to log page view:", error.message);
  }
}

export async function getGlobalFinancialData() {
  if (!(await isAdmin())) return { success: false, error: "Unauthorized" };

  try {
    const db = getDb();
    const [statsRows, transactionRows] = await Promise.all([
      db.select({
        totalRevenue: sql`sum(${transactions.amount})`,
        totalAdminFee: sql`sum(${transactions.adminFee})`,
        totalCreatorEarnings: sql`sum(${transactions.sellerEarnings})`,
      }).from(transactions).where(eq(transactions.status, "completed")),
      db.select().from(transactions)
        .where(eq(transactions.status, "completed"))
        .orderBy(desc(transactions.createdAt))
        .limit(50),
    ]);

    return {
      success: true,
      stats: {
        totalRevenue: Number(statsRows[0]?.totalRevenue || 0),
        totalAdminFee: Number(statsRows[0]?.totalAdminFee || 0),
        totalCreatorEarnings: Number(statsRows[0]?.totalCreatorEarnings || 0),
      },
      transactions: await hydrateTransactions(transactionRows),
    };
  } catch (error) {
    console.error("Admin Financial Analytics Error:", error);
    return { success: false, error: error.message };
  }
}

export async function getUserDashboardAnalytics() {
  const session = await auth();
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const db = getDb();
    const [contentRows, financialRows, transactionRows] = await Promise.all([
      db.select({
        totalViews: sql`sum(${notes.viewCount})`,
        totalDownloads: sql`sum(${notes.downloadCount})`,
        totalNotes: sql`count(*)`,
      }).from(notes).where(eq(notes.userId, session.user.id)),
      db.select({
        totalEarnings: sql`sum(${transactions.sellerEarnings})`,
        totalSales: sql`count(*)`,
      }).from(transactions)
        .where(and(eq(transactions.sellerId, session.user.id), eq(transactions.status, "completed"))),
      db.select().from(transactions)
        .where(and(eq(transactions.sellerId, session.user.id), eq(transactions.status, "completed")))
        .orderBy(desc(transactions.createdAt)),
    ]);

    return {
      success: true,
      contentStats: {
        totalViews: Number(contentRows[0]?.totalViews || 0),
        totalDownloads: Number(contentRows[0]?.totalDownloads || 0),
        totalNotes: Number(contentRows[0]?.totalNotes || 0),
      },
      financialStats: {
        totalEarnings: Number(financialRows[0]?.totalEarnings || 0),
        totalSales: Number(financialRows[0]?.totalSales || 0),
      },
      transactions: await hydrateTransactions(transactionRows),
    };
  } catch (error) {
    console.error("User Analytics Error:", error);
    return { success: false, error: error.message };
  }
}

export async function getMoreTransactions(page = 1, limit = 50) {
  if (!(await isAdmin())) return [];

  const skip = (page - 1) * limit;

  try {
    const db = getDb();
    const transactionRows = await db.select().from(transactions)
      .where(eq(transactions.status, "completed"))
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(skip);

    return await hydrateTransactions(transactionRows);
  } catch (error) {
    console.error("Error fetching paginated transactions:", error);
    return [];
  }
}
