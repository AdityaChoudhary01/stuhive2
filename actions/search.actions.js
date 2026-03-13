"use server";

import { getDb } from "@/lib/db";
import { blogs, notes, users } from "@/db/schema";
import { eq, like, or } from "drizzle-orm";
import { makeContainsPattern, parseJsonField } from "@/lib/edge-action-utils";

export async function performGlobalSearch(query) {
  if (!query) return { notes: [], blogs: [], users: [] };

  try {
    const db = getDb();
    const pattern = makeContainsPattern(query);

    const [noteRows, blogRows, userRows] = await Promise.all([
      db.select({
        note: {
          id: notes.id,
          title: notes.title,
          slug: notes.slug,
          subject: notes.subject,
          course: notes.course,
          university: notes.university,
          fileType: notes.fileType,
          thumbnailKey: notes.thumbnailKey,
          fileKey: notes.fileKey,
          rating: notes.rating,
          numReviews: notes.numReviews,
          viewCount: notes.viewCount,
          downloadCount: notes.downloadCount,
          createdAt: notes.createdAt,
        },
        user: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          role: users.role,
          isVerifiedEducator: users.isVerifiedEducator,
        },
      })
        .from(notes)
        .leftJoin(users, eq(users.id, notes.userId))
        .where(or(like(notes.title, pattern), like(notes.subject, pattern), like(notes.course, pattern)))
        .limit(6),
      db.select({
        blog: {
          id: blogs.id,
          title: blogs.title,
          slug: blogs.slug,
          summary: blogs.summary,
          coverImage: blogs.coverImage,
          tags: blogs.tags,
          rating: blogs.rating,
          numReviews: blogs.numReviews,
          createdAt: blogs.createdAt,
          viewCount: blogs.viewCount,
          readTime: blogs.readTime,
        },
        author: {
          id: users.id,
          name: users.name,
          avatar: users.avatar,
          role: users.role,
          isVerifiedEducator: users.isVerifiedEducator,
        },
      })
        .from(blogs)
        .leftJoin(users, eq(users.id, blogs.authorId))
        .where(or(like(blogs.title, pattern), like(blogs.summary, pattern), like(blogs.tags, pattern)))
        .limit(6),
      db.select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        role: users.role,
        noteCount: users.noteCount,
        blogCount: users.blogCount,
        isVerifiedEducator: users.isVerifiedEducator,
      })
        .from(users)
        .where(or(like(users.name, pattern), like(users.role, pattern)))
        .limit(6),
    ]);

    return {
      notes: noteRows.map(({ note, user }) => ({
        ...note,
        _id: note.id,
        user: user ? { ...user, _id: user.id } : null,
        uploadDate: note.createdAt ? new Date(note.createdAt).toISOString() : new Date().toISOString(),
      })),
      blogs: blogRows.map(({ blog, author }) => ({
        ...blog,
        _id: blog.id,
        author: author ? { ...author, _id: author.id } : null,
        tags: parseJsonField(blog.tags, []),
        createdAt: blog.createdAt ? new Date(blog.createdAt).toISOString() : new Date().toISOString(),
      })),
      users: userRows.map((user) => ({
        ...user,
        _id: user.id,
      })),
    };
  } catch (error) {
    console.error("Global search error:", error);
    return { notes: [], blogs: [], users: [] };
  }
}
