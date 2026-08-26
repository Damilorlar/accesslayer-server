import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { envConfig } from '../config';
import { sendUnauthorized } from '../utils/api-response.utils';

export interface JwtPayload {
  walletAddress: string;
  sub: string;
}

declare global {
  namespace Express {
    interface Request {
      jwtPayload?: JwtPayload;
    }
  }
}

export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendUnauthorized(res, 'Missing or invalid authorization header');
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, envConfig.JWT_SECRET) as JwtPayload;
    req.jwtPayload = payload;
    next();
  } catch {
    sendUnauthorized(res, 'Invalid or expired token');
  }
}

export function signJwt(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: envConfig.JWT_EXPIRES_IN as any,
  };
  return jwt.sign(payload, envConfig.JWT_SECRET, options);
}
