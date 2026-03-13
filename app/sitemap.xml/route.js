export const dynamic = "force-dynamic";


import { getDb } from "@/lib/db";
import { blogs, collections, notes, opportunities, studyEvents, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const BASE_URL = 'https://www.stuhive.in';

const formatDate = (date) => {
  try {
    return new Date(date).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
};

export async function GET() {
  try {
    const db = getDb();

    const [blogRows, noteRows, userRows, collectionRows, roadmapRows, opportunityRows] = await Promise.all([
      db.select({ slug: blogs.slug, updatedAt: blogs.updatedAt }).from(blogs).orderBy(desc(blogs.updatedAt)),
      db.select({ slug: notes.slug, id: notes.id, updatedAt: notes.updatedAt, university: notes.university }).from(notes).orderBy(desc(notes.updatedAt)),
      db.select({ id: users.id, updatedAt: users.updatedAt }).from(users).orderBy(desc(users.updatedAt)),
      db.select({ slug: collections.slug, updatedAt: collections.updatedAt }).from(collections).where(eq(collections.visibility, "public")).orderBy(desc(collections.updatedAt)),
      db.select({ slug: studyEvents.slug, updatedAt: studyEvents.updatedAt }).from(studyEvents).where(eq(studyEvents.isPublic, true)).orderBy(desc(studyEvents.updatedAt)),
      db.select({ slug: opportunities.slug, updatedAt: opportunities.updatedAt }).from(opportunities).where(eq(opportunities.isPublished, true)).orderBy(desc(opportunities.updatedAt)),
    ]);

    const universityMap = new Map();
    for (const note of noteRows) {
      if (!note.university) continue;
      const existing = universityMap.get(note.university);
      if (!existing || new Date(note.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
        universityMap.set(note.university, { _id: note.university, updatedAt: note.updatedAt });
      }
    }
    const universities = [...universityMap.values()];

    // 🚀 STATIC ROUTES
    const staticRoutes = [
      "", "/about", "/contact", "/blogs", "/search", "/global-search", "/shared-collections", "/requests",
      "/login","/signup", "/roadmaps", "/updates", 
      "/donate", "/supporters", "/terms", "/privacy", "/dmca", "/hive-points",
      "/premium-purchase-policy", "/leaderboard" // 🚀 ADDED: Premium Purchase Policy Link & Leaderboard
    ].map(route => ({
      url: `${BASE_URL}${route}`,
      lastModified: new Date().toISOString(),
      priority: route === "" ? "1.0" : route === "/requests" || route === "/roadmaps" || route === "/updates" ? "0.9" : "0.5",
      changefreq: route === "/requests" || route === "/roadmaps" || route === "/updates" ? "daily" : "monthly",
    }));

    const blogPages = blogRows
      .filter(blog => blog.slug) 
      .map(blog => ({
        url: `${BASE_URL}/blogs/${blog.slug}`,
        lastModified: formatDate(blog.updatedAt),
        priority: "0.8",
        changefreq: "weekly",
      }));

    const notePages = noteRows.map(note => ({
      url: `${BASE_URL}/notes/${note.slug || note.id}`,
      lastModified: formatDate(note.updatedAt),
      priority: "0.9",
      changefreq: "daily",
    }));

    const profilePages = userRows.map(user => ({
      url: `${BASE_URL}/profile/${user.id}`,
      lastModified: formatDate(user.updatedAt),
      priority: "0.6",
      changefreq: "weekly",
    }));

    const collectionPages = collectionRows
      .filter(col => col.slug) 
      .map(col => ({
        url: `${BASE_URL}/shared-collections/${col.slug}`,
        lastModified: formatDate(col.updatedAt),
        priority: "0.8",
        changefreq: "weekly",
      }));

    const roadmapPages = roadmapRows
      .filter(rm => rm.slug)
      .map(rm => ({
        url: `${BASE_URL}/roadmaps/${rm.slug}`,
        lastModified: formatDate(rm.updatedAt),
        priority: "0.8",
        changefreq: "weekly",
      }));

    // 🚀 DYNAMIC EXAM/JOB PAGES
    const oppPages = opportunityRows
      .filter(opp => opp.slug)
      .map(opp => ({
        url: `${BASE_URL}/updates/${opp.slug}`,
        lastModified: formatDate(opp.updatedAt),
        priority: "0.9", // High priority for fresh news
        changefreq: "daily",
      }));

    const universityPages = universities.map(univ => {
      const slug = univ._id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      return {
        url: `${BASE_URL}/univ/${slug}`,
        lastModified: formatDate(univ.updatedAt),
        priority: "0.9",
        changefreq: "daily",
      };
    });

    // 🚀 MERGE EVERYTHING TOGETHER
    const allPages = [
      ...staticRoutes, 
      ...universityPages, 
      ...blogPages, 
      ...notePages, 
      ...profilePages, 
      ...collectionPages,
      ...roadmapPages,
      ...oppPages // 🚀 ADDED
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map((page) => `<url>
    <loc>${page.url}</loc>
    <lastmod>${page.lastModified}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`)
  .join("")}
</urlset>`;

    return new Response(sitemap, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Sitemap Generation Error:", error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${BASE_URL}</loc></url></urlset>`, {
      headers: { "Content-Type": "application/xml" },
    });
  }
}
