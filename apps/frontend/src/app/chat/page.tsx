import ChatLayout from '@/components/ChatLayout';
import { Suspense } from 'react';

export default function ChatRoute() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[calc(100vh-4rem)] text-white">Loading...</div>}>
      <ChatLayout />
    </Suspense>
  );
} 