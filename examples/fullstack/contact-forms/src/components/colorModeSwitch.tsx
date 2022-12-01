import { IconButton, IconButtonProps, useColorMode } from '@chakra-ui/react'
import React from 'react'
import { FiMoon, FiSun } from 'react-icons/fi'

export interface ColorModeSwitchProps
  extends Omit<IconButtonProps, 'aria-label'> {}

export const ColorModeSwitch: React.FC<ColorModeSwitchProps> = ({
  ...props
}) => {
  const { colorMode, toggleColorMode } = useColorMode()
  return (
    <IconButton
      variant="ghost"
      aria-label={colorMode === 'dark' ? 'Dark Mode' : 'Light Mode'}
      icon={colorMode === 'dark' ? <FiMoon /> : <FiSun />}
      isRound
      onMouseDown={toggleColorMode}
      sx={{
        mixBlendMode: colorMode === 'light' ? 'multiply' : 'normal',
      }}
      {...props}
    />
  )
}
