import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProfileDashboard from "@/components/profile/ProfileDashboard";
import { getUserProfile, getUserNotes, getSavedNotes } from "@/actions/user.actions";
import { getBlogsForUser } from "@/actions/blog.actions";
import { getUserCollections } from "@/actions/collection.actions";
import { getUserReports } from "@/actions/report.actions"; 

export const runtime = "edge";

// ✅ PERFORMANCE FIX: Enforces strict dynamic rendering for private routes
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dashboard | StuHive",
  description: "Manage your notes, collections, and profile.",
};

export default async function ProfilePage() {
  const session = await auth();

  if (!session) {
    redirect("/login?callbackUrl=/profile");
  }

  // 🚀 PERFORMANCE FIX: Reduced from 1000 to 120. 
  // 120 items provides exactly 10 pages (12 items per page) for the client UI.
  // This drastically speeds up DB execution, lowers memory usage, and makes the page load instantly.
  const [userProfile, userNotesRes, savedNotesRes, myBlogs, userCollections, reportsRes] = await Promise.all([
    getUserProfile(session.user.id),
    getUserNotes(session.user.id, 1, 120), 
    getSavedNotes(session.user.id, 1, 120), 
    getBlogsForUser(session.user.id),
    getUserCollections(session.user.id),
    getUserReports() 
  ]);

  if (!userProfile) {
    redirect("/login");
  }

  const fallbackDate = new Date().toISOString();
  const toIdString = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      if (typeof value._id === "string") return value._id;
      if (typeof value.id === "string") return value.id;
      if (typeof value.toString === "function") return value.toString();
    }
    return String(value);
  };

  // --- SERIALIZATION LAYER ---
  const serializedUser = {
    ...userProfile,
    _id: toIdString(userProfile._id || userProfile.id),
    avatarKey: userProfile.avatarKey || null, 
  };

  const serializedMyNotes = userNotesRes.notes.map(note => ({
    ...note,
    _id: toIdString(note._id || note.id),
    user: note.user?._id || note.user?.id ? { ...note.user, _id: toIdString(note.user._id || note.user.id) } : toIdString(note.user),
    fileKey: note.fileKey || null,          
    thumbnailKey: note.thumbnailKey || null, 
    uploadDate: note.uploadDate ? new Date(note.uploadDate).toISOString() : fallbackDate,
  }));

  const serializedSavedNotes = savedNotesRes.notes.map(note => ({
    ...note,
    _id: toIdString(note._id || note.id),
    user: note.user?._id || note.user?.id ? { ...note.user, _id: toIdString(note.user._id || note.user.id) } : toIdString(note.user),
    uploadDate: note.uploadDate ? new Date(note.uploadDate).toISOString() : fallbackDate,
  }));

  const serializedCollections = userCollections.map(col => ({
    ...col,
    _id: toIdString(col._id || col.id),
    user: col.user?._id || col.user?.id ? { ...col.user, _id: toIdString(col.user._id || col.user.id) } : toIdString(col.user),
    notes: Array.isArray(col.notes) ? col.notes.map(n => toIdString(n)) : [],
    purchasedBy: Array.isArray(col.purchasedBy) ? col.purchasedBy.map(p => toIdString(p)) : [],
    createdAt: col.createdAt ? new Date(col.createdAt).toISOString() : fallbackDate,
  }));

  const serializedMyBlogs = myBlogs.map(blog => ({
    ...blog,
    _id: toIdString(blog._id || blog.id),
    author: blog.author?._id || blog.author?.id ? toIdString(blog.author._id || blog.author.id) : toIdString(blog.author),
    coverImageKey: blog.coverImageKey || null, 
    createdAt: blog.createdAt ? new Date(blog.createdAt).toISOString() : fallbackDate,
  }));

  const serializedReports = (reportsRes.reports || []).map(report => ({
    ...report,
    _id: toIdString(report._id || report.id),
    reporter: toIdString(report.reporter),
    targetNote: report.targetNote ? { ...report.targetNote, _id: toIdString(report.targetNote._id || report.targetNote.id) } : null,
    targetBundle: report.targetBundle ? { ...report.targetBundle, _id: toIdString(report.targetBundle._id || report.targetBundle.id) } : null,
    createdAt: report.createdAt ? new Date(report.createdAt).toISOString() : fallbackDate,
  }));

  return (
    <main className="min-h-screen bg-background pt-20">
      <h1 className="sr-only">My Dashboard</h1>

      <ProfileDashboard 
        user={serializedUser} 
        initialMyNotes={serializedMyNotes} 
        initialSavedNotes={serializedSavedNotes} 
        initialMyBlogs={serializedMyBlogs} 
        initialCollections={serializedCollections}
        initialReports={serializedReports} 
      />
    </main>
  );
}
