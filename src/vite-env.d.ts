/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'simple-mind-map' {
  const MindMap: any
  export default MindMap
}

declare module 'simple-mind-map/src/plugins/*' {
  const plugin: any
  export default plugin
}

declare module 'simple-mind-map/src/parse/*' {
  const mod: any
  export default mod
}

declare module 'simple-mind-map/src/utils/*' {
  const mod: any
  export default mod
}

interface Window {
  desktop?: import('../electron/preload').DesktopApi
}
