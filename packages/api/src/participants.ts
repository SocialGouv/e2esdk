import { z } from 'zod'
import { permissionFlags } from './permissions'
import { timestampSchema } from './schemas/encodings'
import { publicIdentitySchema } from './schemas/identity'

export const getParticipantsResponseBody = z.array(
  publicIdentitySchema.merge(permissionFlags).merge(
    z.object({
      addedAt: timestampSchema,
      sharedBy: publicIdentitySchema.shape.userId.nullable(),
    })
  )
)
export type GetParticipantsResponseBody = z.infer<
  typeof getParticipantsResponseBody
>
