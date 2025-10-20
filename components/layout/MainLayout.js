// components/layout/MainLayout.js - FIXED
'use client';

import Sidebar from './Sidebar';
import { useChat } from '../../lib/hooks/useChat';
import clsx from 'clsx';

export default function MainLayout({ children }) {
  const { sidebarOpen } = useChat();

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <main className={clsx(
        "h-auto w-full transition-all duration-300 ease-in-out",
        sidebarOpen ? "ml-75" : "ml-2"
      )}>
        {children}
      </main>
    </div>
  );
}