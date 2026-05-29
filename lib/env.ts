export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

