/**
 * Validation utilities untuk API requests
 * Memastikan input data valid dan aman
 */

/**
 * Validasi API request
 * @param {Request} request - HTTP request object
 * @returns {Object} Validation result
 */
export async function validateRequest(request) {
  try {
    // Check content type untuk POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const contentType = request.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return {
          valid: false,
          error: 'Content-Type must be application/json'
        };
      }
    }

    // TODO: Add authentication validation
    // const token = request.headers.get('authorization');
    // if (!token) {
    //   return { valid: false, error: 'Authentication required' };
    // }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: 'Request validation failed'
    };
  }
}

/**
 * Validasi chat data
 * @param {Object} data - Chat data
 * @returns {Object} Validation result
 */
export function validateChatData(data) {
  const { title, userId } = data;
  const errors = [];

  if (!title || title.trim().length === 0) {
    errors.push('Chat title is required');
  }

  if (title && title.length > 200) {
    errors.push('Chat title must be less than 200 characters');
  }

  if (!userId) {
    errors.push('User ID is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validasi message data
 * @param {Object} data - Message data
 * @returns {Object} Validation result
 */
export function validateMessageData(data) {
  const { content, role, chatId } = data;
  const errors = [];

  if (!content || content.trim().length === 0) {
    errors.push('Message content is required');
  }

  if (content && content.length > 10000) {
    errors.push('Message must be less than 10000 characters');
  }

  if (!['user', 'assistant'].includes(role)) {
    errors.push('Invalid message role');
  }

  if (!chatId) {
    errors.push('Chat ID is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize input text
 * @param {string} text - Input text
 * @returns {string} Sanitized text
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  
  return text
    .trim()
    .replace(/[<>]/g, '') // Remove < and > untuk prevent XSS
    .substring(0, 10000); // Limit length
}