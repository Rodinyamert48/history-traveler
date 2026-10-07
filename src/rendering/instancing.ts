import { VertexBuffer, type Mesh } from "@babylonjs/core";

interface InstancedStorage {
  data: Record<string, Float32Array>;
  sizes: Record<string, number>;
  vertexBuffers: Record<string, VertexBuffer | null>;
}

/**
 * Registers a per-instance buffer with room for `capacity` instances up front.
 *
 * Babylon grows instanced buffers lazily (starting at 32 instances). On WebGPU each render
 * pass (main, shadow, glow, geometry) keeps its own GPU copy, and a growth triggered in one
 * pass leaves the other passes' buffers at the old size → "write range does not fit" errors
 * and invalid draws. Reserving the capacity before the first frame avoids any resize.
 */
export function registerInstancedBufferWithCapacity(mesh: Mesh, kind: string, stride: number, capacity: number): void {
  mesh.registerInstancedBuffer(kind, stride);
  const storage = (mesh as unknown as { _userInstancedBuffersStorage?: InstancedStorage })._userInstancedBuffersStorage;
  if (!storage) return;
  const size = stride * capacity;
  if (storage.sizes[kind] >= size) return;
  storage.sizes[kind] = size;
  storage.data[kind] = new Float32Array(size);
  // WebGL keeps one shared VBO created from the old array: recreate it on the new array.
  if (storage.vertexBuffers[kind]) {
    storage.vertexBuffers[kind]!.dispose();
    storage.vertexBuffers[kind] = new VertexBuffer(mesh.getEngine(), storage.data[kind], kind, true, false, stride, true);
  }
}
