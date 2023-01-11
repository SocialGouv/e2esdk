// https://chadalen.com/blog/how-to-use-a-multipart-form-in-nextjs-using-api-routes

import { fileMetadataSchema } from '@socialgouv/e2esdk-crypto'
import formidable from 'formidable'
import type { NextApiRequest, NextApiResponse } from 'next'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

export const config = {
  api: {
    bodyParser: false,
  },
}

const storageDir = path.resolve(
  __dirname,
  '../../../../../../../.volumes/docker/e2esdk-examples-contact-forms/storage'
)

// SHA-512 hex output
const validFileName = fileMetadataSchema.shape.hash

const form = formidable({
  multiples: true,
  uploadDir: storageDir,
  hashAlgorithm: 'sha512',
  filename(name, ext, part, form) {
    if (!part.originalFilename) {
      throw new Error('Missing file name (should be hash of content)')
    }
    return validFileName.parse(part.originalFilename)
  },
})

form.on('file', (_formName, file) => {
  if (!file.hash) {
    return
  }
  if (file.newFilename === file.hash) {
    return
  }
  console.error(`Invalid file name (does not match SHA-512 hash)
  Received: ${file.newFilename}
  Hashed:   ${file.hash}`)
  fs.rm(path.resolve(storageDir, file.newFilename))
})

export default async function storageEndpoint(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // todo: Add authentication
  await fs.mkdir(storageDir, { recursive: true }).catch(() => {})
  if (req.method === 'POST') {
    if (
      !req.headers['content-type'] ||
      req.headers['content-type'].indexOf('multipart/form-data') === -1
    ) {
      return res
        .status(415)
        .send('Invalid content-type, only multipart/form-data is accepted')
    }
    await new Promise<void>((resolve, reject) =>
      form.parse(req, (err, _, files) => {
        if (err) {
          res.status(400).json({
            error: 'Invalid request',
            message: 'Failed to parse multipart body',
            reason: err,
          })
          reject(err)
        }
        Object.entries(files).forEach(([formField, files]) => {
          ;[files]
            .flat()
            .forEach(file =>
              console.info(`Saved file ${file.filepath} (${formField})`)
            )
        })
        resolve()
      })
    )
    res.status(201).send(null)
  } else if (req.method === 'GET') {
    const hash = validFileName.parse([req.query['hash']].flat()[0])
    if (!hash) {
      return res.status(400).send('Expected hash query string')
    }
    const filePath = path.resolve(storageDir, hash)
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      return res.status(404).send('Not found')
    }
    return res
      .setHeader('content-type', 'application/octet-stream')
      .setHeader('content-disposition', 'inline')
      .send(createReadStream(filePath))
  } else {
    res.status(405).send('Unsupported method')
  }
}
