import { prisma } from '../../utils/prisma.utils';
import { z } from 'zod';
import {
   InvoiceMetric,
   InvoiceComparisonResponseSchema,
} from './invoice.schemas';

export async function fetchInvoiceMetrics(invoiceIds: string[]): Promise<InvoiceMetric[]> {
   const sortedIds = [...invoiceIds].sort();
   const invoices = await prisma.invoice.findMany({
      where: {
         invoiceId: {
            in: sortedIds,
         },
      },
      select: {
         invoiceId: true,
         amount: true,
         rate: true,
         maturity: true,
         riskRating: true,
         sellerStats: true,
         fundingProgress: true,
      },
   });

   const idToMetric = new Map<string, InvoiceMetric>();
   for (const inv of invoices) {
      idToMetric.set(inv.invoiceId, {
         invoiceId: inv.invoiceId,
         amount: inv.amount.toString(),
         rate: inv.rate.toString(),
         maturity: inv.maturity.toISOString(),
         riskRating: inv.riskRating,
         sellerStats: inv.sellerStats as Record<string, any> ?? {},
         fundingProgress: inv.fundingProgress.toString(),
      });
   }

   // Return metrics in the sorted ID order, filtering out missing (should not happen with valid IDs)
   return sortedIds
      .map(id => idToMetric.get(id))
      .filter((metric): metric is InvoiceMetric => metric !== null);
}

export async function fetchInvoiceComparison(
   ids: string[]
): Promise<z.infer<typeof InvoiceComparisonResponseSchema>> {
   const [id1, id2] = ids;

   const metrics1 = await fetchInvoiceMetrics([id1]);
   const metrics2 = await fetchInvoiceMetrics([id2]);

   const metric1 = metrics1[0];
   const metric2 = metrics2[0];

   if (!metric1 || !metric2) {
      throw new Error('One or both invoices not found');
   }

   return {
      comparison: {
         invoiceId: `${id1} vs ${id2}`,
         metrics: [metric1, metric2],
      },
   };
}