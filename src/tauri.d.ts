// Type declarations for Tauri globals injected by withGlobalTauri: true
interface Window {
  __TAURI__?: {
    core: {
      invoke: <T = any>(cmd: string, args?: Record<string, unknown>) => Promise<T>
    }
    window: {
      getCurrentWindow: () => {
        minimize:          () => Promise<void>
        maximize:          () => Promise<void>
        toggleMaximize:    () => Promise<void>
        close:             () => Promise<void>
        center:            () => Promise<void>
        show:              () => Promise<void>
        outerPosition:     () => Promise<{ x: number; y: number }>
        listen:            (event: string, handler: (e: any) => void) => Promise<() => void>
      }
    }
  }
  // LiteUI components (loaded from CDN)
  UI?: {
    toast?: {
      success?: (msg: string) => void
      error?:   (msg: string) => void
      warning?: (msg: string) => void
      (msg: string): void
    }
    modal?: {
      confirm: (opts: { title: string; content: string; onOk: () => void }) => void
    }
    theme?: {
      get:    () => 'dark' | 'light'
      toggle: () => void
    }
  }
}
