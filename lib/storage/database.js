import { appDb } from '../database/app-connection.js';

/**
 * Database Storage Layer for tmachat v1.5.3
 * Adapted to user's PostgreSQL schema with soft delete support
 * 
 * Table mappings:
 * - users (with default user: 00000000-0000-0000-0000-000000000001)
 * - chats (replaces in-memory chat storage)
 * - messages (stores all chat messages)
 * - chat_groups (for future grouping feature)
 */

// Default User UUID (Rizky Kusramdani - system user)
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_GROUP_ID = '00000000-0000-0000-0000-000000000001';

class DatabaseStorage {
    constructor() {
        this.db = appDb;
    }

    // ==========================================
    // CHAT METHODS
    // ==========================================

    /**
     * Get all chats for a user (excluding soft-deleted)
     */
    async getChatsByUser(userId = DEFAULT_USER_ID) {
        const query = `
      SELECT 
        id, user_id, title, group_id,
        created_at, updated_at
      FROM chats
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `;

        try {
            const result = await this.db.query(query, [userId]);

            // Convert snake_case to camelCase for frontend compatibility
            return result.rows.map(chat => ({
                id: chat.id,
                userId: chat.user_id,
                title: chat.title,
                groupId: chat.group_id,
                createdAt: chat.created_at,
                updatedAt: chat.updated_at
            }));
        } catch (error) {
            console.error('[DatabaseStorage] getChatsByUser error:', error);
            throw error;
        }
    }

    /**
     * Get specific chat by ID
     */
    async getChatById(chatId) {
        const query = `
      SELECT 
        id, user_id, title, group_id,
        created_at, updated_at
      FROM chats
      WHERE id = $1 AND deleted_at IS NULL
    `;

        try {
            const result = await this.db.query(query, [chatId]);
            const chat = result.rows[0];

            if (!chat) return null;

            // Convert snake_case to camelCase for frontend compatibility
            return {
                id: chat.id,
                userId: chat.user_id,
                title: chat.title,
                groupId: chat.group_id,
                createdAt: chat.created_at,
                updatedAt: chat.updated_at
            };
        } catch (error) {
            console.error('[DatabaseStorage] getChatById error:', error);
            throw error;
        }
    }

    /**
     * Create new chat
     */
    async createChat(chatData) {
        const query = `
      INSERT INTO chats (user_id, title, group_id)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, title, group_id, created_at, updated_at
    `;

        const userId = chatData.userId || DEFAULT_USER_ID;
        const title = chatData.title || 'New Chat';
        const groupId = chatData.groupId || DEFAULT_GROUP_ID;

        try {
            const result = await this.db.query(query, [userId, title, groupId]);
            const chat = result.rows[0];

            console.log(`✅ Created chat: ${chat.id} - "${chat.title}"`);

            // Convert snake_case to camelCase for frontend compatibility
            return {
                id: chat.id,
                userId: chat.user_id,
                title: chat.title,
                groupId: chat.group_id,
                createdAt: chat.created_at,
                updatedAt: chat.updated_at
            };
        } catch (error) {
            console.error('[DatabaseStorage] createChat error:', error);
            throw error;
        }
    }

    /**
     * Update chat (title, group_id, etc.)
     */
    async updateChat(chatId, updates) {
        // Build dynamic update query
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (updates.title !== undefined) {
            fields.push(`title = $${paramCount++}`);
            values.push(updates.title);
        }

        if (updates.groupId !== undefined || updates.group_id !== undefined) {
            fields.push(`group_id = $${paramCount++}`);
            values.push(updates.groupId || updates.group_id);
        }

        // No updates provided
        if (fields.length === 0) {
            console.warn('[DatabaseStorage] updateChat: No updates provided');
            return await this.getChatById(chatId);
        }

        values.push(chatId);
        const query = `
      UPDATE chats 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING id, user_id, title, group_id, created_at, updated_at
    `;

        try {
            const result = await this.db.query(query, values);
            const chat = result.rows[0];

            if (!chat) return null;

            // Convert snake_case to camelCase for frontend compatibility
            return {
                id: chat.id,
                userId: chat.user_id,
                title: chat.title,
                groupId: chat.group_id,
                createdAt: chat.created_at,
                updatedAt: chat.updated_at
            };
        } catch (error) {
            console.error('[DatabaseStorage] updateChat error:', error);
            throw error;
        }
    }

    /**
     * Delete chat (soft delete)
     */
    async deleteChat(chatId) {
        const query = `
      UPDATE chats 
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
    `;

        try {
            await this.db.query(query, [chatId]);
            console.log(`🗑️  Soft deleted chat: ${chatId}`);
            return true;
        } catch (error) {
            console.error('[DatabaseStorage] deleteChat error:', error);
            throw error;
        }
    }

    // ==========================================
    // MESSAGE METHODS
    // ==========================================

