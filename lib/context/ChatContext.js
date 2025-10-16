/**
 * Enhanced Chat Context dengan Sidebar State
 * Menambahkan state management untuk sidebar collapsible
 */
'use client';

import React, { createContext, useReducer, useContext, useCallback } from 'react';

// Initial state dengan sidebar state
const initialState = {
  chats: [],
  activeChat: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  error: null,
  // ✅ NEW: Sidebar state
  sidebarOpen: true,
};

// Action types
const ACTION_TYPES = {
  SET_LOADING: 'SET_LOADING',
  SET_STREAMING: 'SET_STREAMING',
  SET_CHATS: 'SET_CHATS',
  SET_ACTIVE_CHAT: 'SET_ACTIVE_CHAT',
  SET_MESSAGES: 'SET_MESSAGES',
  ADD_MESSAGE: 'ADD_MESSAGE',
  UPDATE_MESSAGE: 'UPDATE_MESSAGE',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  // ✅ NEW: Sidebar actions
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
  SET_SIDEBAR_OPEN: 'SET_SIDEBAR_OPEN',
};

// Reducer function
function chatReducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
        error: action.payload ? state.error : null,
      };

    case ACTION_TYPES.SET_STREAMING:
      return {
        ...state,
        isStreaming: action.payload,
      };

    case ACTION_TYPES.SET_CHATS:
      return {
        ...state,
        chats: action.payload,
        error: null,
      };

    case ACTION_TYPES.SET_ACTIVE_CHAT:
      return {
        ...state,
        activeChat: action.payload,
        error: null,
      };

    case ACTION_TYPES.SET_MESSAGES:
      return {
        ...state,
        messages: action.payload,
        error: null,
      };

    case ACTION_TYPES.ADD_MESSAGE:
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };

    case ACTION_TYPES.UPDATE_MESSAGE:
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.id 
            ? { ...msg, ...action.payload.updates }
            : msg
        ),
      };

    case ACTION_TYPES.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
        isStreaming: false,
      };

    case ACTION_TYPES.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    // ✅ NEW: Sidebar reducers
    case ACTION_TYPES.TOGGLE_SIDEBAR:
      return {
        ...state,
        sidebarOpen: !state.sidebarOpen,
      };

    case ACTION_TYPES.SET_SIDEBAR_OPEN:
      return {
        ...state,
        sidebarOpen: action.payload,
      };

    default:
      return state;
  }
}

// Create context
const ChatContext = createContext();

/**
 * Chat Provider Component
 */
export function ChatProvider({ children }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  // Action creators
  const actions = {
    setLoading: useCallback((loading) => 
      dispatch({ type: ACTION_TYPES.SET_LOADING, payload: loading }), []),

    setStreaming: useCallback((streaming) => 
      dispatch({ type: ACTION_TYPES.SET_STREAMING, payload: streaming }), []),

    setChats: useCallback((chats) => 
      dispatch({ type: ACTION_TYPES.SET_CHATS, payload: chats }), []),

    setActiveChat: useCallback((chat) => 
      dispatch({ type: ACTION_TYPES.SET_ACTIVE_CHAT, payload: chat }), []),

    setMessages: useCallback((messages) => 
      dispatch({ type: ACTION_TYPES.SET_MESSAGES, payload: messages }), []),

    addMessage: useCallback((message) => 
      dispatch({ type: ACTION_TYPES.ADD_MESSAGE, payload: message }), []),

    updateMessage: useCallback((id, updates) => 
      dispatch({ type: ACTION_TYPES.UPDATE_MESSAGE, payload: { id, updates } }), []),

    setError: useCallback((error) => 
      dispatch({ type: ACTION_TYPES.SET_ERROR, payload: error }), []),

    clearError: useCallback(() => 
      dispatch({ type: ACTION_TYPES.CLEAR_ERROR }), []),

    // ✅ NEW: Sidebar actions
    toggleSidebar: useCallback(() => 
      dispatch({ type: ACTION_TYPES.TOGGLE_SIDEBAR }), []),

    setSidebarOpen: useCallback((open) => 
      dispatch({ type: ACTION_TYPES.SET_SIDEBAR_OPEN, payload: open }), []),
  };

  const value = {
    ...state,
    ...actions,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export default ChatContext;