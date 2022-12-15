import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const serverContextSchema = z.object({
  cwd: z.string().endsWith('/packages/server'),
  nextRelease: z.object({
    version: z.string(),
  }),
})

export async function prepare(_: any, context: any) {
  const ctx = serverContextSchema.safeParse(context)
  if (!ctx.success) {
    return
  }
  // Inject the version number into package.json
  // This would otherwise be done by the @semantic-release/npm plugin,
  // but the server is a private package so it won't be touched.
  const serverPackageJsonFile = path.resolve(ctx.data.cwd, 'package.json')
  const serverPackageJson = JSON.parse(
    await fs.readFile(serverPackageJsonFile, { encoding: 'utf8' })
  )
  context.logger.log(
    `Server package.json version: ${serverPackageJson.version} -> ${ctx.data.nextRelease.version}`
  )
  serverPackageJson.version = ctx.data.nextRelease.version
  await fs.writeFile(
    serverPackageJsonFile,
    JSON.stringify(serverPackageJson, null, 2)
  )
}

export async function publish(_: any, context: any) {
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
