"use client"

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUser } from '@/hooks/useUser'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [threadId, setThreadId] = useState<string>('')
  
  const { user } = useUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Initialize or get threadId from URL
  useEffect(() => {
    const urlThreadId = searchParams.get('threadId')
    if (urlThreadId) {
      setThreadId(urlThreadId)
    } else {
      // Generate new threadId and update URL
      const newThreadId = crypto.randomUUID()
      setThreadId(newThreadId)
      router.replace(`/chat?threadId=${newThreadId}`)
    }
  }, [searchParams, router])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  // Load existing messages when threadId changes
  useEffect(() => {
    if (threadId && user) {
      loadMessages()
    }
  }, [threadId, user])

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/history/${threadId}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !user || !threadId || isStreaming) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date()
    }

    // Add both messages to state
    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInput('')
    setIsStreaming(true)

    try {
      // Send message to backend
      const response = await fetch('/api/chat', {
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

      // Start listening to stream
      const eventSource = new EventSource(`/api/stream/${threadId}`)
      eventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.delta) {
          setMessages(prev => {
            const newMessages = [...prev]
            const lastMessage = newMessages[newMessages.length - 1]
            if (lastMessage.role === 'assistant') {
              lastMessage.content += data.delta
            }
            return newMessages
          })
        }
      }

      eventSource.addEventListener('close', () => {
        setIsStreaming(false)
        eventSource.close()
      })

      eventSource.onerror = () => {
        setIsStreaming(false)
        eventSource.close()
      }

    } catch (error) {
      console.error('Failed to send message:', error)
      setIsStreaming(false)
      // Remove the empty assistant message on error
      setMessages(prev => prev.slice(0, -1))
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

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
                {message.content === '' && message.role === 'assistant' && isStreaming && (
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                  </div>
                )}
              </div>
            </div>
          ))}
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
          disabled={isStreaming}
        />
        <Button
          onClick={sendMessage}
          disabled={!input.trim() || isStreaming}
          className="self-end h-[60px] px-6 bg-blue-600 hover:bg-blue-700"
        >
          Send
        </Button>
      </div>
    </div>
  )
} 