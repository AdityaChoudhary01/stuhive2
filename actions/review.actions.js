"use server";

import { getDb } from "@/lib/db";
import { noteReviews, notes, users } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/actions/notification.actions";

function toLegacyReview(review, user) {
  return {
    ...review,
    _id: review.id,
    parentReviewId: review.parentReviewId || null,
    user: user ? { ...user, _id: user.id } : null,
    createdAt: review.createdAt ? new Date(review.createdAt).toISOString() : new Date().toISOString(),
  };
}

export async function addReview({ noteId, rating, comment, userId, parentReviewId = null }) {
  try {
    const db = getDb();
    const noteRows = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    const note = noteRows[0];
    if (!note) return { success: false, error: "Note not found" };

    if (!parentReviewId) {
      const existingReviews = await db.select().from(noteReviews)
        .where(and(eq(noteReviews.noteId, noteId), eq(noteReviews.userId, userId), sql`parent_review_id IS NULL`));

      if (existingReviews.length > 0) {
        return { success: false, error: "You have already reviewed this note." };
      }
    }

    const reviewId = crypto.randomUUID();
    await db.insert(noteReviews).values({
      id: reviewId,
      noteId,
      userId,
      rating: parentReviewId ? 0 : Number(rating),
      comment,
      parentReviewId: parentReviewId || null,
      createdAt: new Date(),
    });

    const allReviews = await db.select().from(noteReviews).where(eq(noteReviews.noteId, noteId));
    const mainReviews = allReviews.filter((item) => !item.parentReviewId);
    const nextRating = mainReviews.length > 0
      ? mainReviews.reduce((sum, item) => sum + (item.rating || 0), 0) / mainReviews.length
      : 0;

    await db.update(notes).set({
      numReviews: mainReviews.length,
      rating: nextRating,
    }).where(eq(notes.id, noteId));

    const noteOwnerId = note.userId;
    const notificationLink = `/notes/${note.slug || noteId}#reviews`;

    if (parentReviewId) {
      const parentReview = allReviews.find((item) => item.id === parentReviewId);
      if (parentReview) {
        const parentCommenterId = parentReview.userId;

        if (parentCommenterId !== userId) {
          await createNotification({
            recipientId: parentCommenterId,
            actorId: userId,
            type: "SYSTEM",
            message: `Someone replied to your comment on "${note.title}".`,
            link: notificationLink,
          });
        }

        if (noteOwnerId !== userId && noteOwnerId !== parentCommenterId) {
          await createNotification({
            recipientId: noteOwnerId,
            actorId: userId,
            type: "SYSTEM",
            message: `New discussion on your note "${note.title}".`,
            link: notificationLink,
          });
        }
      }
    } else if (noteOwnerId !== userId) {
      await createNotification({
        recipientId: noteOwnerId,
        actorId: userId,
        type: "SYSTEM",
        message: `Someone just left a ${rating}-star review on your note "${note.title}".`,
        link: notificationLink,
      });
    }

    revalidatePath(`/notes/${note.slug || noteId}`);

    const fullReviews = await db.select({
      review: noteReviews,
      user: {
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        isVerifiedEducator: users.isVerifiedEducator,
      },
    })
      .from(noteReviews)
      .leftJoin(users, eq(noteReviews.userId, users.id))
      .where(eq(noteReviews.noteId, noteId))
      .orderBy(asc(noteReviews.createdAt));

    return {
      success: true,
      reviews: fullReviews.map(({ review, user }) => toLegacyReview(review, user)),
    };
  } catch (error) {
    console.error("Add Review Error:", error);
    return { success: false, error: "Server error while submitting your review." };
  }
}
