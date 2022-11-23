#!/usr/bin/env node

import {
  encrypt,
  generateBoxKeyPair,
  generateSecretBoxCipher,
  generateSignatureKeyPair,
  sodium,
} from '@e2esdk/crypto'

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
    --userId           Set the user ID in the returned Identity ${chalk.italic.dim(
      '(only for `identity`)'
    )}
  `)
    process.exit(0)
  }

  await sodium.ready

  const indentation = argv.compact ? 0 : 2

  if (argv._[0] === 'secretBox') {
    console.log(
      JSON.stringify(
        {
          key: sodium.crypto_secretbox_keygen('base64'),
        },
        null,
        indentation
      )
    )
  }
  if (['box', 'sealedBox'].includes(argv._[0])) {
    const { publicKey, privateKey } = sodium.crypto_box_keypair('base64')
    console.log(JSON.stringify({ publicKey, privateKey }, null, indentation))
  }
  if (['sign', 'signature'].includes(argv._[0])) {
    const { publicKey, privateKey } = sodium.crypto_sign_keypair('base64')
    console.log(JSON.stringify({ publicKey, privateKey }, null, indentation))
  }

  if (argv._[0] === 'identity') {
    const personalKey = generateSecretBoxCipher(sodium)
    const signature = generateSignatureKeyPair(sodium)
    const sharing = generateBoxKeyPair(sodium)
    console.log(
      JSON.stringify(
        {
          personalKey: sodium.to_base64(personalKey.key),
          identity: {
            userId: argv.userId,
            sharingPublicKey: sodium.to_base64(sharing.publicKey),
            sharingPrivateKey: encrypt(
              sodium,
              sharing.privateKey,
              personalKey,
              'base64'
            ),
            signaturePublicKey: sodium.to_base64(signature.publicKey),
            signaturePrivateKey: encrypt(
              sodium,
              signature.privateKey,
              personalKey,
              'base64'
            ),
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
