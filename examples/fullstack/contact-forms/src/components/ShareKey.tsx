import {
  useDisclosure,
  Popover,
  PopoverTrigger,
  Button,
  PopoverContent,
  PopoverArrow,
  PopoverCloseButton,
  PopoverHeader,
  Icon,
  PopoverBody,
  Checkbox,
  ButtonProps,
} from '@chakra-ui/react'
import { PublicUserIdentity } from '@socialgouv/e2esdk-client'
import { useE2ESDKClient } from '@socialgouv/e2esdk-react'
import React from 'react'
import { FiShare2, FiShield } from 'react-icons/fi'
import { UserIdentityInput } from './UserIdentityInput'
import FocusLock from 'react-focus-lock'
import { useSubmissionCommentsKey } from 'lib/comments'

type ShareKeyPopupProps = ButtonProps & {
  nameFingerprint: string
}

export const ShareKeyPopup: React.FC<ShareKeyPopupProps> = ({
  nameFingerprint,
  ...props
}) => {
  const { isOpen, onClose, onToggle } = useDisclosure()
  const client = useE2ESDKClient()
  const [recipientIdentity, setRecipientIdentity] =
    React.useState<PublicUserIdentity | null>(null)
  const close = React.useCallback(() => {
    setRecipientIdentity(null)
    onClose()
  }, [onClose])
  const [shareCommentsKey, setShareCommentsKey] = React.useState(true)
  const commentsKey = useSubmissionCommentsKey(nameFingerprint)

  const share = React.useCallback(async () => {
    if (!recipientIdentity) {
      return
    }
    await client.shareKey(nameFingerprint, recipientIdentity)
    if (commentsKey && shareCommentsKey) {
      await client.shareKey(commentsKey.nameFingerprint, recipientIdentity)
    }
    close()
  }, [
    client,
    close,
    commentsKey,
    nameFingerprint,
    recipientIdentity,
    shareCommentsKey,
  ])

  return (
    <Popover isOpen={isOpen} onClose={close}>
      <PopoverTrigger>
        <Button leftIcon={<FiShield />} {...props} onClick={onToggle}>
          Share access
        </Button>
      </PopoverTrigger>
      <PopoverContent minW="lg">
        <FocusLock returnFocus persistentFocus={false}>
          <PopoverArrow />
          <PopoverCloseButton rounded="full" mt={1} />
          <PopoverHeader display="flex" alignItems="center" fontWeight="medium">
            <Icon as={FiShare2} mr={2} />
            Share key with
          </PopoverHeader>
          <PopoverBody fontWeight="md">
            <UserIdentityInput
              identity={recipientIdentity}
              onIdentityChange={setRecipientIdentity}
              showPublicKey
              mb={4}
            />
            <Checkbox
              isChecked={shareCommentsKey}
              onChange={event => setShareCommentsKey(event.target.checked)}
            >
              also share access to comments
            </Checkbox>
            <Button
              width="100%"
              leftIcon={<FiShare2 />}
              isDisabled={!recipientIdentity}
              onClick={share}
              mt={4}
            >
              Share access
            </Button>
          </PopoverBody>
        </FocusLock>
      </PopoverContent>
    </Popover>
  )
}
