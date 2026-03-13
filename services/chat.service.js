'use server';

import { getDb } from "@/lib/db";
import { 
  users, 
  conversations, 
  conversationParticipants, 
  messages, 
  messageReads 
} from "@/db/schema";
import { eq, and, or, like, desc, inArray, ne, sql } from "drizzle-orm";
import { generateUploadUrl, getR2PublicUrl } from "@/lib/r2"; 

const isValidUUID = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function searchUsersForChat(query, currentUserId) {
  if (!query) return [];

  try {
    const db = getDb();
    console.log(`🔍 Searching for: "${query}" | Excluding ID: ${currentUserId}`);

    const s = `%${query.trim()}%`;
    const fetchedUsers = await db.select({
      id: users.id,
      name: users.name,
      avatar: users.avatar
    })
    .from(users)
    .where(and(
      ne(users.id, currentUserId),
      like(users.name, s)
    ))
    .limit(8);

    console.log(`✅ Found ${fetchedUsers.length} matching users.`);

    return fetchedUsers.map(u => ({
      ...u,
      _id: u.id
    }));

  } catch (error) {
    console.error("❌ Chat user search error:", error);
    return [];
  }
}

// ===============================
// 1️⃣ GET OR CREATE CONVERSATION
// ===============================
export async function getOrCreateConversation(userA, userB) {
  const db = getDb();

  // 1. Find existing conversation between these two exact users
  const existingConvos = await db.select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(inArray(conversationParticipants.userId, [userA, userB]))
    .groupBy(conversationParticipants.conversationId)
    .having(sql`count(distinct ${conversationParticipants.userId}) = 2`);

  let convoId;

  if (existingConvos.length > 0) {
    convoId = existingConvos[0].id;
  } else {
    convoId = crypto.randomUUID();
    await db.insert(conversations).values({ id: convoId });
    await db.insert(conversationParticipants).values([
      { conversationId: convoId, userId: userA },
      { conversationId: convoId, userId: userB }
    ]);
  }

  return { _id: convoId, id: convoId };
}

// ===============================
// 🚀 GET R2 UPLOAD URL
// ===============================
export async function getChatPresignedUrl(fileName, fileType) {
  const ext = fileName.split('.').pop();
  const key = `chat/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${ext}`;
  const uploadUrl = await generateUploadUrl(key, fileType);
  const publicUrl = getR2PublicUrl(key);
  
  return { uploadUrl, publicUrl };
}

// ===============================
// 2️⃣ SEND MESSAGE 
// ===============================
export async function sendMessage({ senderId, receiverId, content, imageUrl, fileUrl, fileName, replyTo }) {
  const db = getDb();
  const convo = await getOrCreateConversation(senderId, receiverId);
  const msgId = crypto.randomUUID();
  const now = new Date();

  // Note: Drizzle handles JSON fields automatically if mode is 'json'
  await db.insert(messages).values({
    id: msgId,
    conversationId: convo.id,
    senderId: senderId,
    content: content || "",
    imageUrl,
    fileUrl,
    fileName,
    replyTo,
    createdAt: now,
    updatedAt: now
  });

  // Insert Read receipt for the sender
  await db.insert(messageReads).values({ messageId: msgId, userId: senderId });

  // Update conversation's last message
  await db.update(conversations)
    .set({ lastMessageId: msgId, updatedAt: now })
    .where(eq(conversations.id, convo.id));

  return {
    _id: msgId,
    conversationId: convo.id,
    sender: senderId,
    content: content || "",
    imageUrl,
    fileUrl,
    fileName,
    replyTo,
    createdAt: now.toISOString(),
    readBy: [senderId]
  };
}

// ===============================
// 🔹 MARK CONVERSATION READ
// ===============================
export async function markConversationRead(conversationId, userId) {
  try {
    const db = getDb();
    
    // Find all messages in this conversation not sent by this user
    const unreadMsgs = await db.select({ id: messages.id })
      .from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        ne(messages.senderId, userId)
      ));

    if (unreadMsgs.length === 0) return { success: true, updatedCount: 0 };

    let updatedCount = 0;
    
    for (const msg of unreadMsgs) {
      // Drizzle SQLite onConflictDoNothing to prevent unique constraint crashes
      try {
        await db.insert(messageReads).values({ messageId: msg.id, userId }).onConflictDoNothing();
        updatedCount++;
      } catch (e) {
        // Already read, ignore
      }
    }

    return { success: true, updatedCount };
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    return { success: false, error: error.message };
  }
}

