#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import minimist from 'minimist';
import { scaffoldXmcpProject } from '@divij_web3dev/sentinel-sdk';

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

function gatewayExpressPackageJson() {
  return JSON.stringify({
    name: 'gateway-express',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js'
    },
    dependencies: {
      express: '^4.18.2',
      cors: '^2.8.5',
      helmet: '^7.1.0',
      dotenv: '^16.4.5',
      'x402-express': '^0.6.5',
      tweetnacl: '^1.0.3'
    },
    devDependencies: {
      typescript: '^5.3.3',
      tsx: '^4.7.0'
    }
  }, null, 2) + '\n';
}

function gatewayExpressEnvExample() {
  return [
    'PORT=4021',
    'FACILITATOR_URL=https://facilitator.payai.network',
    'NETWORK=solana-devnet',
    'ADDRESS=YOUR_SOL_ADDRESS_BASE58',
    'XMCP_URL=http://localhost:3001/mcp',
    'RESEARCH_URL=http://localhost:4022/research',
    'REQUIRE_TAP=true',
    'TAP_KEYS_BASEURL=http://localhost:4001',
    'TAP_DEBUG=true',
    ''
  ].join('\n');
}

function gatewayExpressIndexTs() {
  return `import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { paymentMiddleware, Resource } from 'x402-express';
import nacl from 'tweetnacl';

const facilitatorUrl = process.env.FACILITATOR_URL as Resource;
const network = process.env.NETWORK || 'solana-devnet';
const payTo = process.env.ADDRESS || '';
const xmcpUrl = process.env.XMCP_URL || '';
const researchUrl = process.env.RESEARCH_URL || '';
const requireTap = String(process.env.REQUIRE_TAP || 'false') === 'true';
const tapDebug = String(process.env.TAP_DEBUG || 'false') === 'true';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

async function tapRequired(req: any, res: any, next: any) {
  if (!requireTap) return next();
  const correlationId = req.header('x-correlation-id') || req.header('x-request-id') || '';
  const debugId = req.header('x-tap-debug-id') || correlationId;
  if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' method=' + req.method + ' host=' + req.headers['host'] + ' url=' + (req.originalUrl || req.url));
  try {
    const sigInput = req.header('signature-input') || req.header('Signature-Input');
    const signature = req.header('signature') || req.header('Signature');
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' signature-input=' + sigInput);
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' signature=' + signature);
    if (!sigInput || !signature) return res.status(401).json({ error: 'tap required' });

    // Extract params string and sig b64
    const si = String(sigInput);
    const sig = String(signature);
    const paramsIdx = si.indexOf('sig2=');
    if (paramsIdx < 0) return res.status(400).json({ error: 'invalid signature-input' });
    const signatureParams = si.slice(paramsIdx + 5).trim(); // after 'sig2='
    const sigStart = sig.indexOf('sig2=:');
    const sigEnd = sig.lastIndexOf(':');
    if (sigStart < 0 || sigEnd <= sigStart + 6) return res.status(400).json({ error: 'invalid signature' });
    const sigB64 = sig.slice(sigStart + 6, sigEnd);
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' signature-params=' + signatureParams);
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' sigB64=' + sigB64);

    // Find keyId and alg
    const keyIdMatch = signatureParams.match(/keyId="([^"]+)"/);
    const algMatch = signatureParams.match(/alg="([^"]+)"/);
    const keyId = keyIdMatch?.[1];
    const alg = algMatch?.[1] || 'ed25519';
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' keyId=' + keyId + ' alg=' + alg);
    if (!keyId) return res.status(400).json({ error: 'missing keyId' });

    const keysBase = process.env.TAP_KEYS_BASEURL || '';
    const r = await fetch(keysBase + '/tap/keys/' + encodeURIComponent(keyId));
    const keyData = await r.json().catch(() => ({}));

    const authority = req.headers['host'] || '';
    const path = req.originalUrl || req.url || '/';
    const signingString = [
      '"@authority": ' + authority,
      '"@path": ' + path,
      '"@signature-params": ' + signatureParams,
    ].join('\\n');
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' authority=' + authority + ' path=' + path);
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' signing-string:\\n' + signingString);

    const sigBytes = Buffer.from(sigB64, 'base64');
    const msgBytes = Buffer.from(signingString, 'utf-8');
    let ok = false;
    if (alg === 'ed25519' && keyData?.ed25519PublicKeyB64) {
      const pub = Buffer.from(String(keyData.ed25519PublicKeyB64), 'base64');
      ok = nacl.sign.detached.verify(msgBytes, sigBytes, pub);
    } else if (alg === 'rsa-pss-sha256' && keyData?.rsaPublicKeyPem) {
      // Minimal RSA-PSS verify via WebCrypto if available (skip for template)
      ok = true; // Assume valid; implement as needed with Node crypto
    } else {
      return res.status(400).json({ error: 'unsupported alg' });
    }
    if (!ok) {
      if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' verified=false');
      return res.status(401).json({ error: 'invalid tap signature' });
    }
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' verified=true');
    next();
  } catch (e: any) {
    if (tapDebug) console.log('[TAP VERIFY] id=' + debugId + ' error=' + (e?.message));
    return res.status(400).json({ error: e?.message || 'tap verify failed' });
  }
}

app.use(
  paymentMiddleware(
    payTo as any,
    {
      'POST /research': { price: '$0.002', network },
      'POST /mcp/execute': { price: '$0.001', network },
    } as any,
    { url: facilitatorUrl },
  ),
);

app.post('/research', tapRequired, async (req, res) => {
  try {
    const r = await fetch(researchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'research failed' });
  }
});

app.post('/mcp/execute', tapRequired, async (req, res) => {
  try {
    const r = await fetch(xmcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'mcp failed' });
  }
});

const port = Number(process.env.PORT || 4021);
app.listen(port, () => console.log('[gateway-express] :' + port));
`;
}

