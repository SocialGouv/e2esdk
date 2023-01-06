// https://chadalen.com/blog/how-to-use-a-multipart-form-in-nextjs-using-api-routes

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

const form = formidable({
  multiples: true,
  uploadDir: storageDir,
  filename(name, ext, part, form) {
    if (!part.originalFilename) {
      throw new Error('Missing file name (should be hash of content)')
    }
    return part.originalFilename
  },
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
    form.parse(req, (err, _, files) => {
      if (err) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Failed to parse multipart body',
          reason: err,
        })
      }
      Object.entries(files).forEach(([formField, files]) => {
        ;[files]
          .flat()
          .forEach(file =>
            console.info(`Saved file ${file.filepath} (${formField})`)
          )
      })
      res.status(201).send(null)
    })
  } else if (req.method === 'GET') {
    const hash = [req.query['hash']].flat()[0]
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
