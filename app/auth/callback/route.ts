import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { encryptGithubToken } from '@/lib/github-token'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error, data } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.session && data.user) {
      // Sync user with our Prisma database
      const user = data.user
      const session = data.session
      
      const githubIdStr = user.user_metadata?.provider_id
      const githubId = githubIdStr ? parseInt(githubIdStr, 10) : null
      
      if (githubId) {
        // Try to find if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { githubId }
        })

        let githubToken: string | null = null
        try {
          githubToken = encryptGithubToken(session.provider_token)
        } catch (error) {
          console.error("[auth/callback] Failed to encrypt GitHub token", { githubId, error })
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/auth/auth-code-error`)
        }

        if (!existingUser) {
          // Create new user (First login)
          const newUser = await prisma.user.create({
            data: {
              githubId,
              username: user.user_metadata?.user_name || `user_${githubId}`,
              name: user.user_metadata?.full_name || null,
              avatarUrl: user.user_metadata?.avatar_url || null,
              githubToken,
              onboarded: false,
            }
          })

          // Create the empty skill profile stub for the new user
          await prisma.skillProfile.create({
            data: {
              userId: newUser.id
            }
          })
          
        } else {
          if (githubToken) {
            // Update the token if it changed
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { githubToken }
            })
          }
        }

        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
