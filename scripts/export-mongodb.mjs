import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import crypto from "node:crypto"; // 🚀 ADDED: Required for generating UUIDs for extracted embedded docs

const SOURCE = {
  users: ["users", "user"],
  notes: ["notes", "note"],
  blogs: ["blogs", "blog", "posts"],
  collections: ["collections", "collection", "bundles", "bundle"],
  universities: ["universities", "university"],
  opportunities: ["opportunities", "opportunity", "updates", "update"],
  requests: ["requests", "request"],
  studyEvents: ["study_events", "studyevents", "studyplans", "study_plans", "roadmaps"],
  reviews: ["reviews", "review"],
  noteReviews: ["note_reviews", "notereviews"],
  blogReviews: ["blog_reviews", "blogreviews"],
  reports: ["reports", "report"],
  notifications: ["notifications", "notification"],
  userAnalytics: ["user_analytics", "useranalytics", "analytics"],
  siteAnalytics: ["site_analytics", "siteanalytics"],
  conversations: ["conversations", "conversation"],
  messages: ["messages", "message"],
  transactions: ["transactions", "transaction"],
  purchases: ["purchases", "purchase"],
  userBookmarks: ["user_bookmarks", "userbookmarks", "bookmarks", "saved_notes"],
  userFollows: ["user_follows", "userfollows", "follows"],
  collectionNotes: ["collection_notes", "collectionnotes", "bundle_notes", "bundlenotes"],
  conversationParticipants: ["conversation_participants", "conversationparticipants"],
  messageReads: ["message_reads", "messagereads"],
};

const TABLES = [
  "users", "universities", "notes", "blogs", "collections", "opportunities", "requests",
  "study_events", "conversations", "messages", "transactions", "purchases", "notifications",
  "user_analytics", "site_analytics", "note_reviews", "blog_reviews", "reports",
  "user_bookmarks", "user_follows", "collection_notes", "conversation_participants", "message_reads",
];

const NOTE_CATEGORIES = ["University", "School", "Competitive Exams", "Other"];
const OPP_CATEGORIES = ["Latest Jobs", "Admit Card", "Result", "Admission", "Syllabus", "Answer Key"];
const REQUEST_STATUSES = ["pending", "fulfilled"];
const ROLES = ["user", "admin"];
const NOTIFICATION_TYPES = ["REQUEST_FULFILLED", "FEATURED", "MILESTONE", "SYSTEM", "PURCHASE"];
const REPORT_REASONS = ["Empty Content", "Incorrect Subject", "Copyright/Plagiarism", "Poor Quality", "Spam"];
const REPORT_STATUSES = ["pending", "investigating", "resolved", "dismissed"];
const PURCHASE_TYPES = ["note", "collection"];
const TX_STATUSES = ["pending", "completed", "failed"];
const STUDY_CATEGORIES = ["University", "School", "Competitive Exams", "General"];

const DEFAULT_PAYOUT = { upiId: "", bankName: "", accountNumber: "", ifscCode: "" };
const DEFAULT_BADGES = { list: [], consistentLearner: { earnedAt: null, isActive: false } };

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { outputDir: "migration-output", outputFile: "mongodb-to-d1.sql", d1Name: "stuhive-db", truncate: true, execute: null };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === "--mongo-uri" && n) out.mongoUri = argv[++i];
    else if (a === "--mongo-db" && n) out.mongoDb = argv[++i];
    else if (a === "--output-dir" && n) out.outputDir = argv[++i];
    else if (a === "--output-file" && n) out.outputFile = argv[++i];
    else if (a === "--d1-name" && n) out.d1Name = argv[++i];
    else if (a === "--execute" && n) out.execute = argv[++i];
    else if (a === "--no-truncate") out.truncate = false;
  }

  return out;
}

const val = (obj, path, fallback = undefined) => path.split(".").reduce((x, k) => x == null ? undefined : x[k], obj) ?? fallback;
const pick = (obj, paths, fallback = undefined) => paths.map((p) => val(obj, p)).find((v) => v !== undefined && v !== null && v !== "") ?? fallback;
const arr = (v) => Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
const text = (v, fallback = "") => v == null ? fallback : String(v);
const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const bool = (v, fallback = 0) => v == null || v === "" ? fallback : (typeof v === "string" ? ["true", "1", "yes", "public", "published"].includes(v.toLowerCase()) : !!v) ? 1 : 0;
const id = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") {
    if (typeof v.toHexString === "function") return v.toHexString();
    if (v.constructor?.name === "ObjectId" && typeof v.toString === "function") return v.toString();
    if (v._id && v._id !== v) return id(v._id);
    if (v.id && v.id !== v) return id(v.id);
    if (typeof v.toString === "function") {
      const stringified = v.toString();
      if (stringified && stringified !== "[object Object]") return stringified;
    }
  }
  return String(v);
};
const ref = (obj, keys) => keys.map((k) => id(val(obj, k))).find(Boolean) ?? null;
const refs = (obj, keys) => keys.flatMap((k) => arr(val(obj, k)).map(id)).filter(Boolean);
const json = (v, fallback) => JSON.stringify(v == null || v === "" ? fallback : v);
const ts = (v, fallback = null) => {
  if (v == null || v === "") return fallback;
  if (typeof v === "number") return Math.floor(v > 1_000_000_000_000 ? v / 1000 : v);
  if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  if (typeof v === "object" && v.$date) return ts(v.$date, fallback);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : Math.floor(d.getTime() / 1000);
};
const slug = (v, fallback = "item") => String(v || fallback).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
const en = (v, allowed, fallback) => allowed.includes(v) ? v : fallback;
const sql = (v) => v == null ? "NULL" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "1" : "0") : `'${String(v).replace(/'/g, "''")}'`;
const uniq = (rows, keyFn) => Array.from(new Map(rows.map((r) => [keyFn(r), r])).values());
const add = (rows, warns, table, row, required = []) => required.every((k) => row[k] !== null && row[k] !== undefined && row[k] !== "") ? rows.push(row) : warns.push(`${table}: skipped row missing ${required.filter((k) => row[k] == null || row[k] === "").join(", ")}`);

