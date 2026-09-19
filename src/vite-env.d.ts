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

interface Window {
  desktop?: import('../electron/preload').DesktopApi
}
