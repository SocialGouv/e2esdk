#!/usr/bin/env zx

import {
  HandleRegistration,
  Registration,
  ServerSetup,
  set_panic_hook,
} from '@47ng/opaque-server'
import { encodeDeviceRegistrationURI } from '@socialgouv/e2esdk-api'
import {
  base64UrlEncode,
  deriveClientIdentity,
  encrypt,
  getOpaqueExportCipher,
  multipartSignature,
  sodium,
  verifyMultipartSignature,
} from '@socialgouv/e2esdk-crypto'
import crypto from 'node:crypto'

async function main() {
  await import('zx/globals')

  if (argv.help || !argv._[0]) {
    console.log(`
  ${chalk.bold('Generate Sodium keys')}

  Usage:
    ${chalk.dim('$')} keygen ${chalk.green('[algorithm]')} ${chalk.dim(
      '(OPTIONS)'
    )}

  Algorithms and options
    ${chalk.green('•')} box              ${chalk.italic.dim('x25519')}

    ${chalk.green('•')} sealedBox        ${chalk.italic.dim('x25519')}

    ${chalk.green('•')} secretBox        ${chalk.italic.dim(
      'XChaCha20-Poly1305'
    )}

    ${chalk.green('•')} sign, signature  ${chalk.italic.dim('ed25519')}
        --seed         [seed]         Create a seeded signature key pair ${chalk.dim.italic(
          "(don't use in production!)"
        )}

    ${chalk.green('•')} identity         ${chalk.italic.dim(
      'Complete e2esdk Identity'
    )}
        --userId       [userId]       Set the user ID in the returned Identity
        --mainKey      [mainKey]      Set the main key to derive the Identity from
        --deviceId     [deviceId]     Set the main device ID
        --deviceSecret [deviceSecret] Set the main device secret for OPAQUE auth
        --opaqueSetup  [opaqueSetup]  Set the server's OPAQUE serialised setup ${chalk.dim.italic(
          '(see below)'
        )}

    ${chalk.green('•')} opaque           ${chalk.italic.dim(
      'OPAQUE server setup'
    )}

  Common options:
    --help             Show this message
    --compact          Single-line JSON output
    --env [name]       Output in .env format, using [name] as prefix
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
    set_panic_hook()

    const mainKey = argv.mainKey
      ? sodium.from_base64(argv.mainKey)
      : sodium.randombytes_buf(32)
    const userId = argv.userId ?? crypto.randomUUID()
    const identity = deriveClientIdentity(sodium, userId, mainKey)
    const deviceId = argv.deviceId ?? crypto.randomUUID()
    const deviceSecret =
      argv.deviceSecret ?? sodium.randombytes_buf(32, 'base64')
    const serverSetup = ServerSetup.deserialize(
      sodium.from_base64(
        argv.opaqueServerSetup ??
          // by default, use the server .env.example value
          'y9nWjEF_GxEaTZIX8LXR8ssOuC5RJcTc5XN73WGnzN1DdksCf4VhhH7mkqC48UFBeQtCBY_77akTivYOoGTyoLLMm_1GTMPLaYSt_tvbHuGQI_xhCFjA9bBJ0fONA8QINH6rxlX0oG9lApZ65AIC5l7Q1A9YdoFh-stB81Uk7Q0'
      )
    )
    const clientRegistration = new Registration()
    const serverRegistration = new HandleRegistration(serverSetup)
    const registrationRequest = clientRegistration.start(deviceSecret)
    const registrationResponse = serverRegistration.start(
      sodium.from_string(userId),
      registrationRequest
    )
    const registrationRecord = clientRegistration.finish(
      deviceSecret,
      registrationResponse
    )
    const opaqueCredentials = sodium.to_base64(
      serverRegistration.finish(registrationRecord)
    )
    const wrappedMainKey = encrypt(
      sodium,
      mainKey,
      getOpaqueExportCipher(sodium, clientRegistration.getExportKey()),
      sodium.from_string(userId),
      'application/e2esdk.ciphertext.v1'
    )
    console.log(
      JSON.stringify(
        {
          mainKey: sodium.to_base64(mainKey),
          keychainBaseKey: sodium.to_base64(identity.keychainBaseKey),
          deviceRegistrationURI: encodeDeviceRegistrationURI(
            userId,
            deviceId,
            deviceSecret
          ),
          identity: {
            userId,
            sharingPublicKey: sodium.to_base64(identity.sharing.publicKey),
            signaturePublicKey: sodium.to_base64(identity.signature.publicKey),
            proof: identity.proof,
          },
          device: {
            id: deviceId,
            ownerId: userId,
            enrolledFrom: null,
            label: null,
            wrappedMainKey,
            opaqueCredentials,
          },
        },
        null,
        indentation
      )
    )
  }
  if (argv._[0] === 'opaque') {
    const setup = new ServerSetup()
    const env = base64UrlEncode(setup.serialize())
    console.info(`Add the following environment variable to package/server/.env:
OPAQUE_SERVER_SETUP=${env}
`)
  }
}

// --

main()
