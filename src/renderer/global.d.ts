import type { KaiAPI } from '../preload'

declare global {
  interface Window {
    kai: KaiAPI
  }
}

export {}