// ===============================
// 🔹 GET CONVERSATION MESSAGES 
// ===============================
export async function getConversationWithMessages(userA, userB) {
  const db = getDb();
  const convo = await getOrCreateConversation(userA, userB);

  const msgs = await db.select()
    .from(messages)
    .where(eq(messages.conversationId, convo.id))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  if (msgs.length === 0) {
    return { conversationId: convo.id, messages: [] };
  }

  const msgIds = msgs.map(m => m.id);
  const reads = await db.select().from(messageReads).where(inArray(messageReads.messageId, msgIds));

  const formattedMessages = msgs.reverse().map(m => {
    const readByArray = reads.filter(r => r.messageId === m.id).map(r => r.userId);
    const reactionsArray = typeof m.reactions === 'string' ? JSON.parse(m.reactions) : (m.reactions || []);

    return { 
      _id: m.id,
      sender: m.senderId,
      content: m.content,
      imageUrl: m.imageUrl || null,
      fileUrl: m.fileUrl || null,
      fileName: m.fileName || null,
      replyTo: typeof m.replyTo === 'string' ? JSON.parse(m.replyTo) : m.replyTo,
      readBy: readByArray,
      edited: m.edited,
      deletedForEveryone: m.deletedForEveryone,
      reactions: reactionsArray.map(r => ({
        emoji: r.emoji,
        userId: r.userId,
        _id: r._id || crypto.randomUUID()
      })),
      createdAt: m.createdAt.toISOString()
    };
  });

  return {
    conversationId: convo.id,
    messages: formattedMessages
  };
}

export async function editMessage(messageId, newContent) {
  const db = getDb();
  await db.update(messages).set({
    content: newContent,
    edited: true,
    updatedAt: new Date()
  }).where(eq(messages.id, messageId));
}

export async function deleteMessageForEveryone(messageId) {
  const db = getDb();
  await db.update(messages).set({
    deletedForEveryone: true,
    updatedAt: new Date()
  }).where(eq(messages.id, messageId));
}

// ===============================
// 🔹 GET USER CONVERSATIONS
// ===============================
export async function getUserConversations(userId) {
  const db = getDb();

  // 1. Get all conversation IDs for this user
  const userConvos = await db.select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId));

  if (userConvos.length === 0) return [];
  const convoIds = userConvos.map(c => c.id);

  // 2. Fetch conversations with their last message
  const convos = await db.select({ 
      convo: conversations,
      lastMsg: messages
    })
    .from(conversations)
    .leftJoin(messages, eq(conversations.lastMessageId, messages.id))
    .where(inArray(conversations.id, convoIds))
    .orderBy(desc(conversations.updatedAt));

  // 3. Fetch all participants for these conversations
  const allParticipants = await db.select({
      conversationId: conversationParticipants.conversationId,
      user: { id: users.id, name: users.name, avatar: users.avatar }
    })
    .from(conversationParticipants)
    .innerJoin(users, eq(conversationParticipants.userId, users.id))
    .where(inArray(conversationParticipants.conversationId, convoIds));

  // 4. Fetch reads for the last messages to determine unread count
  const lastMsgIds = convos.map(c => c.lastMsg?.id).filter(Boolean);
  let lastMsgReads = [];
  if (lastMsgIds.length > 0) {
    lastMsgReads = await db.select().from(messageReads).where(inArray(messageReads.messageId, lastMsgIds));
  }

  return convos.map(row => {
    const convoId = row.convo.id;
    const participants = allParticipants.filter(p => p.conversationId === convoId).map(p => p.user);
    const otherUser = participants.find(p => p.id !== userId) || participants[0]; // fallback
    const lastMessage = row.lastMsg;

    let unreadCount = 0;

    if (lastMessage) {
      const isSentByMe = lastMessage.senderId === userId;
      const isRead = lastMsgReads.some(r => r.messageId === lastMessage.id && r.userId === userId);

      if (!isSentByMe && !isRead) {
        unreadCount = 1;
      }
    }

    return {
      conversationId: convoId,
      user: {
        _id: otherUser.id,
        name: otherUser.name,
        avatar: otherUser.avatar
      },
      lastMessage: lastMessage?.content || (lastMessage?.imageUrl ? "🖼️ Image" : lastMessage?.fileUrl ? "📄 Document" : ""),
      lastMessageDate: lastMessage?.createdAt || null,
      unreadCount
    };
  });
}

