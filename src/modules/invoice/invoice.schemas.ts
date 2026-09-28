import { z } from 'zod';

export const InvoiceComparisonQuerySchema = z
   .object({
      ids: z.string().refine(
         val => val.split(',').length <= 2,
         'Maximum 2 invoice IDs allowed'
      ),
   })
   .strict();

export type InvoiceComparisonQueryType = z.infer<typeof InvoiceComparisonQuerySchema>;

// Individual invoice metric response shape
export const InvoiceMetricSchema = z.object({
   invoiceId: z.string(),
   amount: z.string(),
   rate: z.string(),
   maturity: z.string(),
   riskRating: z.string(),
   sellerStats: z.record(z.any()),
   fundingProgress: z.string(),
});

export type InvoiceMetric = z.infer<typeof InvoiceMetricSchema>;

export const InvoiceComparisonResponseSchema = z.object({
   comparison: z.object({
      invoiceId: z.string(),
      metrics: z.array(InvoiceMetricSchema),
   }),
});

export type InvoiceComparisonResponse = z.infer<typeof InvoiceComparisonResponseSchema>;