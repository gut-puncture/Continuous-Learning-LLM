import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Chat from '../Chat'

// Mock the useUser hook to return authenticated user
jest.mock('../../hooks/useUser', () => ({
  useUser: () => ({
    user: {
      name: 'Test User',
      email: 'test@example.com',
      image: 'https://example.com/avatar.jpg',
    },
  }),
}))

describe('Chat Component', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()
    
    // Reset global mocks
    global.fetch = jest.fn()
    global.EventSource = jest.fn(() => ({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
      onmessage: null,
      onerror: null,
    }))
  })

  describe('Thread ID Management', () => {
    it('should generate new thread ID when none exists in URL', () => {
      global.__TEST_MOCKS__.searchParams.get.mockReturnValue(null)
      render(<Chat />)
      
      expect(global.__TEST_MOCKS__.router.replace).toHaveBeenCalledWith('/chat?threadId=test-uuid-123')
    })

    it('should use existing thread ID from URL', () => {
      const existingThreadId = 'existing-thread-123'
      global.__TEST_MOCKS__.searchParams.get.mockReturnValue(existingThreadId)
      
      render(<Chat />)
      
      expect(global.__TEST_MOCKS__.router.replace).not.toHaveBeenCalled()
    })
  })

  describe('Message Rendering', () => {
    beforeEach(() => {
      global.__TEST_MOCKS__.searchParams.get.mockReturnValue('test-thread-id')
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [] })
      })
    })

    it('should render empty chat initially', () => {
      render(<Chat />)
      
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    })

    it('should render message input and send button', () => {
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByRole('button', { name: 'Send' })
      
      expect(textarea).toBeInTheDocument()
      expect(sendButton).toBeInTheDocument()
      expect(sendButton).toBeDisabled() // Should be disabled when input is empty
    })
  })

  describe('Input Handling', () => {
    beforeEach(() => {
      global.__TEST_MOCKS__.searchParams.get.mockReturnValue('test-thread-id')
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [] })
      })
    })

    it('should enable send button when user types message', async () => {
      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByRole('button', { name: 'Send' })
      
      expect(sendButton).toBeDisabled()
      
      await user.type(textarea, 'Hello world')
      
      expect(sendButton).not.toBeDisabled()
    })

    it('should send message on Enter key press', async () => {
      const user = userEvent.setup()
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      expect(global.fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'test@example.com',
          threadId: 'test-thread-id',
          content: 'Test message',
        }),
      })
    })

    it('should NOT send message on Shift+Enter (should create new line)', async () => {
      const user = userEvent.setup()
      
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      // Clear any previous fetch calls (from history loading)
      jest.clearAllMocks()
      global.fetch = jest.fn()
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Shift>}{Enter}{/Shift}')
      
      // Should not call /api/chat, only /api/history might be called
      expect(global.fetch).not.toHaveBeenCalledWith('/api/chat', expect.anything())
    })

    it('should send message on Send button click', async () => {
      const user = userEvent.setup()
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByRole('button', { name: 'Send' })
      
      await user.type(textarea, 'Test message')
      await user.click(sendButton)
      
      expect(global.fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'test@example.com',
          threadId: 'test-thread-id',
          content: 'Test message',
        }),
      })
    })

    it('should clear input after sending message', async () => {
      const user = userEvent.setup()
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      expect(textarea).toHaveValue('')
    })
  })

  describe('Message Streaming', () => {
    beforeEach(() => {
      global.__TEST_MOCKS__.searchParams.get.mockReturnValue('test-thread-id')
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [] })
      })
    })

    it('should create EventSource for streaming when message is sent', async () => {
      const user = userEvent.setup()
      const mockEventSource = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        close: jest.fn(),
        onmessage: null,
        onerror: null,
      }
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })
      global.EventSource = jest.fn(() => mockEventSource) as any

      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      expect(global.EventSource).toHaveBeenCalledWith('/api/stream/test-thread-id')
    })

    it('should disable input while streaming', async () => {
      const user = userEvent.setup()
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByRole('button', { name: 'Send' })
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      // After sending, both should be disabled during streaming
      expect(textarea).toBeDisabled()
      expect(sendButton).toBeDisabled()
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      global.__TEST_MOCKS__.searchParams.get.mockReturnValue('test-thread-id')
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [] })
      })
    })

    it('should handle fetch errors gracefully', async () => {
      const user = userEvent.setup()
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to send message:', expect.any(Error))
      })
      
      // Should re-enable input after error
      expect(textarea).not.toBeDisabled()
      
      consoleSpy.mockRestore()
    })

    it('should handle HTTP error responses', async () => {
      const user = userEvent.setup()
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to send message:', expect.any(Error))
      })
      
      consoleSpy.mockRestore()
    })
  })

  describe('History Loading', () => {
    beforeEach(() => {
      global.__TEST_MOCKS__.searchParams.get.mockReturnValue('test-thread-id')
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [] })
      })
    })

    it('should load message history when thread ID is set', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [
            { id: '1', role: 'user', content: 'Hello', timestamp: new Date() },
            { id: '2', role: 'assistant', content: 'Hi there!', timestamp: new Date() },
          ],
        }),
      })

      render(<Chat />)
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/history/test-thread-id')
      })
    })

    it('should handle history loading errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      
      global.fetch = jest.fn().mockRejectedValue(new Error('Failed to load'))

      render(<Chat />)
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load messages:', expect.any(Error))
      })
      
      consoleSpy.mockRestore()
    })
  })

  describe('Component Cleanup', () => {
    beforeEach(() => {
      global.__TEST_MOCKS__.searchParams.get.mockReturnValue('test-thread-id')
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [] })
      })
    })

    it('should close EventSource on component unmount', async () => {
      const user = userEvent.setup()
      const mockEventSource = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        close: jest.fn(),
        onmessage: null,
        onerror: null,
      }
      
      global.EventSource = jest.fn(() => mockEventSource) as any
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [] })
      })

      const { unmount } = render(<Chat />)
      
      // Send a message to create an EventSource
      const textarea = screen.getByPlaceholderText('Type your message...')
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      // Wait for EventSource to be created
      expect(global.EventSource).toHaveBeenCalled()
      
      unmount()
      
      // EventSource should be cleaned up on unmount
      expect(mockEventSource.close).toHaveBeenCalled()
    })
  })
}) 