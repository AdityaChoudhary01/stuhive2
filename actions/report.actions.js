"use server";

import { getDb } from "@/lib/db";
import { collections, notes, reports } from "@/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

function buildLegacyReport(report, note, bundle) {
  return {
    ...report,
    _id: report.id,
    targetNote: note
      ? {
          ...note,
          _id: note.id,
        }
      : null,
    targetBundle: bundle
      ? {
          ...bundle,
          _id: bundle.id,
        }
      : null,
  };
}

export async function submitReport(data) {
  const session = await auth();
  if (!session) return { success: false, error: "Authentication required" };

  try {
    const db = getDb();
    await db.insert(reports).values({
      id: crypto.randomUUID(),
      reporterId: session.user.id,
      targetNoteId: data.noteId || null,
      targetBundleId: data.bundleId || null,
      reason: data.reason,
      details: data.details,
    });

    revalidatePath("/admin/reports");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getUserReports(page = 1, limit = 120) {
  const session = await auth();
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    const db = getDb();
    const skip = (page - 1) * limit;

    const [reportRows, totalRows] = await Promise.all([
      db.select()
        .from(reports)
        .where(eq(reports.reporterId, session.user.id))
        .orderBy(desc(reports.createdAt))
        .limit(limit)
        .offset(skip),
      db.select({ count: sql`count(*)` })
        .from(reports)
        .where(eq(reports.reporterId, session.user.id)),
    ]);

    const noteIds = [...new Set(reportRows.map((item) => item.targetNoteId).filter(Boolean))];
    const bundleIds = [...new Set(reportRows.map((item) => item.targetBundleId).filter(Boolean))];

    const [noteRows, bundleRows] = await Promise.all([
      noteIds.length
        ? db.select({ id: notes.id, title: notes.title, slug: notes.slug })
          .from(notes)
          .where(inArray(notes.id, noteIds))
        : [],
      bundleIds.length
        ? db.select({ id: collections.id, name: collections.name, slug: collections.slug })
          .from(collections)
          .where(inArray(collections.id, bundleIds))
        : [],
    ]);

    const noteMap = new Map(noteRows.map((item) => [item.id, item]));
    const bundleMap = new Map(bundleRows.map((item) => [item.id, item]));
    const total = Number(totalRows[0]?.count || 0);

    return {
      success: true,
      reports: reportRows.map((report) =>
        buildLegacyReport(report, noteMap.get(report.targetNoteId), bundleMap.get(report.targetBundleId))
      ),
      total,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error("Error fetching user reports:", error);
    return { success: false, error: error.message };
  }
}
