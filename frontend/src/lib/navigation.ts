import type { PersonTab } from '../components/AdminCreatePage'

export type View =
  | { name: 'login' }
  | { name: 'forgot' }
  | { name: 'reset'; token: string }
  | { name: 'home' }
  | { name: 'profile' }
  | { name: 'admin-create'; tab: PersonTab }
  | { name: 'admin-classes' }
  | { name: 'admin-timetable' }
  | { name: 'admin-attendance' }
  | { name: 'my-timetable' }
  | { name: 'mark-attendance' }
  | { name: 'my-attendance' }
  | { name: 'notices' }

/** Views only an admin may open; anyone else is shown My Timetable instead. */
export function isAdminOnlyView(view: View): boolean {
  return (
    view.name === 'admin-create' ||
    view.name === 'admin-classes' ||
    view.name === 'admin-timetable' ||
    view.name === 'admin-attendance'
  )
}
