"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUser } from '@/hooks/useUser'
import { signIn } from 'next-auth/react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [threadId, setThreadId] = useState<string>('')
  
  const { user, isLoading: userLoading, isAuthenticated } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS

  // Redirect unauthenticated users
  useEffect(() => {
    if (!userLoading && !isAuthenticated) {
      signIn('google', { callbackUrl: '/chat' })
    }
  }, [userLoading, isAuthenticated])

  // Initialize or get threadId from URL
  useEffect(() => {
    if (isAuthenticated) {
      const urlThreadId = searchParams.get('threadId')
      if (urlThreadId) {
        setThreadId(urlThreadId)
      } else {
        const newThreadId = crypto.randomUUID()
        setThreadId(newThreadId)
        router.replace(`/chat?threadId=${newThreadId}`)
      }
    }
  }, [searchParams, router, isAuthenticated])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  // Helper function for loading messages
  const loadMessages = useCallback(async () => {
    if (!threadId) return
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/history/${threadId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.messages) {
          const formattedMessages = data.messages.map((msg: { msg_id: number; role: string; content: string; created_at: string }) => ({
            id: msg.msg_id.toString(),
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.created_at)
          }))
          setMessages(formattedMessages)
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }, [threadId])

  // Load existing messages when threadId and user are available
  useEffect(() => {
    if (threadId && user && isAuthenticated) {
      loadMessages()
    }
  }, [threadId, user, isAuthenticated, loadMessages])

  // NOW SAFE TO HAVE CONDITIONAL RETURNS

  // Show loading while checking authentication
  if (userLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-gray-500">Checking authentication...</div>
      </div>
    )
  }

  // Don't render chat if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-gray-500">Redirecting to sign in...</div>
      </div>
    )
  }

  const sendMessage = async () => {
    if (!input.trim() || !user || !threadId || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Send message to backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.email, // Use email as userId since id is not available in NextAuth user type
          threadId,
          content: userMessage.content,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data = await response.json()
      
      // Add assistant response to UI
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.assistant.content,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

    } catch (error) {
      console.error('Failed to send message:', error)
      // Remove the user message on error
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto p-4">
      {/* Messages area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 pr-4 mb-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white ml-auto'
                    : 'bg-gray-800 text-gray-100 mr-auto'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 text-gray-100 mr-auto max-w-[70%] p-3 rounded-lg">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="flex space-x-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type your message..."
          className="flex-1 min-h-[60px] bg-gray-900 border-gray-700 text-white resize-none"
          disabled={isLoading}
        />
        <Button
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          className="self-end h-[60px] px-6 bg-blue-600 hover:bg-blue-700"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </div>
  )
} 