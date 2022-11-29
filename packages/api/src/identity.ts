import { z } from 'zod'
import { identitySchema } from './schemas/identity'

export const getSingleIdentityResponseBody = identitySchema
export type GetSingleIdentityResponseBody = z.infer<
  typeof getSingleIdentityResponseBody
>

export const getMultipleIdentitiesResponseBody = z.array(identitySchema)
export type GetMultipleIdentitiesResponseBody = z.infer<
  typeof getMultipleIdentitiesResponseBody
>