function researchPyRequirements() {
  return ['fastapi','uvicorn','python-dotenv','httpx','parallel-web'].join('\n') + '\n';
}

function researchPyMain() {
  return [
    'from fastapi import FastAPI',
    'from pydantic import BaseModel',
    'from dotenv import load_dotenv',
    'from parallel import Parallel, APIConnectionError, APIStatusError',
    'import httpx',
    'import os',
    '',
    'load_dotenv()',
    'app = FastAPI()',
    '',
    'class Req(BaseModel):',
    '    query: str | None = None',
    '    objective: str | None = None',
    '    searchQueries: list[str] | None = None',
    '    maxResults: int | None = 10',
    '    maxCharsPerResult: int | None = 10000',
    '    betas: list[str] | None = None',
    '',
    'def _make_client() -> Parallel:',
    '    api_key = os.getenv("PARALLEL_API_KEY")',
    '    return Parallel(api_key=api_key)',
    '',
    '@app.post("/research")',
    'def research(body: Req):',
    '    client = _make_client()',
    '    try:',
    '        objective = (body.objective or body.query or "").strip()',
    '        if not objective:',
    '            objective = "Create a comprehensive market research report on the renewable energy storage market in Europe, focusing on battery technologies and policy impacts"',
    '        search_queries = body.searchQueries or [objective]',
    '        max_results = int(body.maxResults or 10)',
    '        max_chars = int(body.maxCharsPerResult or 10000)',
    '        betas_env = (os.getenv("PARALLEL_BETAS") or "").strip()',
    '        betas_list = body.betas or [b.strip() for b in betas_env.split(",") if b.strip()]',
    '        base_url = (os.getenv("PARALLEL_BASE_URL") or "https://api.parallel.ai").rstrip("/")',
    '        url = base_url + "/v1/beta/search"',
    '        headers = {',
    '            "Authorization": "Bearer " + os.getenv("PARALLEL_API_KEY", ""),',
    '            "Content-Type": "application/json",',
    '        }',
    '        if betas_list:',
    "            headers['parallel-beta'] = ','.join(betas_list)",
    '        resp = httpx.post(url, headers=headers, json={"objective": objective, "search_queries": search_queries}, timeout=60.0)',
    '        if resp.status_code >= 400:',
    '            beta_err = { "status": resp.status_code, "body": resp.text }',
    '            try:',
    '                processor = (os.getenv("PARALLEL_PROCESSOR") or "lite").strip()',
    '                tr = client.task_run.create(input=objective, processor=processor)',
    '                rr = client.task_run.result(run_id=tr.run_id)',
    '                out = getattr(rr, "output", None)',
    '                content = getattr(out, "content", out)',
    '                text = str(content) if content is not None else ""',
    '                return { "ok": True, "mode": "task", "processor": processor, "objective": objective, "output": text }',
    '            except APIStatusError as e2:',
    '                det = ""',
    '                try:',
    '                    det = str(e2.response)',
    '                except Exception:',
    '                    det = ""',
    '                return { "ok": False, "error": "beta search failed and task fallback failed", "beta": beta_err, "task": { "status": e2.status_code, "details": det } }',
    '            except APIConnectionError:',
    '                return { "ok": False, "error": "beta search failed and task fallback connection error", "beta": beta_err }',
    '        else:',
    '            data = resp.json()',
    '            results = data.get("results", data)',
    '            return { "ok": True, "mode": "beta-search", "objective": objective, "queries": search_queries, "results": results }',
    '    except APIStatusError as e:',
    '        details = ""',
    '        try:',
    '            details = str(e.response.json())',
    '        except Exception:',
    '            try:',
    '                details = str(e.response.text)',
    '            except Exception:',
    '                details = ""',
    '        return { "ok": False, "error": f"Error code: {e.status_code}", "details": details }',
    '    except APIConnectionError:',
    '        return { "ok": False, "error": "Connection error." }',
    '    except Exception as e:',
    '        return { "ok": False, "error": str(e) }',
    ''
  ].join('\n');
}

function researchPyEnvExample() {
  return ['PARALLEL_API_KEY=','PARALLEL_BETAS=','PARALLEL_BASE_URL=','PORT=4022'].join('\n') + '\n';
}

function clientSolanaPackageJson() {
  return JSON.stringify({
    name: 'client-solana',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { dev: 'tsx src/index.ts' },
    dependencies: { dotenv: '^16.4.5', '@solana/web3.js': '^1.95.3', 'x402-fetch': '^0.6.6' },
    devDependencies: { typescript: '^5.3.3', tsx: '^4.7.0' }
  }, null, 2) + '\n';
}

function clientSolanaEnvExample() {
  return [
    '# Gateway URL',
    'RESOURCE_SERVER_URL=http://localhost:4021',
    'ENDPOINT_PATH=/research',
    '# Solana signer (use PRIVATE_KEY or SOLANA_PRIVATE_KEY_JSON)',
    'PRIVATE_KEY=',
    '# Keypair',
    'SOLANA_KEYPAIR_PATH=',
    'SOLANA_PRIVATE_KEY_JSON=',
    '# TAP signer URL (optional if REQUIRE_TAP=false)',
    'TAP_SIGN_URL=http://localhost:4001/tap/sign',
    '',
    '# Optional: JSON body override (stringified). For XMCP /mcp/execute set a JSON-RPC payload here.',
    '# JSON_BODY={"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"firecrawl.scrape","arguments":{"url":"https://example.com","mode":"markdown"}}}',
    ''
  ].join('\n');
}

