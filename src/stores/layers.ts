import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

import { LAYERS } from '@/config/layers'

const BASE = import.meta.env.BASE_URL

/** Layer visibility + data-availability state. A vector layer is "available"
 *  only once its key is listed in public/data/layers/available.json (written by
 *  scripts/build_layers.py). Raster layers (ESRI) are always available. */
export const useLayersStore = defineStore('layers', () => {
  const visible = reactive<Record<string, boolean>>({})
  const available = ref<Set<string>>(new Set())
  const counts = ref<Record<string, number>>({}) // feature count per layer

  for (const l of LAYERS) visible[l.key] = !!l.defaultOn

  async function loadAvailability() {
    for (const l of LAYERS) if (l.geometry === 'raster') available.value.add(l.key)
    try {
      const res = await fetch(`${BASE}data/layers/available.json`, { cache: 'no-store' })
      if (res.ok) {
        const keys: string[] = await res.json()
        const next = new Set(available.value)
        keys.forEach((k) => next.add(k))
        available.value = next
      }
    } catch {
      /* no availability manifest yet — only raster + nothing else */
    }
    try {
      const res = await fetch(`${BASE}data/layers/counts.json`, { cache: 'no-store' })
      if (res.ok) counts.value = await res.json()
    } catch {
      /* no counts file — labels just omit the count */
    }
  }

  const isAvailable = (key: string) => available.value.has(key)

  function toggle(key: string) {
    if (!isAvailable(key)) return
    visible[key] = !visible[key]
  }

  return { visible, available, counts, loadAvailability, isAvailable, toggle }
})
