import {
   horizonRequest,
   type HorizonRequestInit,
} from '../utils/horizon-api.utils';

/**
 * Horizon HTTP client. All outbound Horizon traffic must go through these helpers
 * so structured request logging is applied consistently.
 */
export async function horizonGet(
   endpoint: string,
   init: Omit<HorizonRequestInit, 'method'> = {}
): Promise<Response> {
   return horizonRequest(endpoint, { ...init, method: 'GET' });
}

export async function horizonPost(
   endpoint: string,
   init: Omit<HorizonRequestInit, 'method'> = {}
): Promise<Response> {
   return horizonRequest(endpoint, { ...init, method: 'POST' });
}

export { horizonRequest };
