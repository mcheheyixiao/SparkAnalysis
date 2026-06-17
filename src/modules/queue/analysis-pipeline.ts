import { prisma } from '../../plugins/prisma.js'
import { AppError } from '../../utils/errors.js'
import { safeJsonStringify } from '../../utils/json.js'
import { logService } from '../logs/log.service.js'
import { sparkFetcher } from '../spark/spark-fetcher.service.js'
import { sparkNormalizer } from '../spark/spark-normalizer.service.js'
import { sparkRuleAnalyzer } from '../spark/spark-rule-analyzer.service.js'
import { promptBuilder } from '../ai/prompt-builder.service.js'
import { aiAnalysisService } from '../ai/ai-analysis.service.js'
import { reportService } from '../reports/report.service.js'
import { settingsService } from '../settings/settings.service.js'

import type { IAnalysisJob } from './queue.interface.js'

class AnalysisPipeline {
  async execute(job: IAnalysisJob): Promise<void> {
    const { reportId, sparkCode } = job

    try {
      // ---- Stage 1: Fetching spark (progress=15) ----
      await reportService.updateStage(reportId, { stage: 'fetching_spark', progress: 15 })

      const rawData = await sparkFetcher.fetchRawMetadata(sparkCode)

      // Save raw if enabled
      const saveRaw = await settingsService.getBoolean('saveRawSparkData')
      const rawJson = saveRaw ? safeJsonStringify(rawData.rawJson) : null

      await reportService.updateStage(reportId, {
        platform: rawData.platform,
        minecraftVersion: rawData.minecraftVersion,
        sparkVersion: rawData.sparkVersion,
        serverBrand: rawData.serverBrand,
        reportType: rawData.reportType,
        durationSeconds: rawData.durationSeconds,
        rawMetadataJson: rawJson,
      })

      // ---- Stage 2: Normalizing (progress=30) ----
      await reportService.updateStage(reportId, { stage: 'normalizing', progress: 30 })

      const normalized = sparkNormalizer.normalize(rawData)
      const saveNormalized = await settingsService.getBoolean('saveNormalizedSummary')

      await reportService.updateStage(reportId, {
        normalizedJson: saveNormalized ? safeJsonStringify(normalized) : null,
      })

      // ---- Stage 3: Rule analyzing (progress=45) ----
      await reportService.updateStage(reportId, { stage: 'rule_analyzing', progress: 45 })

      const ruleAnalysis = sparkRuleAnalyzer.analyze(normalized)

      await reportService.updateStage(reportId, {
        ruleAnalysisJson: safeJsonStringify(ruleAnalysis),
      })

      // ---- Stage 4: Building prompt (progress=60) ----
      await reportService.updateStage(reportId, { stage: 'building_prompt', progress: 60 })

      const prompts = await promptBuilder.build(normalized, ruleAnalysis, rawData.reportType)

      // ---- Stage 5: Calling AI (progress=80) ----
      await reportService.updateStage(reportId, { stage: 'calling_ai', progress: 80 })

      const aiOutput = await aiAnalysisService.analyzeWithPrompts(
        normalized,
        ruleAnalysis,
        rawData.reportType,
        prompts,
      )

      // ---- Stage 6: Saving result (progress=95) ----
      await reportService.updateStage(reportId, { stage: 'saving_result', progress: 95 })

      await reportService.saveAnalysisResult(reportId, aiOutput)

      // Mark completed
      await reportService.updateStage(reportId, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
        completedAt: new Date(),
      })

      await logService.write('info', 'pipeline', 'Analysis completed', {
        reportId,
        sparkCode,
        severity: aiOutput.severity,
        isFallback: aiOutput.isFallback,
      })
    } catch (err) {
      const errorCode = this.classifyError(err)
      const errorMessage = err instanceof Error ? err.message : '分析过程发生未知错误'
      const errorDetail = {
        name: err instanceof Error ? err.name : 'UnknownError',
        message: errorMessage,
        module: 'analysis-pipeline',
        reportId,
        sparkCode,
      }

      await reportService.markFailed(reportId, errorCode, errorMessage, errorDetail)

      await logService.write('error', 'pipeline', `Analysis failed: ${errorCode}`, errorDetail)
    }
  }

  private classifyError(err: unknown): string {
    if (err instanceof AppError) {
      return err.code
    }
    if (err instanceof Error) {
      const msg = err.message.toLowerCase()
      if (msg.includes('timeout') || msg.includes('abort')) return 'SPARK_FETCH_TIMEOUT'
      if (msg.includes('404') || msg.includes('not found')) return 'SPARK_REPORT_NOT_FOUND'
      if (msg.includes('too large') || msg.includes('size')) return 'SPARK_RESPONSE_TOO_LARGE'
    }
    return 'INTERNAL_ERROR'
  }
}

export const analysisPipeline = new AnalysisPipeline()
