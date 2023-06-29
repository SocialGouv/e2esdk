---
description: Encrypting and decrypting form data.
---

# Forms

In applications where data has to be submitted from forms filled by outsiders
(submitters not considered as users, that do not have an account on the
application), e2esdk provides ways to ingest anonymously encrypted form data.

End-to-end encrypted responses can also be edited by their authors, if desired
by the application developers. Moreover, different response acceptation strategies
can be implemented.

## Creating keys

You will want to use the **`sealedBox`** algorithm when
[creating a key](./keys#creating-a-key).

The public key will be used to encrypt form data, and the private key
will be used to decrypt it.

```ts
const { publicKey } = await e2esdkClient.createNewKeychain(
  'my-encrypted-form', // purpose
  'sealedBox' // algorithm
)
```

## Encrypting form data

This example assumes the public key is passed base64url-encoded in
the URL hash/fragment.

:::note Security note

Passing the public key in the URL hash makes it invisible from the application
server. This is to ensure E2EE by protecting against a malicious server
rewriting the public key to one it controls.

:::

```ts
import {
  initializeEncryptedFormLocalState,
  encryptFormData,
} from '@socialgouv/e2esdk-crypto'

async function onSubmit(formValues: Record<string, any>) {
  const namespace = 'my-form'
  const state = await initializeEncryptedFormLocalState(namespace)
  const submission = encryptFormData(formValues, state)
  await sendEncryptedFormDataToTheApplicationServer(submission)
}
```

:::tip

The `namespace` parameter is only relevant for edition and retrieval of
previous submissions. For most cases, it can be made constant.

:::

## Decrypting form data

Because form data validation cannot occur on the application server,
due to end-to-end encryption, it has to occur right after decryption.

Here's an example with [Zod](https://zod.dev):

```ts
import { z } from 'zod'

// Describe the data shape of acceptable responses
const formDataSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  subscribeToNewsletter: z.boolean(),
})

const submission = await getSubmissionFromTheApplicationServer()
const formData = formDataSchema.parse(
  e2esdkClient.unsealFormData(submission, keychainFingerprint)
)
```

## Files

Files can be encrypted as part of a form submission, but they require
a bit of preprocessing for sending the encrypted contents to the
application server, and storing it somewhere for later retrieval.

```ts
import { encryptFile } from '@socialgouv/e2esdk-crypto'

async function onSubmit(formValues: Record<string, any>) {
  const namespace = 'my-form'
  const state = await initializeEncryptedFormLocalState(namespace)

  // 1. encrypt the file contents, obtain a metadata object.
  const { metadata, encryptedFile } = await encryptFile(
    state.sodium,
    formValues.secretDocument[0] // File field values are usually arrays
  )

  // 2. Replace the File object in the form values with its metadata
  formValues.secretDocument = metadata

  // 3. Encrypt the form data, including metadata
  const submission = encryptFormData(formValues, state)

  // 4. Send it all to the application server
  await sendEncryptedFormDataAndFilesToTheApplicationServer(
    submission,
    encryptedFile
  )
}
```

:::tip

The metadata contains a `hash` property, which is the SHA-512 of the ciphertext.

You may use it for data integrity verification, and/or for content addressing.

:::

At decryption time, you can use the `fileMetadataSchema` to validate metadata
objects:

```ts
import { fileMetadataSchema } from '@socialgouv/e2esdk-crypto'

const formDataSchema = z.object({
  secretDocument: fileMetadataSchema,
})
```

The decrypted metadata lets your UI display:

- The file name
- The size in bytes
- Its MIME type
- The last modified date

This can guide your users into selecting which file to download.

You can then download the encrypted contents, and use the key in the metadata to decrypt it:

```ts
import {
  decryptFileContents,
  FileMetadata,
  Sodium,
} from '@socialgouv/e2esdk-crypto'

async function downloadAndDecryptFile(sodium: Sodium, metadata: FileMetadata) {
  // Fetch encrypted file contents from your application server, eg:
  const res = await fetch(`/encryped-file?hash=${metadata.hash}`)
  const ciphertext = new Uint8Array(await (await res.blob()).arrayBuffer())
  const cleartext = decryptFileContents(sodium, ciphertext, {
    algorithm: 'secretBox',
    key: sodium.from_base64(metadata.key),
  })
  return new File([cleartext], metadata.name, {
    type: metadata.type,
    lastModified: metadata.lastModified,
  })
}

// This may come handy to save the file on your computer:
function saveFile(file: File) {
  const link = document.createElement('a')
  link.setAttribute('href', URL.createObjectURL(file))
  link.setAttribute('download', file.name)
  link.click()
  URL.revokeObjectURL(link.href)
}
```

:::tip

For a more detailed example of form encryption with files, check out the
[contact-forms](https://github.com/SocialGouv/e2esdk/blob/4dab716578e8aabfdf32b55e67173976854cb21e/examples/fullstack/contact-forms)
example in the e2esdk repository.

:::

## Editing responses

## Use cases

### Accepting a single response per submitter

Example use-case: school assignments.

### Allowing edits within a time frame

Example use-case: tax returns report, progress-saving forms.
