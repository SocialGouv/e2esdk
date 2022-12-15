import { Badge, BadgeProps } from '@chakra-ui/react'
import type { Cipher } from '@socialgouv/e2esdk-crypto'
import React from 'react'

type AlgorithmBadgeProps = BadgeProps & {
  algorithm: Cipher['algorithm']
}

export const algorithmColors: Record<Cipher['algorithm'], string> = {
  box: 'yellow',
  sealedBox: 'green',
  secretBox: 'purple',
}

export const AlgorithmBadge: React.FC<AlgorithmBadgeProps> = ({
  algorithm,
}) => {
  return (
    <Badge
      w="4.5rem"
      h="1.2rem"
      textTransform="none"
      textAlign="center"
      colorScheme={algorithmColors[algorithm]}
      aria-label={`Algorithm type: ${algorithm}`}
    >
      {algorithm}
    </Badge>
  )
}
