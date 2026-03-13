// components/about/PlatformStats.jsx
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notes, users } from "@/db/schema";

// 🚀 This component does the heavy lifting
export default async function PlatformStats() {
  // Fetch stats in parallel to save time
  const db = getDb();
  const [userCountRows, noteCountRows] = await Promise.all([
    db.select({ count: sql`count(*)` }).from(users),
    db.select({ count: sql`count(*)` }).from(notes)
  ]);
  const userCount = Number(userCountRows[0]?.count || 0);
  const noteCount = Number(noteCountRows[0]?.count || 0);

  return (
    <div className="flex gap-8 justify-center">
       <div className="p-6 bg-secondary/10 rounded-xl border border-border">
          <h3 className="text-3xl font-black text-cyan-400">{userCount}+</h3>
          <p className="text-muted-foreground uppercase text-xs">Students</p>
       </div>
       <div className="p-6 bg-secondary/10 rounded-xl border border-border">
          <h3 className="text-3xl font-black text-pink-400">{noteCount}+</h3>
          <p className="text-muted-foreground uppercase text-xs">Notes Shared</p>
       </div>
    </div>
  );
}
