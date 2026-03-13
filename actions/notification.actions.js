"use server";

import { getDb } from "@/lib/db";
import { notifications } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function toLegacyNotification(notification) {
  return {
    ...notification,
    _id: notification.id,
  };
}

export async function createNotification({ recipientId, actorId, type, message, link }) {
  try {
    const db = getDb();
    await db.insert(notifications).values({
      recipientId,
      actorId: actorId || null,
      type,
      message,
      link: link || null,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to create notification:", error);
    return { success: false, error: error.message };
  }
}

export async function getUserNotifications(userId, limit = 10) {
  try {
    const db = getDb();
    const [notificationRows, unreadRows] = await Promise.all([
      db.select()
        .from(notifications)
        .where(eq(notifications.recipientId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit),
      db.select({ count: sql`count(*)` })
        .from(notifications)
        .where(and(eq(notifications.recipientId, userId), eq(notifications.isRead, false))),
    ]);

    return {
      success: true,
      notifications: notificationRows.map(toLegacyNotification),
      unreadCount: Number(unreadRows[0]?.count || 0),
    };
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return { success: false, notifications: [], unreadCount: 0 };
  }
}

export async function markNotificationAsRead(notificationId) {
  try {
    const db = getDb();
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, notificationId));
    return { success: true };
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    return { success: false };
  }
}

export async function markAllNotificationsAsRead(userId) {
  try {
    const db = getDb();
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.recipientId, userId), eq(notifications.isRead, false)));
    return { success: true };
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
    return { success: false };
  }
}

export async function getPaginatedNotifications(userId, page = 1, limit = 20) {
  try {
    const db = getDb();
    const skip = (page - 1) * limit;

    const [notificationRows, totalRows, unreadRows] = await Promise.all([
      db.select()
        .from(notifications)
        .where(eq(notifications.recipientId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(skip),
      db.select({ count: sql`count(*)` })
        .from(notifications)
        .where(eq(notifications.recipientId, userId)),
      db.select({ count: sql`count(*)` })
        .from(notifications)
        .where(and(eq(notifications.recipientId, userId), eq(notifications.isRead, false))),
    ]);

    const total = Number(totalRows[0]?.count || 0);

    return {
      success: true,
      notifications: notificationRows.map(toLegacyNotification),
      total,
      totalPages: Math.ceil(total / limit),
      unreadCount: Number(unreadRows[0]?.count || 0),
    };
  } catch (error) {
    console.error("Failed to fetch paginated notifications:", error);
    return { success: false, notifications: [], total: 0, totalPages: 0, unreadCount: 0 };
  }
}

export async function clearAllNotifications(userId) {
  try {
    const db = getDb();
    await db.delete(notifications).where(eq(notifications.recipientId, userId));
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    console.error("Failed to clear notifications:", error);
    return { success: false };
  }
}

export async function deleteNotification(notificationId) {
  try {
    const db = getDb();
    await db.delete(notifications).where(eq(notifications.id, notificationId));
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete notification:", error);
    return { success: false };
  }
}