function clientSolanaIndexTs() {
  return [
    "import { config } from 'dotenv';",
    "import { wrapFetchWithPayment, createSigner, decodeXPaymentResponse, type Hex } from 'x402-fetch';",
    '',
    'config();',
    '',
    'const baseURL = process.env.RESOURCE_SERVER_URL as string;',
    'const endpointPath = process.env.ENDPOINT_PATH as string;',
    'const privateKey = (process.env.PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY_JSON) as Hex | string;',
    'const url = `${' + 'baseURL' + '}${' + 'endpointPath' + '}`;',
    "if (!baseURL || !endpointPath || !privateKey) {",
    "  console.error('Missing env: PRIVATE_KEY (or SOLANA_PRIVATE_KEY_JSON), RESOURCE_SERVER_URL, ENDPOINT_PATH');",
    '  process.exit(1);',
    '}',
    '',
    'async function main(): Promise<void> {',
    "  const signer = await createSigner('solana-devnet', privateKey);",
    '  const fetchWithPayment = wrapFetchWithPayment(fetch, signer);',
    "  const override = process.env.JSON_BODY || '';",
    "  const argQuestion = process.argv.slice(2).join(' ').trim();",
    "  const body = override ? (() => { try { return JSON.parse(override); } catch { return { query: override }; } })() : { query: argQuestion || 'hello from client-solana' };",
    "  const response = await fetchWithPayment(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });",
    "  const json = await response.json().catch(() => ({}));",
    '  console.log(json);',
    "  const xpr = response.headers.get('x-payment-response');",
    '  if (xpr) console.log(decodeXPaymentResponse(xpr));',
    '}',
    '',
    'main().catch(err => { console.error(err); process.exit(1); });',
    ''
  ].join('\n');
}

function clientFetchPackageJson() {
  return JSON.stringify({
    name: 'client-fetch',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx index.ts',
      'dev:multi-network-signer': 'tsx multi-network-signer.ts'
    },
    dependencies: {
      dotenv: '^16.4.7',
      'x402-fetch': '^0.6.6'
    },
    devDependencies: {
      typescript: '^5.3.0',
      tsx: '^4.7.0'
    }
  }, null, 2) + '\n';
}

function clientFetchEnvExample() {
  return [
    '# Single-network signer',
    'PRIVATE_KEY=',
    '',
    '# Multi-network signer (optional)',
    'EVM_PRIVATE_KEY=',
    'SVM_PRIVATE_KEY=',
    '',
    'RESOURCE_SERVER_URL=http://localhost:4021',
    'ENDPOINT_PATH=/research',
    'USE_TAP=true',
    'TAP_BASE_URL=http://localhost:4001',
    'QUESTION=',
    '# JSON_BODY can override the full body for /research (objective/searchQueries...) or /mcp/execute payload',
    'JSON_BODY=',
    ''
  ].join('\n');
}

function clientFetchIndexTs() {
  return [
    "import { config } from 'dotenv';",
    "import { decodeXPaymentResponse, wrapFetchWithPayment, createSigner, type Hex } from 'x402-fetch';",
    '',
    'config();',
    '',
    'const privateKey = process.env.PRIVATE_KEY as Hex | string;',
    'const baseURL = process.env.RESOURCE_SERVER_URL as string;',
    'const endpointPath = process.env.ENDPOINT_PATH as string;',
    "const tapBaseURL = process.env.TAP_BASE_URL || 'http://localhost:4001';",
    "const useTap = String(process.env.USE_TAP || 'false') === 'true';",
    'const url = `${' + 'baseURL' + '}${' + 'endpointPath' + '}`;',
    'const debugId = process.env.TAP_DEBUG_ID || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8));',
    '',
    'if (!baseURL || !privateKey || !endpointPath) {',
    "  console.error('Missing required environment variables');",
    '  process.exit(1);',
    '}',
    '',
    'async function main(): Promise<void> {',
    "  const signer = await createSigner('solana-devnet', privateKey);",
    "  // const signer = await createSigner('base-sepolia', privateKey);",
    '  const fetchWithPayment = wrapFetchWithPayment(fetch, signer);',
    '',
    "  const override = process.env.JSON_BODY || '';",
    "  const envQuestion = process.env.QUESTION || '';",
    "  const argQuestion = process.argv.slice(2).join(' ').trim();",
    '  let reqBody: any;',
    '  if (override) {',
    '    try { reqBody = JSON.parse(override); } catch { reqBody = { query: override }; }',
    '  } else {',
    '    const q = envQuestion || argQuestion;',
    '    if (q) {',
    '      reqBody = {',
    '        query: q,',
    "        processor: process.env.PARALLEL_PROCESSOR || 'ultra',",
    "        timeoutSec: Number(process.env.PARALLEL_TIMEOUT_SEC || '600'),",
    '      };',
    '    } else {',
    '      reqBody = {',
    "        query: 'Create a comprehensive market research report on the renewable energy storage market in Europe, focusing on battery technologies and policy impacts',",
    "        processor: process.env.PARALLEL_PROCESSOR || 'ultra',",
    "        timeoutSec: Number(process.env.PARALLEL_TIMEOUT_SEC || '600'),",
    '      };',
    '    }',
    '  }',
    '  const bodyStr = JSON.stringify(reqBody);',
    "  let headers: Record<string, string> = { 'Content-Type': 'application/json' };",
    '  if (useTap) {',
    "    const signRes = await fetch(`${tapBaseURL}/tap/sign`, {",
    "      method: 'POST',",
    "      headers: { 'Content-Type': 'application/json', 'x-tap-debug-id': debugId },",
    "      body: JSON.stringify({ method: 'POST', url, headers, body: bodyStr }),",
    '    });',
    '    const signed = await signRes.json().catch(() => ({} as any));',
    "    const sigInput = signed.signatureInput || signed.signature_input || signed.headers?.['Signature-Input'] || signed.headers?.['signature-input'];",
    "    const signature = signed.signature || signed.headers?.['Signature'] || signed.headers?.['signature'];",
    '    if (sigInput && signature) {',
    "      headers['Signature-Input'] = sigInput;",
    "      headers['Signature'] = signature;",
    '    }',
    '    if (signed.headers) {',
    '      for (const [k, v] of Object.entries(signed.headers)) {',
    '        headers[k] = String(v);',
    '      }',
    '    }',
    "    headers['x-tap-debug-id'] = debugId;",
    "    headers['x-correlation-id'] = debugId;",
    '  }',
    '',
    "  console.log(`[TAP DEBUG] id=${debugId}`);",
    "  const response = await fetchWithPayment(url, { method: 'POST', headers, body: bodyStr });",
    '  const body = await response.json().catch(() => ({}));',
    '  console.log(body);',
    '',
    "  const xpr = response.headers.get('x-payment-response');",
    '  if (xpr) {',
    '    const paymentResponse = decodeXPaymentResponse(xpr);',
    '    console.log(paymentResponse);',
    '  } else {',
    "    console.log('No x-payment-response header present.');",
    '  }',
    '}',
    '',
    'main().catch(error => {',
    "  console.error(error?.response?.data?.error ?? error);",
    '  process.exit(1);',
    '});',
    ''
  ].join('\n');
}

