'use client';

import ChatItem from './ChatItem';

export default function ChatList({ isCollapsed }) {
  // Sample chat data
  const chatGroups = [
    {
      date: 'Today',
      chats: [
        { id: 1, title: 'Sanduar Project AI Chat dengs...', time: '10:30 AM' }
      ]
    },
    {
      date: '2005-05',
      chats: [
        { id: 2, title: 'Dassin Uze Case Sistem Infor...', time: '14:20' }
      ]
    }
  ];

  if (isCollapsed) {
    return (
      <div className="py-4">
        {chatGroups.map(group => 
          group.chats.map(chat => (
            <div key={chat.id} className="flex justify-center py-2">
              <div className="w-8 h-8 bg-gray-700 rounded-lg flex items-center justify-center text-xs">
                {chat.title[0]}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="py-4">
      {chatGroups.map((group, index) => (
        <div key={index} className="mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase px-4 mb-2">
            {group.date}
          </h3>
          <div className="space-y-1">
            {group.chats.map(chat => (
              <ChatItem key={chat.id} chat={chat} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}