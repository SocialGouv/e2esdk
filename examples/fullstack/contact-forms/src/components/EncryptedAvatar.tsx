import { Avatar, AvatarProps } from '@chakra-ui/react'
import type { FileMetadata } from '@socialgouv/e2esdk-crypto'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import { downloadAndDecryptFile } from 'lib/files'
import React from 'react'

export type EncryptedAvatarProps = Omit<AvatarProps, 'src'> & {
  metadata: FileMetadata
}

const objectURLs: Record<string, string> = {}

export const EncryptedAvatar: React.FC<EncryptedAvatarProps> = ({
  metadata,
  ...props
}) => {
  const client = useE2ESDKClient()
  const [src, setSrc] = React.useState<string | undefined>()
  React.useEffect(() => {
    const id = Math.random().toString(36).slice(2)
    downloadAndDecryptFile(client.sodium, metadata)
      .then(file => {
        const objectURL = URL.createObjectURL(file)
        setSrc(objectURL)
        objectURLs[id] = objectURL
      })
      .catch(console.error)
    return () => {
      if (!objectURLs[id]) {
        return
      }
      URL.revokeObjectURL(objectURLs[id])
      delete objectURLs[id]
    }
  }, [metadata, client])
  return <Avatar src={src} {...props} />
}
