import Chat from './Chat'

interface ChatPageProps {
  threadId: string
  onMessageSent?: () => void
}

export default function ChatPage({ threadId, onMessageSent }: ChatPageProps) {
  return <Chat threadId={threadId} onMessageSent={onMessageSent} />
} 