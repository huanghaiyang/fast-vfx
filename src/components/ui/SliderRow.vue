<template>
  <div class="srow">
    <span class="sl" :title="label">
      <em
        v-if="keyable"
        class="kdot"
        :class="{ on: keyed }"
        :title="keyed ? '已有轨道：点击在当前时间打一帧' : '在当前时间 K 帧'"
        @click.stop="$emit('key')"
        >◆</em
      >{{ label }}
    </span>
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
const props = defineProps<{
  label: string
  modelValue: number
  min?: number
  max?: number
  step?: number
  digits?: number
  keyable?: boolean
  keyed?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'begin'): void
  (e: 'key'): void
}>()
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
  grid-template-columns: 96px minmax(0, 1fr) 56px;
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
  display: flex;
  align-items: center;
  gap: 4px;
}
.kdot {
  font-style: normal;
  font-size: 9px;
  line-height: 1;
  color: #4b5468;
  cursor: pointer;
  flex: none;
  transition: color 0.15s;
}
.kdot:hover {
  color: var(--accent);
}
.kdot.on {
  color: var(--accent);
  text-shadow: 0 0 6px rgba(255, 138, 61, 0.6);
}
.sn :deep(input) {
  font-size: 11px;
}
</style>
