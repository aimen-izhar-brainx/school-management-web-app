import { ApiError } from './http'

export const GENERIC_ERROR = 'Something went wrong. Please try again.'

/** Client errors (4xx) carry a user-facing message from the API; anything else is shown generically. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError && error.status < 500 ? error.message : GENERIC_ERROR
}
