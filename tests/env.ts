// Reads a required environment variable and fails with a clear message
// instead of letting tests run with `undefined`.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and set it.`);
  }
  return value;
}
