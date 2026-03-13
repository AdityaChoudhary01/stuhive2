"use server";

import { getDb } from "@/lib/db";
import { users } from "@/db/schema";
import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import { parseJsonField } from "@/lib/edge-action-utils";

function toLegacyLeaderboardUser(user) {
  const badges = parseJsonField(user.badges, { list: [], consistentLearner: { earnedAt: null, isActive: false } });

  return {
    ...user,
    _id: user.id,
    badges: Array.isArray(badges) ? badges : badges.list || [],
  };
}

export async function getGlobalLeaderboard(limit = 10) {
  try {
    const db = getDb();
    const topUsers = await db.select({
      id: users.id,
      name: users.name,
      avatar: users.avatar,
      university: users.university,
      hivePoints: users.hivePoints,
      badges: users.badges,
      noteCount: users.noteCount,
      blogCount: users.blogCount,
      isVerifiedEducator: users.isVerifiedEducator,
      role: users.role,
    })
      .from(users)
      .where(or(gt(users.hivePoints, 0), gt(users.noteCount, 0), gt(users.blogCount, 0)))
      .orderBy(desc(users.hivePoints), desc(users.noteCount))
      .limit(limit);

    return topUsers.map(toLegacyLeaderboardUser);
  } catch (error) {
    console.error("Failed to fetch global leaderboard:", error);
    return [];
  }
}

export async function getUniversityLeaderboard(universityName, limit = 10) {
  try {
    const db = getDb();
    const topLocalUsers = await db.select({
      id: users.id,
      name: users.name,
      avatar: users.avatar,
      hivePoints: users.hivePoints,
      badges: users.badges,
      noteCount: users.noteCount,
      isVerifiedEducator: users.isVerifiedEducator,
      role: users.role,
    })
      .from(users)
      .where(and(sql`lower(${users.university}) = lower(${universityName})`, gt(users.hivePoints, 0)))
      .orderBy(desc(users.hivePoints))
      .limit(limit);

    return topLocalUsers.map(toLegacyLeaderboardUser);
  } catch (error) {
    console.error("Failed to fetch local leaderboard:", error);
    return [];
  }
}

export async function awardHivePoints(userId, points) {
  try {
    const db = getDb();
    await db.update(users)
      .set({ hivePoints: sql`${users.hivePoints} + ${points}` })
      .where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.error("Failed to award points:", error);
    return false;
  }
}
