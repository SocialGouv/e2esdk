import {
  generateSignatureKeyPair,
  initializeSodium,
} from '@socialgouv/e2esdk-crypto'
import CodeBlock from '@theme/CodeBlock'
import React from 'react'

const libsodium = initializeSodium()

export const SignatureKeygenUI = () => {
  const [value, setValue] =
    React.useState(`- SIGNATURE_PUBLIC_KEY=gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE
- SIGNATURE_PRIVATE_KEY=___examples-server-signkey__NOT-FOR-PROD__yCwTsHrcRO00MjMDBcSndfUe_XZYIoYfqHtutXdT00oQ`)

  const generate = React.useCallback(async () => {
    const sodium = await libsodium
    const { publicKey, privateKey } = generateSignatureKeyPair(sodium)
    setValue(`- SIGNATURE_PUBLIC_KEY=${sodium.to_base64(publicKey)}
- SIGNATURE_PRIVATE_KEY=${sodium.to_base64(privateKey)}`)
  }, [])

  React.useEffect(() => {
    libsodium.then(generate)
  }, [])

  return (
    <>
      <a href="javascript:;" onClick={generate}>
        generate a new one
      </a>{' '}
      below:
      <CodeBlock>{value}</CodeBlock>
    </>
  )
}