    /**
     * Get all messages for a chat (excluding soft-deleted)
     */
    async getMessagesByChat(chatId) {
        const query = `
      SELECT 
        id, chat_id, role, content, image_url,
        edit_count, created_at, updated_at
      FROM messages
      WHERE chat_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC
    `;

        try {
            const result = await this.db.query(query, [chatId]);

            // Convert snake_case to camelCase for frontend compatibility
            return result.rows.map(msg => ({
                id: msg.id,
                chatId: msg.chat_id,
                role: msg.role,
                content: msg.content,
                imageUrl: msg.image_url,
                editCount: msg.edit_count,
                timestamp: msg.created_at,
                createdAt: msg.created_at,
                updatedAt: msg.updated_at
            }));
        } catch (error) {
            console.error('[DatabaseStorage] getMessagesByChat error:', error);
            throw error;
        }
    }

    /**
     * Add message to chat
     */
    async addMessageToChat(chatId, message) {
        const query = `
      INSERT INTO messages (chat_id, role, content, image_url)
      VALUES ($1, $2, $3, $4)
      RETURNING id, chat_id, role, content, image_url, 
                edit_count, created_at, updated_at
    `;

        const role = message.role || 'user';
        const content = message.content || '';
        const imageUrl = message.imageUrl || message.image_url || null;

        try {
            const result = await this.db.query(query, [chatId, role, content, imageUrl]);
            const msg = result.rows[0];

            // Convert to camelCase
            const messageWithId = {
                id: msg.id,
                chatId: msg.chat_id,
                role: msg.role,
                content: msg.content,
                imageUrl: msg.image_url,
                editCount: msg.edit_count,
                timestamp: msg.created_at,
                createdAt: msg.created_at,
                updatedAt: msg.updated_at
            };

            console.log(`💬 Added ${role} message to chat ${chatId}`);
            return messageWithId;
        } catch (error) {
            console.error('[DatabaseStorage] addMessageToChat error:', error);
            throw error;
        }
    }

    /**
     * Update message (for edit functionality)
     */
    async updateMessage(chatId, messageId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (updates.content !== undefined) {
            fields.push(`content = $${paramCount++}`);
            values.push(updates.content);
        }

        if (updates.editCount !== undefined || updates.edit_count !== undefined) {
            fields.push(`edit_count = $${paramCount++}`);
            values.push(updates.editCount || updates.edit_count);
        }

        if (fields.length === 0) {
            console.warn('[DatabaseStorage] updateMessage: No updates provided');
            return null;
        }

        values.push(messageId);
        const query = `
      UPDATE messages
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING id, chat_id, role, content, image_url,
                edit_count, created_at, updated_at
    `;

        try {
            const result = await this.db.query(query, values);
            const msg = result.rows[0];

            if (!msg) return null;

            return {
                id: msg.id,
                chatId: msg.chat_id,
                role: msg.role,
                content: msg.content,
                imageUrl: msg.image_url,
                editCount: msg.edit_count,
                timestamp: msg.created_at,
                createdAt: msg.created_at,
                updatedAt: msg.updated_at
            };
        } catch (error) {
            console.error('[DatabaseStorage] updateMessage error:', error);
            throw error;
        }
    }

    /**
     * Delete messages after a specific message (for edit flow)
     * When user edits a message, delete all subsequent messages
     */
    async deleteMessagesAfter(chatId, messageId) {
        try {
            // Get the message's timestamp
            const getMsgQuery = `
        SELECT created_at FROM messages 
        WHERE id = $1 AND deleted_at IS NULL
      `;
            const msgResult = await this.db.query(getMsgQuery, [messageId]);

            if (msgResult.rows.length === 0) {
                console.warn(`[DatabaseStorage] Message ${messageId} not found`);
                return { deleted: 0 };
            }

            const timestamp = msgResult.rows[0].created_at;

            // Soft delete all messages after this timestamp in the same chat
            const deleteQuery = `
        UPDATE messages 
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE chat_id = $1 
          AND created_at > $2 
          AND deleted_at IS NULL
      `;

            const result = await this.db.query(deleteQuery, [chatId, timestamp]);

            console.log(`🗑️  Deleted ${result.rowCount} messages after message ${messageId}`);
            return { deleted: result.rowCount };
        } catch (error) {
            console.error('[DatabaseStorage] deleteMessagesAfter error:', error);
            throw error;
        }
    }

    // ==========================================
    // SEARCH METHODS
    // ==========================================

    /**
     * Search chats by title
     */
    async searchChats(userId = DEFAULT_USER_ID, query) {
        if (!query || query.trim() === '') {
            return await this.getChatsByUser(userId);
        }

        const searchQuery = `
      SELECT 
        id, user_id, title, group_id,
        created_at, updated_at,
        CASE 
          WHEN LOWER(title) LIKE $2 THEN 2
          ELSE 1
        END as relevance
      FROM chats
      WHERE user_id = $1 
        AND deleted_at IS NULL
        AND LOWER(title) LIKE $3
      ORDER BY relevance DESC, updated_at DESC
    `;

        try {
            const lowerQuery = query.toLowerCase();
            const result = await this.db.query(searchQuery, [
                userId,
                `${lowerQuery}%`,   // Starts with (higher relevance)
                `%${lowerQuery}%`   // Contains
            ]);

            // Convert snake_case to camelCase for frontend compatibility
            return result.rows.map(chat => ({
                id: chat.id,
                userId: chat.user_id,
                title: chat.title,
                groupId: chat.group_id,
                createdAt: chat.created_at,
                updatedAt: chat.updated_at,
                relevance: chat.relevance
            }));
        } catch (error) {
            console.error('[DatabaseStorage] searchChats error:', error);
            throw error;
        }
    }

