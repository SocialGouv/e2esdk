import React from 'react'

type UseLocalStateProps<DataType> = {
  storageKey: string
  defaultValue: DataType | (() => DataType)
  parser?: {
    stringify: (input: DataType) => string
    parse: (input: string) => DataType
  }
}

export function useLocalState<DataType>({
  storageKey,
  defaultValue,
  parser = JSON,
}: UseLocalStateProps<DataType>) {
  const [value, _setValue] = React.useState<DataType>(() => {
    const _default = () => {
      return typeof defaultValue === 'function'
        ? (defaultValue as () => DataType)()
        : defaultValue
    }
    if (typeof window === 'undefined') {
      return _default()
    }
    const fromStorage = localStorage.getItem(storageKey)
    if (!fromStorage) {
      return _default()
    }
    try {
      return parser.parse(fromStorage)
    } catch (e) {
      return _default()
    }
  })
  const setValue = React.useCallback(
    (value: DataType) => {
      _setValue(value)
      localStorage.setItem(storageKey, parser.stringify(value))
    },
    [storageKey, parser]
  )
  return [value, setValue] as const
}
