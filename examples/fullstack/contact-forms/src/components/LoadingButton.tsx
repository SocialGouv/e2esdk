import { Button, ButtonProps } from '@chakra-ui/react'
import React from 'react'

type LoadingButtonProps = Omit<ButtonProps, 'onClick' | 'isLoading'> & {
  onClick: () => Promise<any>
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  onClick,
  ...props
}) => {
  const [isLoading, setLoading] = React.useState(false)
  const _onClick = React.useCallback(async () => {
    setLoading(true)
    try {
      await onClick()
    } finally {
      setLoading(false)
    }
  }, [onClick])

  return <Button isLoading={isLoading} onClick={_onClick} {...props} />
}
