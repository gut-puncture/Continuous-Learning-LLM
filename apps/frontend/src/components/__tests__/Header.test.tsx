import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { signIn, signOut } from 'next-auth/react'
import Header from '../Header'

// Mock next-auth
jest.mock('next-auth/react')
jest.mock('../../hooks/useUser')

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>
const mockSignOut = signOut as jest.MockedFunction<typeof signOut>

describe('Header Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Loading State', () => {
    it('should show loading state', () => {
      // Mock useUser hook for loading state
      const { useUser } = require('../../hooks/useUser')
      useUser.mockReturnValue({
        user: null,
        isLoading: true,
      })

      render(<Header />)
      
      expect(screen.getByText('Mini-CLM')).toBeInTheDocument()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('Authenticated User', () => {
    beforeEach(() => {
      const { useUser } = require('../../hooks/useUser')
      useUser.mockReturnValue({
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          image: 'https://example.com/avatar.jpg',
        },
        isLoading: false,
      })
    })

    it('should display user information', () => {
      render(<Header />)
      
      expect(screen.getByText('Mini-CLM')).toBeInTheDocument()
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    })

    it('should show user avatar when available', () => {
      render(<Header />)
      
      const avatar = screen.getByAltText('John Doe')
      expect(avatar).toBeInTheDocument()
      expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    })

    it('should call signOut when sign out button is clicked', async () => {
      const user = userEvent.setup()
      render(<Header />)
      
      const signOutButton = screen.getByRole('button', { name: 'Sign out' })
      await user.click(signOutButton)
      
      expect(mockSignOut).toHaveBeenCalledTimes(1)
    })

    it('should have dark theme styling', () => {
      render(<Header />)
      
      const header = screen.getByRole('banner')
      expect(header).toHaveClass('bg-gray-900', 'border-gray-700')
      
      const title = screen.getByText('Mini-CLM')
      expect(title).toHaveClass('text-white')
    })
  })

  describe('Unauthenticated User', () => {
    beforeEach(() => {
      const { useUser } = require('../../hooks/useUser')
      useUser.mockReturnValue({
        user: null,
        isLoading: false,
      })
    })

    it('should show sign in button when not authenticated', () => {
      render(<Header />)
      
      expect(screen.getByText('Mini-CLM')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    })

    it('should call signIn when sign in button is clicked', async () => {
      const user = userEvent.setup()
      render(<Header />)
      
      const signInButton = screen.getByRole('button', { name: 'Sign in with Google' })
      await user.click(signInButton)
      
      expect(mockSignIn).toHaveBeenCalledWith('google')
    })
  })
}) 