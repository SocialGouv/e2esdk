import { z } from 'zod'
import { fingerprintSchema } from './schemas/encodings'
import { publicIdentitySchema } from './schemas/identity'

export const permissionFlags = z.object({
  allowSharing: z.boolean(),
  allowRotation: z.boolean(),
  allowDeletion: z.boolean(),
  allowManagement: z.boolean(),
})

export type PermissionFlags = z.infer<typeof permissionFlags>

export const postPermissionRequestBody = permissionFlags.partial().extend({
  userId: publicIdentitySchema.shape.userId,
  nameFingerprint: fingerprintSchema,
})

export type PostPermissionRequestBody = z.infer<
  typeof postPermissionRequestBody
>
