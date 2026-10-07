import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom'
import { AuthShell } from './AuthShell'

describe('AuthShell', () => {
  it('DoD-3 renders without crashing and shows "Brainx School"', () => {
    render(
      <AuthShell heading="Welcome back" blurb="Sign in to continue.">
        <p>form content</p>
      </AuthShell>,
    )

    // "Brainx School" appears in both the desktop branded panel and the
    // mobile header, so there can be more than one match.
    const brandMatches = screen.getAllByText('Brainx School')
    expect(brandMatches.length).toBeGreaterThan(0)
    expect(brandMatches[0]).toBeInTheDocument()
  })
})
