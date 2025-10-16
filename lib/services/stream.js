/**
 * Streaming Service untuk AI Responses
 * Menangani koneksi streaming real-time dari backend
 * Implementasi Server-Sent Events (SSE) dengan reconnection logic
 */

class StreamService {
  constructor() {
    this.eventSource = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
  }

  /**
   * Connect ke streaming endpoint
   * @param {string} url - Streaming endpoint URL
   * @param {Object} options - Connection options
   */
  connect(url, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Close existing connection
        this.disconnect();

        // Create new EventSource connection
        this.eventSource = new EventSource(url);
        
        // Setup event handlers
        this.eventSource.onopen = () => {
          console.log('Streaming connection established');
          this.reconnectAttempts = 0;
          resolve(this.eventSource);
        };

        this.eventSource.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.eventSource.onerror = (error) => {
          console.error('Streaming connection error:', error);
          this.handleError(error);
          reject(error);
        };

        // Set timeout untuk connection
        setTimeout(() => {
          if (this.eventSource?.readyState !== EventSource.OPEN) {
            reject(new Error('Connection timeout'));
            this.disconnect();
          }
        }, options.timeout || 10000);

      } catch (error) {
        console.error('Failed to create streaming connection:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming stream messages
   * @param {MessageEvent} event - SSE message event
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      // Trigger registered listeners
      this.emit(data.type, data);
      
      // Global message handler
      this.emit('*', data);
    } catch (error) {
      console.error('Error parsing stream message:', error);
      this.emit('error', { 
        type: 'error', 
        error: 'Failed to parse stream message' 
      });
    }
  }

  /**
   * Handle connection errors dengan reconnection logic
   * @param {Error} error - Error object
   */
  handleError(error) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      setTimeout(() => {
        if (this.eventSource) {
          this.eventSource.close();
          this.connect(this.eventSource.url);
        }
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      this.emit('error', { 
        type: 'error', 
        error: 'Max reconnection attempts reached' 
      });
      this.disconnect();
    }
  }

  /**
   * Register event listener
   * @param {string} event - Event type
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  /**
   * Remove event listener
   * @param {string} event - Event type
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit event to listeners
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in stream listener:', error);
        }
      });
    }
  }

  /**
   * Close streaming connection
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
    this.reconnectAttempts = 0;
  }

  /**
   * Check if connection is active
   */
  isConnected() {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Export singleton instance
export const streamService = new StreamService();
export default StreamService;