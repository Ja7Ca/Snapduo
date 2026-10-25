import { PROTOCOL_VERSION } from "@snapduo/protocol";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-3xl font-bold">Snapduo</h1>
      <p className="text-sm opacity-70">
        Scaffold OK · protocol v{PROTOCOL_VERSION}
      </p>
    </main>
  );
}
