import { z } from 'zod';
export const AcceptSpecSchema = z.object({
    scheme: z.literal('exact'),
    network: z.string(),
    asset: z.string(),
    payTo: z.string(),
    maxAmountRequired: z.string(),
    resource: z.string(),
    tokenMint: z.string().optional(),
    decimals: z.number().int().nonnegative().optional(),
});
