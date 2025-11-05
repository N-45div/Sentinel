/**
 * x402 Server Application
 * TypeScript implementation with x402 middleware using Gill template patterns
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getServerContext } from '../lib/get-server-context.js';
import { createX402MiddlewareWithUtils } from '../lib/x402-middleware.js';
import { successResponse, errorResponse } from '../lib/api-response-helpers.js';
import { REQUEST_TIMEOUT, RETRY_ATTEMPTS, REQUEST_BODY_LIMIT, PAYMENT_AMOUNTS } from '../lib/constants.js';
import { enforcePolicy } from '../lib/switchboard-policy.js';
import { verifyTapFromRequest } from '../lib/tap-verify.js';
import crypto from 'crypto';
import nacl from 'tweetnacl';

// Initialize context
const context = getServerContext();
const app: Express = express();

// Setup middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  context.log.info(`${req.method} ${req.path}`);
  next();
});

// Create x402 utils instance
const x402Utils = createX402MiddlewareWithUtils(
  {},
  {
    facilitatorUrl: context.config.facilitatorUrl,
    timeout: REQUEST_TIMEOUT,
    retryAttempts: RETRY_ATTEMPTS,
  }
);

// Augment Request with optional TAP info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tap?: { commitment?: string; claims?: any };
    }
  }
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const facilitatorHealth = await x402Utils.healthCheck();
    res.json(
      successResponse({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        facilitator: facilitatorHealth,
      })
    );
  } catch (error) {
    res
      .status(500)
      .json(errorResponse(error instanceof Error ? error.message : 'Unknown error', 'HEALTH_CHECK_FAILED', 500));
  }
});

// Public endpoint (no payment required)
app.get('/public', (_req, res) => {
  res.json(
    successResponse({
      message: 'This is a public endpoint - no payment required',
      timestamp: new Date().toISOString(),
    })
  );
});

// TAP Agent: minimal in-repo Agent Registry and signing endpoints
app.get('/tap/keys/:keyId', (req, res) => {
  const { keyId } = req.params;
  const envKeyId = process.env.TAP_KEY_ID || '';
  const alg = (process.env.TAP_ALG || '').toLowerCase();
  if (!envKeyId || keyId !== envKeyId) {
    res.status(404).json(errorResponse('Key not found', 'TAP_KEY_NOT_FOUND', 404));
    return;
  }
  let public_key = '';
  if (alg === 'ed25519') {
    public_key = process.env.ED25519_PUBLIC_KEY || '';
  } else if (alg === 'rsa-pss-sha256') {
    public_key = (process.env.RSA_PUBLIC_KEY || '').replace(/\\n/g, '\n');
  } else {
    res.status(400).json(errorResponse('Unsupported algorithm', 'TAP_UNSUPPORTED_ALG', 400));
    return;
  }
  res.json({
    key_id: envKeyId,
    is_active: 'true',
    public_key,
    algorithm: alg,
    description: 'Local TAP Agent key',
  });
});

app.post('/tap/sign', async (req, res) => {
  try {
    const { url, authority: authBody, path: pathBody, keyId, alg, ttlSec = 300, tag = 'agent-auth', nonce } = req.body || {};
    const envKeyId = process.env.TAP_KEY_ID || keyId || '';
    const algorithm = String(alg || process.env.TAP_ALG || '').toLowerCase();
    if (!envKeyId) {
      res.status(400).json(errorResponse('Missing keyId (TAP_KEY_ID)', 'TAP_SIGN_MISSING_KEYID', 400));
      return;
    }
    if (algorithm !== 'ed25519' && algorithm !== 'rsa-pss-sha256') {
      res.status(400).json(errorResponse('Unsupported algorithm', 'TAP_SIGN_UNSUPPORTED_ALG', 400));
      return;
    }
    let authority = authBody;
    let path = pathBody;
    if (url && (!authority || !path)) {
      try {
        const u = new URL(url);
        authority = u.host;
        path = u.pathname + (u.search || '');
      } catch {}
    }
    if (!authority || !path) {
      res.status(400).json(errorResponse('Missing authority/path or url', 'TAP_SIGN_MISSING_URL', 400));
      return;
    }
    const created = Math.floor(Date.now() / 1000);
    const expires = created + Number(ttlSec);
    const useNonce = nonce || crypto.randomBytes(12).toString('hex');
    const signatureParams = `("@authority" "@path"); created=${created}; expires=${expires}; keyId="${envKeyId}"; alg="${algorithm}"; nonce="${useNonce}"; tag="${tag}"`;
    const signatureBase = [
      `"@authority": ${authority}`,
      `"@path": ${path}`,
      `"@signature-params": ${signatureParams}`,
    ].join('\n');

    let signatureB64 = '';
    if (algorithm === 'rsa-pss-sha256') {
      const privPem = (process.env.RSA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signatureBase, 'utf-8');
      const sig = signer.sign({ key: privPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN });
      signatureB64 = Buffer.from(sig).toString('base64');
    } else if (algorithm === 'ed25519') {
      const privB64 = process.env.ED25519_PRIVATE_KEY || '';
      const priv = Buffer.from(privB64, 'base64');
      if (priv.length !== 32) {
        res.status(400).json(errorResponse('Invalid ED25519_PRIVATE_KEY (must be base64 of 32 bytes)', 'TAP_SIGN_BAD_KEY', 400));
        return;
      }
      const kp = nacl.sign.keyPair.fromSeed(priv);
      const sig = nacl.sign.detached(Buffer.from(signatureBase, 'utf-8'), kp.secretKey);
      signatureB64 = Buffer.from(sig).toString('base64');
    }

    const signature_input = `sig2=(${"\"@authority\" \"@path\""}); created=${created}; expires=${expires}; keyId="${envKeyId}"; alg="${algorithm}"; nonce="${useNonce}"; tag="${tag}"`;
    const signature = `sig2=:${signatureB64}:`;
    res.json({ signature_input, signature, authority, path });
  } catch (e) {
    res.status(500).json(errorResponse('TAP sign error', 'TAP_SIGN_ERROR', 500));
  }
});

// Free passthrough to MCP (discovery + dev usage)
app.post('/mcp', async (req, res) => {
  try {
    const target = context.config.mcpUrl || 'http://localhost:3001/mcp';
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (error) {
    res
      .status(502)
      .json(errorResponse(error instanceof Error ? error.message : 'Upstream MCP error', 'MCP_PROXY_ERROR', 502));
  }
});

// Paid passthrough to MCP (requires SOL payment via x402)
const executeMw = createX402MiddlewareWithUtils(
  {
    amount: PAYMENT_AMOUNTS.GENERATE_CONTENT, // default price; clients can override by route variant later
    payTo: context.config.merchantSolanaAddress || context.config.facilitatorPublicKey || '',
    asset: 'SOL',
    network: `solana-${context.config.solanaNetwork}`,
  },
  {
    facilitatorUrl: context.config.facilitatorUrl,
    timeout: REQUEST_TIMEOUT,
    retryAttempts: RETRY_ATTEMPTS,
  }
);

// TAP verification middleware (optional by env)
async function tapMw(req: Request, res: Response, next: NextFunction) {
  try {
    const v = await verifyTapFromRequest(req);
    if (!v.ok) {
      res.status(401).json(errorResponse(v.reason || 'TAP verification failed', 'TAP_VERIFICATION_FAILED', 401));
      return;
    }
    if (v.commitment) req.tap = { commitment: v.commitment };
    next();
  } catch (e) {
    res.status(500).json(errorResponse('TAP middleware error', 'TAP_MIDDLEWARE_ERROR', 500));
  }
}

// Switchboard policy gate before payment
async function policyMw(_req: Request, res: Response, next: NextFunction) {
  try {
    const amountLamports = BigInt(PAYMENT_AMOUNTS.GENERATE_CONTENT);
    const decision = await enforcePolicy(amountLamports);
    if (!decision.allow) {
      res
        .status(403)
        .json(
          errorResponse(
            decision.reason || 'Policy denied',
            'POLICY_DENIED',
            403
          )
        );
      return;
    }
    if (decision.solUsd !== undefined) res.set('x-policy-solusd', String(decision.solUsd));
    if (decision.usdAmount !== undefined) res.set('x-policy-usdamount', String(decision.usdAmount));
    next();
  } catch (e) {
    res.status(500).json(errorResponse('Policy middleware error', 'POLICY_MIDDLEWARE_ERROR', 500));
  }
}

function sha256Hex(obj: unknown): string {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return crypto.createHash('sha256').update(json).digest('hex');
}

function computePaymentCommitment(req: Request): string | undefined {
  if (!req.payment) return undefined;
  const receipt = {
    nonce: req.payment.nonce,
    amount: req.payment.amount,
    recipient: req.payment.recipient,
    resourceId: req.payment.resourceId,
    transactionSignature: req.payment.transactionSignature,
    timestamp: Date.now(),
  };
  return sha256Hex(receipt);
}

const JOB_TOOLS = new Set([
  'sentinel.create_job',
  'sentinel.checkpoint',
  'sentinel.settle',
]);

app.post('/mcp/execute', tapMw, policyMw, executeMw.middleware, async (req, res) => {
  try {
    const target = context.config.mcpUrl || 'http://localhost:3001/mcp';

    // Inject commitments for job tools if missing
    const body = (req.body ?? {}) as any;
    if (body?.method === 'tools/call' && body?.params?.name && JOB_TOOLS.has(body.params.name)) {
      body.params.arguments = body.params.arguments || {};
      if (!body.params.arguments.paymentCommitment) {
        const pc = computePaymentCommitment(req);
        if (pc) body.params.arguments.paymentCommitment = pc;
      }
      if (!body.params.arguments.tapCommitment && req.tap?.commitment) {
        body.params.arguments.tapCommitment = req.tap.commitment;
      }
    }
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    res.set({
      'x-payment-processed': 'true',
      'x-payment-method': 'solana-sol',
      'x-payment-network': String(context.config.solanaNetwork || 'devnet'),
      'x-payment-transaction': req.payment?.transactionSignature || '',
    });
    res.status(r.status).json(data);
  } catch (error) {
    res
      .status(502)
      .json(errorResponse(error instanceof Error ? error.message : 'Upstream MCP error', 'MCP_PROXY_ERROR', 502));
  }
});

// ============================================================================
// PROTECTED ENDPOINTS (x402 Payment Required)
// ============================================================================

// Premium data endpoint - 0.01 SOL
const premiumRouteMw = createX402MiddlewareWithUtils(
  {
    amount: PAYMENT_AMOUNTS.PREMIUM_DATA,
    payTo: context.config.merchantSolanaAddress || context.config.facilitatorPublicKey || '',
    asset: 'SOL',
    network: `solana-${context.config.solanaNetwork}`,
  },
  {
    facilitatorUrl: context.config.facilitatorUrl,
    timeout: REQUEST_TIMEOUT,
    retryAttempts: RETRY_ATTEMPTS,
  }
);

app.get('/api/premium-data', premiumRouteMw.middleware, (req, res) => {
  res.set({
    'x-payment-processed': 'true',
    'x-payment-method': 'solana-sol',
    'x-payment-network': 'devnet',
    'x-payment-transaction': req.payment?.transactionSignature,
  });

  res.json(
    successResponse({
      message: 'Premium data accessed successfully',
      data: {
        secret: 'This is premium content that requires payment',
        timestamp: new Date().toISOString(),
        payment: req.payment,
      },
    })
  );
});

// Generate content endpoint - 0.005 SOL
const generateContentMw = createX402MiddlewareWithUtils(
  {
    amount: PAYMENT_AMOUNTS.GENERATE_CONTENT,
    payTo: context.config.merchantSolanaAddress || context.config.facilitatorPublicKey || '',
    asset: 'SOL',
    network: `solana-${context.config.solanaNetwork}`,
  },
  {
    facilitatorUrl: context.config.facilitatorUrl,
    timeout: REQUEST_TIMEOUT,
    retryAttempts: RETRY_ATTEMPTS,
  }
);

app.post('/api/generate-content', generateContentMw.middleware, (req, res): void => {
  const { prompt } = req.body;

  if (!prompt) {
    res.status(400).json(errorResponse('Prompt is required', 'MISSING_PROMPT', 400));
    return;
  }

  res.json(
    successResponse({
      message: 'Content generated successfully',
      data: {
        prompt: prompt,
        generatedContent: `AI-generated content for: "${prompt}"`,
        timestamp: new Date().toISOString(),
        payment: req.payment,
      },
    })
  );
});

// File download endpoint - 0.02 SOL
const downloadMw = createX402MiddlewareWithUtils(
  {
    amount: PAYMENT_AMOUNTS.DOWNLOAD_FILE,
    payTo: context.config.merchantSolanaAddress || context.config.facilitatorPublicKey || '',
    asset: 'SOL',
    network: `solana-${context.config.solanaNetwork}`,
  },
  {
    facilitatorUrl: context.config.facilitatorUrl,
    timeout: REQUEST_TIMEOUT,
    retryAttempts: RETRY_ATTEMPTS,
  }
);

app.get('/api/download/:fileId', downloadMw.middleware, (req, res) => {
  const { fileId } = req.params;

  res.json(
    successResponse({
      message: 'File download authorized',
      data: {
        fileId: fileId,
        // TODO: Implement actual file download URL generation
        downloadUrl: `/files/${fileId}`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        payment: req.payment,
      },
    })
  );
});

// Tier-based access endpoint - 0.05 SOL
const tierMw = createX402MiddlewareWithUtils(
  {
    amount: PAYMENT_AMOUNTS.TIER_ACCESS,
    payTo: context.config.merchantSolanaAddress || context.config.facilitatorPublicKey || '',
    asset: 'SOL',
    network: `solana-${context.config.solanaNetwork}`,
  },
  {
    facilitatorUrl: context.config.facilitatorUrl,
    timeout: REQUEST_TIMEOUT,
    retryAttempts: RETRY_ATTEMPTS,
  }
);

app.get('/api/tier/:tier', tierMw.middleware, (req, res) => {
  const { tier } = req.params;
  const payment = req.payment;

  res.json(
    successResponse({
      message: `Access granted to ${tier} tier`,
      data: {
        tier: tier,
        features: [`${tier} tier features enabled`],
        payment: payment,
      },
    })
  );
});

// Stats endpoint - public
app.get('/stats', async (_req, res) => {
  try {
    // Get facilitator stats
    const statsResponse = await fetch(`${context.config.facilitatorUrl}/stats`);
    const stats = await statsResponse.json();
    res.json(successResponse(stats));
  } catch (error) {
    res
      .status(500)
      .json(errorResponse(error instanceof Error ? error.message : 'Failed to get stats', 'STATS_ERROR', 500));
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json(errorResponse('The requested resource was not found', 'NOT_FOUND', 404));
});

// ============================================================================
// START SERVER
// ============================================================================

async function start() {
  try {
    app.listen(context.config.port, () => {
      context.log.info(`Server App running on port ${context.config.port}`);
      context.log.info(`Facilitator URL: ${context.config.facilitatorUrl}`);
      context.log.info('');
      context.log.info('Available endpoints:');
      context.log.info('  GET  /health - Health check');
      context.log.info('  GET  /public - Public endpoint (no payment)');
      context.log.info('  POST /mcp - MCP discovery passthrough (free)');
      context.log.info('  POST /mcp/execute - MCP paid passthrough (SOL via x402)');
      context.log.info('  GET  /api/premium-data - Premium data (payment required)');
      context.log.info('  POST /api/generate-content - Generate content (payment required)');
      context.log.info('  GET  /api/download/:fileId - Download file (payment required)');
      context.log.info('  GET  /api/tier/:tier - Tier-based access (payment required)');
      context.log.info('  GET  /stats - Payment statistics');
    });
  } catch (error) {
    context.log.error('Failed to start Server App:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  context.log.info('Shutting down Server App...');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the app
start();

export { app, context };
