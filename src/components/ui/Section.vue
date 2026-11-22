<template>
  <section class="sec" :class="{ collapsed }">
    <header @click="collapsed = !collapsed">
      <span class="chev" :class="{ open: !collapsed }">▸</span>
      <span class="title">{{ title }}</span>
      <span class="extra"><slot name="extra" /></span>
    </header>
    <div v-show="!collapsed" class="body"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ title: string; start?: boolean }>()
const collapsed = ref(false)
</script>

<style scoped>
.sec {
  border-bottom: 1px solid var(--line-soft);
}
header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}
header:hover {
  background: #131620;
}
.chev {
  color: var(--dim-2);
  font-size: 10px;
  transition: transform 0.15s;
  display: inline-block;
}
.chev.open {
  transform: rotate(90deg);
  color: var(--accent);
}
.title {
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: #b9c0d4;
  font-weight: 600;
  flex: 1;
}
.extra {
  display: flex;
  gap: 4px;
  align-items: center;
}
.body {
  padding: 4px 12px 12px;
}
</style>
