import ChatPage from '@/components/ChatPage';
import { Suspense } from 'react';

export default function Chat() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-white">Loading...</div>}>
      <ChatPage />
    </Suspense>
  );
} 