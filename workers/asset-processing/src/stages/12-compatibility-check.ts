import type { EngineTarget } from '@sonic-gameworld/world-schema';
import type { CompatibilityResult, Stage } from '../types.js';

/** glTF extensions each engine's importer is known not to round-trip cleanly, plus a rough
 * triangle budget past which the asset should be flagged (not blocked — a creator may still ship
 * it, but the marketplace UI surfaces the warning via GET /licenses & product compatibility). */
const UNSUPPORTED_EXTENSIONS: Record<EngineTarget, string[]> = {
  WEB: [],
  UNITY: ['KHR_materials_variants', 'KHR_xmp_json_ld', 'EXT_mesh_gpu_instancing'],
  UNREAL: ['KHR_materials_variants', 'EXT_mesh_gpu_instancing'],
  GODOT: ['KHR_texture_transform', 'KHR_materials_variants', 'KHR_draco_mesh_compression'],
};

const TRIANGLE_BUDGET: Record<EngineTarget, number> = {
  WEB: 500_000,
  UNITY: 2_000_000,
  UNREAL: 5_000_000,
  GODOT: 1_000_000,
};

export const compatibilityCheckStage: Stage = {
  name: 'COMPATIBILITY_CHECK',
  async run(ctx) {
    const metrics = ctx.data.metrics;
    const extensionsUsed = metrics?.extensionsUsed ?? [];
    const triangleCount = metrics?.triangleCount ?? 0;

    const engines: EngineTarget[] = ['WEB', 'UNITY', 'UNREAL', 'GODOT'];
    const results: CompatibilityResult[] = engines.map((engine) => {
      const issues: string[] = [];
      const unsupported = extensionsUsed.filter((ext) => UNSUPPORTED_EXTENSIONS[engine].includes(ext));
      if (unsupported.length > 0) issues.push(`Uses extension(s) not reliably supported by ${engine}: ${unsupported.join(', ')}`);
      const budget = TRIANGLE_BUDGET[engine];
      if (triangleCount > budget) issues.push(`Triangle count ${triangleCount.toLocaleString()} exceeds the recommended ${budget.toLocaleString()} budget for ${engine}`);
      return { engine, compatible: issues.length === 0, issues };
    });

    ctx.data.compatibility = results;
    const incompatibleEngines = results.filter((r) => !r.compatible).map((r) => r.engine);
    return { status: 'OK', details: { results, incompatibleEngines } };
  },
};