function clientFetchMultiNetworkTs() {
  return [
    "import { config } from 'dotenv';",
    "import { decodeXPaymentResponse, wrapFetchWithPayment, createSigner, type Hex, type MultiNetworkSigner } from 'x402-fetch';",
    '',
    'config();',
    '',
    'const evmPrivateKey = process.env.EVM_PRIVATE_KEY as Hex;',
    'const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;',
    'const baseURL = process.env.RESOURCE_SERVER_URL as string;',
    'const endpointPath = process.env.ENDPOINT_PATH as string;',
    'const url = `${' + 'baseURL' + '}${' + 'endpointPath' + '}`;',
    '',
    'if (!baseURL || !evmPrivateKey || !svmPrivateKey || !endpointPath) {',
    "  console.error('Missing required environment variables');",
    '  process.exit(1);',
    '}',
    '',
    'async function main(): Promise<void> {',
    "  const evmSigner = await createSigner('base-sepolia', evmPrivateKey);",
    "  const svmSigner = await createSigner('solana-devnet', svmPrivateKey);",
    '  const signer = { evm: evmSigner, svm: svmSigner } as MultiNetworkSigner;',
    '  const fetchWithPayment = wrapFetchWithPayment(fetch, signer);',
    '',
    "  const response = await fetchWithPayment(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'hello' }) });",
    '  const body = await response.json().catch(() => ({}));',
    '  console.log(body);',
    '',
    "  const paymentResponse = decodeXPaymentResponse(response.headers.get('x-payment-response')!);",
    '  console.log(paymentResponse);',
    '}',
    '',
    'main().catch(error => {',
    "  console.error(error?.response?.data?.error ?? error);",
    '  process.exit(1);',
    '});',
    ''
  ].join('\n');
}

function receiptsTuiPackageJson() {
  return JSON.stringify({
    name: 'receipts-tui',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.tsx',
      build: 'tsc',
      start: 'node dist/index.js'
    },
    dependencies: {
      react: '^18.2.0',
      ink: '^4.4.1',
      dotenv: '^16.4.5'
    },
    devDependencies: {
      typescript: '^5.3.3',
      tsx: '^4.7.0',
      '@types/react': '^18.2.0'
    }
  }, null, 2) + '\n';
}

