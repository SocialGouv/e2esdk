import CodeBlock from '@theme/CodeBlock'
import React from 'react'

export const SignatureKeygenUI = () => {
  const [value, setValue] =
    React.useState(`- SIGNATURE_PUBLIC_KEY=gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE
- SIGNATURE_PRIVATE_KEY=___examples-server-signkey__NOT-FOR-PROD__yCwTsHrcRO00MjMDBcSndfUe_XZYIoYfqHtutXdT00oQ`)

  const generate = React.useCallback(async () => {
    const { generateSignatureKeyPair, initializeSodium } = await import(
      '@socialgouv/e2esdk-crypto'
    )
    const sodium = await initializeSodium()
    const { publicKey, privateKey } = generateSignatureKeyPair(sodium)
    setValue(`- SIGNATURE_PUBLIC_KEY=${sodium.to_base64(publicKey)}
- SIGNATURE_PRIVATE_KEY=${sodium.to_base64(privateKey)}`)
  }, [])

  React.useEffect(generate, [])

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
