import { Center, Spinner } from '@chakra-ui/react'
import { base64UrlDecode } from '@socialgouv/e2esdk-crypto'
import type { NextPage } from 'next'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import React from 'react'

const ContactForm = dynamic(
  () => import('lib/contact-form').then(m => m.ContactForm),
  {
    ssr: false,
    loading({ error }) {
      if (error) {
        return (
          <Center>
            <>
              {error.name}: {error.message} ({error.cause})
            </>
          </Center>
        )
      }
      return <Spinner />
    },
  }
)

const ContactFormPage: NextPage = () => {
  const router = useRouter()
  const submissionBucketId = router.query.submissionBucketId as string
  const publicKey = usePublicKeyInURLHash()
  if (!publicKey) {
    return <>Error: missing public key</>
  }
  return (
    <ContactForm
      submissionBucketId={submissionBucketId}
      publicKey={publicKey}
    />
  )
}

export default ContactFormPage

// --

function usePublicKeyInURLHash() {
  const [publicKey, setPublicKey] = React.useState<Uint8Array | null>(null)
  React.useEffect(() => {
    const onHashChange = () => {
      const publicKey = base64UrlDecode(window.location.hash.replace(/^#/, ''))
      if (publicKey.byteLength === 32) {
        setPublicKey(publicKey)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    onHashChange()
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return publicKey
}
