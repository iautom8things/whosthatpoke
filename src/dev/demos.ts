// Demo states for screenshots and manual checks: open the app with ?demo=<name>.
// Each file in ./demos registers its own; nothing else needs editing to add one.
type DemoSetup = () => void | Promise<void>;

const registry = new Map<string, DemoSetup>();

export function registerDemo(name: string, setup: DemoSetup): void {
  registry.set(name, setup);
}

export function demoNames(): string[] {
  return [...registry.keys()].sort();
}

export async function runDemoFromUrl(): Promise<boolean> {
  const name = new URLSearchParams(location.search).get("demo");
  if (!name) return false;
  await Promise.all(Object.values(import.meta.glob("./demos/*.ts")).map((load) => load()));
  const setup = registry.get(name);
  if (!setup) {
    console.warn(`Unknown demo "${name}". Known: ${demoNames().join(", ")}`);
    return false;
  }
  await setup();
  return true;
}
