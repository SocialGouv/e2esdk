import {
  Box,
  BoxProps,
  Flex,
  FlexProps,
  Heading,
  HeadingProps,
  Icon,
  useBreakpointValue,
} from '@chakra-ui/react'
import { IconType } from 'react-icons/lib'

export const SectionContainer = (props: FlexProps) => {
  return (
    <Flex
      position="absolute"
      flexDirection={{ base: 'column', lg: 'row' }}
      gap={{ base: 8, lg: 0 }}
      inset={0}
      {...props}
    />
  )
}

export const Section: React.FC<BoxProps> = props => (
  <Box
    as="section"
    flex={{ base: undefined, lg: 1 }}
    overflow={{ base: undefined, lg: 'auto' }}
    pb={4}
    sx={{
      '&:not(:first-of-type)':
        useBreakpointValue({
          base: {
            borderTopWidth: '1px',
          },
          lg: {
            borderLeftWidth: '1px',
          },
        }) ?? {},
    }}
    {...props}
  />
)

type SectionHeaderProps = HeadingProps & {
  icon?: IconType
  children?: React.ReactNode
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  children,
  icon,
  ...props
}) => {
  return (
    <Heading
      as="h3"
      fontSize="md"
      display="flex"
      alignItems="center"
      px={4}
      py={2}
      mb={4}
      _light={{
        bg: 'gray.50',
      }}
      _dark={{
        bg: 'gray.800',
      }}
      sx={{
        '&:first-of-type': {
          mt: 0,
        },
        ...props.sx,
      }}
      {...props}
    >
      {icon && <Icon as={icon} mr={1.5} />}
      {children}
    </Heading>
  )
}
