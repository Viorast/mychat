'use client';

import { useRouter } from 'next/navigation';

export default function ChatItem({ chat }) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/chat/${chat.id}`);
  };

  const handleDropdownClick = (e) => {
    e.stopPropagation(); // supaya klik dropdown tidak trigger parent button
    console.log('Dropdown clicked');
  };

  return (
    <button
      onClick={handleClick}
      className="w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {chat.title}
          </p>
          <p className="text-xs text-gray-400 mt-1">{chat.time}</p>
        </div>
        <div
          onClick={handleDropdownClick}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-all cursor-pointer"
        >
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </button>
  );
}
