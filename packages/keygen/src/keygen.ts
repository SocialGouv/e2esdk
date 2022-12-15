#!/usr/bin/env zx

import {
  deriveClientIdentity,
  multipartSignature,
  sodium,
  verifyMultipartSignature,
} from '@socialgouv/e2esdk-crypto'
import crypto from 'node:crypto'

async function main() {
  await import('zx/globals')

  const pkg = require(path.resolve(__dirname, '../package.json'))

  if (argv.help || !argv._[0]) {
    console.log(`
  ${chalk.bold('Generate Sodium keys')} ${chalk.dim(`v${pkg.version}`)}

  Usage:
    ${chalk.dim('$')} keygen ${chalk.green('[algorithm]')} ${chalk.dim(
      '(OPTIONS)'
    )}

  Algorithms:
    ${chalk.green('•')} box              ${chalk.italic.dim('x25519')}
    ${chalk.green('•')} sealedBox        ${chalk.italic.dim('x25519')}
    ${chalk.green('•')} secretBox        ${chalk.italic.dim(
      'XChaCha20-Poly1305'
    )}
    ${chalk.green('•')} sign, signature  ${chalk.italic.dim('ed25519')}
    ${chalk.green('•')} identity         ${chalk.italic.dim(
      'Complete e2esdk Identity'
    )}

  Options:
    --help             Show this message
    --compact          Single-line JSON output
    --env [name]       Output in .env format, using [name] as prefix
    --seed [seed]      Create a seeded signature key pair       ${chalk.italic.dim(
      "(only for `signature` and don't use for production!)"
    )}
    --userId [userId]  Set the user ID in the returned Identity ${chalk.italic.dim(
      '(only for `identity`)'
    )}
  `)
    process.exit(0)
  }

  await sodium.ready

  const indentation = argv.compact ? 0 : 2

  function envName(name: string) {
    return [argv.env, name].join('_').toUpperCase().replace(/\W/g, '_')
  }

  if (argv._[0].toLowerCase() === 'secretbox') {
    const key = sodium.crypto_secretbox_keygen('base64')
    if (argv.env) {
      console.log(`${envName('SECRET_KEY')}=${key}`)
    } else {
      console.log(
        JSON.stringify(
          {
            key,
          },
          null,
          indentation
        )
      )
    }
  }
  if (['box', 'sealedbox'].includes(argv._[0].toLowerCase())) {
    const { publicKey, privateKey } = sodium.crypto_box_keypair('base64')
    if (argv.env) {
      console.log(`${envName('PUBLIC_KEY')}=${publicKey}
${envName('PRIVATE_KEY')}=${privateKey}`)
    } else {
      console.log(JSON.stringify({ publicKey, privateKey }, null, indentation))
    }
  }
  if (['sign', 'signature'].includes(argv._[0])) {
    if (argv.seed) {
      // Construct a human-readable but base64-compatible 32 byte string
      const seed =
        (
          '___' + (argv.seed as string).trim().replace(/\W/g, '-').slice(0, 38)
        ).padEnd(42, '_') + 'w'
      const { publicKey, privateKey } = sodium.crypto_sign_seed_keypair(
        sodium.from_base64(seed),
        'base64'
      )
      const input = sodium.randombytes_buf(32)
      const signature = multipartSignature(
        sodium,
        sodium.from_base64(privateKey),
        input
      )
      const verified = verifyMultipartSignature(
        sodium,
        sodium.from_base64(publicKey),
        signature,
        input
      )
      if (!verified) {
        console.error('Failed to generate key pair with this seed')
      }
      if (argv.env) {
        console.log(`${envName('PUBLIC_KEY')}=${publicKey}
${envName('PRIVATE_KEY')}=${privateKey}`)
      } else {
        console.log(
          JSON.stringify(
            {
              publicKey,
              privateKey,
            },
            null,
            indentation
          )
        )
      }
    } else {
      const { publicKey, privateKey } = sodium.crypto_sign_keypair('base64')
      if (argv.env) {
        console.log(`${envName('PUBLIC_KEY')}=${publicKey}
${envName('PRIVATE_KEY')}=${privateKey}`)
      } else {
        console.log(
          JSON.stringify({ publicKey, privateKey }, null, indentation)
        )
      }
    }
  }

  if (argv._[0] === 'identity') {
    const mainKey = argv.mainKey
      ? sodium.from_base64(argv.mainKey)
      : sodium.randombytes_buf(32)
    const userId = argv.userId ?? crypto.randomUUID()
    const identity = deriveClientIdentity(sodium, userId, mainKey)
    console.log(
      JSON.stringify(
        {
          mainKey: sodium.to_base64(mainKey),
          keychainBaseKey: sodium.to_base64(identity.keychainBaseKey),
          identity: {
            userId,
            sharingPublicKey: sodium.to_base64(identity.sharing.publicKey),
            signaturePublicKey: sodium.to_base64(identity.signature.publicKey),
            proof: identity.proof,
          },
        },
        null,
        indentation
      )
    )
  }
}

// --

main()
