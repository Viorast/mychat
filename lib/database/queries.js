/**
 * Database queries untuk TmaChat
 * Centralized query management untuk maintainability
 */

import { db } from './connection';

/**
 * Chat-related queries
 */
export const chatQueries = {
  // Get all chats for a user
  getUserChats: `
    SELECT id, title, "createdAt", "updatedAt", "userId"
    FROM chats 
    WHERE "userId" = $1 
    ORDER BY "updatedAt" DESC
  `,

  // Get specific chat with messages
  getChatById: `
    SELECT 
      c.*,
      json_agg(
        json_build_object(
          'id', m.id,
          'content', m.content,
          'role', m.role,
          'timestamp', m."createdAt",
          'chatId', m."chatId"
        ) ORDER BY m."createdAt" ASC
      ) as messages
    FROM chats c
    LEFT JOIN messages m ON c.id = m."chatId"
    WHERE c.id = $1
    GROUP BY c.id
  `,

  // Create new chat
  createChat: `
    INSERT INTO chats (title, "userId", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `,

  // Update chat
  updateChat: `
    UPDATE chats 
    SET title = $1, "updatedAt" = $2 
    WHERE id = $3 
    RETURNING *
  `,

  // Delete chat
  deleteChat: `
    DELETE FROM chats WHERE id = $1
  `,
};

/**
 * Message-related queries
 */
export const messageQueries = {
  // Add message to chat
  addMessage: `
    INSERT INTO messages (content, role, "chatId", "createdAt")
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `,

  // Get messages for a chat
  getChatMessages: `
    SELECT * FROM messages 
    WHERE "chatId" = $1 
    ORDER BY "createdAt" ASC
  `,
};

// Query functions
export async function getUserChats(userId) {
  const result = await db.query(chatQueries.getUserChats, [userId]);
  return result.rows;
}

export async function getChatById(chatId) {
  const result = await db.query(chatQueries.getChatById, [chatId]);
  return result.rows[0] || null;
}

export async function createChat(chatData) {
  const { title, userId, timestamp } = chatData;
  const result = await db.query(chatQueries.createChat, [
    title, 
    userId, 
    timestamp, 
    timestamp
  ]);
  return result.rows[0];
}

export async function updateChat(chatId, updateData) {
  const { title, updatedAt } = updateData;
  const result = await db.query(chatQueries.updateChat, [
    title, 
    updatedAt, 
    chatId
  ]);
  return result.rows[0];
}

export async function deleteChat(chatId) {
  await db.query(chatQueries.deleteChat, [chatId]);
}

export async function addMessage(messageData) {
  const { content, role, chatId, timestamp } = messageData;
  const result = await db.query(messageQueries.addMessage, [
    content,
    role,
    chatId,
    timestamp
  ]);
  return result.rows[0];
}