/**
 * Root Layout dengan Chat Provider dan Auth Provider
 */

import { ChatProvider } from '../lib/context/ChatContext';
import AuthProvider from '../components/auth/AuthProvider';
import './globals.css';

export const metadata = {
  title: 'TmaChat - AI Chat Interface',
  description: 'Modern AI Chat Interface with Real-time Streaming',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="h-screen bg-gray-50">
        <AuthProvider>
          <ChatProvider>
            {children}
          </ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
}