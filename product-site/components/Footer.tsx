export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-10 mt-24">
      <div className="container flex flex-col items-center gap-3 text-sm text-white/60">
        <div>© {new Date().getFullYear()} SentinelX</div>
        <div className="flex gap-4">
          <a href="https://www.npmjs.com/package/@divij_web3dev/sentinel-sdk" target="_blank" rel="noreferrer" className="hover:text-white">SDK</a>
          <a href="https://www.npmjs.com/package/create-sentinelx" target="_blank" rel="noreferrer" className="hover:text-white">CLI</a>
        </div>
      </div>
    </footer>
  );
}
