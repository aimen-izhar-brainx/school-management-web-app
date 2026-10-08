import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom'
import { Select } from './Select'

// Tests for T-005: shared `Select` component, extracted from the
// `SelectField` helper duplicated inside `AdminCreatePage.tsx`.
//
// `./Select` does not exist yet, so this whole file is expected to fail to
// resolve the import until `frontend/src/components/Select.tsx` is built.
//
// Assumed API (copied verbatim from `AdminCreatePage.tsx`'s `SelectField` so
// T-006 can swap it in as a drop-in replacement):
//   interface SelectProps {
//     id: string
//     label: string
//     value: string
//     onChange: (value: string) => void   // receives the new string value,
//                                          // not a ChangeEvent
//     options: string[]
//   }
// A leading `<option value="">Select…</option>` placeholder is always
// rendered first, matching current `SelectField` behavior.
//
// Exact className copied from `AdminCreatePage.tsx`'s `SelectField` (line
// ~609), so visual appearance (AC-02.5) doesn't drift during extraction.
const EXPECTED_SELECT_CLASSNAME =
  'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10'

describe('Select', () => {
  it('AC-02.5 renders a label wired to the select via id, and reflects the controlled value', () => {
    render(
      <Select
        id="role"
        label="Role"
        value="Teacher"
        onChange={vi.fn()}
        options={['Teacher', 'Parent']}
      />,
    )

    const select = screen.getByLabelText('Role')
    expect(select).toBeInTheDocument()
    expect(select).toHaveAttribute('id', 'role')
    expect(select).toHaveValue('Teacher')
  })

  it('AC-02.5 renders a leading "Select…" placeholder option plus one option per entry in `options`', () => {
    render(
      <Select id="role" label="Role" value="" onChange={vi.fn()} options={['Teacher', 'Parent']} />,
    )

    const select = screen.getByLabelText('Role')
    const optionEls = within(select).getAllByRole('option') as HTMLOptionElement[]

    expect(optionEls).toHaveLength(3)
    expect(optionEls[0].value).toBe('')
    expect(optionEls[0].textContent).toMatch(/select/i)
    expect(optionEls[1]).toHaveValue('Teacher')
    expect(optionEls[2]).toHaveValue('Parent')
  })

  it('AC-02.5 calls onChange with the newly selected string value (not a raw event)', () => {
    const onChange = vi.fn()
    render(
      <Select
        id="role"
        label="Role"
        value="Teacher"
        onChange={onChange}
        options={['Teacher', 'Parent']}
      />,
    )

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Parent' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('Parent')
  })

  it('AC-02.5 renders the exact className used by AdminCreatePage\'s SelectField so styling (spacing, border, focus ring) is unchanged', () => {
    render(
      <Select id="role" label="Role" value="" onChange={vi.fn()} options={['Teacher', 'Parent']} />,
    )

    expect(screen.getByLabelText('Role')).toHaveClass(EXPECTED_SELECT_CLASSNAME, {
      exact: true,
    })
  })

  it('AC-02.5 renders the label with the same className used by AdminCreatePage\'s SelectField label', () => {
    render(
      <Select id="role" label="Role" value="" onChange={vi.fn()} options={['Teacher', 'Parent']} />,
    )

    const label = screen.getByText('Role')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', 'role')
    expect(label.className).toBe('block text-sm font-medium text-slate-700')
  })
})
