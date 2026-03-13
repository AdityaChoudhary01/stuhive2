"use server";

import { getDb } from "@/lib/db";
import { collections, notes, requests, universities, users } from "@/db/schema";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { makeContainsPattern, slugify } from "@/lib/edge-action-utils";

function toLegacyUser(user) {
  return user ? { ...user, _id: user.id } : null;
}

function toLegacyRequest(request, requester) {
  return {
    ...request,
    _id: request.id,
    requester: toLegacyUser(requester),
  };
}

function buildUniversityMatch(pattern) {
  return or(like(notes.university, pattern), like(notes.title, pattern));
}

function buildCollectionMatch(pattern) {
  return and(eq(collections.visibility, "public"), or(like(collections.university, pattern), like(collections.name, pattern)));
}

function buildRequestMatch(pattern) {
  return and(eq(requests.status, "pending"), or(like(requests.university, pattern), like(requests.title, pattern)));
}

export async function getUniversityHubData(slug) {
  try {
    const db = getDb();
    const nameStr = slug.replace(/-/g, " ");
    const pattern = makeContainsPattern(nameStr);
    const limitNum = 12;

    const [detailRows, noteRows, collectionRows, requestRows, noteCountRows, collectionCountRows, requestCountRows] = await Promise.all([
      db.select().from(universities).where(eq(universities.slug, slug)).limit(1),
      db.select({
        note: notes,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          isVerifiedEducator: users.isVerifiedEducator,
        },
      })
        .from(notes)
        .leftJoin(users, eq(notes.userId, users.id))
        .where(buildUniversityMatch(pattern))
        .orderBy(desc(notes.viewCount))
        .limit(limitNum),
      db.select({
        collection: collections,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          isVerifiedEducator: users.isVerifiedEducator,
        },
      })
        .from(collections)
        .leftJoin(users, eq(collections.userId, users.id))
        .where(buildCollectionMatch(pattern))
        .orderBy(desc(collections.createdAt))
        .limit(limitNum),
      db.select({
        request: requests,
        requester: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          isVerifiedEducator: users.isVerifiedEducator,
        },
      })
        .from(requests)
        .leftJoin(users, eq(requests.requesterId, users.id))
        .where(buildRequestMatch(pattern))
        .orderBy(desc(requests.createdAt))
        .limit(limitNum),
      db.select({ count: sql`count(*)` }).from(notes).where(buildUniversityMatch(pattern)),
      db.select({ count: sql`count(*)` }).from(collections).where(buildCollectionMatch(pattern)),
      db.select({ count: sql`count(*)` }).from(requests).where(buildRequestMatch(pattern)),
    ]);

    const universityDetails = detailRows[0] || null;
    const formattedName = universityDetails?.name || nameStr.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

    return {
      success: true,
      universityName: formattedName,
      details: universityDetails,
      stats: {
        noteCount: Number(noteCountRows[0]?.count || 0),
        collectionCount: Number(collectionCountRows[0]?.count || 0),
        requestCount: Number(requestCountRows[0]?.count || 0),
      },
      notes: noteRows.map(({ note, user }) => ({ ...note, _id: note.id, user: toLegacyUser(user) })),
      collections: collectionRows.map(({ collection, user }) => ({ ...collection, _id: collection.id, user: toLegacyUser(user) })),
      requests: requestRows.map(({ request, requester }) => toLegacyRequest(request, requester)),
    };
  } catch (error) {
    console.error("Error fetching university data:", error);
    return { success: false, universityName: slug, details: null, notes: [], collections: [], requests: [], stats: {} };
  }
}

export async function getTopUniversities() {
  try {
    const db = getDb();
    const topUnivs = await db.select({
      name: notes.university,
      count: sql`count(*)`,
    })
      .from(notes)
      .where(sql`${notes.university} IS NOT NULL AND ${notes.university} != ''`)
      .groupBy(notes.university)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return topUnivs.map((item) => ({
      name: item.name,
      slug: slugify(item.name),
      count: Number(item.count || 0),
    }));
  } catch (error) {
    console.error("Error fetching top universities:", error);
    return [];
  }
}

export async function loadMoreUniversityData(slug, tab, page = 1, limit = 12) {
  try {
    const db = getDb();
    const nameStr = slug.replace(/-/g, " ");
    const pattern = makeContainsPattern(nameStr);
    const skip = (page - 1) * limit;

    if (tab === "notes") {
      const noteRows = await db.select({
        note: notes,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          isVerifiedEducator: users.isVerifiedEducator,
        },
      })
        .from(notes)
        .leftJoin(users, eq(notes.userId, users.id))
        .where(buildUniversityMatch(pattern))
        .orderBy(desc(notes.viewCount))
        .limit(limit)
        .offset(skip);

      return noteRows.map(({ note, user }) => ({ ...note, _id: note.id, user: toLegacyUser(user) }));
    }

    if (tab === "collections") {
      const collectionRows = await db.select({
        collection: collections,
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          isVerifiedEducator: users.isVerifiedEducator,
        },
      })
        .from(collections)
        .leftJoin(users, eq(collections.userId, users.id))
        .where(buildCollectionMatch(pattern))
        .orderBy(desc(collections.createdAt))
        .limit(limit)
        .offset(skip);

      return collectionRows.map(({ collection, user }) => ({ ...collection, _id: collection.id, user: toLegacyUser(user) }));
    }

    if (tab === "requests") {
      const requestRows = await db.select({
        request: requests,
        requester: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          isVerifiedEducator: users.isVerifiedEducator,
        },
      })
        .from(requests)
        .leftJoin(users, eq(requests.requesterId, users.id))
        .where(buildRequestMatch(pattern))
        .orderBy(desc(requests.createdAt))
        .limit(limit)
        .offset(skip);

      return requestRows.map(({ request, requester }) => toLegacyRequest(request, requester));
    }

    return [];
  } catch (error) {
    console.error("Error loading more data:", error);
    return [];
  }
}
