import { withAuth } from "next-auth/middleware"

export default withAuth(
  function middleware() {
    // Add any additional middleware logic here if needed
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token
    },
    pages: {
      signIn: "/api/auth/signin"
    }
  }
)

export const config = { 
  matcher: ["/chat", "/history"] 
} 