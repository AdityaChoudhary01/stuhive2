"use server";

import { getDb } from "@/lib/db";
import { blogs, notes, studyEvents, users } from "@/db/schema";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { indexNewContent, removeContentFromIndex } from "@/lib/googleIndexing";
import { pingIndexNow } from "@/lib/indexnow";
import { parseJsonField, randomHex, slugify } from "@/lib/edge-action-utils";

const APP_URL = process.env.NEXTAUTH_URL || "https://www.stuhive.in";

function normalizeResources(value) {
  const resources = parseJsonField(value, []);
  return Array.isArray(resources) ? resources : [];
}

function normalizeBadges(value) {
  const badges = parseJsonField(value, { list: [], consistentLearner: { earnedAt: null, isActive: false } });
  if (Array.isArray(badges)) {
    return {
      list: badges,
      consistentLearner: {
        earnedAt: badges.includes("Consistent Learner") ? new Date().toISOString() : null,
        isActive: badges.includes("Consistent Learner"),
      },
    };
  }

  return {
    list: Array.isArray(badges?.list) ? badges.list : [],
    consistentLearner: {
      earnedAt: badges?.consistentLearner?.earnedAt || null,
      isActive: Boolean(badges?.consistentLearner?.isActive),
    },
  };
}

function computeProgress(resources) {
  if (!resources.length) {
    return { progress: 0, isCompleted: false };
  }

  const completed = resources.filter((item) => item.isDone).length;
  const progress = Math.round((completed / resources.length) * 100);

  return {
    progress,
    isCompleted: progress === 100,
  };
}

async function checkAndAwardBadges(userId) {
  const db = getDb();
  const planRows = await db.select({ resources: studyEvents.resources })
    .from(studyEvents)
    .where(eq(studyEvents.userId, userId));

  const completionDates = planRows.flatMap((plan) =>
    normalizeResources(plan.resources)
      .filter((resource) => resource.isDone && resource.completedAt)
      .map((resource) => new Date(resource.completedAt).toISOString().split("T")[0])
  );

  const uniqueDates = [...new Set(completionDates)].sort();
  if (uniqueDates.length < 3) return false;

  let consecutiveDays = 1;
  let hasThreeDayStreak = false;

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const current = new Date(uniqueDates[index]);
    const previous = new Date(uniqueDates[index - 1]);
    const diffDays = Math.ceil(Math.abs(current - previous) / (1000 * 60 * 60 * 24));

    consecutiveDays = diffDays === 1 ? consecutiveDays + 1 : 1;
    if (consecutiveDays >= 3) {
      hasThreeDayStreak = true;
      break;
    }
  }

  if (!hasThreeDayStreak) return false;

  const userRows = await db.select({ badges: users.badges }).from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) return false;

  const badges = normalizeBadges(user.badges);
  if (badges.consistentLearner.isActive) return false;

  if (!badges.list.includes("Consistent Learner")) {
    badges.list.push("Consistent Learner");
  }

  badges.consistentLearner = {
    earnedAt: new Date().toISOString(),
    isActive: true,
  };

  await db.update(users).set({ badges: JSON.stringify(badges) }).where(eq(users.id, userId));
  return true;
}

async function hydratePlanResources(plan) {
  const resources = normalizeResources(plan.resources);
  if (!resources.length) {
    return { ...plan, _id: plan.id, resources: [] };
  }

  const db = getDb();
  const noteIds = [...new Set(resources.filter((item) => item.resourceType === "Note").map((item) => item.resourceId))];
  const blogIds = [...new Set(resources.filter((item) => item.resourceType === "Blog").map((item) => item.resourceId))];

  const [noteRows, blogRows] = await Promise.all([
    noteIds.length
      ? db.select({ id: notes.id, slug: notes.slug, title: notes.title }).from(notes).where(inArray(notes.id, noteIds))
      : [],
    blogIds.length
      ? db.select({ id: blogs.id, slug: blogs.slug, title: blogs.title }).from(blogs).where(inArray(blogs.id, blogIds))
      : [],
  ]);

  const noteMap = new Map(noteRows.map((item) => [item.id, item]));
  const blogMap = new Map(blogRows.map((item) => [item.id, item]));

  return {
    ...plan,
    _id: plan.id,
    resources: resources.map((resource) => {
      const item = resource.resourceType === "Note"
        ? noteMap.get(resource.resourceId)
        : blogMap.get(resource.resourceId);

      return {
        ...resource,
        resourceSlug: item?.slug || resource.resourceId,
        resourceTitle: item?.title || "Unknown Resource",
        isDone: Boolean(resource.isDone),
        completedAt: resource.completedAt || null,
        estimatedTime: resource.estimatedTime || 60,
      };
    }),
  };
}

function toLegacyUser(user) {
  return user ? { ...user, _id: user.id } : null;
}

