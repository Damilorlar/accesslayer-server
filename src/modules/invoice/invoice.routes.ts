import { Router } from 'express';
import { httpGetInvoiceComparison } from './invoice.controllers';

const invoiceRouter = Router();

/**
 * GET /invoices/compare
 *
 * Compare metrics for two invoices in a single request.
 * Accepts comma-separated invoice IDs via query parameter `ids`.
 * Example: GET /invoices/compare?ids=inv1,inv2
 *
 * Response cached with 30s TTL per invoice combination.
 */
invoiceRouter.get('/compare', httpGetInvoiceComparison);

export default invoiceRouter;