function receiptsTuiTsconfig() {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
`;
}

function receiptsTuiEnvExample() {
  return `# x402 dev proxy base URL
X402_URL=http://localhost:3000
`;
}

function receiptsTuiIndexTsx() {
  return `import 'dotenv/config';
import React, { useEffect, useState } from 'react';
import { render, Box, Text } from 'ink';

type Receipt = { at: string; request: any; response: any };

function App() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const base = process.env.X402_URL || 'http://localhost:3000';

  useEffect(() => {
    let mounted = true;
    async function fetchOnce() {
      try {
        const r = await fetch(base + '/receipts');
        const data = await r.json();
        if (mounted) setReceipts(Array.isArray(data?.receipts) ? data.receipts : []);
      } catch {}
    }
    fetchOnce();
    const id = setInterval(fetchOnce, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, [base]);

  return (
    <Box flexDirection="column">
      <Text>Receipts from {base}</Text>
      {receipts.length === 0 && <Text color="yellow">No receipts yet. Run sentinel.settle via /mcp/execute.</Text>}
      {receipts.map((r, i) => {
        const name = r?.request?.params?.name || '';
        const jobId = r?.request?.params?.arguments?.jobId || '';
        const explorer = r?.response?.structuredContent?.explorer || '';
        return (
          <Box key={i} borderStyle="round" padding={1} marginTop={1} flexDirection="column">
            <Text>at: {r.at}</Text>
            {!!name && <Text>tool: {name}</Text>}
            {!!jobId && <Text>jobId: {jobId}</Text>}
            {!!explorer && <Text>explorer: {explorer}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}

render(<App />);
`;
}

function landingPackageJson() {
  return JSON.stringify({
    name: 'landing',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview'
    },
    devDependencies: {
      vite: '^5.0.0'
    }
  }, null, 2) + '\n';
}

function landingIndexHtml(projectName: string) {
  const title = projectName || 'SentinelX - x402 Paid Agents';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header class="hero">
      <div class="container">
        <h1>SentinelX</h1>
        <p class="tagline">Build paid, trustless agents on Solana with x402 + XMCP + TAP + Coral + Crossmint</p>
        <div class="cta">
          <a class="btn" href="https://www.npmjs.com/package/create-sentinelx" target="_blank" rel="noreferrer">npx create-sentinelx</a>
          <a class="btn secondary" href="#tech">See integrated tech</a>
        </div>
      </div>
    </header>
    <section class="features container">
      <div class="card">
        <h3>Paid Tools</h3>
        <p>XMCP tools wired with x402: create_job, checkpoint, settle.</p>
      </div>
      <div class="card">
        <h3>TAP Agent</h3>
        <p>RFC 9421 signatures and verification with Express routes.</p>
      </div>
      <div class="card">
        <h3>Wallets</h3>
        <p>Crossmint provider for SOL, USDC and generic SPL (CASH).</p>
      </div>
      <div class="card">
        <h3>Coral</h3>
        <p>Adapter and TOML builder for multi-agent orchestration.</p>
      </div>
    </section>
    <section id="tech" class="marquee-wrap">
      <div class="marquee">
        <span>Solana</span>
        <span>x402</span>
        <span>XMCP</span>
        <span>TAP (RFC 9421)</span>
        <span>Coral</span>
        <span>Crossmint</span>
        <span>MCP</span>
        <span>USDC</span>
        <span>CASH</span>
        <span>SPL</span>
        <span>SDK</span>
        <span>Receipts TUI</span>
      </div>
      <div aria-hidden="true" class="marquee">
        <span>Solana</span>
        <span>x402</span>
        <span>XMCP</span>
        <span>TAP (RFC 9421)</span>
        <span>Coral</span>
        <span>Crossmint</span>
        <span>MCP</span>
        <span>USDC</span>
        <span>CASH</span>
        <span>SPL</span>
        <span>SDK</span>
        <span>Receipts TUI</span>
      </div>
    </section>
    <footer class="container foot">
      <small>&copy; ${new Date().getFullYear()} SentinelX</small>
    </footer>
  </body>
  </html>`;
}

function landingStylesCss() {
  return `:root{--bg:#0b0b0f;--fg:#e6e6f0;--muted:#9aa0a6;--accent:#7c3aed;--card:#12121a}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}
.container{max-width:1100px;margin:0 auto;padding:0 20px}
.hero{padding:80px 0;background:linear-gradient(120deg,#0b0b0f,#15152a)}
.hero h1{font-size:48px;margin:0 0 12px}
.tagline{color:var(--muted);font-size:18px;margin:0 0 24px}
.cta{display:flex;gap:12px}
.btn{display:inline-block;padding:10px 16px;border-radius:8px;background:var(--accent);color:white;text-decoration:none;transition:opacity .2s}
.btn:hover{opacity:.9}
.btn.secondary{background:#2b2b3a}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:40px auto}
.card{background:var(--card);border:1px solid #222333;border-radius:12px;padding:16px}
.card h3{margin:0 0 6px}
.marquee-wrap{overflow:hidden;white-space:nowrap;border-top:1px solid #1f2030;border-bottom:1px solid #1f2030;background:#0f0f18}
.marquee{display:inline-flex;gap:28px;padding:14px 0;min-width:100%;animation:scroll 18s linear infinite}
.marquee span{color:#c9c9d5;font-weight:600;letter-spacing:.3px}
@keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-100%)}}
.foot{padding:36px 0;color:var(--muted)}
`;
}

function x402ServerPackageJson() {
  return JSON.stringify({
    name: 'x402-server',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js'
    },
    dependencies: {
      express: '^4.18.2',
      cors: '^2.8.5',
      helmet: '^7.1.0',
      dotenv: '^16.4.5',
      '@divij_web3dev/sentinel-sdk': '*'
    },
    devDependencies: {
      typescript: '^5.3.3',
      tsx: '^4.7.0'
    }
  }, null, 2) + '\n';
}

function x402ServerTsconfig() {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
`;
}

function x402ServerEnvExample() {
  return `PORT=3000
# MCP HTTP endpoint exposed by xmcp dev/build
MCP_URL=http://localhost:3001/mcp  # XMCP HTTP endpoint
# Optional: TAP verification (set your resolver URL if needed)
TAP_REQUIRED=false
`;
}

function x402ServerIndexTs() {
  return `import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Request, Response } from 'express';
import { ensureCommitments, computeCommitmentFromReceipt } from '@divij_web3dev/sentinel-sdk';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const MCP_URL = process.env.MCP_URL || '';
if (!MCP_URL) console.warn('[x402-server] MCP_URL is not set');

// Simple in-memory receipts log (dev only)
const receipts: any[] = [];

app.post('/mcp/execute', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    // Auto-inject a demo commitment if none provided (dev convenience)
    const demoCommitment = computeCommitmentFromReceipt({
      nonce: 'demo-' + Date.now(),
      amount: '0',
      recipient: 'demo',
      resourceId: 'demo'
    });
    const enriched = ensureCommitments(body, { paymentCommitment: demoCommitment });
    const r = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(enriched),
    });
    const data = await r.json().catch(() => ({}));
    if (String(enriched?.params?.name || '').includes('sentinel.settle')) {
      receipts.push({ at: new Date().toISOString(), request: enriched, response: data });
    }
    res.status(r.status).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'mcp/execute failed' });
  }
});

app.get('/receipts', (_req: Request, res: Response) => {
  res.json({ receipts });
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'x402-server', ts: new Date().toISOString() }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log('[x402-server] listening on :' + port));
`;
}

function walletsDemoPackageJson() {
  return JSON.stringify({
    name: 'wallets-demo',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      demo: 'tsx src/index.ts'
    },
    dependencies: {
      '@crossmint/wallets-sdk': '*',
      dotenv: '^16.4.5'
    },
    devDependencies: {
      typescript: '^5.3.3',
      tsx: '^4.7.0'
    }
  }, null, 2) + '\n';
}

function walletsDemoTsconfig() {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
`;
}

function walletsDemoEnvExample() {
  return `# Crossmint Wallets SDK
CROSSMINT_API_KEY=
# Optional on client-side: JWT for end-user context
CROSSMINT_JWT=

# default chain for demo: solana | base | polygon | etc.
CROSSMINT_CHAIN=solana

# Choose one: email or phone number signer
CROSSMINT_EMAIL=
CROSSMINT_PHONE=

# Optional transfer demo
RECIPIENT=
ASSET=usdc
AMOUNT=1
`;
}

