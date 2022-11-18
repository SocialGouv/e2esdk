import { z } from 'zod'
import { publicIdentitySchema } from './schemas/identity'

export const getSingleIdentityResponseBody = publicIdentitySchema
export type GetSingleIdentityResponseBody = z.infer<
  typeof getSingleIdentityResponseBody
>

export const getMultipleIdentitiesResponseBody = z.array(publicIdentitySchema)
export type GetMultipleIdentitiesResponseBody = z.infer<
  typeof getMultipleIdentitiesResponseBody
>
