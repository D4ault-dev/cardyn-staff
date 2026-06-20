import { useState, useEffect } from 'react'

/**
 * Debounces a value — only updates after the user stops typing for `delay` ms.
 * Use for search inputs to avoid firing an API call on every keystroke.
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}
