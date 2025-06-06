import { Suspense } from 'react'
import Chat from './Chat'

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-[calc(100vh-4rem)]">
      <div className="text-gray-500">Loading chat...</div>
    </div>}>
      <Chat />
    </Suspense>
  )
} 