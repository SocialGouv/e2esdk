import { HandleRegistration } from '@47ng/opaque-server'
import {
  ActiveSession,
  Device,
  DeviceEnrolledResponse,
  deviceEnrolledResponse,
  DeviceEnrollmentRecord,
  deviceEnrollmentRecord,
  deviceEnrollmentRequest,
  DeviceEnrollmentRequest,
  deviceEnrollmentResponse,
  DeviceEnrollmentResponse,
  deviceIdSchema,
  deviceSchema,
  listDevicesResponseBody,
  ListDevicesResponseBody,
  requestHeaders,
  RequestHeaders,
} from '@socialgouv/e2esdk-api'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  createDevice,
  deleteUserDevice,
  getUserDevice,
  getUserDevices,
} from '../../database/models/devices.js'
import { env } from '../../env.js'
import { generateNonce } from '../../lib/crypto.js'
import { decryptSession } from '../../plugins/auth.js'
import { App } from '../../types'

export default async function devicesRoutes(app: App) {
  const redisKey = (nonce: string) =>
    app.redis.key(['auth', 'opaque', 'device', 'enrollment', nonce])

  const deviceIdUrlParams = z.object({
    deviceId: deviceIdSchema,
  })
  type DeviceIdUrlParams = z.infer<typeof deviceIdUrlParams>

  app.post<{
    Headers: RequestHeaders
    Body: DeviceEnrollmentRequest
    Reply: DeviceEnrollmentResponse
  }>(
    '/devices/enrollment/request',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['auth', 'devices'],
        summary: 'Device enrollment start',
        headers: app.auth.headers,
        body: zodToJsonSchema(deviceEnrollmentRequest, {
          $refStrategy: 'none',
        }),
        response: {
          200: zodToJsonSchema(deviceEnrollmentResponse, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function deviceEnrollmentRequest(req, res) {
      req.auditLog.trace({
        msg: 'deviceEnrollmentRequest:init',
        body: req.body,
      })
      const registration = new HandleRegistration(env.OPAQUE_SERVER_SETUP)
      const registrationResponse = app.sodium.to_base64(
        registration.start(
          app.sodium.from_string(req.identity.userId),
          app.sodium.from_base64(req.body.registrationRequest)
        )
      )
      registration.free()
      const nonce = generateNonce()
      await req.server.redis.client.setex(
        redisKey(nonce),
        120,
        req.identity.userId
      )
      req.auditLog.info({
        msg: 'deviceEnrollmentRequest:success',
        body: req.body,
        nonce,
        registrationResponse,
      })
      return res.send({
        nonce,
        registrationResponse,
      })
    }
  )

  // --

  app.post<{
    Headers: RequestHeaders
    Body: DeviceEnrollmentRecord
    Reply: DeviceEnrolledResponse
  }>(
    '/devices/enrollment/record',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['auth', 'devices'],
        summary: 'Device enrollment finish',
        headers: app.auth.headers,
        body: zodToJsonSchema(deviceEnrollmentRecord, { $refStrategy: 'none' }),
        response: {
          201: zodToJsonSchema(deviceEnrolledResponse, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function deviceEnrollmentRecord(req, res) {
      req.auditLog.trace({
        msg: 'deviceEnrollmentRecord:init',
        body: req.body,
      })
      const userId = await req.server.redis.client.get(redisKey(req.body.nonce))
      if (!userId || userId !== req.identity.userId) {
        const reason =
          'Failed to complete device enrollment in time, please try again'
        req.auditLog.warn({
          msg: 'deviceEnrollmentRecord:timeout',
          body: req.body,
          userId,
          reason,
        })
        throw app.httpErrors.forbidden(reason)
      }
      const registration = new HandleRegistration(env.OPAQUE_SERVER_SETUP)
      const opaqueCredentials = app.sodium.to_base64(
        registration.finish(app.sodium.from_base64(req.body.registrationRecord))
      )
      const deviceRecord = await createDevice(app.db, {
        ownerId: req.identity.userId,
        opaqueCredentials,
        label: req.body.deviceLabel ?? null,
        wrappedMainKey: req.body.wrappedMainKey,
        enrolledFrom: req.deviceId,
      })
      if (!deviceRecord) {
        throw req.server.httpErrors.conflict('Failed to create device record')
      }
      await req.server.redis.client.del(redisKey(req.body.nonce))
      req.auditLog.info({
        msg: 'deviceEnrollmentRecord:success',
        body: req.body,
      })
      return res.status(201).send({
        deviceId: deviceRecord.id,
      })
    }
  )

  // --

  app.get<{
    Headers: RequestHeaders
    Reply: ListDevicesResponseBody
  }>(
    '/devices',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['devices'],
        summary: 'List enrolled devices owned by the current user',
        headers: app.auth.headers,
        response: {
          200: zodToJsonSchema(listDevicesResponseBody, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function listDevices(req, res) {
      req.auditLog.trace('listDevices:init')
      const devices = await getUserDevices(req.server.db, req.identity.userId)
      const redisSessionKeys = await req.server.auth.getRedisSessionKeys(
        req.identity.userId
      )
      const activeSessions: ActiveSession[] = []
      for (const redisKey of redisSessionKeys) {
        try {
          const sessionId = redisKey.slice(redisKey.lastIndexOf(':') + 1)
          const sessionData = await decryptSession(
            req,
            req.identity.userId,
            sessionId
          )
          activeSessions.push({
            deviceId: sessionData.deviceId,
            ip: sessionData.ip,
            sessionId,
          })
        } catch {
          continue
        }
      }

      const body: ListDevicesResponseBody = devices.map(device => ({
        id: device.id,
        createdAt: device.createdAt,
        enrolledFrom: device.enrolledFrom ?? undefined,
        wrappedMainKey: device.wrappedMainKey,
        label: device.label ?? undefined,
        sessions: activeSessions.filter(
          session => session.deviceId === device.id
        ),
      }))
      req.auditLog.info({ msg: 'listDevices:success', devices: body })
      return res.send(body)
    }
  )

  app.get<{
    Params: DeviceIdUrlParams
    Headers: RequestHeaders
    Reply: Device
  }>(
    '/devices/:deviceId',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['devices'],
        summary: 'Get an enrolled device by ID for the current user',
        headers: app.auth.headers,
        params: zodToJsonSchema(deviceIdUrlParams, {
          $refStrategy: 'none',
        }),
        response: {
          200: zodToJsonSchema(deviceSchema, {
            $refStrategy: 'none',
          }),
        },
      },
    },
    async function getEnrolledDevice(req, res) {
      req.auditLog.trace({ msg: 'getEnrolledDevice:init', params: req.params })
      const device = await getUserDevice(
        req.server.db,
        req.identity.userId,
        req.params.deviceId
      )
      if (!device) {
        throw req.server.httpErrors.notFound(
          'No such device is associated with this account'
        )
      }
      const body: Device = {
        id: device.id,
        createdAt: device.createdAt,
        enrolledFrom: device.enrolledFrom ?? undefined,
        wrappedMainKey: device.wrappedMainKey,
        label: device.label ?? undefined,
      }
      req.auditLog.info({
        msg: 'getEnrolledDevice:success',
        params: req.params,
        device: body,
      })
      return res.send(body)
    }
  )

  // --

  app.delete<{
    Params: DeviceIdUrlParams
    Headers: RequestHeaders
  }>(
    '/devices/:deviceId',
    {
      preHandler: app.useAuth(),
      schema: {
        tags: ['auth', 'devices'],
        summary: 'Revoke an enrolled device',
        headers: zodToJsonSchema(requestHeaders, { $refStrategy: 'none' }),
        params: zodToJsonSchema(deviceIdUrlParams, {
          $refStrategy: 'none',
        }),
        response: {
          204: {
            type: 'null',
          },
        },
      },
    },
    async function revokeEnrolledDevice(req, res) {
      req.auditLog.trace({
        msg: 'revokeEnrolledDevice:init',
        params: req.params,
      })
      await deleteUserDevice(app.db, req.identity.userId, req.params.deviceId)
      req.auditLog.info({
        msg: 'revokeEnrolledDevice:success',
        params: req.params,
      })
      return res.status(204).send()
    }
  )
}
