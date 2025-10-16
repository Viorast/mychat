/**
 * Root Layout dengan Chat Provider
 */

import { ChatProvider } from '../lib/context/ChatContext';
import './globals.css';

export const metadata = {
  title: 'TmaChat - AI Chat Interface',
  description: 'Modern AI Chat Interface with Real-time Streaming',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="h-screen bg-gray-50">
        <ChatProvider>
          {children}
        </ChatProvider>
      </body>
    </html>
  );
}