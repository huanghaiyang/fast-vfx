<template>
  <div class="vec">
    <span v-if="label" class="vl">{{ label }}</span>
    <div class="vec-groups" :class="{ 'with-label': !!label }">
      <div class="g" v-for="(axis, i) in ['x', 'y', 'z']" :key="axis">
        <span class="ax" :class="axis">{{ axis }}</span>
        <NumberField
          :model-value="(modelValue as number[])[i]"
          :step="step"
          :digits="digits"
          @begin="$emit('begin')"
          @update:model-value="set(i, $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import NumberField from './NumberField.vue'
const props = defineProps<{ modelValue: number[]; label?: string; step?: number; digits?: number }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: number[]): void; (e: 'begin'): void }>()

function set(i: number, v: number) {
  const next = [...props.modelValue] as number[]
  next[i] = v
  emit('update:modelValue', next as any)
}
</script>

<style scoped>
.vec {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}
.vl {
  color: var(--dim);
  font-size: 11.5px;
}
.vec-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}
.g {
  display: flex;
  align-items: center;
  gap: 3px;
  background: #0c0e15;
  border-radius: 5px;
  padding-left: 5px;
}
.g .ax {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}
.ax.x {
  color: #ff6b7a;
}
.ax.y {
  color: #6ee7a8;
}
.ax.z {
  color: #6bb6ff;
}
.g :deep(input) {
  border: none;
  background: transparent;
}
</style>
