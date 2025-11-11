export default function Header() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-white/10 bg-black/50 backdrop-blur">
      <div className="container h-14 flex items-center justify-between">
        <div className="font-semibold tracking-tight">SentinelX</div>
        <nav className="flex items-center gap-4 text-sm text-white/80">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#tech" className="hover:text-white">Tech</a>
          <a href="https://www.npmjs.com/package/create-sentinelx" target="_blank" rel="noreferrer" className="hover:text-white">CLI</a>
        </nav>
      </div>
    </header>
  );
}
