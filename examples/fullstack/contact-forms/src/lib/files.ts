import {
  decryptFileContents,
  FileMetadata,
  Sodium,
} from '@socialgouv/e2esdk-crypto'

export async function uploadFiles(formData: FormData) {
  if (Array.from(formData.values()).flat().length === 0) {
    return
  }
  return fetch('/api/storage', {
    method: 'POST',
    body: formData,
  })
}

export async function downloadAndDecryptFile(
  sodium: Sodium,
  metadata: FileMetadata
) {
  const res = await fetch(`/api/storage?hash=${metadata.hash}`)
  const blob = await res.blob()
  const cleartext = decryptFileContents(
    sodium,
    new Uint8Array(await blob.arrayBuffer()),
    {
      algorithm: 'secretBox',
      key: sodium.from_base64(metadata.key),
    }
  )
  return new File([cleartext], metadata.name, {
    type: metadata.type,
    lastModified: metadata.lastModified,
  })
}

export function saveFile(file: File) {
  const link = document.createElement('a')
  link.setAttribute('href', URL.createObjectURL(file))
  link.setAttribute('download', file.name)
  link.click()
  URL.revokeObjectURL(link.href)
}
