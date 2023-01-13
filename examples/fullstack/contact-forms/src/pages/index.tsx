import { Center, Spinner } from '@chakra-ui/react'
import { useRouter } from 'next/router'
import React from 'react'

export default function Home() {
  const router = useRouter()

  React.useEffect(() => {
    router.replace('/app/contact-forms')
  }, [router])

  return (
    <Center h="90vh">
      <Spinner />
    </Center>
  )
}
