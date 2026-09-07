import WatchClient from "./watch-client";

// Pre-render a single shell page ("/watch/_") at build time. The Electron
// offline server serves this same shell for every /watch/<id>, and the client
// reads the real id from the URL path — so the watch page works without
// internet too. Unknown ids still render on demand on the hosted app.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function WatchPage() {
  return <WatchClient />;
}