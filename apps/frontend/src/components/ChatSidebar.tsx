"use client"

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, RefreshCw } from 'lucide-react'
import type { Thread } from '@/types/thread'
import ChatListItem from './ChatListItem'

interface ChatSidebarProps {
  threads: Thread[]
  loading: boolean
  error: Error | null
  activeThreadId: string
  onSelect: (threadId: string) => void
  onNew: () => void
  onRename: (threadId: string, name: string) => Promise<void>
  onRefresh: () => void
}

export default function ChatSidebar({
  threads,
  loading,
  error,
  activeThreadId,
  onSelect,
  onNew,
  onRename,
  onRefresh
}: ChatSidebarProps) {
  if (error) {
    return (
      <div className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-white font-semibold">Chat History</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-red-400 mb-2">Failed to load chats</p>
            <Button 
              onClick={onRefresh}
              variant="outline" 
              size="sm"
              className="text-gray-300 border-gray-600"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">Chat History</h2>
          <Button
            onClick={onRefresh}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white p-1"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <Button 
          onClick={onNew}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-3">
            {/* Loading skeleton */}
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-800 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            <p>No chats yet</p>
            <p className="text-sm mt-1">Start a new conversation!</p>
          </div>
        ) : (
          <div className="p-2">
            {threads.map((thread) => (
              <ChatListItem
                key={thread.thread_id}
                thread={thread}
                active={thread.thread_id === activeThreadId}
                onSelect={onSelect}
                onRename={onRename}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
} 