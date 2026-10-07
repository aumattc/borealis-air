/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the storefront API. Defaults to the same-origin `/api`. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
