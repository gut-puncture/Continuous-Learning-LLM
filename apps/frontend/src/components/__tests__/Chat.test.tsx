import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Chat from '../Chat'
import { useUser } from '@/hooks/useUser'

// Mock useUser hook - next-auth is already mocked in jest.setup.js
jest.mock('@/hooks/useUser')

// Setup environment variable
process.env.NEXT_PUBLIC_BACKEND_URL = 'http://localhost:3001'

beforeEach(() => {
  // Mock useUser hook
  (useUser as jest.Mock).mockReturnValue({
    user: { name: 'Test User', email: 'test@example.com' },
    isLoading: false
  })

  // Reset and setup search params mock (threadId exists by default)
  global.__TEST_MOCKS__.searchParams.get.mockReset()
  global.__TEST_MOCKS__.searchParams.get.mockImplementation((key: string) => {
    if (key === 'threadId') return 'test-thread-id'
    return null
  })

  // Mock fetch with default successful responses
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (url.includes('/history/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ messages: [] })
      })
    }
    if (url.includes('/chat')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          threadId: 'test-thread-id',
          assistant: {
            content: 'Test response from assistant',
            tokenCnt: 100
          }
        })
      })
    }
    return Promise.resolve({ ok: false })
  })

  // Clear router mocks
  global.__TEST_MOCKS__.router.replace.mockClear()
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('Chat Component', () => {
  describe('Thread ID Management', () => {
    it('should use existing thread ID from URL', () => {
      render(<Chat />)
      
      // Should not replace URL when threadId exists
      expect(global.__TEST_MOCKS__.router.replace).not.toHaveBeenCalled()
    })

    // TODO: Fix infinite loop issue with this test
    // The mock causes searchParams to trigger useEffect repeatedly
    // it('should generate new thread ID when not in URL', () => {
    //   // Mock empty search params for this test only
    //   global.__TEST_MOCKS__.searchParams.get.mockImplementation(() => null)
    //   
    //   render(<Chat />)
    //   
    //   // Should replace URL with new threadId
    //   expect(global.__TEST_MOCKS__.router.replace).toHaveBeenCalledWith(expect.stringMatching(/\/chat\?threadId=.+/))
    // })
  })

  describe('Message Rendering', () => {
    it('should render chat interface', () => {
      render(<Chat />)
      
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    })

    it('should disable send button when input is empty', () => {
      render(<Chat />)
      
      const sendButton = screen.getByRole('button', { name: 'Send' })
      expect(sendButton).toBeDisabled()
    })

    it('should enable send button when user types message', async () => {
      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByRole('button', { name: 'Send' })
      
      await user.type(textarea, 'Hello world')
      
      expect(sendButton).not.toBeDisabled()
    })
  })

  describe('Message History Loading', () => {
    it('should load message history when thread ID is set', async () => {
      render(<Chat />)
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/history/test-thread-id')
      })
    })

    it('should display loaded messages', async () => {
      // Mock fetch to return some messages
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/history/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              messages: [
                {
                  msg_id: 1,
                  role: 'user',
                  content: 'Hello',
                  created_at: '2024-01-01T10:00:00Z'
                },
                {
                  msg_id: 2,
                  role: 'assistant',
                  content: 'Hi there!',
                  created_at: '2024-01-01T10:00:05Z'
                }
              ]
            })
          })
        }
        return Promise.resolve({ ok: false })
      })

      render(<Chat />)
      
      await waitFor(() => {
        expect(screen.getByText('Hello')).toBeInTheDocument()
        expect(screen.getByText('Hi there!')).toBeInTheDocument()
      })
    })
  })

  describe('Sending Messages', () => {
    it('should send message on Enter key press', async () => {
      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/chat', {
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
    })

    it('should send message on Send button click', async () => {
      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByRole('button', { name: 'Send' })
      
      await user.type(textarea, 'Test message')
      await user.click(sendButton)
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/chat', {
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
    })

    it('should NOT send message on Shift+Enter', async () => {
      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      
      // Clear previous calls (history loading)
      jest.clearAllMocks()
      
      await user.keyboard('{Shift>}{Enter}{/Shift}')
      
      // Should not call /chat endpoint
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/chat'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('should clear input after sending message', async () => {
      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      await waitFor(() => {
        expect(textarea).toHaveValue('')
      })
    })

    it('should display user message immediately', async () => {
      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      // Should show user message immediately
      expect(screen.getByText('Test message')).toBeInTheDocument()
    })

    it('should display assistant response after API call', async () => {
      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      // Should show assistant response
      await waitFor(() => {
        expect(screen.getByText('Test response from assistant')).toBeInTheDocument()
      })
    })
  })

  describe('Loading States', () => {
    it('should show loading state while sending message', async () => {
      // Mock slow response
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/chat')) {
          return new Promise(resolve => 
            setTimeout(() => resolve({
              ok: true,
              json: () => Promise.resolve({
                threadId: 'test-thread-id',
                assistant: { content: 'Response', tokenCnt: 100 }
              })
            }), 100)
          )
        }
        if (url.includes('/history/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ messages: [] })
          })
        }
        return Promise.resolve({ ok: false })
      })

      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      const sendButton = screen.getByRole('button', { name: 'Send' })
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      // Should show loading state
      expect(sendButton).toHaveTextContent('Sending...')
      expect(textarea).toBeDisabled()
    })

    it('should show typing indicator while loading', async () => {
      // Mock slow response
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/chat')) {
          return new Promise(resolve => 
            setTimeout(() => resolve({
              ok: true,
              json: () => Promise.resolve({
                threadId: 'test-thread-id',
                assistant: { content: 'Response', tokenCnt: 100 }
              })
            }), 100)
          )
        }
        if (url.includes('/history/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ messages: [] })
          })
        }
        return Promise.resolve({ ok: false })
      })

      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      // Should show typing indicator (animated dots)
      expect(document.querySelector('.animate-bounce')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // Mock failed response
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/chat')) {
          return Promise.resolve({ ok: false })
        }
        if (url.includes('/history/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ messages: [] })
          })
        }
        return Promise.resolve({ ok: false })
      })

      const user = userEvent.setup()
      render(<Chat />)
      
      const textarea = screen.getByPlaceholderText('Type your message...')
      
      await user.type(textarea, 'Test message')
      await user.keyboard('{Enter}')
      
      // User message should be removed on error
      await waitFor(() => {
        expect(screen.queryByText('Test message')).not.toBeInTheDocument()
      })
    })

    it('should not send message when user is not logged in', () => {
      // Mock no user
      (useUser as jest.Mock).mockReturnValue({
        user: null,
        isLoading: false
      })

      render(<Chat />)
      
      const sendButton = screen.getByRole('button', { name: 'Send' })
      
      // Send button should be disabled
      expect(sendButton).toBeDisabled()
    })
  })
}) 