<template>
  <div class="srow">
    <span class="sl" :title="label">{{ label }}</span>
    <input
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      @pointerdown="$emit('begin')"
      @input="onInput"
    />
    <NumberField
      class="sn"
      :model-value="modelValue"
      :step="step"
      :min="min"
      :max="max"
      :digits="digits"
      @begin="$emit('begin')"
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import NumberField from './NumberField.vue'
const props = defineProps<{ label: string; modelValue: number; min?: number; max?: number; step?: number; digits?: number }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void; (e: 'begin'): void }>()
const min = props.min ?? 0
const max = props.max ?? 1
const step = props.step ?? 0.01
function onInput(e: Event) {
  emit('update:modelValue', parseFloat((e.target as HTMLInputElement).value))
}
</script>

<style scoped>
.srow {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr) 56px;
  gap: 8px;
  align-items: center;
  margin: 5px 0;
}
.sl {
  color: var(--dim);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sn :deep(input) {
  font-size: 11px;
}
</style>
