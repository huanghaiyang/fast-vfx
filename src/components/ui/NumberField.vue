<template>
  <input class="nf" type="number" :value="display" :step="step" @input="onInput" @focus="$emit('begin')" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ modelValue: number; step?: number; min?: number; max?: number; digits?: number }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void; (e: 'begin'): void }>()

const display = computed(() => {
  const d = props.digits ?? 2
  return Number(props.modelValue.toFixed(d))
})

function onInput(ev: Event) {
  const el = ev.target as HTMLInputElement
  let v = parseFloat(el.value)
  if (!isFinite(v)) return
  if (props.min !== undefined) v = Math.max(props.min, v)
  if (props.max !== undefined) v = Math.min(props.max, v)
  emit('update:modelValue', v)
}
</script>

<style scoped>
.nf {
  width: 100%;
  text-align: center;
  padding: 4px 2px;
  font-variant-numeric: tabular-nums;
}
.nf:hover {
  border-color: #39415a;
}
</style>
