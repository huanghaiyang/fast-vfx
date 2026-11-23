import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { exportPngSequence, exportWebm } from './core/capture'
import { getEngine, S, A } from './core/store'
import { PRESETS } from './core/presets'

createApp(App).mount('#app')

// 调试/自动化验收钩子（与已有的 __fastvfx_engine 一致，不改变正常交互）
;(globalThis as any).__fastvfx_capture = { exportPngSequence, exportWebm }
;(globalThis as any).__fastvfx_getEngine = getEngine
;(globalThis as any).__fastvfx_store = { S, A, PRESETS }