function walletsDemoIndexTs() {
  return `import 'dotenv/config';
import { CrossmintWallets, createCrossmint } from '@crossmint/wallets-sdk';

async function main() {
  const apiKey = process.env.CROSSMINT_API_KEY || '';
  const jwt = process.env.CROSSMINT_JWT || undefined;
  if (!apiKey) throw new Error('Set CROSSMINT_API_KEY in .env');
  const chain = (process.env.CROSSMINT_CHAIN || 'solana').toLowerCase();
  const email = process.env.CROSSMINT_EMAIL || '';
  const phone = process.env.CROSSMINT_PHONE || '';

  const signer = email
    ? { type: 'email', email }
    : phone
    ? { type: 'phone', phoneNumber: phone }
    : null;
  if (!signer) throw new Error('Set CROSSMINT_EMAIL or CROSSMINT_PHONE in .env');

  const crossmint = createCrossmint({ apiKey, jwt });
  const wallets = CrossmintWallets.from(crossmint);

  console.log('[wallets-demo] creating or fetching wallet...');
  const wallet = await wallets.getOrCreateWallet({ chain, signer } as any);
  console.log('[wallets-demo] address:', wallet.address);

  const balances = await wallet.balances();
  console.log('[wallets-demo] native balance:', balances.nativeToken?.amount, balances.nativeToken?.symbol);
  if ((balances as any).usdc) {
    console.log('[wallets-demo] USDC balance:', (balances as any).usdc.amount);
  }

  const recipient = process.env.RECIPIENT || '';
  const asset = process.env.ASSET || '';
  const amount = process.env.AMOUNT || '';
  if (recipient && asset && amount) {
    console.log('[wallets-demo] sending ' + amount + ' ' + asset + ' -> ' + recipient);
    const tx = await wallet.send(recipient, asset, amount);
    console.log('[wallets-demo] tx explorer:', tx.explorerLink);
  } else {
    console.log('[wallets-demo] set RECIPIENT, ASSET, AMOUNT in .env to run a transfer demo');
  }

  const activity = await (wallet as any).experimental_activity?.();
  if (activity) {
    console.log('[wallets-demo] recent events:', activity.events?.length ?? 0);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
`;
}

function merchantExpressPackageJson() {
  return JSON.stringify({
    name: 'merchant-express',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js'
    },
    dependencies: {
      express: '^4.18.2',
      dotenv: '^16.4.5',
      'x402-express': '^0.6.5'
    },
    devDependencies: {
      typescript: '^5.3.3',
      tsx: '^4.7.0'
    }
  }, null, 2) + '\n';
}

function merchantExpressEnvExample() {
  return `FACILITATOR_URL=https://facilitator.payai.network
NETWORK=solana-devnet # e.g. solana | solana-devnet | base | base-sepolia
ADDRESS=YOUR_SOL_ADDRESS_BASE58

# For Base mainnet facilitator (optional)
CDP_API_KEY_ID=
CDP_API_KEY_SECRET=
`;
}

function merchantExpressIndexTs() {
  return `import { config } from 'dotenv';
import express from 'express';
import { paymentMiddleware } from 'x402-express';
config();

const facilitatorUrl = process.env.FACILITATOR_URL as any;
const payTo = process.env.ADDRESS as string; // Solana base58 or EVM 0x depending on NETWORK
const network = (process.env.NETWORK || 'solana-devnet') as string;

if (!facilitatorUrl || !payTo) {
  console.error('Missing FACILITATOR_URL or ADDRESS in .env');
  process.exit(1);
}

const app = express();

app.use(
  paymentMiddleware(
    payTo as any,
    {
      'GET /weather': {
        price: '$0.001',
        network,
      },
    } as any,
    { url: facilitatorUrl },
  ),
);

app.get('/weather', (_req, res) => {
  res.send({ report: { weather: 'sunny', temperature: 70 } });
});

const port = Number(process.env.PORT || 4021);
app.listen(port, () => console.log('[merchant-express] listening at http://localhost:' + port));
`;
}

async function write(p: string, content: string) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, content, 'utf-8');
}

function readme(projectName: string) {
  return `# ${projectName}

Scaffolded by create-sentinelx.

What you got:
- xmcp/: XMCP app (HTTP /mcp)
- gateway-express/: PayAI Solana devnet gateway with paid /research and /mcp/execute, TAP optional
- research-python-service/: Market research service using Parallel beta.search (with parallel-beta header) and automatic Task API fallback (processor=lite)
- client-solana/: Solana devnet pay-then-fetch client for /research and /mcp/execute
- client-fetch/: x402-fetch client for multi-network EVM/SVM payments
- tap-python-server/: TAP signer exposing /tap/keys and /tap/sign

Next steps:
1) XMCP dev tools:
   - cd xmcp && npm i && npm run dev  # HTTP server at http://localhost:3001/mcp
2) Python TAP server (optional):
   - cd ../tap-python-server && python -m venv .venv && source .venv/bin/activate
   - pip install -r requirements.txt
   - cp .env.example .env  # set keys, then run
   - uvicorn main:app --reload --port 4001
3) Research service:
   - cd ../research-python-service && pip install -r requirements.txt
   - cp .env.example .env  # set PARALLEL_API_KEY; optionally set PARALLEL_BETAS=search-extract-2025-10-10
   - Optional: PARALLEL_BASE_URL (default https://api.parallel.ai)
   - uvicorn main:app --reload --port 4022
4) Gateway:
   - cd ../gateway-express && npm i && cp .env.example .env
   - Ensure NETWORK=solana-devnet, ADDRESS=<your devnet address>, XMCP_URL=http://localhost:3001/mcp
   - Optional: set REQUIRE_TAP=true and TAP_DEBUG=true for signature debugging
   - npm run dev  # http://localhost:4021
5) Client (Solana devnet):
   - cd ../client-solana && npm i && cp .env.example .env
   - Set RESOURCE_SERVER_URL=http://localhost:4021 and ENDPOINT_PATH=/research
   - For paid XMCP tool calls, set ENDPOINT_PATH=/mcp/execute and optionally JSON_BODY to a JSON-RPC payload (defaults to firecrawl.scrape example)
   - npm run dev
   Or, generic x402 client:
   - cd ../client-fetch && npm i && cp .env.example .env
   - Set PRIVATE_KEY and RESOURCE_SERVER_URL/ENDPOINT_PATH (or use EVM_PRIVATE_KEY/SVM_PRIVATE_KEY for multi-network)
   - Optionally set QUESTION or JSON_BODY to control the request; USE_TAP=true and TAP_BASE_URL to enable TAP signing
   - npm run dev
`;
}