async function loadEnvFiles() {
  const envFiles = [".env.local", ".env", ".env.example"];

  for (const envFile of envFiles) {
    const fullPath = path.resolve(process.cwd(), envFile);
    try {
      const raw = await fs.readFile(fullPath, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const equalsIndex = trimmed.indexOf("=");
        if (equalsIndex === -1) continue;
        const key = trimmed.slice(0, equalsIndex).trim();
        let value = trimmed.slice(equalsIndex + 1).trim();
        if (!key || process.env[key]) continue;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value.replace(/\\n/g, "\n");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

async function loadSource(db) {
  const list = await db.listCollections().toArray();
  const names = new Map(list.map((c) => [c.name.toLowerCase(), c.name]));
  const resolved = {};
  const data = {};

  for (const [logical, aliases] of Object.entries(SOURCE)) {
    const found = aliases.find((alias) => {
      const normalizedAlias = alias.toLowerCase();
      if (names.has(normalizedAlias)) return true;

      return list.some((collection) => {
        const normalizedName = collection.name.toLowerCase();
        return normalizedName === normalizedAlias ||
          normalizedName.endsWith(`_${normalizedAlias}`) ||
          normalizedName.endsWith(`-${normalizedAlias}`) ||
          normalizedName.includes(`_${normalizedAlias}_`) ||
          normalizedName.includes(`-${normalizedAlias}-`);
      });
    });

    if (found) {
      const normalizedAlias = found.toLowerCase();
      const directMatch = names.get(normalizedAlias);
      const fuzzyMatch = list.find((collection) => {
        const normalizedName = collection.name.toLowerCase();
        return normalizedName === normalizedAlias ||
          normalizedName.endsWith(`_${normalizedAlias}`) ||
          normalizedName.endsWith(`-${normalizedAlias}`) ||
          normalizedName.includes(`_${normalizedAlias}_`) ||
          normalizedName.includes(`-${normalizedAlias}-`);
      });
      resolved[logical] = directMatch || fuzzyMatch?.name || null;
    } else {
      resolved[logical] = null;
    }

    data[logical] = resolved[logical] ? await db.collection(resolved[logical]).find({}).toArray() : [];
  }

  return { data, resolved, collections: list.map((c) => c.name) };
}

async function dumpRawCollections(outDir, source) {
  const rawDir = path.join(outDir, "raw");
  await fs.mkdir(rawDir, { recursive: true });

  for (const [name, docs] of Object.entries(source)) {
    await fs.writeFile(path.join(rawDir, `${name}.json`), JSON.stringify(docs, null, 2), "utf8");
  }
}

function buildRows(source, warns) {
  const rows = Object.fromEntries(TABLES.map((t) => [t, []]));

  for (const u of source.users) add(rows.users, warns, "users", {
    id: id(u._id),
    name: text(pick(u, ["name", "username", "displayName"], "Unknown User")),
    email: text(pick(u, ["email", "emailAddress"], `${id(u._id)}@migration.local`)),
    password: pick(u, ["password", "passwordHash"], null),
    avatar: text(pick(u, ["avatar", "image", "profilePicture"], "")),
    avatar_key: text(pick(u, ["avatarKey", "avatar_key"], "")),
    bio: text(pick(u, ["bio"], "")),
    university: text(pick(u, ["university", "college"], "")),
    location: text(pick(u, ["location", "city"], "")),
    wallet_balance: num(pick(u, ["walletBalance", "wallet.balance"], 0)),
    pending_balance: num(pick(u, ["pendingBalance", "wallet.pendingBalance"], 0)),
    payout_schedule: json(pick(u, ["payoutSchedule"], []), []),
    payout_details: json(pick(u, ["payoutDetails", "payout"], DEFAULT_PAYOUT), DEFAULT_PAYOUT),
    is_verified_educator: bool(pick(u, ["isVerifiedEducator"], false)),
    role: en(text(pick(u, ["role"], "user")), ROLES, "user"),
    last_seen: ts(pick(u, ["lastSeen"], null)),
    show_last_seen: bool(pick(u, ["showLastSeen"], true), 1),
    note_count: num(pick(u, ["noteCount"], 0)),
    blog_count: num(pick(u, ["blogCount"], 0)),
    hive_points: num(pick(u, ["hivePoints"], 0)),
    badges: json(pick(u, ["badges"], DEFAULT_BADGES), DEFAULT_BADGES),
    created_at: ts(pick(u, ["createdAt"], null)),
    updated_at: ts(pick(u, ["updatedAt"], null)),
  }, ["id", "name", "email"]);

  const userIds = new Set(rows.users.map((r) => r.id));

  for (const n of source.notes) {
    const userId = ref(n, ["userId", "user", "uploader", "owner", "author"]);
    if (!userIds.has(userId)) { warns.push(`notes: skipped ${id(n._id) || "unknown"} because user is missing`); continue; }
    const title = text(pick(n, ["title", "name"], "Untitled Note"));
    add(rows.notes, warns, "notes", {
      id: id(n._id),
      title,
      slug: text(pick(n, ["slug"], slug(title, id(n._id)))),
      category: en(text(pick(n, ["category"], "University")), NOTE_CATEGORIES, "University"),
      is_paid: bool(pick(n, ["isPaid", "paid", "premium"], false)),
      price: num(pick(n, ["price"], 0)),
      preview_pages: num(pick(n, ["previewPages"], 3), 3),
      is_archived: bool(pick(n, ["isArchived", "archived"], false)),
      sales_count: num(pick(n, ["salesCount"], 0)),
      description: text(pick(n, ["description", "summary"], title)),
      university: text(pick(n, ["university"], "")),
      course: text(pick(n, ["course"], "")),
      subject: text(pick(n, ["subject"], "")),
      year: text(pick(n, ["year"], "")),
      file_name: text(pick(n, ["fileName", "originalFileName", "pdf.name"], `${id(n._id)}.pdf`)),
      file_type: text(pick(n, ["fileType", "mimetype", "pdf.type"], "application/pdf")),
      file_size: num(pick(n, ["fileSize", "pdf.size"], 0)),
      file_key: text(pick(n, ["fileKey", "pdf.key", "filePath", "pdf.url"], "")),
      thumbnail_key: pick(n, ["thumbnailKey", "thumbnail.key"], null),
      preview_key: pick(n, ["previewKey", "preview.key"], null),
      file_path: pick(n, ["filePath", "pdf.url"], null),
      user_id: userId,
      rating: num(pick(n, ["rating"], 0)),
      num_reviews: num(pick(n, ["numReviews"], 0)),
      download_count: num(pick(n, ["downloadCount"], 0)),
      view_count: num(pick(n, ["viewCount", "views"], 0)),
      is_featured: bool(pick(n, ["isFeatured", "featured"], false)),
      created_at: ts(pick(n, ["createdAt"], null)),
      updated_at: ts(pick(n, ["updatedAt"], null)),
    }, ["id", "title", "slug", "description", "university", "course", "subject", "year", "file_name", "file_type", "file_key", "user_id"]);
  }

  const noteIds = new Set(rows.notes.map((r) => r.id));

  for (const b of source.blogs) {
    const authorId = ref(b, ["authorId", "author", "userId", "user"]);
    if (!userIds.has(authorId)) { warns.push(`blogs: skipped ${id(b._id) || "unknown"} because author is missing`); continue; }
    const title = text(pick(b, ["title"], "Untitled Blog"));
    const content = text(pick(b, ["content", "body"], ""));
    add(rows.blogs, warns, "blogs", {
      id: id(b._id),
      title,
      summary: text(pick(b, ["summary", "excerpt"], content.slice(0, 180) || title)),
      content,
      slug: text(pick(b, ["slug"], slug(title, id(b._id)))),
      author_id: authorId,
      tags: json(pick(b, ["tags"], []), []),
      cover_image: text(pick(b, ["coverImage", "image"], "")),
      cover_image_key: text(pick(b, ["coverImageKey"], "")),
      rating: num(pick(b, ["rating"], 0)),
      num_reviews: num(pick(b, ["numReviews"], 0)),
      view_count: num(pick(b, ["viewCount", "views"], 0)),
      read_time: num(pick(b, ["readTime"], 1), 1),
      is_featured: bool(pick(b, ["isFeatured", "featured"], false)),
      created_at: ts(pick(b, ["createdAt"], null)),
      updated_at: ts(pick(b, ["updatedAt"], null)),
    }, ["id", "title", "summary", "content", "slug", "author_id"]);
  }

  const blogIds = new Set(rows.blogs.map((r) => r.id));

  for (const c of source.collections) {
    const userId = ref(c, ["userId", "user", "owner", "creator"]);
    if (!userIds.has(userId)) { warns.push(`collections: skipped ${id(c._id) || "unknown"} because user is missing`); continue; }
    const name = text(pick(c, ["name", "title"], "Untitled Collection"));
    add(rows.collections, warns, "collections", {
      id: id(c._id),
      user_id: userId,
      name,
      category: en(text(pick(c, ["category"], "University")), NOTE_CATEGORIES, "University"),
      university: text(pick(c, ["university"], "")),
      slug: text(pick(c, ["slug"], slug(name, id(c._id)))),
      visibility: en(text(pick(c, ["visibility"], bool(pick(c, ["isPublic"], false)) ? "public" : "private")), ["public", "private"], "private"),
      description: text(pick(c, ["description"], "")),
      is_premium: bool(pick(c, ["isPremium", "premium"], false)),
      price: num(pick(c, ["price"], 0)),
      is_archived: bool(pick(c, ["isArchived", "archived"], false)),
      created_at: ts(pick(c, ["createdAt"], null)),
      updated_at: ts(pick(c, ["updatedAt"], null)),
    }, ["id", "user_id", "name", "slug"]);
  }

  const collectionIds = new Set(rows.collections.map((r) => r.id));

  for (const u of source.universities) add(rows.universities, warns, "universities", {
    id: id(u._id),
    name: text(pick(u, ["name", "title"], "")),
    slug: text(pick(u, ["slug"], slug(pick(u, ["name", "title"], ""), id(u._id)))),
    description: text(pick(u, ["description"], "")),
    logo: text(pick(u, ["logo"], "")),
    cover_image: text(pick(u, ["coverImage", "cover_image"], "")),
    location: text(pick(u, ["location"], "")),
    website: text(pick(u, ["website"], "")),
    meta_title: text(pick(u, ["metaTitle", "meta_title"], "")),
    meta_description: text(pick(u, ["metaDescription", "meta_description"], "")),
    keywords: json(pick(u, ["keywords"], []), []),
    is_active: bool(pick(u, ["isActive"], true), 1),
    created_at: ts(pick(u, ["createdAt"], null)),
    updated_at: ts(pick(u, ["updatedAt"], null)),
  }, ["id", "name", "slug"]);

  for (const o of source.opportunities) {
    const title = text(pick(o, ["title"], "Untitled Opportunity"));
    add(rows.opportunities, warns, "opportunities", {
      id: id(o._id),
      title,
      slug: text(pick(o, ["slug"], slug(title, id(o._id)))),
      category: en(text(pick(o, ["category"], "Latest Jobs")), OPP_CATEGORIES, "Latest Jobs"),
      organization: text(pick(o, ["organization"], "Unknown")),
      advt_no: pick(o, ["advtNo", "advt_no"], null),
      short_description: pick(o, ["shortDescription", "short_description"], null),
      important_dates: json(pick(o, ["importantDates", "important_dates"], []), []),
      application_fee: json(pick(o, ["applicationFee", "application_fee"], []), []),
      fee_mode: pick(o, ["feeMode", "fee_mode"], null),
      age_limit: json(pick(o, ["ageLimit", "age_limit"], {}), {}),
      vacancy_details: json(pick(o, ["vacancyDetails", "vacancy_details"], []), []),
      how_to_apply: json(pick(o, ["howToApply", "how_to_apply"], []), []),
      selection_process: json(pick(o, ["selectionProcess", "selection_process"], []), []),
      important_links: json(pick(o, ["importantLinks", "important_links"], []), []),
      faqs: json(pick(o, ["faqs"], []), []),
      is_published: bool(pick(o, ["isPublished", "published"], false)),
      created_at: ts(pick(o, ["createdAt"], null)),
      updated_at: ts(pick(o, ["updatedAt"], null)),
    }, ["id", "title", "slug", "category", "organization"]);
  }

  for (const r of source.requests) {
    const requesterId = ref(r, ["requesterId", "requester", "userId", "user"]);
    if (!userIds.has(requesterId)) { warns.push(`requests: skipped ${id(r._id) || "unknown"} because requester is missing`); continue; }
    const fulfilledById = ref(r, ["fulfilledById", "fulfilledBy"]);
    const fulfillmentNoteId = ref(r, ["fulfillmentNoteId", "fulfilledNote", "noteId"]);
    add(rows.requests, warns, "requests", {
      id: id(r._id),
      title: text(pick(r, ["title"], "Untitled Request")),
      description: text(pick(r, ["description"], "")),
      university: text(pick(r, ["university"], "")),
      subject: text(pick(r, ["subject"], "")),
      requester_id: requesterId,
      status: en(text(pick(r, ["status"], "pending")), REQUEST_STATUSES, "pending"),
      fulfilled_by_id: userIds.has(fulfilledById) ? fulfilledById : null,
      fulfillment_note_id: noteIds.has(fulfillmentNoteId) ? fulfillmentNoteId : null,
      created_at: ts(pick(r, ["createdAt"], null)),
    }, ["id", "title", "description", "university", "subject", "requester_id"]);
  }

  for (const e of source.studyEvents) {
    const userId = ref(e, ["userId", "user", "owner"]);
    if (!userIds.has(userId)) { warns.push(`study_events: skipped ${id(e._id) || "unknown"} because user is missing`); continue; }
    const title = text(pick(e, ["title", "name"], "Untitled Plan"));
    add(rows.study_events, warns, "study_events", {
      id: id(e._id),
      user_id: userId,
      title,
      slug: text(pick(e, ["slug"], slug(title, id(e._id)))),
      exam_date: ts(pick(e, ["examDate", "date"], null)),
      category: en(text(pick(e, ["category"], "University")), STUDY_CATEGORIES, "University"),
      resources: json(pick(e, ["resources"], []), []),
      progress: num(pick(e, ["progress"], 0)),
      is_public: bool(pick(e, ["isPublic"], false)),
      clones: num(pick(e, ["clones"], 0)),
      is_completed: bool(pick(e, ["isCompleted"], false)),
      created_at: ts(pick(e, ["createdAt"], null)),
      updated_at: ts(pick(e, ["updatedAt"], null)),
    }, ["id", "user_id", "title", "slug", "exam_date"]);
  }

  for (const c of source.conversations) add(rows.conversations, warns, "conversations", {
    id: id(c._id),
    last_message_id: ref(c, ["lastMessageId", "lastMessage"]),
    pinned_message_id: ref(c, ["pinnedMessageId", "pinnedMessage"]),
    created_at: ts(pick(c, ["createdAt"], null)),
    updated_at: ts(pick(c, ["updatedAt"], null)),
  }, ["id"]);

  const conversationIds = new Set(rows.conversations.map((r) => r.id));

  for (const m of source.messages) {
    const conversationId = ref(m, ["conversationId", "conversation"]);
    const senderId = ref(m, ["senderId", "sender", "userId", "user"]);
    if (!conversationIds.has(conversationId) || !userIds.has(senderId)) { warns.push(`messages: skipped ${id(m._id) || "unknown"} because conversation or sender is missing`); continue; }
    add(rows.messages, warns, "messages", {
      id: id(m._id),
      conversation_id: conversationId,
      sender_id: senderId,
      content: pick(m, ["content", "text"], null),
      image_url: pick(m, ["imageUrl"], null),
      file_url: pick(m, ["fileUrl"], null),
      file_name: pick(m, ["fileName"], null),
      reply_to: val(m, "replyTo") != null ? json(val(m, "replyTo"), null) : null,
      reactions: json(pick(m, ["reactions"], []), []),
      edited: bool(pick(m, ["edited"], false)),
      deleted_for_everyone: bool(pick(m, ["deletedForEveryone"], false)),
      pinned: bool(pick(m, ["pinned"], false)),
      created_at: ts(pick(m, ["createdAt"], null)),
      updated_at: ts(pick(m, ["updatedAt"], null)),
    }, ["id", "conversation_id", "sender_id"]);
  }

  const messageIds = new Set(rows.messages.map((r) => r.id));

  for (const t of source.transactions) {
    const buyerId = ref(t, ["buyerId", "buyer"]);
    const sellerId = ref(t, ["sellerId", "seller"]);
    if (!userIds.has(buyerId) || !userIds.has(sellerId)) { warns.push(`transactions: skipped ${id(t._id) || "unknown"} because buyer or seller is missing`); continue; }
    const noteId = ref(t, ["noteId", "note"]);
    const bundleId = ref(t, ["bundleId", "bundle"]);
    add(rows.transactions, warns, "transactions", {
      id: id(t._id),
      buyer_id: buyerId,
      seller_id: sellerId,
      note_id: noteIds.has(noteId) ? noteId : null,
      bundle_id: collectionIds.has(bundleId) ? bundleId : null,
      amount: num(pick(t, ["amount"], 0)),
      admin_fee: num(pick(t, ["adminFee"], 0)),
      seller_earnings: num(pick(t, ["sellerEarnings"], 0)),
      razorpay_order_id: text(pick(t, ["razorpayOrderId", "orderId"], id(t._id) || "missing-order-id")),
      razorpay_payment_id: pick(t, ["razorpayPaymentId", "paymentId"], null),
      status: en(text(pick(t, ["status"], "pending")), TX_STATUSES, "pending"),
      created_at: ts(pick(t, ["createdAt"], null)),
      updated_at: ts(pick(t, ["updatedAt"], null)),
    }, ["id", "buyer_id", "seller_id", "amount", "admin_fee", "seller_earnings", "razorpay_order_id"]);
  }

  for (const p of source.purchases) {
    const userId = ref(p, ["userId", "user"]);
    if (!userIds.has(userId)) { warns.push(`purchases: skipped ${id(p._id) || "unknown"} because user is missing`); continue; }
    const type = text(pick(p, ["itemType", "type"], "note")) === "bundle" ? "collection" : text(pick(p, ["itemType", "type"], "note"));
    add(rows.purchases, warns, "purchases", {
      id: id(p._id),
      user_id: userId,
      item_id: text(ref(p, ["itemId", "item", "noteId", "collectionId", "bundleId"]) || ""),
      item_type: en(type, PURCHASE_TYPES, "note"),
      amount: num(pick(p, ["amount"], 0)),
      notes_snapshot: json(pick(p, ["notesSnapshot"], []), []),
      purchased_at: ts(pick(p, ["purchasedAt", "createdAt"], null)),
    }, ["id", "user_id", "item_id", "item_type", "amount"]);
  }

  for (const n of source.notifications) {
    const recipientId = ref(n, ["recipientId", "recipient", "userId", "user"]);
    if (!userIds.has(recipientId)) { warns.push(`notifications: skipped ${id(n._id) || "unknown"} because recipient is missing`); continue; }
    const actorId = ref(n, ["actorId", "actor"]);
    add(rows.notifications, warns, "notifications", {
      id: id(n._id),
      recipient_id: recipientId,
      actor_id: userIds.has(actorId) ? actorId : null,
      type: en(text(pick(n, ["type"], "SYSTEM")), NOTIFICATION_TYPES, "SYSTEM"),
      message: text(pick(n, ["message", "text"], "")),
      link: pick(n, ["link", "href"], null),
      is_read: bool(pick(n, ["isRead", "read"], false)),
      created_at: ts(pick(n, ["createdAt"], null)),
    }, ["id", "recipient_id", "type", "message"]);
  }

  for (const a of source.userAnalytics) {
    const userId = ref(a, ["userId", "user"]);
    if (!userIds.has(userId)) continue;
    add(rows.user_analytics, warns, "user_analytics", {
      id: id(a._id),
      user_id: userId,
      date: text(pick(a, ["date"], "")),
      views: num(pick(a, ["views"], 0)),
      downloads: num(pick(a, ["downloads"], 0)),
    }, ["id", "user_id", "date"]);
  }

  for (const a of source.siteAnalytics) add(rows.site_analytics, warns, "site_analytics", {
    id: id(a._id),
    path: text(pick(a, ["path"], "")),
    date: text(pick(a, ["date"], "")),
    views: num(pick(a, ["views"], 0)),
  }, ["id", "path", "date"]);

  // =========================================================================
  // 🚀 FIX: EXTRACT EMBEDDED REVIEWS & PURCHASES FROM DOCUMENTS
  // =========================================================================

  // Extract embedded Note Reviews
  for (const n of source.notes) {
    const noteId = id(n._id);
    for (const r of arr(val(n, "reviews"))) {
      const userId = ref(r, ["user", "userId", "author"]);
      if (userIds.has(userId) && noteIds.has(noteId)) {
        rows.note_reviews.push({
          id: id(r._id) || crypto.randomUUID(),
          note_id: noteId,
          user_id: userId,
          rating: num(pick(r, ["rating"], 0)),
          comment: text(pick(r, ["comment", "text"], "")),
          parent_review_id: ref(r, ["parentReviewId", "parent"]),
          created_at: ts(pick(r, ["createdAt"], null))
        });
      }
    }
  }

  // Extract embedded Blog Reviews
  for (const b of source.blogs) {
    const blogId = id(b._id);
    for (const r of arr(val(b, "reviews"))) {
      const userId = ref(r, ["user", "userId", "author"]);
      if (userIds.has(userId) && blogIds.has(blogId)) {
        rows.blog_reviews.push({
          id: id(r._id) || crypto.randomUUID(),
          blog_id: blogId,
          user_id: userId,
          rating: num(pick(r, ["rating"], 0)),
          comment: text(pick(r, ["comment", "text"], "")),
          parent_review_id: ref(r, ["parentReviewId", "parent"]),
          created_at: ts(pick(r, ["createdAt"], null))
        });
      }
    }
  }

  // Extract embedded Purchases from Users
  const embeddedPurchases = [];
  for (const u of source.users) {
    const userId = id(u._id);
    if (!userIds.has(userId)) continue;

    // Purchased Notes
    for (const noteId of refs(u, ["purchasedNotes"])) {
      if (noteIds.has(noteId)) {
         embeddedPurchases.push({
           id: crypto.randomUUID(),
           user_id: userId,
           item_id: noteId,
           item_type: "note",
           amount: 0,
           notes_snapshot: "[]",
           purchased_at: ts(pick(u, ["updatedAt", "createdAt"], null))
         });
      }
    }

    // Purchased Bundles
    for (const b of arr(val(u, "purchasedBundles"))) {
      const bundleId = id(val(b, "bundle"));
      if (bundleId && collectionIds.has(bundleId)) {
         embeddedPurchases.push({
           id: id(b._id) || crypto.randomUUID(),
           user_id: userId,
           item_id: bundleId,
           item_type: "collection",
           amount: 0,
           notes_snapshot: json(val(b, "notesSnapshot"), []),
           purchased_at: ts(pick(b, ["purchasedAt", "createdAt"], pick(u, ["updatedAt", "createdAt"], null)))
         });
      }
    }
  }
  // Add extracted purchases to the rows array
  rows.purchases.push(...uniq(embeddedPurchases, (r) => `${r.user_id}:${r.item_id}`));

  // =========================================================================

  const genericNoteReviews = source.reviews.filter((r) => ref(r, ["noteId", "note"]) || text(pick(r, ["targetType", "onModel"], "")).toLowerCase() === "note");
  const genericBlogReviews = source.reviews.filter((r) => ref(r, ["blogId", "blog"]) || text(pick(r, ["targetType", "onModel"], "")).toLowerCase() === "blog");

  for (const r of [...source.noteReviews, ...genericNoteReviews]) {
    const noteId = ref(r, ["noteId", "note"]);
    const userId = ref(r, ["userId", "user", "authorId", "author"]);
    if (!noteIds.has(noteId) || !userIds.has(userId)) continue;
    add(rows.note_reviews, warns, "note_reviews", {
      id: id(r._id),
      note_id: noteId,
      user_id: userId,
      rating: num(pick(r, ["rating"], 0)),
      comment: text(pick(r, ["comment", "text"], "")),
      parent_review_id: ref(r, ["parentReviewId", "parent"]),
      created_at: ts(pick(r, ["createdAt"], null)),
    }, ["id", "note_id", "user_id", "comment"]);
  }

  for (const r of [...source.blogReviews, ...genericBlogReviews]) {
    const blogId = ref(r, ["blogId", "blog"]);
    const userId = ref(r, ["userId", "user", "authorId", "author"]);
    if (!blogIds.has(blogId) || !userIds.has(userId)) continue;
    add(rows.blog_reviews, warns, "blog_reviews", {
      id: id(r._id),
      blog_id: blogId,
      user_id: userId,
      rating: num(pick(r, ["rating"], 0)),
      comment: text(pick(r, ["comment", "text"], "")),
      parent_review_id: ref(r, ["parentReviewId", "parent"]),
      created_at: ts(pick(r, ["createdAt"], null)),
    }, ["id", "blog_id", "user_id", "comment"]);
  }

  for (const r of source.reports) {
    const reporterId = ref(r, ["reporterId", "reporter", "userId", "user"]);
    if (!userIds.has(reporterId)) continue;
    const targetNoteId = ref(r, ["targetNoteId", "noteId", "note"]);
    const targetBundleId = ref(r, ["targetBundleId", "bundleId", "collectionId", "bundle", "collection"]);
    add(rows.reports, warns, "reports", {
      id: id(r._id),
      reporter_id: reporterId,
      target_note_id: noteIds.has(targetNoteId) ? targetNoteId : null,
      target_bundle_id: collectionIds.has(targetBundleId) ? targetBundleId : null,
      reason: en(text(pick(r, ["reason"], "Poor Quality")), REPORT_REASONS, "Poor Quality"),
      details: text(pick(r, ["details", "description"], "")),
      status: en(text(pick(r, ["status"], "pending")), REPORT_STATUSES, "pending"),
      created_at: ts(pick(r, ["createdAt"], null)),
      updated_at: ts(pick(r, ["updatedAt"], null)),
    }, ["id", "reporter_id", "reason", "details"]);
  }

  const bookmarkRows = [];
  for (const b of source.userBookmarks) {
    const userId = ref(b, ["userId", "user"]);
    const noteId = ref(b, ["noteId", "note"]);
    if (userIds.has(userId) && noteIds.has(noteId)) bookmarkRows.push({ user_id: userId, note_id: noteId, created_at: ts(pick(b, ["createdAt"], null)) });
  }
  for (const u of source.users) for (const noteId of refs(u, ["savedNotes", "bookmarks"])) if (userIds.has(id(u._id)) && noteIds.has(noteId)) bookmarkRows.push({ user_id: id(u._id), note_id: noteId, created_at: ts(pick(u, ["updatedAt", "createdAt"], null)) });
  rows.user_bookmarks.push(...uniq(bookmarkRows, (r) => `${r.user_id}:${r.note_id}`));

  const followRows = [];
  for (const f of source.userFollows) {
    const followerId = ref(f, ["followerId", "follower"]);
    const followingId = ref(f, ["followingId", "following"]);
    if (userIds.has(followerId) && userIds.has(followingId) && followerId !== followingId) followRows.push({ follower_id: followerId, following_id: followingId, created_at: ts(pick(f, ["createdAt"], null)) });
  }
  for (const u of source.users) for (const followingId of refs(u, ["following"])) if (userIds.has(id(u._id)) && userIds.has(followingId) && id(u._id) !== followingId) followRows.push({ follower_id: id(u._id), following_id: followingId, created_at: ts(pick(u, ["updatedAt", "createdAt"], null)) });
  rows.user_follows.push(...uniq(followRows, (r) => `${r.follower_id}:${r.following_id}`));

  const collectionNoteRows = [];
  for (const c of source.collectionNotes) {
    const collectionId = ref(c, ["collectionId", "collection", "bundleId", "bundle"]);
    const noteId = ref(c, ["noteId", "note"]);
    if (collectionIds.has(collectionId) && noteIds.has(noteId)) collectionNoteRows.push({ collection_id: collectionId, note_id: noteId, added_at: ts(pick(c, ["addedAt", "createdAt"], null)) });
  }
  for (const c of source.collections) for (const noteId of refs(c, ["notes", "noteIds", "items"])) if (collectionIds.has(id(c._id)) && noteIds.has(noteId)) collectionNoteRows.push({ collection_id: id(c._id), note_id: noteId, added_at: ts(pick(c, ["updatedAt", "createdAt"], null)) });
  rows.collection_notes.push(...uniq(collectionNoteRows, (r) => `${r.collection_id}:${r.note_id}`));

  const participantRows = [];
  for (const p of source.conversationParticipants) {
    const conversationId = ref(p, ["conversationId", "conversation"]);
    const userId = ref(p, ["userId", "user", "participantId", "participant"]);
    if (conversationIds.has(conversationId) && userIds.has(userId)) participantRows.push({ conversation_id: conversationId, user_id: userId });
  }
  for (const c of source.conversations) for (const userId of refs(c, ["participants", "memberIds", "members"])) if (conversationIds.has(id(c._id)) && userIds.has(userId)) participantRows.push({ conversation_id: id(c._id), user_id: userId });
  rows.conversation_participants.push(...uniq(participantRows, (r) => `${r.conversation_id}:${r.user_id}`));

  const readRows = [];
  for (const r of source.messageReads) {
    const messageId = ref(r, ["messageId", "message"]);
    const userId = ref(r, ["userId", "user"]);
    if (messageIds.has(messageId) && userIds.has(userId)) readRows.push({ message_id: messageId, user_id: userId, read_at: ts(pick(r, ["readAt", "createdAt"], null)) });
  }
  for (const m of source.messages) for (const userId of refs(m, ["readBy", "seenBy", "readers"])) if (messageIds.has(id(m._id)) && userIds.has(userId)) readRows.push({ message_id: id(m._id), user_id: userId, read_at: ts(pick(m, ["updatedAt", "createdAt"], null)) });
  rows.message_reads.push(...uniq(readRows, (r) => `${r.message_id}:${r.user_id}`));

  return rows;
}

function renderSql(rows) {
  const lines = [];
  if (args.truncate) for (const table of [...TABLES].reverse()) lines.push(`DELETE FROM ${table};`);
  for (const table of TABLES) for (const row of rows[table]) lines.push(`INSERT OR REPLACE INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.values(row).map(sql).join(", ")});`);
  return `${lines.join("\n")}\n`;
}

function buildSummary(rows, warnings, sourceMeta, sqlFile) {
  return {
    mongoCollectionsFound: sourceMeta.collections,
    aliasResolution: sourceMeta.resolved,
    insertedCounts: Object.fromEntries(TABLES.map((t) => [t, rows[t].length])),
    warnings,
    sqlFile,
    rawDumpDir: path.join(path.dirname(sqlFile), "raw"),
    executedAgainst: args.execute,
  };
}

function runWrangler(sqlFile) {
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const mode = args.execute === "remote" ? "--remote" : "--local";
  const result = spawnSync(cmd, ["wrangler", "d1", "execute", args.d1Name, "--file", sqlFile, mode], { stdio: "inherit", cwd: process.cwd(), env: process.env });
  if (result.status !== 0) throw new Error(`wrangler d1 execute failed with exit code ${result.status}`);
}

async function main() {
  await loadEnvFiles();
  const mongoUri = args.mongoUri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required. Pass --mongo-uri or set it in the environment.");

  const outputDir = path.resolve(process.cwd(), args.outputDir);
  const sqlFile = path.resolve(outputDir, args.outputFile);
  const summaryFile = path.resolve(outputDir, "mongodb-to-d1-summary.json");

  await fs.mkdir(outputDir, { recursive: true });
  await mongoose.connect(mongoUri, { dbName: args.mongoDb, serverSelectionTimeoutMS: 30000 });

  try {
    const sourceMeta = await loadSource(mongoose.connection.db);
    await dumpRawCollections(outputDir, sourceMeta.data);
    const warnings = [];
    const rows = buildRows(sourceMeta.data, warnings);
    await fs.writeFile(sqlFile, renderSql(rows), "utf8");
    await fs.writeFile(summaryFile, JSON.stringify(buildSummary(rows, warnings, sourceMeta, sqlFile), null, 2), "utf8");
    if (args.execute) runWrangler(sqlFile);

    console.log(`Wrote SQL migration to ${sqlFile}`);
    console.log(`Wrote summary to ${summaryFile}`);
    for (const table of TABLES) console.log(`- ${table}: ${rows[table].length}`);
    if (warnings.length) console.log(`Warnings: ${warnings.length}. Review ${summaryFile}.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("MongoDB to D1 migration failed.");
  console.error(error);
  process.exit(1);
});