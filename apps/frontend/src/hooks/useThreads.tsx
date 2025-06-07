"use client"

import { useState, useEffect, useCallback } from 'react'
import { useUser } from './useUser'
import type { Thread } from '@/types/thread'

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  const { user, isAuthenticated } = useUser()

  const fetchThreads = useCallback(async () => {
    if (!user || !isAuthenticated) return

    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/threads/${user.email}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch threads')
      }
      
      const data = await response.json()
      setThreads(data.threads || [])
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [user, isAuthenticated])

  const newThread = useCallback((threadId: string) => {
    const newThreadData: Thread = {
      thread_id: threadId,
      name: null,
      last_updated: new Date().toISOString(),
      message_count: 0,
      preview: ''
    }
    
    setThreads(prev => [newThreadData, ...prev])
  }, [])

  const renameThread = useCallback(async (threadId: string, name: string) => {
    // Optimistic update
    const previousThreads = threads
    setThreads(prev => 
      prev.map(t => 
        t.thread_id === threadId ? { ...t, name } : t
      )
    )

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/threads/${threadId}/name`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        throw new Error('Failed to rename thread')
      }
    } catch (err) {
      // Rollback on error
      setThreads(previousThreads)
      throw err
    }
  }, [threads])

  const refresh = useCallback(() => {
    fetchThreads()
  }, [fetchThreads])

  // Auto-fetch on mount and when user changes
  useEffect(() => {
    if (user && isAuthenticated) {
      fetchThreads()
    }
  }, [user, isAuthenticated, fetchThreads])

  return {
    threads,
    loading,
    error,
    refresh,
    newThread,
    renameThread
  }
} 