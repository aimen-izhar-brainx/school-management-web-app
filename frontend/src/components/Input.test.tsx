import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { Input } from './Input'

// Tests for T-005: shared `Input` component, extracted from the
// `TextField` helper duplicated inside `AdminCreatePage.tsx` (and the
// inline `<input>` markup in `ProfilePage.tsx`).
//
// `./Input` does not exist yet, so this whole file is expected to fail to
// resolve the import until `frontend/src/components/Input.tsx` is built.
//
// Assumed API (copied verbatim from `AdminCreatePage.tsx`'s `TextField` so
// T-006 can swap it in as a drop-in replacement):
//   interface InputProps {
//     id: string
//     label: string
//     value: string
//     onChange: (value: string) => void   // receives the new string value,
//                                          // not a ChangeEvent
//     type?: string                       // defaults to 'text'
//     autoComplete?: string
//     placeholder?: string
//   }
//
// Exact className copied from `AdminCreatePage.tsx`'s `TextField` (line
// ~580), so visual appearance (AC-02.5) doesn't drift during extraction.
const EXPECTED_INPUT_CLASSNAME =
  'mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10'

describe('Input', () => {
  it('AC-02.5 renders a label wired to the input via id, and reflects the controlled value', () => {
    render(<Input id="full-name" label="Full name" value="Ada Lovelace" onChange={vi.fn()} />)

    const input = screen.getByLabelText('Full name')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('id', 'full-name')
    expect(input).toHaveValue('Ada Lovelace')
  })

  it('AC-02.5 calls onChange with the new string value (not a raw event) when the user types', () => {
    const onChange = vi.fn()
    render(<Input id="email" label="Email address" value="" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'ada@example.com' },
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('ada@example.com')
  })

  it('AC-02.5 defaults to type="text" and accepts an explicit type, autoComplete, and placeholder', () => {
    render(
      <Input
        id="email"
        label="Email address"
        value=""
        onChange={vi.fn()}
        type="email"
        autoComplete="email"
        placeholder="name@school.com"
      />,
    )

    const input = screen.getByLabelText('Email address')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveAttribute('placeholder', 'name@school.com')
  })

  it('AC-02.5 defaults the input type to "text" when no type prop is given', () => {
    render(<Input id="full-name" label="Full name" value="" onChange={vi.fn()} />)

    expect(screen.getByLabelText('Full name')).toHaveAttribute('type', 'text')
  })

  it('AC-02.5 renders the exact className used by AdminCreatePage\'s TextField so styling (spacing, border, focus ring) is unchanged', () => {
    render(<Input id="full-name" label="Full name" value="" onChange={vi.fn()} />)

    expect(screen.getByLabelText('Full name')).toHaveClass(EXPECTED_INPUT_CLASSNAME, {
      exact: true,
    })
  })

  it('AC-02.5 renders the label with the same className used by AdminCreatePage\'s TextField label', () => {
    render(<Input id="full-name" label="Full name" value="" onChange={vi.fn()} />)

    const label = screen.getByText('Full name')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', 'full-name')
    expect(label.className).toBe('block text-sm font-medium text-slate-700')
  })
})
