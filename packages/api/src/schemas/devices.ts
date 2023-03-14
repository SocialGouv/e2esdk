import { z } from 'zod'
import { secretBoxCiphertextV1Schema } from './encodings'

export const deviceIdSchema = z.string().uuid()
export const deviceLabelSchema = secretBoxCiphertextV1Schema('txt')
