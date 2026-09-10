import { GraduationCap } from 'lucide-react'
import type { ReactNode } from 'react'

interface AuthShellProps {
  /** Copy for the branded panel — each auth screen sets its own. */
  heading: string
  blurb: string
  children: ReactNode
}

/** Split-screen frame shared by every screen in the sign-in flow. */
export function AuthShell({ heading, blurb, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-600 to-indigo-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="size-7" />
          Brainx School
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight">{heading}</h1>
          <p className="mt-4 max-w-md text-white/80">{blurb}</p>
        </div>

        <p className="text-sm text-white/60">
          &copy; {new Date().getFullYear()} Brainx School Management. All rights reserved.
        </p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 text-lg font-semibold text-slate-900 lg:hidden">
            <GraduationCap className="size-7" />
            Brainx School
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
