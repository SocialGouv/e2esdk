import { z } from 'zod'
import { identitySchema } from './schemas/identity'

// Request and response have the same shape:
// the server echoes its input, allowing the
// client to verify what was stored and authenticate the server.
export const signupBody = identitySchema
export type SignupBody = z.infer<typeof signupBody>
