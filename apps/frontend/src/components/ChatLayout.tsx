"use client"

import React, { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/hooks/useUser'
import { useThreads } from '@/hooks/useThreads'
import ChatSidebar from './ChatSidebar'
import ChatPage from './ChatPage'

export default function ChatLayout() {
  const { user, isLoading: userLoading, isAuthenticated } = useUser()
  const { threads, loading: threadsLoading, error: threadsError, refresh, newThread, renameThread } = useThreads()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get active thread ID from URL
  const activeThreadId = searchParams.get('threadId') || ''

  // Handle new thread creation
  const handleNewThread = () => {
    const newId = crypto.randomUUID()
    newThread(newId)
    router.push(`/chat?threadId=${newId}`)
  }

  // Handle thread selection
  const handleSelectThread = (threadId: string) => {
    router.push(`/chat?threadId=${threadId}`)
  }

  // Initialize thread if none exists
  useEffect(() => {
    if (isAuthenticated && !activeThreadId) {
      handleNewThread()
    }
  }, [isAuthenticated, activeThreadId])

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-gray-500">Checking authentication...</div>
      </div>
    )
  }

  // Don't render if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-gray-500">Redirecting to sign in...</div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <ChatSidebar
        threads={threads}
        loading={threadsLoading}
        error={threadsError}
        activeThreadId={activeThreadId}
        onSelect={handleSelectThread}
        onNew={handleNewThread}
        onRename={renameThread}
        onRefresh={refresh}
      />
      <div className="flex-1">
        <ChatPage threadId={activeThreadId} onMessageSent={refresh} />
      </div>
    </div>
  )
} 