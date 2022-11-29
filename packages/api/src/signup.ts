import { z } from 'zod'
import { identitySchema } from './schemas/identity'

export const signupRequestBody = identitySchema

export type SignupRequestBody = z.infer<typeof signupRequestBody>
