import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const serverContextSchema = z.object({
  cwd: z.string().endsWith('/packages/server'),
  nextRelease: z.object({
    version: z.string(),
  }),
})

export async function publish(_pluginConfig: any, context: any) {
  const ctx = serverContextSchema.safeParse(context)
  if (!ctx.success) {
    return
  }
  const serverVersion = ctx.data.nextRelease.version
  const repoRoot = path.resolve(ctx.data.cwd, '../..')
  const serverInfoFile = path.resolve(repoRoot, 'server-needs-publishing')
  await fs.writeFile(serverInfoFile, serverVersion)
  context.logger.log(
    `Wrote server version ${serverVersion} to ${serverInfoFile} for Docker to pick up and push image`
  )
}
