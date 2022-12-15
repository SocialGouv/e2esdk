import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const serverContextSchema = z.object({
  cwd: z.string().endsWith('/packages/server'),
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
  const ctx = serverContextSchema.safeParse(context)
  if (!ctx.success) {
    return
  }
  const serverVersion = ctx.data.nextRelease.version
  const repoRoot = path.resolve(ctx.data.cwd, '../..')
  const serverInfoFile = path.resolve(repoRoot, 'server-needs-publishing')
  await fs.writeFile(serverInfoFile, serverVersion)
  console.log(
    `Wrote server version ${serverVersion} to ${serverInfoFile} for Docker to pick up and push image`
  )
}

export async function success(_: any, context: any) {
  const ctx = serverContextSchema.omit({ cwd: true }).safeParse(context)
  if (!ctx.success) {
    console.dir(context, { depth: 2 })
    return
  }
  const { gitTag, channel, name, version } = ctx.data.nextRelease
  console.dir({ gitTag, channel, name, version })
  try {
    await fs.appendFile(
      ctx.data.env.GITHUB_STEP_SUMMARY,
      `📦 [\`${gitTag}\`](https://www.npmjs.com/package/${name}/v/${version}) was published on NPM  \n`
    )
  } catch (error) {
    console.error(error)
  }
}
