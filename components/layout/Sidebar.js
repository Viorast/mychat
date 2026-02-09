'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useChat } from '../../lib/hooks/useChat';
import { useRouter, useParams } from 'next/navigation';
import Button from '../ui/Button';
import clsx from 'clsx';
import SearchBar from '../chat/SearchBar';
import GroupItem from '../chat/GroupItem';
import ChatContextMenu from '../chat/ChatContextMenu';
import RenameDialog from '../chat/RenameDialog';
import MoveToGroupDialog from '../chat/MoveToGroupDialog';
import GroupContextMenu from '../chat/GroupContextMenu';
import RenameGroupDialog from '../chat/RenameGroupDialog';
import UserMenu from '../auth/UserMenu';
import ConfirmDialog from '../ui/ConfirmDialog';

export default function Sidebar() {
  const { data: session } = useSession();
  const userId = session?.user?.id || '00000000-0000-0000-0000-000000000001';

  const {
    chats,
    activeChat,
    sidebarOpen,
    createChat,
    selectChat,
    toggleSidebar,
    setError,
    clearError,
    refreshChats,
    setActiveChat,
  } = useChat();

  const router = useRouter();
  const params = useParams();
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [groups, setGroups] = useState([]);
  const [chatsByGroup, setChatsByGroup] = useState({});
  const [searchResults, setSearchResults] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [groupContextMenu, setGroupContextMenu] = useState(null);
  const [renameDialog, setRenameDialog] = useState(null);
  const [renameGroupDialog, setRenameGroupDialog] = useState(null);
  const [moveToGroupDialog, setMoveToGroupDialog] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load groups and organize chats
  useEffect(() => {
    if (userId) {
      loadGroupsAndChats();
    }
  }, [chats, userId]);

  const loadGroupsAndChats = async () => {
    try {
      // Load groups
      const groupsRes = await fetch(`/api/groups?userId=${userId}`);
      const groupsData = await groupsRes.json();

      if (groupsData.success) {
        setGroups(groupsData.groups);

        // Organize chats by group
        const organized = {};
        groupsData.groups.forEach(group => {
          organized[group.id] = chats.filter(chat =>
            (chat.groupId || 'uncategorized') === group.id
          );
        });

        setChatsByGroup(organized);
      }
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const handleNewChat = async () => {
    if (isCreatingChat) return;

    try {
      setIsCreatingChat(true);
      clearError();

      const newChat = await createChat();

      if (newChat) {
        console.log('New chat created successfully:', newChat.id);

        if (window.innerWidth < 768) {
          toggleSidebar();
        }
      }
    } catch (error) {
      console.error('Failed to create new chat:', error);
      setError(`Failed to create new chat: ${error.message}`);
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleSearch = (results) => {
    setSearchResults(results);
  };

  const handleClearSearch = () => {
    setSearchResults(null);
  };

  // ✅ FIX Issue #2: Immediate UI refresh after rename
  const handleRename = async (updatedChat) => {
    await refreshChats?.(); // Refresh chat list
    setRenameDialog(null);

    // ✅ Update active chat if it's the one being renamed
    if (activeChat?.id === updatedChat.id) {
      setActiveChat(updatedChat);
    }
  };

  // ✅ FIX Issue #1: Proper delete handler with ConfirmDialog
  const handleDelete = async (chat) => {
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/chat/${chat.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await refreshChats?.(); // Refresh list

        // ✅ FIX: Proper navigation if deleted chat was active
        if (activeChat?.id === chat.id) {
          setActiveChat(null); // Clear active chat
          router.push('/'); // Redirect to home
        }

        setDeleteConfirm(null); // Close dialog
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete chat. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ FIX Issue #3: Move to group with create functionality
  const handleMoveToGroup = async (chat, groupId) => {
    try {
      const response = await fetch(`/api/chat/${chat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId })
      });

      if (response.ok) {
        await refreshChats?.();
        await loadGroupsAndChats(); // Reload groups
        setMoveToGroupDialog(null);
      }
    } catch (error) {
      console.error('Move to group error:', error);
    }
  };

  // ✅ FIX Issue #3: Create new group
  const handleCreateGroup = async (groupName) => {
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          userId: userId
        })
      });

      const data = await response.json();

      if (data.success) {
        await loadGroupsAndChats(); // Reload groups
        return data.group;
      }
    } catch (error) {
      console.error('Create group error:', error);
      throw error;
    }
  };

  // ✅ FIX Issue #4: Rename group
  const handleRenameGroup = async (updatedGroup) => {
    await loadGroupsAndChats();
    setRenameGroupDialog(null);
  };

  // ✅ FIX Issue #4: Delete group with ConfirmDialog
  const handleDeleteGroup = async (group) => {
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/groups/${group.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await refreshChats?.();
        await loadGroupsAndChats();
        setDeleteGroupConfirm(null); // Close dialog
      }
    } catch (error) {
      console.error('Delete group error:', error);
      alert(error.message || 'Failed to delete group');
    } finally {
      setIsDeleting(false);
    }
  };

  const displayGroups = searchResults ? [{
    id: 'search-results',
    name: 'Search Results',
    icon: '🔍'
  }] : groups;

  const displayChats = searchResults ? {
    'search-results': searchResults
  } : chatsByGroup;

  if (!sidebarOpen) {
    return (
      <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Open sidebar"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="mt-4">
          <button
            onClick={handleNewChat}
            disabled={isCreatingChat}
            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            title={isCreatingChat ? "Creating chat..." : "New chat"}
          >
            {isCreatingChat ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside className={clsx(
      "fixed top-0 left-0 h-full bg-white border-r border-gray-200 flex flex-col z-20",
      "transition-all duration-300 ease-in-out",
      sidebarOpen ? "w-75" : "w-16"
    )}>
      {/* Header */}
      <div className="p-4 h-18 border-b border-gray-200 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 ml-20">TMA CHAT</h1>
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          title="Close sidebar"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search Bar */}
      <SearchBar onSearch={handleSearch} onClear={handleClearSearch} />

      {/* New Chat Button */}
      <div className="p-4">
        <Button
          onClick={handleNewChat}
          disabled={isCreatingChat}
          className="w-full justify-center bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >
          {isCreatingChat ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Creating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New chat
            </>
          )}
        </Button>
      </div>

      {/* Chat History List with Groups */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {displayGroups.map(group => (
          <GroupItem
            key={group.id}
            group={group}
            chats={displayChats[group.id] || []}
            activeChatId={params?.id}
            onChatContextMenu={setContextMenu}
            onGroupContextMenu={setGroupContextMenu}
          />
        ))}

        {/* Empty State */}
        {chats.length === 0 && (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">No chats yet</p>
            <p className="text-gray-400 text-xs mt-1">Start a new conversation</p>
          </div>
        )}
      </div>

      {/* Chat Context Menu */}
      {contextMenu && (
        <ChatContextMenu
          chat={contextMenu.chat}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onRename={(chat) => setRenameDialog(chat)}
          onDelete={(chat) => setDeleteConfirm(chat)}
          onMoveToGroup={(chat) => setMoveToGroupDialog(chat)}
        />
      )}

      {/* Group Context Menu */}
      {groupContextMenu && (
        <GroupContextMenu
          group={groupContextMenu.group}
          position={groupContextMenu.position}
          onClose={() => setGroupContextMenu(null)}
          onRename={(group) => setRenameGroupDialog(group)}
          onDelete={(group) => setDeleteGroupConfirm(group)}
        />
      )}

      {/* Rename Chat Dialog */}
      {renameDialog && (
        <RenameDialog
          chat={renameDialog}
          onRename={handleRename}
          onCancel={() => setRenameDialog(null)}
        />
      )}

      {/* Rename Group Dialog */}
      {renameGroupDialog && (
        <RenameGroupDialog
          group={renameGroupDialog}
          onRename={handleRenameGroup}
          onCancel={() => setRenameGroupDialog(null)}
        />
      )}

      {/* Move to Group Dialog */}
      {moveToGroupDialog && (
        <MoveToGroupDialog
          chat={moveToGroupDialog}
          groups={groups}
          onMove={handleMoveToGroup}
          onCreateGroup={handleCreateGroup}
          onCancel={() => setMoveToGroupDialog(null)}
        />
      )}

      {/* Delete Chat Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Hapus Chat?"
        message={`Apakah Anda yakin ingin menghapus chat "${deleteConfirm?.title}"?`}
        confirmText="OK"
        cancelText="Batal"
        variant="danger"
        onConfirm={() => handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
        isLoading={isDeleting}
      />

      {/* Delete Group Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteGroupConfirm}
        title="Hapus Grup?"
        message={`Apakah Anda yakin ingin menghapus grup "${deleteGroupConfirm?.name}"? Semua chat akan dipindahkan ke Uncategorized.`}
        confirmText="OK"
        cancelText="Batal"
        variant="warning"
        onConfirm={() => handleDeleteGroup(deleteGroupConfirm)}
        onCancel={() => setDeleteGroupConfirm(null)}
        isLoading={isDeleting}
      />

      {/* User Profile Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <UserMenu />
        </div>
      </div>
    </aside>
  );
}