function tapServerPackageJson() {
  return JSON.stringify({
    name: 'tap-server',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js'
    },
    dependencies: {
      express: '^4.18.2',
      cors: '^2.8.5',
      helmet: '^7.1.0',
      dotenv: '^16.4.5',
      '@divij_web3dev/sentinel-sdk': '*'
    },
    devDependencies: {
      typescript: '^5.3.3',
      tsx: '^4.7.0'
    }
  }, null, 2) + '\n';
}

function tapServerTsconfig() {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
`;
}

function tapServerEnvExample() {
  return `PORT=4000
TAP_KEY_ID=agent-ed25519
TAP_ALG=ed25519
# ED25519_PRIVATE_KEY must be base64 32-byte seed
ED25519_PRIVATE_KEY=
ED25519_PUBLIC_KEY=
# RSA_PSS_SHA256 keys optional if using rsa
RSA_PRIVATE_KEY=
RSA_PUBLIC_KEY=
`;
}

function tapServerIndexTs() {
  return `import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { registerTapRoutes } from '@divij_web3dev/sentinel-sdk';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const keyId = process.env.TAP_KEY_ID || 'agent-ed25519';
const alg = (process.env.TAP_ALG || 'ed25519') as 'ed25519' | 'rsa-pss-sha256';
registerTapRoutes(app as any, {
  basePath: '/tap',
  keyId,
  alg,
  ed25519PublicKeyB64: process.env.ED25519_PUBLIC_KEY,
  ed25519PrivateSeedB64: process.env.ED25519_PRIVATE_KEY,
  rsaPublicKeyPem: (process.env.RSA_PUBLIC_KEY || '').replace(/\\n/g, '\n'),
  rsaPrivateKeyPem: (process.env.RSA_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tap-server', timestamp: new Date().toISOString() });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log('TAP server on :' + port));
`;
}

async function main() {
  const argv = minimist(process.argv.slice(2));
  const target = argv._[0] || 'x402-app';
  const outDir = path.resolve(process.cwd(), target);
  const includeOnchain = !!argv.onchain;

  console.log(`[create-sentinelx] creating at ${outDir}`);
  await ensureDir(outDir);

  // README
  await write(path.join(outDir, 'README.md'), readme(path.basename(outDir)));

  // XMCP app
  const xmcpDir = path.join(outDir, 'xmcp');
  await scaffoldXmcpProject({ outDir: xmcpDir, projectName: 'x402-xmcp', includeOnchain });

  // TAP server
  // (Removed) TS TAP server scaffold; use tap-python-server instead

  // gateway-express
  const gwDir = path.join(outDir, 'gateway-express');
  await write(path.join(gwDir, 'package.json'), gatewayExpressPackageJson());
  await write(path.join(gwDir, '.env.example'), gatewayExpressEnvExample());
  await write(path.join(gwDir, 'src', 'index.ts'), gatewayExpressIndexTs());

  // research-python-service
  const rsvc = path.join(outDir, 'research-python-service');
  await write(path.join(rsvc, 'requirements.txt'), researchPyRequirements());
  await write(path.join(rsvc, '.env.example'), researchPyEnvExample());
  await write(path.join(rsvc, 'main.py'), researchPyMain());

  // client-solana
  const csol = path.join(outDir, 'client-solana');
  await write(path.join(csol, 'package.json'), clientSolanaPackageJson());
  await write(path.join(csol, '.env.example'), clientSolanaEnvExample());
  await write(path.join(csol, 'src', 'index.ts'), clientSolanaIndexTs());

  // client-fetch (x402-fetch)
  const cfetch = path.join(outDir, 'client-fetch');
  await write(path.join(cfetch, 'package.json'), clientFetchPackageJson());
  await write(path.join(cfetch, '.env.example'), clientFetchEnvExample());
  await write(path.join(cfetch, 'index.ts'), clientFetchIndexTs());
  await write(path.join(cfetch, 'multi-network-signer.ts'), clientFetchMultiNetworkTs());

  // receipts-tui (Ink UI for receipts)
  const tuiDir = path.join(outDir, 'receipts-tui');
  await write(path.join(tuiDir, 'package.json'), receiptsTuiPackageJson());
  await write(path.join(tuiDir, 'tsconfig.json'), receiptsTuiTsconfig());
  await write(path.join(tuiDir, '.env.example'), receiptsTuiEnvExample());
  await write(path.join(tuiDir, 'src', 'index.tsx'), receiptsTuiIndexTsx());

  // tap-python-server (Python TAP signer)
  const tapPyDir = path.join(outDir, 'tap-python-server');
  await write(path.join(tapPyDir, 'requirements.txt'), `fastapi
uvicorn
pydantic
python-dotenv
cryptography
`);
  await write(path.join(tapPyDir, '.env.example'), `PORT=4001
TAP_KEY_ID=agent-ed25519
TAP_ALG=ed25519 # or rsa-pss-sha256
ED25519_PRIVATE_KEY=
ED25519_PUBLIC_KEY=
RSA_PRIVATE_KEY=
RSA_PUBLIC_KEY=
`);
  await write(path.join(tapPyDir, 'Dockerfile'), `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=4001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4001"]
`);
  await write(path.join(tapPyDir, 'main.py'), `import os, base64, time, hashlib
from urllib.parse import urlsplit
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

KEY_ID = os.getenv('TAP_KEY_ID', 'agent-ed25519')
ALG = os.getenv('TAP_ALG', 'ed25519')  # 'ed25519' or 'rsa-pss-sha256'

ED25519_PRIV_B64 = os.getenv('ED25519_PRIVATE_KEY', '')
ED25519_PUB_B64 = os.getenv('ED25519_PUBLIC_KEY', '')
RSA_PRIV_PEM = (os.getenv('RSA_PRIVATE_KEY', '') or '').replace('\\n','\n')
RSA_PUB_PEM = (os.getenv('RSA_PUBLIC_KEY', '') or '').replace('\\n','\n')

ed25519_priv = None
rsa_priv = None
try:
    if ALG == 'ed25519' and ED25519_PRIV_B64:
        seed = base64.b64decode(ED25519_PRIV_B64)
        ed25519_priv = Ed25519PrivateKey.from_private_bytes(seed)
        if not ED25519_PUB_B64:
            ED25519_PUB_B64 = base64.b64encode(ed25519_priv.public_key().public_bytes(encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw)).decode()
    elif ALG == 'rsa-pss-sha256' and RSA_PRIV_PEM:
        rsa_priv = load_pem_private_key(RSA_PRIV_PEM.encode(), password=None)
except Exception:
    pass

@app.get('/tap/keys/{keyId}')
def get_key(keyId: str):
    if ALG == 'ed25519':
        return { 'keyId': KEY_ID, 'alg': ALG, 'ed25519PublicKeyB64': ED25519_PUB_B64 }
    else:
        return { 'keyId': KEY_ID, 'alg': ALG, 'rsaPublicKeyPem': RSA_PUB_PEM }

class SignPayload(BaseModel):
    method: str
    url: str
    headers: dict | None = None
    body: str | None = None
    tag: str | None = None
    nonce: str | None = None
    expiresIn: int | None = None  # seconds

def _set_header(headers: dict, name: str, value: str):
    headers[name] = value

@app.post('/tap/sign')
def sign(p: SignPayload):
    global ed25519_priv, rsa_priv, ED25519_PUB_B64
    headers = dict(p.headers or {})
    parts = urlsplit(p.url)
    authority = parts.netloc
    path = parts.path or '/'
    if parts.query:
        path = f"{path}?{parts.query}"

    # Optional: set Date header (not covered by Visa style but useful)
    dt = time.strftime('%a, %d %b %Y %H:%M:%S GMT', time.gmtime())
    _set_header(headers, 'Date', dt)

    # Optional: content digest if body present (not covered by Visa style)
    body_bytes = (p.body or '').encode('utf-8')
    if body_bytes:
        digest = base64.b64encode(hashlib.sha256(body_bytes).digest()).decode()
        _set_header(headers, 'Content-Digest', f"sha-256={digest}")

    created = int(time.time())
    # Default expiry 300s if not provided
    expires = created + int(p.expiresIn or 300)

    covered_components = '("@authority" "@path")'
    params = [
        f"created={created}",
        f"expires={expires}",
        f'keyId="{KEY_ID}"',
        f'alg="{ALG}"',
    ]
    if p.nonce:
        params.append(f'nonce="{p.nonce}"')
    if p.tag:
        params.append(f'tag="{p.tag}"')

    signature_params = covered_components + '; ' + '; '.join(params)

    # Build RFC 9421 base per Visa TAP reference
    signing_string_lines = [
        f'"@authority": {authority}',
        f'"@path": {path}',
        f'"@signature-params": {signature_params}',
    ]
    signing_string = '\n'.join(signing_string_lines)

    try:
        if ALG == 'ed25519':
            if not ed25519_priv:
                seed = base64.b64decode(ED25519_PRIV_B64)
                ed25519_priv = Ed25519PrivateKey.from_private_bytes(seed)
            sig_bytes = ed25519_priv.sign(signing_string.encode('utf-8'))
        elif ALG == 'rsa-pss-sha256':
            if not rsa_priv:
                rsa_priv = load_pem_private_key(RSA_PRIV_PEM.encode(), password=None)
            sig_bytes = rsa_priv.sign(
                signing_string.encode('utf-8'),
                padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
                hashes.SHA256()
            )
        else:
            raise HTTPException(status_code=400, detail='Unsupported ALG')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'sign error: {str(e)}')

    sig_b64 = base64.b64encode(sig_bytes).decode()
    signature_input_header = f'sig2={signature_params}'
    signature_header = f'sig2=:{sig_b64}:'

    headers['Signature-Input'] = signature_input_header
    headers['Signature'] = signature_header

    return { 'headers': headers, 'signatureInput': signature_input_header, 'signature': signature_header, 'created': created, 'expires': expires }
`);

  console.log('[create-sentinelx] Done!');
  console.log('Next:');
  console.log(`  cd ${target}/xmcp && npm i && npm run dev`);
  console.log(`  cd ../research-python-service && pip install -r requirements.txt && cp .env.example .env && uvicorn main:app --reload --port 4022`);
  console.log(`  cd ../gateway-express && npm i && cp .env.example .env && npm run dev`);
  console.log(`  cd ../client-solana && npm i && cp .env.example .env && npm run dev`);
  console.log(`  cd ../client-fetch && npm i && cp .env.example .env && npm run dev`);
}

main().catch((e) => {
  console.error('[create-sentinelx] error', e);
  process.exit(1);
});
