import {
  Box,
  BoxProps,
  Flex,
  FlexProps,
  forwardRef,
  Heading,
  HeadingProps,
  useBreakpointValue,
} from '@chakra-ui/react'

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

export const Section = forwardRef<BoxProps, 'section'>((props, ref) => (
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
    ref={ref}
    {...props}
  />
))

type SectionHeaderProps = HeadingProps & {
  children?: React.ReactNode
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  children,
  ...props
}) => {
  return (
    <Heading
      as="h3"
      fontSize="md"
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
      {children}
    </Heading>
  )
}
