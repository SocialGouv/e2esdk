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
  const { gitTag, version } = ctx.data.nextRelease
  const name = gitTag.replace(`@${version}`, '')
  const sceau = JSON.parse(
    await fs.readFile(path.resolve(ctx.data.cwd, 'sceau.json'), {
      encoding: 'utf8',
    })
  )
  const packageJson = JSON.parse(
    await fs.readFile(path.resolve(ctx.data.cwd, 'package.json'), {
      encoding: 'utf8',
    })
  )
  const depsTable = [
    renderDependencies(packageJson.dependencies ?? {}, 'dependencies'),
    renderDependencies(packageJson.peerDependencies ?? {}, 'peerDependencies'),
    renderDependencies(packageJson.devDependencies ?? {}, 'devDependencies'),
  ]
    .filter(Boolean)
    .join('\n')

  const summaryLine = `### [\`${gitTag}\`](https://www.npmjs.com/package/${name}/v/${version})
<details><summary>📦 Dependencies</summary>

| Package | Version | Type |
|:------- |:------- |:---- |
${depsTable}

</details>

<details>
<summary>🔏 Code signature</summary>

\`\`\`json
${JSON.stringify(sceau, null, 2)}
\`\`\`

</details>

`
  await fs.appendFile(
    path.resolve(repoRoot, 'GITHUB_STEP_SUMMARY_PACKAGES'),
    summaryLine
  )

  // // Add a delay to stagger the GitHub releases running next,
  // // otherwise we end up hitting rate limiting errors.
  // const packages = [
  //   '@socialgouv/e2esdk-api',
  //   '@socialgouv/e2esdk-client',
  //   '@socialgouv/e2esdk-crypto',
  //   '@socialgouv/e2esdk-devtools',
  //   '@socialgouv/e2esdk-keygen',
  //   '@socialgouv/e2esdk-react',
  //   '@socialgouv/e2esdk-server',
  // ]
  // const packageIndex = packages.indexOf(name)
  // const staggerDelay =
  //   2000 * (packageIndex < 0 ? Math.random() * packages.length : packageIndex)
  // await setTimeout(staggerDelay)
}

function renderDependencies(input: Record<string, string>, type: string) {
  const deps = Object.fromEntries(
    Object.entries(input).filter(
      ([packageName, version]) =>
        packageName.startsWith('@socialgouv/e2esdk-') &&
        !['0.0.0-internal', 'workspace:*'].includes(version)
    )
  )
  return Object.keys(deps).length > 0
    ? Object.entries(deps)
        .map(
          ([name, version]) => `| \`${name}\` | \`${version}\` | \`${type}\` |`
        )
        .join('\n')
    : null
}
