"use server";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { opportunities } from "@/db/schema";
import { parseJsonField } from "@/lib/edge-action-utils";
import { auth } from "@/lib/auth";

function serializeOpportunity(row) {
  if (!row) return null;

  return {
    ...row,
    _id: row.id,
    importantDates: parseJsonField(row.importantDates, []),
    applicationFee: parseJsonField(row.applicationFee, []),
    ageLimit: parseJsonField(row.ageLimit, {}),
    vacancyDetails: parseJsonField(row.vacancyDetails, []),
    howToApply: parseJsonField(row.howToApply, []),
    selectionProcess: parseJsonField(row.selectionProcess, []),
    importantLinks: parseJsonField(row.importantLinks, []),
    faqs: parseJsonField(row.faqs, []),
  };
}

// Inside actions/opportunity.actions.js
export async function getCategorizedOpportunities() {
  try {
    const db = getDb();
    const opportunityRows = await db.select({
      id: opportunities.id,
      title: opportunities.title,
      slug: opportunities.slug,
      category: opportunities.category,
      updatedAt: opportunities.updatedAt,
    })
      .from(opportunities)
      .where(eq(opportunities.isPublished, true))
      .orderBy(desc(opportunities.createdAt));

    // Group them into all 6 buckets
    const results = opportunityRows.filter(o => o.category === 'Result').map(serializeOpportunity);
    const admitCards = opportunityRows.filter(o => o.category === 'Admit Card').map(serializeOpportunity);
    const latestJobs = opportunityRows.filter(o => o.category === 'Latest Jobs').map(serializeOpportunity);
    const admissions = opportunityRows.filter(o => o.category === 'Admission').map(serializeOpportunity);
    const syllabuses = opportunityRows.filter(o => o.category === 'Syllabus').map(serializeOpportunity);
    const answerKeys = opportunityRows.filter(o => o.category === 'Answer Key').map(serializeOpportunity);

    return { 
      success: true, 
      data: {
        results,
        admitCards,
        latestJobs,
        admissions,
        syllabuses,
        answerKeys
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Fetch a single opportunity by its slug for the details page
export async function getOpportunityBySlug(slug) {
  try {
    const db = getDb();
    const rows = await db.select().from(opportunities)
      .where(eq(opportunities.slug, slug))
      .limit(1);
    const opportunity = rows[0];
    if (!opportunity || !opportunity.isPublished) {
      return { success: false, opportunity: null };
    }
    return { success: true, opportunity: serializeOpportunity(opportunity) };
  } catch (error) {
    return { success: false, opportunity: null };
  }
}

/**
 * 🚀 TOGGLE SAVE OPPORTUNITY
 */
export async function toggleSaveOpportunity(opportunityId) {
  const session = await auth();
  if (!session) return { success: false, error: "Please log in to save updates." };

  try {
    void opportunityId;
    return {
      success: false,
      error: "Opportunity watchlist is not configured in the current D1 schema yet.",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 🚀 FETCH USER'S WATCHLIST (WITH PAGINATION)
 */
export async function getMyWatchlist(page = 1, limit = 120) {
  const session = await auth();
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    void page;
    void limit;
    return { 
      success: true, 
      opportunities: [],
    };
  } catch(error) {
    return { success: false, error: error.message };
  }
}
