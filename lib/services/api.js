/**
 * API Service untuk komunikasi dengan backend
 * Centralized API calls dengan error handling dan retry logic
 * Optimized dengan request caching dan deduplication
 */

class ApiService {
  constructor() {
    this.baseURL = '/api';
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };
  }

  /**
   * Generic request method dengan error handling
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const requestKey = `${options.method || 'GET'}:${url}`;
    
    // Check untuk duplicate requests
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey);
    }

    const config = {
      ...this.defaultOptions,
      ...options,
      headers: {
        ...this.defaultOptions.headers,
        ...options.headers,
      },
    };

    // Create abort controller untuk timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, config.timeout);

    config.signal = abortController.signal;

    try {
      const promise = fetch(url, config)
        .then(async (response) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestKey);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          
          // Cache successful GET requests
          if (options.method === 'GET' && response.status === 200) {
            this.cache.set(requestKey, data);
          }

          return data;
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestKey);
          
          if (error.name === 'AbortError') {
            throw new Error('Request timeout');
          }
          throw error;
        });

      this.pendingRequests.set(requestKey, promise);
      return await promise;

    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * GET request dengan caching
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async get(endpoint, options = {}) {
    const cacheKey = `GET:${this.baseURL}${endpoint}`;
    
    // Return cached data jika available
    if (this.cache.has(cacheKey) && !options.forceRefresh) {
      return this.cache.get(cacheKey);
    }

    return this.request(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * PUT request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Streaming request untuk AI responses
   * @param {string} endpoint - Streaming endpoint
   * @param {Object} data - Request data
   * @returns {Promise<EventSource>} EventSource instance
   */
  async stream(endpoint, data) {
    const url = `${this.baseURL}${endpoint}`;
    const queryParams = new URLSearchParams(data).toString();
    const streamUrl = `${url}?${queryParams}`;

    return streamService.connect(streamUrl);
  }

  /**
   * Clear API cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default ApiService;