export async function createStudyEvent(userId, data) {
  try {
    const db = getDb();
    const event = {
      id: crypto.randomUUID(),
      userId,
      title: data.title,
      slug: null,
      examDate: new Date(data.examDate),
      category: data.category || "University",
      resources: JSON.stringify([]),
      progress: 0,
      isPublic: false,
      clones: 0,
      isCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(studyEvents).values(event);
    revalidatePath("/planner");
    revalidatePath("/profile");

    return {
      success: true,
      event: {
        ...event,
        _id: event.id,
        resources: [],
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function toggleStepCompletion(userId, planId, resourceId) {
  try {
    const db = getDb();
    const planRows = await db.select().from(studyEvents)
      .where(and(eq(studyEvents.id, planId), eq(studyEvents.userId, userId)))
      .limit(1);

    const plan = planRows[0];
    if (!plan) return { success: false, error: "Plan not found" };

    const resources = normalizeResources(plan.resources);
    const resourceIndex = resources.findIndex((item) => String(item.resourceId) === String(resourceId));
    if (resourceIndex === -1) return { success: false, error: "Resource not found" };

    resources[resourceIndex] = {
      ...resources[resourceIndex],
      isDone: !resources[resourceIndex].isDone,
      completedAt: !resources[resourceIndex].isDone ? new Date().toISOString() : null,
    };

    const { progress, isCompleted } = computeProgress(resources);

    await db.update(studyEvents).set({
      resources: JSON.stringify(resources),
      progress,
      isCompleted,
      updatedAt: new Date(),
    }).where(eq(studyEvents.id, planId));

    const badgeAwarded = resources[resourceIndex].isDone ? await checkAndAwardBadges(userId) : false;

    revalidatePath("/planner");
    return { success: true, badgeAwarded };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getUserStudyPlans(userId) {
  try {
    const db = getDb();
    const plans = await db.select().from(studyEvents)
      .where(and(eq(studyEvents.userId, userId), eq(studyEvents.isCompleted, false)));

    const hydratedPlans = await Promise.all(plans.sort((a, b) => new Date(a.examDate) - new Date(b.examDate)).map(hydratePlanResources));
    return { success: true, plans: hydratedPlans };
  } catch (error) {
    return { success: false, plans: [] };
  }
}

export async function getStudyPlanBySlug(slug) {
  try {
    const db = getDb();
    const rows = await db.select({
      plan: studyEvents,
      user: {
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        isVerifiedEducator: users.isVerifiedEducator,
      },
    })
      .from(studyEvents)
      .leftJoin(users, eq(studyEvents.userId, users.id))
      .where(and(eq(studyEvents.slug, slug), eq(studyEvents.isPublic, true)))
      .limit(1);

    if (!rows.length) return { success: false, plan: null };

    const hydratedPlan = await hydratePlanResources({
      ...rows[0].plan,
      user: toLegacyUser(rows[0].user),
    });

    return { success: true, plan: hydratedPlan };
  } catch (error) {
    return { success: false, plan: null };
  }
}

export async function cloneStudyPlan(userId, originalPlanId) {
  try {
    const db = getDb();
    const rows = await db.select().from(studyEvents).where(eq(studyEvents.id, originalPlanId)).limit(1);
    const original = rows[0];
    if (!original) return { success: false, error: "Original plan not found" };

    const originalResources = normalizeResources(original.resources);
    const clonedResources = originalResources.map((resource) => ({
      resourceId: resource.resourceId,
      resourceType: resource.resourceType,
      estimatedTime: resource.estimatedTime || 60,
      isDone: false,
      completedAt: null,
      addedAt: new Date().toISOString(),
    }));

    const clonedId = crypto.randomUUID();
    await db.insert(studyEvents).values({
      id: clonedId,
      userId,
      title: `Clone: ${original.title}`,
      slug: null,
      examDate: original.examDate,
      category: original.category,
      resources: JSON.stringify(clonedResources),
      progress: 0,
      isPublic: false,
      clones: 0,
      isCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.update(studyEvents).set({
      clones: (original.clones || 0) + 1,
      updatedAt: new Date(),
    }).where(eq(studyEvents.id, originalPlanId));

    revalidatePath("/planner");
    return { success: true, newId: clonedId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function togglePlanVisibility(userId, planId, makePublic) {
  try {
    const db = getDb();
    const rows = await db.select().from(studyEvents)
      .where(and(eq(studyEvents.id, planId), eq(studyEvents.userId, userId)))
      .limit(1);

    const plan = rows[0];
    if (!plan) return { success: false, error: "Plan not found" };

    let slug = plan.slug;
    if (makePublic && !slug) {
      slug = `${slugify(plan.title, "roadmap")}-${randomHex(2)}`;
    }

    await db.update(studyEvents).set({
      isPublic: makePublic,
      slug,
      updatedAt: new Date(),
    }).where(eq(studyEvents.id, planId));

    const roadmapUrl = `${APP_URL}/roadmaps/${slug}`;
    if (makePublic) {
      await indexNewContent(slug, "roadmap").catch((error) => console.error("Google Indexing Error:", error));
      await pingIndexNow(roadmapUrl);
    } else if (slug) {
      await removeContentFromIndex(slug, "roadmap").catch((error) => console.error("Google Removal Error:", error));
    }

    revalidatePath("/planner");
    revalidatePath("/roadmaps");
    return { success: true, slug, isPublic: makePublic };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getPublicStudyPlans(searchQuery = "") {
  try {
    const db = getDb();
    const conditions = [eq(studyEvents.isPublic, true)];
    if (searchQuery) {
      conditions.push(like(studyEvents.title, `%${searchQuery}%`));
    }

    const planRows = await db.select({
      plan: studyEvents,
      user: {
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        isVerifiedEducator: users.isVerifiedEducator,
      },
    })
      .from(studyEvents)
      .leftJoin(users, eq(studyEvents.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(studyEvents.clones), desc(studyEvents.createdAt));

    const hydratedPlans = await Promise.all(
      planRows.map(({ plan, user }) => hydratePlanResources({ ...plan, user: toLegacyUser(user) }))
    );

    return { success: true, plans: hydratedPlans };
  } catch (error) {
    return { success: false, plans: [] };
  }
}

export async function addResourceToPlan(userId, eventId, resourceData) {
  try {
    const db = getDb();
    const rows = await db.select().from(studyEvents)
      .where(and(eq(studyEvents.id, eventId), eq(studyEvents.userId, userId)))
      .limit(1);

    const event = rows[0];
    if (!event) return { success: false, error: "Plan not found" };

    const resources = normalizeResources(event.resources);
    if (resources.some((item) => String(item.resourceId) === String(resourceData.id))) {
      return { success: false, error: "Already in your study plan!" };
    }

    resources.push({
      resourceId: resourceData.id,
      resourceType: resourceData.type,
      estimatedTime: resourceData.estimatedTime || 60,
      isDone: false,
      completedAt: null,
      addedAt: new Date().toISOString(),
    });

    const { progress, isCompleted } = computeProgress(resources);
    await db.update(studyEvents).set({
      resources: JSON.stringify(resources),
      progress,
      isCompleted,
      updatedAt: new Date(),
    }).where(eq(studyEvents.id, eventId));

    revalidatePath("/planner");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteStudyPlan(userId, planId) {
  try {
    const db = getDb();
    const rows = await db.select().from(studyEvents)
      .where(and(eq(studyEvents.id, planId), eq(studyEvents.userId, userId)))
      .limit(1);

    const plan = rows[0];
    if (!plan) return { success: false, error: "Unauthorized" };

    await db.delete(studyEvents).where(eq(studyEvents.id, planId));
    revalidatePath("/planner");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function removeResourceFromPlan(userId, planId, resourceId) {
  try {
    const db = getDb();
    const rows = await db.select().from(studyEvents)
      .where(and(eq(studyEvents.id, planId), eq(studyEvents.userId, userId)))
      .limit(1);

    const plan = rows[0];
    if (!plan) return { success: false, error: "Plan not found" };

    const resources = normalizeResources(plan.resources).filter(
      (item) => String(item.resourceId) !== String(resourceId)
    );

    const { progress, isCompleted } = computeProgress(resources);
    await db.update(studyEvents).set({
      resources: JSON.stringify(resources),
      progress,
      isCompleted,
      updatedAt: new Date(),
    }).where(eq(studyEvents.id, planId));

    revalidatePath("/planner");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getPublicUserRoadmaps(userId, limit = 12) {
  try {
    const db = getDb();
    const roadmaps = await db.select({
      plan: studyEvents,
      user: {
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        isVerifiedEducator: users.isVerifiedEducator,
      },
    })
      .from(studyEvents)
      .leftJoin(users, eq(studyEvents.userId, users.id))
      .where(and(eq(studyEvents.userId, userId), eq(studyEvents.isPublic, true)))
      .orderBy(desc(studyEvents.createdAt))
      .limit(limit);

    const hydrated = await Promise.all(
      roadmaps.map(({ plan, user }) => hydratePlanResources({ ...plan, user: toLegacyUser(user) }))
    );

    return hydrated.map((plan) => ({
      ...plan,
      createdAt: plan.createdAt ? new Date(plan.createdAt).toISOString() : null,
      updatedAt: plan.updatedAt ? new Date(plan.updatedAt).toISOString() : null,
    }));
  } catch (error) {
    console.error("Error fetching public roadmaps:", error);
    return [];
  }
}
