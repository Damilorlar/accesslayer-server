import { AsyncController } from '../../types/auth.types';
import { InvoiceComparisonQuerySchema } from './invoice.schemas';
import { fetchInvoiceComparison } from './invoice.service';
import { sendSuccess, sendValidationError } from '../../utils/api-response.utils';

const CACHE_TTL_SECONDS = 30;

export const httpGetInvoiceComparison: AsyncController = async (req, res, next) => {
   try {
      const parsed = InvoiceComparisonQuerySchema.safeParse(req.query);
      if (!parsed.success) {
         return sendValidationError(
            res,
            'Invalid query parameters',
            parsed.error.issues.map(issue => ({
               field: issue.path.join('.'),
               message: issue.message,
            }))
         );
      }

      const { ids } = parsed.data;
      const idArray = ids.split(',').map(id => id.trim()).filter(id => id.length > 0);

      if (idArray.length > 2) {
         return sendValidationError(
            res,
            'Maximum 2 invoice IDs allowed',
            [{ field: 'ids', message: 'Maximum 2 invoice IDs allowed' }]
         );
      }

      if (idArray.length < 2) {
         return sendValidationError(
            res,
            'At least 2 invoice IDs required',
            [{ field: 'ids', message: 'At least 2 invoice IDs required' }]
         );
      }

      const comparison = await fetchInvoiceComparison(idArray);

      res.setHeader('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
      sendSuccess(res, comparison);
   } catch (error) {
      next(error);
   }
};