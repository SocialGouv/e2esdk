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
const { publicKey } = await e2esdk.createNewKeychain(
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

## Files

## Editing responses

## Use cases

### Accepting a single response per submitter

Example use-case: school assignments.

### Allowing edits within a time frame

Example use-case: tax returns report, progress-saving forms.
