import { IncomingMessage, ServerResponse } from 'http';
import { Params } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { CORRELATION_ID_HEADER } from '../interceptors/correlation-id.interceptor';

export const buildLoggerConfig = (
  nodeEnv: string,
  logLevel: string,
): Params => {
  const isProduction = nodeEnv === 'production';

  return {
    pinoHttp: {
      level: logLevel,
      autoLogging: true,
      genReqId: (req: IncomingMessage) => {
        const header = req.headers[CORRELATION_ID_HEADER];
        if (typeof header === 'string' && header.length > 0) {
          return header;
        }
        return randomUUID();
      },
      customProps: (req: IncomingMessage) => ({
        requestId: req.headers[CORRELATION_ID_HEADER],
      }),
      serializers: {
        req: (req: IncomingMessage) => ({
          method: req.method,
          url: req.url,
          requestId: req.headers[CORRELATION_ID_HEADER],
        }),
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
      },
      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
            },
          },
    },
  };
};