    // ==========================================
    // GROUP METHODS (Future feature)
    // ==========================================

    async getGroupsByUser(userId = DEFAULT_USER_ID) {
        const query = `
      SELECT 
        id, name, user_id, color, icon,
        order_index as "order", is_collapsed,
        created_at, updated_at
      FROM chat_groups
      WHERE (user_id = $1 OR user_id = $2) 
        AND deleted_at IS NULL
      ORDER BY order_index ASC
    `;

        try {
            const result = await this.db.query(query, [userId, DEFAULT_USER_ID]);
            return result.rows;
        } catch (error) {
            console.error('[DatabaseStorage] getGroupsByUser error:', error);
            throw error;
        }
    }

    async getGroupById(groupId) {
        const query = `
      SELECT 
        id, name, user_id, color, icon,
        order_index as "order", is_collapsed,
        created_at, updated_at
      FROM chat_groups
      WHERE id = $1 AND deleted_at IS NULL
    `;

        try {
            const result = await this.db.query(query, [groupId]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('[DatabaseStorage] getGroupById error:', error);
            throw error;
        }
    }

    async getChatsByGroup(userId = DEFAULT_USER_ID, groupId) {
        const query = `
      SELECT 
        id, user_id, title, group_id,
        created_at, updated_at
      FROM chats
      WHERE user_id = $1 
        AND group_id = $2 
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `;

        try {
            const result = await this.db.query(query, [userId, groupId]);

            // Convert snake_case to camelCase for frontend compatibility
            return result.rows.map(chat => ({
                id: chat.id,
                userId: chat.user_id,
                title: chat.title,
                groupId: chat.group_id,
                createdAt: chat.created_at,
                updatedAt: chat.updated_at
            }));
        } catch (error) {
            console.error('[DatabaseStorage] getChatsByGroup error:', error);
            throw error;
        }
    }

    async createGroup(groupData) {
        const query = `
      INSERT INTO chat_groups (name, user_id, color, icon, order_index)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, user_id, color, icon, 
                order_index as "order", is_collapsed,
                created_at, updated_at
    `;

        const userId = groupData.userId || DEFAULT_USER_ID;
        const name = groupData.name;
        const color = groupData.color || '#3B82F6';
        const icon = groupData.icon || '📁';
        const orderIndex = groupData.order ?? 0;

        try {
            const result = await this.db.query(query, [name, userId, color, icon, orderIndex]);
            return result.rows[0];
        } catch (error) {
            console.error('[DatabaseStorage] createGroup error:', error);
            throw error;
        }
    }

    async updateGroup(groupId, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (updates.name !== undefined) {
            fields.push(`name = $${paramCount++}`);
            values.push(updates.name);
        }
        if (updates.color !== undefined) {
            fields.push(`color = $${paramCount++}`);
            values.push(updates.color);
        }
        if (updates.icon !== undefined) {
            fields.push(`icon = $${paramCount++}`);
            values.push(updates.icon);
        }
        if (updates.order !== undefined) {
            fields.push(`order_index = $${paramCount++}`);
            values.push(updates.order);
        }
        if (updates.isCollapsed !== undefined || updates.is_collapsed !== undefined) {
            fields.push(`is_collapsed = $${paramCount++}`);
            values.push(updates.isCollapsed || updates.is_collapsed);
        }

        if (fields.length === 0) return null;

        values.push(groupId);
        const query = `
      UPDATE chat_groups
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING id, name, user_id, color, icon,
                order_index as "order", is_collapsed,
                created_at, updated_at
    `;

        try {
            const result = await this.db.query(query, values);
            return result.rows[0] || null;
        } catch (error) {
            console.error('[DatabaseStorage] updateGroup error:', error);
            throw error;
        }
    }

    async deleteGroup(groupId) {
        // Don't allow deleting default group
        if (groupId === DEFAULT_GROUP_ID) {
            throw new Error('Cannot delete default group');
        }

        const client = await this.db.getClient();

        try {
            await client.query('BEGIN');

            // Move all chats in this group to default group
            await client.query(
                `UPDATE chats 
         SET group_id = $1 
         WHERE group_id = $2 AND deleted_at IS NULL`,
                [DEFAULT_GROUP_ID, groupId]
            );

            // Soft delete the group
            await client.query(
                `UPDATE chat_groups 
         SET deleted_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
                [groupId]
            );

            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('[DatabaseStorage] deleteGroup error:', error);
            throw error;
        } finally {
            client.release();
        }
    }
}

// Singleton instance
let dbStorageInstance = null;

export function getDatabaseStorage() {
    if (!dbStorageInstance) {
        dbStorageInstance = new DatabaseStorage();
    }
    return dbStorageInstance;
}

export const databaseStorage = getDatabaseStorage();
export default DatabaseStorage;
