#!/usr/bin/env zx

import 'zx/globals'

const repoRootDir = path.resolve(__dirname, '../../../')

const commitMessage = await fs.readFile(
  path.resolve(repoRootDir, '.git', 'COMMIT_EDITMSG'),
  { encoding: 'utf8' }
)

const matches = commitMessage.match(
  /^changesets?:\n((?:- (?:(?:@e2esdk\/)?[\w-]+): (?:major|minor|patch)\n?)+)/gm
)

if (!matches) {
  process.exit(0)
}

const commitHeadline = commitMessage.split('\n')[0].trim()

const slug = commitHeadline.replace(/\W+/g, '-').toLowerCase()

/**
 * @typedef {'major' | 'minor' | 'patch'} BumpType
 */

// type BumpType = 'major' | 'minor' | 'patch'

const changesetMap = new Map()

for (const lines of matches) {
  lines
    .trim()
    .split('\n')
    .slice(1) // drop 'changeset(s):\n'
    .forEach(line => {
      const [pkg, bump] = line.slice(2).split(': ')
      const existingBump = changesetMap.get(pkg)
      changesetMap.set(
        pkg,
        existingBump ? getGreaterBump(existingBump, bump) : bump
      )
    })
}

const changesetContent = `---
${Array.from(changesetMap.entries())
  .map(([pkg, bump]) => `"${pkg}": ${bump}`)
  .join('\n')}
---

${commitHeadline}
`

await fs.writeFile(
  path.resolve(repoRootDir, '.changeset', `${slug}.md`),
  changesetContent
)

cd(repoRootDir)

$`git add .changeset/${slug}.md`

process.exit(0)

// --

/**
 * @param {BumpType} a
 * @param {BumpType} b
 * @returns
 */
function getGreaterBump(a, b) {
  // By chance, the lexicographic order is exactly reversed from its meaning,
  // so we can just invert the order
  return a < b ? a : b
}