export async function deleteConversation(conversationId) {
  const db = getDb();

  await db.delete(messageReads).where(inArray(messageReads.messageId, 
    db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, conversationId))
  ));
  await db.delete(messages).where(eq(messages.conversationId, conversationId));
  await db.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, conversationId));
  await db.delete(conversations).where(eq(conversations.id, conversationId));

  return { success: true };
}

export async function toggleReaction(messageId, userId, emoji) {
  const db = getDb();

  const msgRows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (msgRows.length === 0) throw new Error("Message not found");
  
  const msg = msgRows[0];
  let reactions = typeof msg.reactions === 'string' ? JSON.parse(msg.reactions) : (msg.reactions || []);

  const existingIndex = reactions.findIndex(r => r.userId === userId && r.emoji === emoji);

  if (existingIndex > -1) {
    reactions.splice(existingIndex, 1);
  } else {
    reactions.push({ emoji, userId, _id: crypto.randomUUID() });
  }

  await db.update(messages).set({ reactions: JSON.stringify(reactions) }).where(eq(messages.id, messageId));

  return {
    messageId,
    reactions: reactions
  };
}

// ===============================
// 🔟 GET TOTAL UNREAD COUNT
// ===============================
export async function getUnreadCount(userId) {
  const db = getDb();

  // Find convos for user
  const userConvos = await db.select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants).where(eq(conversationParticipants.userId, userId));
  
  if (userConvos.length === 0) return 0;
  const convoIds = userConvos.map(c => c.id);

  // Get last messages of these convos where sender != userId
  const convosWithLastMsgs = await db.select({ lastMessageId: conversations.lastMessageId })
    .from(conversations)
    .where(inArray(conversations.id, convoIds));

  const lastMsgIds = convosWithLastMsgs.map(c => c.lastMessageId).filter(Boolean);
  
  if (lastMsgIds.length === 0) return 0;

  const relevantMsgs = await db.select({ id: messages.id })
    .from(messages)
    .where(and(inArray(messages.id, lastMsgIds), ne(messages.senderId, userId)));

  const relMsgIds = relevantMsgs.map(m => m.id);
  if (relMsgIds.length === 0) return 0;

  // Check how many of these are NOT read by userId
  const reads = await db.select({ messageId: messageReads.messageId })
    .from(messageReads)
    .where(and(inArray(messageReads.messageId, relMsgIds), eq(messageReads.userId, userId)));

  const readMsgIds = new Set(reads.map(r => r.messageId));
  
  let unread = 0;
  relMsgIds.forEach(id => {
    if (!readMsgIds.has(id)) unread++;
  });

  return unread;
}

// ===============================
// 🔹 GET OLDER MESSAGES
// ===============================
export async function getOlderMessages(conversationId, page = 2) {
  const MESSAGES_PER_PAGE = 20;
  const skip = (page - 1) * MESSAGES_PER_PAGE;
  const db = getDb();

  const msgs = await db.select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(MESSAGES_PER_PAGE)
    .offset(skip);

  if (msgs.length === 0) return [];

  const msgIds = msgs.map(m => m.id);
  const reads = await db.select().from(messageReads).where(inArray(messageReads.messageId, msgIds));

  return msgs.reverse().map(m => {
    const readByArray = reads.filter(r => r.messageId === m.id).map(r => r.userId);
    const reactionsArray = typeof m.reactions === 'string' ? JSON.parse(m.reactions) : (m.reactions || []);

    return {
      _id: m.id,
      sender: m.senderId,
      content: m.content,
      imageUrl: m.imageUrl || null,
      fileUrl: m.fileUrl || null,
      fileName: m.fileName || null,
      replyTo: typeof m.replyTo === 'string' ? JSON.parse(m.replyTo) : m.replyTo,
      readBy: readByArray,
      edited: m.edited,
      deletedForEveryone: m.deletedForEveryone,
      reactions: reactionsArray.map(r => ({
        emoji: r.emoji,
        userId: r.userId,
        _id: r._id || crypto.randomUUID()
      })),
      createdAt: m.createdAt.toISOString()
    };
  });
}