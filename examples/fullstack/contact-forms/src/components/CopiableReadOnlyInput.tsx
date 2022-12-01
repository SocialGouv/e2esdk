import {
  IconButton,
  Input,
  InputGroup,
  InputGroupProps,
  InputProps,
  InputRightElement,
  useClipboard,
} from '@chakra-ui/react'
import React from 'react'
import { FiCheck, FiClipboard } from 'react-icons/fi'

type CopiableReadOnlyInput = InputGroupProps & {
  value: string
  inputProps?: InputProps
}

export const CopiableReadOnlyInput: React.FC<CopiableReadOnlyInput> = ({
  value,
  inputProps,
  ...props
}) => {
  const { onCopy, hasCopied, setValue } = useClipboard(value)
  React.useEffect(() => {
    setValue(value)
  }, [value, setValue])
  return (
    <InputGroup {...props}>
      <Input value={value} isReadOnly {...inputProps} />
      <InputRightElement>
        <IconButton
          onClick={onCopy}
          icon={hasCopied ? <FiCheck /> : <FiClipboard />}
          colorScheme={hasCopied ? 'green' : undefined}
          aria-label="Copy"
          rounded="full"
          variant="ghost"
        />
      </InputRightElement>
    </InputGroup>
  )
}
