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
      <button class="primary" :disabled="S.busy" @click="doExport">
        {{ S.busy ? '导出中…' : '⤓ 导出 Godot' }}
      </button>
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
import { ref } from 'vue'
import { S, A, pushHistory, saveProject, importProject, downloadBlob, toast, captureCameraQuiet } from '../core/store'
import { buildGodotPackage } from '../core/godotExport'

const openInput = ref<HTMLInputElement>()

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
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
