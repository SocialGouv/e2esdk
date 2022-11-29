import { z } from 'zod'
import { permissionFlags } from './permissions'
import { timestampSchema } from './schemas/encodings'
import { identitySchema } from './schemas/identity'

export const getParticipantsResponseBody = z.array(
  identitySchema.merge(permissionFlags).merge(
    z.object({
      addedAt: timestampSchema,
      sharedBy: identitySchema.shape.userId.nullable(),
    })
  )
)
export type GetParticipantsResponseBody = z.infer<
  typeof getParticipantsResponseBody
>
