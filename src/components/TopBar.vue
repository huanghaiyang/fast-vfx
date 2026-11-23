<template>
  <header class="topbar">
    <div class="brand">
      <div class="logo">FV</div>
      <div class="bt">
        <span class="bname">FastVFX</span>
        <span class="bsub">Three.js → Godot</span>
      </div>
    </div>

    <input class="name" type="text" v-model="S.doc.name" spellcheck="false" @focus="pushHistory" />

    <div class="actions">
      <button @click="A.newDoc()">新建</button>
      <button @click="openInput?.click()">打开</button>
      <input ref="openInput" type="file" accept=".json,application/json" hidden @change="onOpen" />
      <button @click="saveProject()">保存项目</button>
      <div class="exwrap" ref="exWrap">
        <button class="primary" :disabled="S.busy" @click="menuOpen = !menuOpen">
          {{ S.busy ? '处理中…' : '⤓ 导出 ▾' }}
        </button>
        <div class="exmenu" v-if="menuOpen">
          <button @click="pick('godot')"><b>Godot 工程包</b><i>.zip · vfx.json + 运行时脚本 + 贴图 + GLB</i></button>
          <div class="exrow">
            <span>帧率</span>
            <button v-for="f in [24, 30, 60]" :key="f" :class="['chip', { on: fps === f }]" @click="fps = f">{{ f }}</button>
          </div>
          <button @click="pick('png')"><b>PNG 序列</b><i>逐帧渲染 → zip · {{ Math.round(S.doc.duration * fps) }} 帧</i></button>
          <button @click="pick('webm')"><b>WebM 成片</b><i>实时录制舞台画布 · {{ fps }} fps</i></button>
        </div>
      </div>
    </div>

    <div class="right">
      <span class="tag" v-if="S.autoKey">自动 K 帧</span>
      <span class="tag hot">{{ S.doc.objects.length }} 对象</span>
      <button class="icon ghost" @click="S.helpOpen = true" title="帮助">?</button>
      <button class="icon ghost" @click="S.leftOpen = !S.leftOpen" title="资源面板">◧</button>
      <button class="icon ghost" @click="S.rightOpen = !S.rightOpen" title="属性面板">◨</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { S, A, pushHistory, saveProject, importProject, downloadBlob, toast, captureCameraQuiet } from '../core/store'
import { buildGodotPackage } from '../core/godotExport'
import { exportPngSequence, exportWebm } from '../core/capture'

const openInput = ref<HTMLInputElement>()
const exWrap = ref<HTMLElement>()
const menuOpen = ref(false)
const fps = ref(30)

function onDocDown(e: MouseEvent) {
  if (!menuOpen.value) return
  if (exWrap.value && !exWrap.value.contains(e.target as Node)) menuOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown))

async function pick(kind: 'godot' | 'png' | 'webm') {
  menuOpen.value = false
  if (kind === 'png') return exportPngSequence({ fps: fps.value })
  if (kind === 'webm') return exportWebm({ fps: fps.value })
  return doExport()
}

async function doExport() {
  if (S.busy) return
  S.busy = true
  try {
    // 记录当前机位（只用于导出描述，不改变编辑状态）
    captureCameraQuiet()
    const pkg = await buildGodotPackage(S.doc)
    downloadBlob(pkg.blob, pkg.filename)
    const msg = pkg.warnings.length ? `Godot 包已导出（${pkg.warnings.length} 条提示）` : 'Godot 包已导出'
    toast(msg, 'ok')
    if (pkg.warnings.length) console.info('[FastVFX] 导出提示：', pkg.warnings)
  } catch (err) {
    console.error(err)
    toast('导出失败：' + (err as Error).message, 'warn')
  } finally {
    S.busy = false
  }
}

async function onOpen(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await importProject(file)
  input.value = ''
}
</script>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 12px;
  background: linear-gradient(180deg, #12141d, #0d0f17);
  border-bottom: 1px solid var(--line);
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: none;
}
.logo {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.5px;
  color: #120a04;
  background: linear-gradient(145deg, #ffb46b, #f4772a 60%, #d9591a);
  box-shadow: 0 0 18px rgba(255, 138, 61, 0.35);
}
.bt {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.bname {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.02em;
}
.bsub {
  font-size: 9.5px;
  color: var(--dim-2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.name {
  width: 170px;
  background: #0a0c12;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  padding: 6px 9px;
  font-size: 12.5px;
  color: var(--txt);
  outline: none;
}
.name:focus {
  border-color: var(--accent);
}
.actions {
  display: flex;
  gap: 6px;
  flex: 1;
}
.exwrap {
  position: relative;
}
.exmenu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  width: 268px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #12141d;
  border: 1px solid var(--line);
  border-radius: 9px;
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.6);
}
.exmenu > button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 9px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  text-align: left;
  color: var(--txt);
}
.exmenu > button:hover {
  background: rgba(244, 119, 42, 0.1);
  border-color: rgba(244, 119, 42, 0.3);
}
.exmenu > button b {
  font-size: 12.5px;
  font-weight: 600;
  color: #e9ecf3;
}
.exmenu > button i {
  font-style: normal;
  font-size: 10.5px;
  color: var(--dim-2);
}
.exrow {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px 6px;
  font-size: 11px;
  color: var(--dim);
}
.exrow .chip {
  padding: 2px 8px;
  font-size: 10.5px;
  border-radius: 99px;
  border: 1px solid var(--line-soft);
  background: #0a0c12;
  color: var(--dim);
}
.exrow .chip.on {
  color: #ffd9bf;
  border-color: rgba(244, 119, 42, 0.5);
  background: rgba(244, 119, 42, 0.14);
}
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
