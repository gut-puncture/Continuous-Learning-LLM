"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Edit2, Check, X } from 'lucide-react'
import type { Thread } from '@/types/thread'

interface ChatListItemProps {
  thread: Thread
  active: boolean
  onSelect: (threadId: string) => void
  onRename: (threadId: string, name: string) => Promise<void>
}

export default function ChatListItem({
  thread,
  active,
  onSelect,
  onRename
}: ChatListItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(thread.name || '')
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  // Generate display name
  const displayName = thread.name || `Chat ${thread.thread_id.slice(0, 8)}`
  
  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  const handleSaveRename = async () => {
    if (!editName.trim()) {
      setRenameError('Name cannot be empty')
      return
    }

    setIsRenaming(true)
    setRenameError(null)

    try {
      await onRename(thread.thread_id, editName.trim())
      setIsEditing(false)
    } catch {
      setRenameError('Failed to rename chat')
    } finally {
      setIsRenaming(false)
    }
  }

  const handleCancelRename = () => {
    setEditName(thread.name || '')
    setIsEditing(false)
    setRenameError(null)
  }

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditName(thread.name || '')
    setIsEditing(true)
    setRenameError(null)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename()
    } else if (e.key === 'Escape') {
      handleCancelRename()
    }
  }

  return (
    <div
      className={`group relative p-3 rounded-lg cursor-pointer transition-colors ${
        active 
          ? 'bg-blue-600/20 border border-blue-500/30' 
          : 'hover:bg-gray-800 border border-transparent'
      }`}
      onClick={() => !isEditing && onSelect(thread.thread_id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={handleKeyPress}
                className="text-sm bg-gray-800 border-gray-600 text-white"
                placeholder="Enter chat name..."
                autoFocus
                disabled={isRenaming}
              />
              {renameError && (
                <p className="text-xs text-red-400">{renameError}</p>
              )}
              <div className="flex gap-1">
                <Button
                  onClick={handleSaveRename}
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                  disabled={isRenaming}
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  onClick={handleCancelRename}
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                  disabled={isRenaming}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-medium truncate ${
                  active ? 'text-white' : 'text-gray-200'
                }`}>
                  {displayName}
                </h3>
                <Button
                  onClick={handleStartEdit}
                  size="sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-gray-400 hover:text-white transition-opacity"
                >
                  <Edit2 className="w-3 h-3" />
                </Button>
              </div>
              
              {thread.preview && (
                <p className="text-xs text-gray-400 truncate mt-1">
                  {thread.preview}
                </p>
              )}
              
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">
                  {formatTime(thread.last_updated)}
                </span>
                <span className="text-xs text-gray-500">
                  {thread.message_count} messages
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
} 