# Automated changeset generation

TL;DR: Jump to [commit message documentation](#commit-message-documentation)

This monorepo uses [changeset](https://github.com/changesets/changesets)
to manage versioning for public NPM packages.

Changeset uses changeset files to describe changes that are to be applied to
package versions, along with some changelog text content.

This monorepo also uses conventional commit messages, where a commit message
will convey information like the type of change (bug fix, new feature, etc),
and a detailed description of the change.

While there are tools like semantic-release that are solely based on the commit
message to drive their versioning and releasing decisions, they are often not
adapted to complex dependency management between internal and public packages,
a task for which changeset was designed.

Moreover, semantic-release can be sometimes counter-intuitive if the intent to
release is not directly linked to a bug fix or feature (for example, updating
dependencies).

The use of the commit message as the source of truth was a convenient one though,
as providing one is a mandatory step in declaring changes. Coupled with a linter
to ensure correct formatting, some actions can be derived from the commit message.

## Why can't we have both?

What if we could use changeset files to drive the versioning and changelog
generation, but have those somehow driven by the commit message?

This is what this package is about.

It reads the commit message, and tries to find directives to pass on to
changesets. If it finds some, it will generate a changeset file, and include
it in the commit itself.

The generated file can be edited in later commits and reviewed,
before changesets consumes it to calculate new versions.

## How does it work?

It uses Git hooks to read the commit message, generate a changeset file,
and add it to the files to be commited.

Because no (current) Git hook can both read the message (commit-msg or post-commit)
and stage files to be commited (only pre-commit), we need to do this in two steps:

1. Generate the changeset file in a post-commit hook, where we have access to
   the commit message
2. Stage the file to be commited, and amend the previous commit

Now since the amend operation uses the same commit message, we'd risk running
in an infinite loop.

To resolve this, we create a lock file in a pre-commit hook:

```shell
# pre-commit
touch <repoRoot>/.changeset/.autocommit
```

If the file exists when we run our post-commit hook, we delete it and run our
changeset generation code.

Once this is done, we can amend by ignoring the pre-commit hook.

## Commit message documentation

First, follow conventional commit conventions (though this is not enforced by
the tool, it's a recommended practice to describe changes).

Then, anywhere in the body of the commit message, describe your changeset:

```
doc: Describe how to use changeset generation

Add a `changeset:` line, then list the packages you want to update
and what type of version bump to apply.

changeset:
- foo: major
- bar: minor
- egg: patch

You can even have multiple changeset blocks in a single commit message
(also note that `changesets:` works too, as it's easily mispelled):

changesets:
- foo: patch
- bar: minor
- baz: patch
```

The changeset instructions will be merged, using the highest bump for each package.
For the commit message above, this would end up bumping the following packages:

- `foo`: major
- `bar`: minor
- `egg`: patch
- `baz`: patch

The generated changeset file would then look like this:

```md
---
'foo': major
'bar': minor
'egg': patch
'baz': patch
---

doc: Describe how to use changeset generation
```

The name of the file is a slug of the first line of the commit message.
