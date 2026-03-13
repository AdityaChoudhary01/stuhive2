"use server";

import { getDb } from "@/lib/db";
import { notes, requests, users } from "@/db/schema";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/actions/notification.actions";
import { makeContainsPattern, slugify } from "@/lib/edge-action-utils";

const isValidUUID = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function normalizeSearchValue(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof RegExp) return value.source.replace(/\.\*/g, "").replace(/\./g, " ").trim();
  return String(value);
}

function buildLegacyRequest(request, requester, fulfillmentNote, fulfillmentNoteUser) {
  return {
    ...request,
    _id: request.id,
    requester: requester
      ? {
          ...requester,
          _id: requester.id,
        }
      : request.requesterId,
    fulfillmentNote: fulfillmentNote
      ? {
          ...fulfillmentNote,
          _id: fulfillmentNote.id,
          user: fulfillmentNoteUser
            ? {
                ...fulfillmentNoteUser,
                _id: fulfillmentNoteUser.id,
              }
            : null,
        }
      : null,
  };
}

async function hydrateRequests(requestRows) {
  if (requestRows.length === 0) return [];

  const db = getDb();
  const requesterIds = [...new Set(requestRows.map((item) => item.requesterId).filter(Boolean))];
  const noteIds = [...new Set(requestRows.map((item) => item.fulfillmentNoteId).filter(Boolean))];

  const [requesterRows, noteRows] = await Promise.all([
    requesterIds.length
      ? db.select({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          isVerifiedEducator: users.isVerifiedEducator,
        })
          .from(users)
          .where(inArray(users.id, requesterIds))
      : [],
    noteIds.length
      ? db.select({
          note: notes,
          user: {
            id: users.id,
            name: users.name,
            isVerifiedEducator: users.isVerifiedEducator,
          },
        })
          .from(notes)
          .leftJoin(users, eq(notes.userId, users.id))
          .where(inArray(notes.id, noteIds))
      : [],
  ]);

  const requesterMap = new Map(requesterRows.map((item) => [item.id, item]));
  const noteMap = new Map(noteRows.map((item) => [item.note.id, item]));

  return requestRows.map((request) =>
    buildLegacyRequest(
      request,
      requesterMap.get(request.requesterId),
      noteMap.get(request.fulfillmentNoteId)?.note,
      noteMap.get(request.fulfillmentNoteId)?.user
    )
  );
}

export async function createRequest(data, userId) {
  try {
    const db = getDb();
    const newId = crypto.randomUUID();

    await db.insert(requests).values({
      id: newId,
      title: data.title,
      description: data.description,
      university: data.university,
      subject: data.subject,
      requesterId: userId,
      status: "pending",
    });

    const requesterRows = await db.select({
      id: users.id,
      name: users.name,
      avatar: users.avatar,
      isVerifiedEducator: users.isVerifiedEducator,
    }).from(users).where(eq(users.id, userId)).limit(1);

    const createdRequest = {
      id: newId,
      title: data.title,
      description: data.description,
      university: data.university,
      subject: data.subject,
      requesterId: userId,
      status: "pending",
      fulfilledById: null,
      fulfillmentNoteId: null,
      createdAt: new Date(),
    };

    revalidatePath("/requests");
    if (data.university) {
      revalidatePath(`/univ/${slugify(data.university)}`);
    }

    return {
      success: true,
      request: buildLegacyRequest(createdRequest, requesterRows[0], null, null),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getRequests({ page = 1, limit = 12, filter = "all", universityRegex = null } = {}) {
  try {
    const db = getDb();
    const skip = (page - 1) * limit;
    const conditions = [];

    if (filter === "pending") conditions.push(eq(requests.status, "pending"));
    if (filter === "fulfilled") conditions.push(eq(requests.status, "fulfilled"));

    const normalizedSearch = normalizeSearchValue(universityRegex);
    if (normalizedSearch) {
      const pattern = makeContainsPattern(normalizedSearch);
      conditions.push(or(like(requests.university, pattern), like(requests.title, pattern)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [requestRows, totalRows] = await Promise.all([
      db.select()
        .from(requests)
        .where(whereClause)
        .orderBy(desc(requests.createdAt))
        .limit(limit)
        .offset(skip),
      db.select({ count: sql`count(*)` }).from(requests).where(whereClause),
    ]);

    return {
      requests: await hydrateRequests(requestRows),
      totalPages: Math.ceil(Number(totalRows[0]?.count || 0) / limit),
      totalCount: Number(totalRows[0]?.count || 0),
    };
  } catch (error) {
    console.error("Error fetching requests:", error);
    return { requests: [], totalCount: 0, totalPages: 0 };
  }
}

export async function fulfillRequest(requestId, noteUrlOrId, userId) {
  try {
    const db = getDb();
    let identifier = String(noteUrlOrId || "").trim();

    if (identifier.includes("/notes/")) {
      identifier = identifier.split("/notes/")[1]?.split("?")[0]?.replace(/\/$/, "") || identifier;
    }

    const noteRows = await db.select()
      .from(notes)
      .where(
        isValidUUID(identifier)
          ? or(eq(notes.id, identifier), eq(notes.slug, identifier))
          : eq(notes.slug, identifier)
      )
      .limit(1);

    const note = noteRows[0];
    if (!note) {
      return { success: false, error: "Note not found. Check the link and try again." };
    }

    const requestRows = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
    const request = requestRows[0];
    if (!request) {
      return { success: false, error: "Request not found." };
    }

    await db.update(requests).set({
      status: "fulfilled",
      fulfilledById: userId,
      fulfillmentNoteId: note.id,
    }).where(eq(requests.id, requestId));

    if (request.requesterId !== userId) {
      await createNotification({
        recipientId: request.requesterId,
        actorId: userId,
        type: "REQUEST_FULFILLED",
        message: `Good news! Your community request "${request.title}" has been fulfilled!`,
        link: `/notes/${note.slug || note.id}`,
      });
    }

    revalidatePath("/requests");
    if (request.university) {
      revalidatePath(`/univ/${slugify(request.university)}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Fulfill Request Error:", error);
    return { success: false, error: "An error occurred while linking the note." };
  }
}

export async function deleteRequest(requestId, userId) {
  try {
    const db = getDb();
    const requestRows = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
    const request = requestRows[0];

    if (!request) return { success: false, error: "Request not found" };
    if (request.requesterId !== userId) return { success: false, error: "Unauthorized" };

    await db.delete(requests).where(eq(requests.id, requestId));

    revalidatePath("/requests");
    if (request.university) {
      revalidatePath(`/univ/${slugify(request.university)}`);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
