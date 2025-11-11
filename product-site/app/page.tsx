import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Marquee from "@/components/Marquee";

export default function Page() {
  return (
    <main>
      <Header />
      <section className="pt-28">
        <div className="container text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs text-white/70">
            <span>Public Launch</span>
            <span className="text-white/40">•</span>
            <span>x402 + XMCP + TAP (Visa) + Solana</span>
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">
            Build autonomous, verifiable agents on Solana
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">
            x402 payments + XMCP tools + TAP (Visa, RFC 9421) signatures. Verifiable receipts and
            checkpoints prove what your agent did and paid for—on Solana devnet with generic SPL
            support (incl. CASH).
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <a
              className="rounded-md bg-white px-4 py-2 text-black hover:opacity-90"
              href="https://www.npmjs.com/package/create-sentinelx"
              target="_blank"
              rel="noreferrer"
            >
              npx create-sentinelx@latest my-app
            </a>
            <a
              className="rounded-md border border-white/20 px-4 py-2 hover:bg-white/5"
              href="#features"
            >
              Learn more
            </a>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <div className="container">
          <Marquee />
        </div>
      </section>

      <section id="features" className="container mt-16 grid gap-6 md:grid-cols-3">
        <div className="card">
          <h3 className="text-lg font-semibold">x402 Gateway</h3>
          <p className="mt-2 text-sm text-white/70">Payment-gated gateway for Solana devnet (PayAI Facilitator). Optional XMCP paid tools via /mcp/execute.</p>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold">Autonomous & Verifiable</h3>
          <p className="mt-2 text-sm text-white/70">TAP (Visa) signed HTTP requests with x402 commitments. Verifiable receipts and checkpoints that prove agent actions and spend.</p>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold">Wallets & SPL</h3>
          <p className="mt-2 text-sm text-white/70">Solana devnet signing (keypair/private key) and generic SPL support including CASH — with receipts for visibility.</p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
