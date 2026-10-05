declare global {
  /** The version in package.json, defined at build time in vite.config.ts. */
  const __APP_VERSION__: string;
}

export {};
