<template>
  <div class="app">
    <TopBar />
    <div class="main" :class="{ 'no-left': !S.leftOpen, 'no-right': !S.rightOpen }">
      <AssetPanel v-if="S.leftOpen" />
      <Viewport />
      <Inspector v-if="S.rightOpen" />
    </div>
    <TimelinePanel />
    <div v-if="S.toast" class="toast" :class="S.toastKind">{{ S.toast }}</div>
    <HelpModal v-if="S.helpOpen" @close="S.helpOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import TopBar from './components/TopBar.vue'
import AssetPanel from './components/AssetPanel.vue'
import Viewport from './components/Viewport.vue'
import Inspector from './components/Inspector.vue'
import TimelinePanel from './components/TimelinePanel.vue'
import HelpModal from './components/HelpModal.vue'
import { S, A, undo, redo, saveProject, restoreAutosave, toast } from './core/store'

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function onKey(e: KeyboardEvent) {
  if (isTyping(e.target)) return
  const meta = e.ctrlKey || e.metaKey
  if (meta && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    e.shiftKey ? redo() : undo()
    return
  }
  if (meta && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveProject()
    return
  }
  if (e.code === 'Space') {
    e.preventDefault()
    A.togglePlay()
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    A.remove()
    return
  }
  if (e.key === 'Escape') {
    S.mode = 'select'
    S.selectedId = null
    return
  }
  if (e.key.toLowerCase() === 'w') S.mode = 'translate'
  else if (e.key.toLowerCase() === 'e') S.mode = 'rotate'
  else if (e.key.toLowerCase() === 'r') S.mode = 'scale'
  else if (e.key.toLowerCase() === 'k' && S.selectedId) A.addKeyframe('position')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (restoreAutosave()) toast('已恢复上次编辑的自动存档', 'info')
  const q = new URLSearchParams(location.search)
  const preset = q.get('preset')
  if (preset) A.setPreset(preset)
  const t = q.get('t')
  if (t) {
    S.playing = false
    A.setTime(parseFloat(t) || 0)
  }
  const tab = q.get('tab')
  if (tab === 'preset' || tab === 'model' || tab === 'texture') S.tab = tab
  const sel = q.get('sel')
  if (sel !== null) {
    const obj = S.doc.objects[parseInt(sel, 10) || 0]
    if (obj) S.selectedId = obj.id
  }
  if (q.get('help') === '1') S.helpOpen = true
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
