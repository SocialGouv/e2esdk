import { z } from 'zod'
import { fullIdentitySchema } from './schemas/identity'

export const signupRequestBody = fullIdentitySchema

export type SignupRequestBody = z.infer<typeof signupRequestBody>
