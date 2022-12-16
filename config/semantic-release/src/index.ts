import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const contextSchema = z.object({
  cwd: z.string(),
  nextRelease: z.object({
    name: z.string(),
    version: z.string(),
    gitTag: z.string(),
    channel: z.string(),
  }),
  env: z.object({
    GITHUB_STEP_SUMMARY: z.string(),
  }),
})

export async function publish(_: any, context: any) {
  const ctx = contextSchema.safeParse(context)
  if (!ctx.success || !ctx.data.cwd.endsWith('packages/server')) {
    return
  }
  const serverVersion = ctx.data.nextRelease.version
  const repoRoot = path.resolve(ctx.data.cwd, '../..')
  const serverInfoFile = path.resolve(repoRoot, 'server-needs-publishing')
  await fs.writeFile(serverInfoFile, serverVersion)
  const summaryLine = `Bumped server version to \`${serverVersion}\`  \n`
  await fs.appendFile(
    path.resolve(repoRoot, 'GITHUB_STEP_SUMMARY_SERVER'),
    summaryLine
  )
}

export async function success(_: any, context: any) {
  const ctx = contextSchema.safeParse(context)
  if (!ctx.success || ctx.data.cwd.endsWith('packages/server')) {
    return
  }
  const repoRoot = path.resolve(ctx.data.cwd, '../..')
  const { gitTag, name, version } = ctx.data.nextRelease
  const nameWithoutVersion = name.replace(`@${version}`, '')
  const summaryLine = `- [\`${gitTag}\`](https://www.npmjs.com/package/${nameWithoutVersion}/v/${version})  \n`
  await fs.appendFile(
    path.resolve(repoRoot, 'GITHUB_STEP_SUMMARY_PACKAGES'),
    summaryLine
  )
}
