"use server";

import { getDb } from "@/lib/db";
import { blogs, notes, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { parseJsonField } from "@/lib/edge-action-utils";

export async function getHomeData() {
  try {
    const db = getDb();

    const [noteCountRows, userCountRows, downloadRows, blogRows] = await Promise.all([
      db.select({ count: sql`count(*)` }).from(notes),
      db.select({ count: sql`count(*)` }).from(users),
      db.select({ total: sql`sum(${notes.downloadCount})` }).from(notes),
      db.select({
        blog: blogs,
        author: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          role: users.role,
        },
      })
        .from(blogs)
        .leftJoin(users, eq(blogs.authorId, users.id))
        .orderBy(desc(blogs.createdAt))
        .limit(3),
    ]);

    return {
      stats: {
        totalNotes: Number(noteCountRows[0]?.count || 0),
        totalUsers: Number(userCountRows[0]?.count || 0),
        totalDownloads: Number(downloadRows[0]?.total || 0),
      },
      blogs: blogRows.map(({ blog, author }) => ({
        ...blog,
        _id: blog.id,
        author: author ? { ...author, _id: author.id } : null,
        summary: blog.summary || blog.excerpt || "",
        coverImage: blog.coverImage || null,
        tags: parseJsonField(blog.tags, []),
        rating: blog.rating || 0,
        numReviews: blog.numReviews || 0,
        viewCount: blog.viewCount || 0,
        createdAt: blog.createdAt ? new Date(blog.createdAt).toISOString() : new Date().toISOString(),
      })),
    };
  } catch (error) {
    console.error("Failed to fetch home data:", error);
    return {
      stats: { totalNotes: 0, totalUsers: 0, totalDownloads: 0 },
      blogs: [],
    };
  }
}
