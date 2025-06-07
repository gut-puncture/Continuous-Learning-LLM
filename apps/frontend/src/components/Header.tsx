"use client"
import { useUser } from "@/hooks/useUser"
import { signIn, signOut } from "next-auth/react"
import Image from "next/image"

export default function Header() {
  const { user, isLoading } = useUser()

  if (isLoading) {
    return (
      <header className="bg-gray-900 shadow-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-white">Mini-CLM</h1>
            <div className="text-sm text-gray-400">Loading...</div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="bg-gray-900 shadow-sm border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <h1 className="text-xl font-semibold text-white">Mini-CLM</h1>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <div className="flex items-center space-x-3">
                  {user.image && (
                    <Image 
                      src={user.image} 
                      alt={user.name || 'User'} 
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <span className="text-sm font-medium text-gray-200">
                    {user.name}
                  </span>
                </div>
                <button
                  onClick={() => signOut()}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
} 