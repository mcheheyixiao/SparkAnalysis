# kPy1L2N05S Debug Summary

**Date**: 2026-06-18
**Sample**: kPy1L2N05S (Forge 1.19.2, TPS 13.95)

## Fetch Status

| Metric | Value |
|--------|-------|
| raw=1 success | ✅ Yes |
| raw body size | ~101 KB |
| full=true success | ✅ Yes |
| full body size | ~30+ MB |
| fullMaxBytes | 50 MB (P3 default) |
| reportType | sampler |

## Full Data Top-Level Keys

`type, metadata, threads, classSources, methodSources, lineSources, timeWindows, timeWindowStatistics, channelInfo`

## Health

| Metric | Value |
|--------|-------|
| TPS latest | 13.95 |
| TPS mean | 13.95 |
| MSPT mean | 66.6 ms |
| MSPT median | 66.6 ms |
| MSPT max | 296.0 ms |
| GC data | Present in metadata but shows empty (need extraction from platformStatistics) |
| Memory | Available in metadata |

## Main Thread

- Name: "Server thread"
- Children count: 23,154 (flat call tree)
- Top methods show MinecraftServer main loop methods

## Key Findings After P1-P3

1. **Percent calculation**: Now works — methods have 2.2%, 2.1%, etc. (uses `times[]` array sum)
2. **Source mapping**: Works — methods classified as `minecraft`/`java`/`native` by package prefix
3. **No className duplication**: Fixed in `parseMethodNode`
4. **Full fetch failure**: Now writes appropriate limitations when full=true fails
5. **methodSources**: Empty for this sample (only classSources available)
6. **lineSources**: Present in full data, added to SourceIndex

## Remaining Issues

1. GC data extraction from `metadata.platformStatistics.gc` not yet implemented
2. Top methods dominated by MinecraftServer loop methods — DynamicGraphMinFixedPoint and ChunkTracker exist but with lower sample counts
3. Source percent computation for mods: most top methods are `minecraft`, not mod-specific
4. The 187 mod sources all show `?%` because their methods don't appear in top 30

## ftbessentials Analysis

- Present in metadata.sources list
- No main thread method evidence
- confidence: low
- canBeRootCause: false
