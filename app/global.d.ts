declare global {
  interface Window {
    __hivecomActivitySignal?: () => void
  }
}

export {}
