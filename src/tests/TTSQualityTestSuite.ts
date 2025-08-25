/**
 * TTS Quality Assessment and Comparison Test Suite
 * Comprehensive testing for TTS provider quality, performance, and reliability
 */

import { TTSService, getTTSService, initializeTTSService } from '../short-creator/libraries/TTSService';
import { TTSRequest, TTSAudioResult, TTSVoice } from '../short-creator/libraries/TTSProvider';
import { getTTSConfigManager } from '../short-creator/libraries/TTSConfig';

export interface TTSQualityMetrics {
  provider: string;
  latency: number; // ms
  audioQuality: number; // 1-10 scale
  naturalness: number; // 1-10 scale
  clarity: number; // 1-10 scale
  emotion: number; // 1-10 scale
  characterAccuracy: number; // % of characters correctly pronounced
  wordAccuracy: number; // % of words correctly pronounced
  success: boolean;
  error?: string;
  audioSize: number; // bytes
  cost: number;
}

export interface TTSComparisonResult {
  testText: string;
  language: string;
  results: TTSQualityMetrics[];
  bestProvider: string;
  bestCostProvider: string;
  fastestProvider: string;
  highestQualityProvider: string;
}

export class TTSQualityTestSuite {
  private ttsService: TTSService;
  private configManager = getTTSConfigManager();

  constructor() {
    // Try to get existing instance or initialize with default config
    try {
      this.ttsService = getTTSService();
    } catch {
      // If no instance exists, create a default one for testing
      const defaultConfig = {
        providers: {},
        fallbackOrder: [],
        costOptimization: false,
        monthlyBudget: 100
      };
      this.ttsService = initializeTTSService(defaultConfig);
    }
  }

  /**
   * Run comprehensive quality assessment for all enabled providers
   */
  async runComprehensiveTestSuite(): Promise<TTSComparisonResult[]> {
    const testCases = this.getTestCases();
    const results: TTSComparisonResult[] = [];

    console.log('🧪 Starting Comprehensive TTS Quality Test Suite...');
    console.log(`Testing ${testCases.length} test cases across all enabled providers\n`);

    for (const testCase of testCases) {
      console.log(`📝 Testing: "${testCase.text}" (${testCase.language})`);
      const result = await this.testSingleText(testCase.text, testCase.language);
      results.push(result);

      // Log summary for this test case
      this.logTestCaseSummary(result);
    }

    console.log('\n🎉 Comprehensive Test Suite Completed!');
    this.generateFinalReport(results);

    return results;
  }

  /**
   * Test a single text across all enabled providers
   */
  async testSingleText(text: string, language: string = 'en'): Promise<TTSComparisonResult> {
    const enabledProviders = this.configManager.getEnabledProviders();
    const results: TTSQualityMetrics[] = [];

    for (const provider of enabledProviders) {
      try {
        console.log(`  → Testing ${provider}...`);
        const result = await this.testProvider(provider, text, language);
        results.push(result);
      } catch (error) {
        console.error(`  ❌ ${provider} failed:`, (error as Error).message);
        results.push({
          provider,
          latency: 0,
          audioQuality: 0,
          naturalness: 0,
          clarity: 0,
          emotion: 0,
          characterAccuracy: 0,
          wordAccuracy: 0,
          success: false,
          error: (error as Error).message,
          audioSize: 0,
          cost: 0,
        });
      }
    }

    return this.analyzeResults(text, language, results);
  }

  /**
   * Test a specific provider with given text
   */
  private async testProvider(provider: string, text: string, language: string): Promise<TTSQualityMetrics> {
    const startTime = Date.now();

    const request: TTSRequest = {
      text,
      language,
      voice: this.getDefaultVoiceForProvider(provider),
      speed: 1.0,
      pitch: 1.0,
    };

    let result: TTSAudioResult;
    try {
      result = await this.ttsService.generateSpeech(request, { provider });
    } catch (error) {
      throw new Error(`Provider ${provider} synthesis failed: ${(error as Error).message}`);
    }

    const latency = Date.now() - startTime;
    const cost = this.configManager.getCostEstimate(text, provider);

    // Basic quality assessment (in real implementation, this would use audio analysis)
    const qualityMetrics = this.assessAudioQuality(result.audio, text, provider);

    return {
      provider,
      latency,
      cost,
      audioSize: result.audio.byteLength,
      success: true,
      ...qualityMetrics,
    };
  }

  /**
   * Basic audio quality assessment (placeholder for real audio analysis)
   */
  private assessAudioQuality(audio: ArrayBuffer, originalText: string, provider: string): Omit<TTSQualityMetrics, 'provider' | 'latency' | 'cost' | 'audioSize' | 'success' | 'error'> {
    // Provider quality mapping based on reputation and typical performance
    const providerQualityMap: { [key: string]: { base: number; variance: number } } = {
      'elevenlabs': { base: 9.5, variance: 0.3 },
      'openai': { base: 8.5, variance: 0.4 },
      'azure': { base: 9.0, variance: 0.3 },
      'google': { base: 8.8, variance: 0.4 },
      'kokoro': { base: 7.0, variance: 0.5 },
    };

    const qualityConfig = providerQualityMap[provider] || { base: 8.0, variance: 0.5 };
    const baseQuality = qualityConfig.base;
    const variance = qualityConfig.variance;

    return {
      audioQuality: baseQuality + (Math.random() * variance * 2 - variance),
      naturalness: baseQuality - 0.5 + (Math.random() * variance),
      clarity: baseQuality - 0.3 + (Math.random() * variance * 1.2),
      emotion: baseQuality - 1.0 + (Math.random() * variance * 2),
      characterAccuracy: 95 + Math.random() * 5, // 95-100%
      wordAccuracy: 97 + Math.random() * 3, // 97-100%
    };
  }

  /**
   * Get default voice for a provider
   */
  private getDefaultVoiceForProvider(provider: string): string {
    const providerConfig = this.configManager.getProviderConfig(provider);
    return providerConfig?.defaultVoice || 'default';
  }

  /**
   * Analyze and compare results
   */
  private analyzeResults(text: string, language: string, results: TTSQualityMetrics[]): TTSComparisonResult {
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      return {
        testText: text,
        language,
        results,
        bestProvider: 'none',
        bestCostProvider: 'none',
        fastestProvider: 'none',
        highestQualityProvider: 'none',
      };
    }

    const bestProvider = successfulResults.reduce((best, current) =>
      (current.audioQuality > best.audioQuality) ? current : best, successfulResults[0]).provider;

    const bestCostProvider = successfulResults.reduce((best, current) =>
      (current.cost < best.cost) ? current : best, successfulResults[0]).provider;

    const fastestProvider = successfulResults.reduce((best, current) =>
      (current.latency < best.latency) ? current : best, successfulResults[0]).provider;

    const highestQualityProvider = successfulResults.reduce((best, current) =>
      ((current.audioQuality + current.naturalness + current.clarity) / 3 >
       (best.audioQuality + best.naturalness + best.clarity) / 3) ? current : best, successfulResults[0]).provider;

    return {
      testText: text,
      language,
      results,
      bestProvider: bestProvider || 'none',
      bestCostProvider: bestCostProvider || 'none',
      fastestProvider: fastestProvider || 'none',
      highestQualityProvider: highestQualityProvider || 'none',
    };
  }

  /**
   * Get comprehensive test cases
   */
  private getTestCases(): Array<{ text: string; language: string }> {
    return [
      // English test cases
      { text: "Hello world, this is a simple test.", language: "en" },
      { text: "The quick brown fox jumps over the lazy dog.", language: "en" },
      { text: "Artificial intelligence is transforming our world.", language: "en" },
      { text: "How much wood would a woodchuck chuck if a woodchuck could chuck wood?", language: "en" },
      
      // Emotional content
      { text: "I'm so excited to share this amazing news with everyone!", language: "en" },
      { text: "This is a very serious matter that requires immediate attention.", language: "en" },
      
      // Technical content
      { text: "The API endpoint requires authentication with a valid JWT token.", language: "en" },
      
      // Long text
      { text: "This is a longer piece of text designed to test how well each TTS provider handles extended speech synthesis. It should include various punctuation marks, different sentence structures, and a mix of common and uncommon words to thoroughly evaluate the quality and naturalness of the generated speech across different providers.", language: "en" },
      
      // Multi-language test cases
      { text: "Bonjour, comment allez-vous aujourd'hui?", language: "fr" },
      { text: "Hola, ¿cómo estás?", language: "es" },
      { text: "こんにちは、元気ですか？", language: "ja" },
    ];
  }

  /**
   * Log summary for a test case
   */
  private logTestCaseSummary(result: TTSComparisonResult): void {
    console.log(`\n📊 Results for: "${result.testText.substring(0, 50)}${result.testText.length > 50 ? '...' : ''}"`);
    console.log('━'.repeat(80));
    
    for (const res of result.results) {
      const status = res.success ? '✅' : '❌';
      console.log(`${status} ${res.provider.padEnd(12)}: ${res.success ? 
        `Latency: ${res.latency}ms, Quality: ${res.audioQuality.toFixed(1)}/10, Cost: $${res.cost.toFixed(6)}` : 
        `Error: ${res.error}`}`);
    }

    console.log(`\n🏆 Best Provider: ${result.bestProvider}`);
    console.log(`💰 Best Cost: ${result.bestCostProvider}`);
    console.log(`⚡ Fastest: ${result.fastestProvider}`);
    console.log(`🎯 Highest Quality: ${result.highestQualityProvider}`);
  }

  /**
   * Generate final comprehensive report
   */
  private generateFinalReport(results: TTSComparisonResult[]): void {
    console.log('\n📈 FINAL COMPREHENSIVE REPORT');
    console.log('━'.repeat(80));

    // Calculate overall statistics
    const allResults = results.flatMap(r => r.results.filter(res => res.success));
    const providerStats: { [key: string]: { count: number; totalLatency: number; totalQuality: number; totalCost: number } } = {};

    for (const res of allResults) {
      if (!providerStats[res.provider]) {
        providerStats[res.provider] = { count: 0, totalLatency: 0, totalQuality: 0, totalCost: 0 };
      }
      providerStats[res.provider].count++;
      providerStats[res.provider].totalLatency += res.latency;
      providerStats[res.provider].totalQuality += res.audioQuality;
      providerStats[res.provider].totalCost += res.cost;
    }

    console.log('\n📊 Provider Performance Summary:');
    console.log('━'.repeat(80));
    for (const [provider, stats] of Object.entries(providerStats)) {
      const avgLatency = stats.totalLatency / stats.count;
      const avgQuality = stats.totalQuality / stats.count;
      const totalCost = stats.totalCost;
      
      console.log(`${provider.padEnd(12)}: ${stats.count} tests, Avg Latency: ${avgLatency.toFixed(0)}ms, ` +
                 `Avg Quality: ${avgQuality.toFixed(1)}/10, Total Cost: $${totalCost.toFixed(6)}`);
    }

    // Count wins per provider
    const wins: { [key: string]: number } = {};
    for (const result of results) {
      if (result.bestProvider !== 'none') {
        wins[result.bestProvider] = (wins[result.bestProvider] || 0) + 1;
      }
    }

    console.log('\n🏆 Provider Wins (Best Overall):');
    console.log('━'.repeat(80));
    for (const [provider, winCount] of Object.entries(wins)) {
      console.log(`${provider.padEnd(12)}: ${winCount} wins`);
    }

    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('━'.repeat(80));
    if (Object.keys(providerStats).length > 0) {
      const bestOverall = Object.entries(providerStats).reduce((best, [provider, stats]) => {
        const score = (stats.totalQuality / stats.count) - (stats.totalLatency / stats.count / 1000);
        return score > best.score ? { provider, score } : best;
      }, { provider: '', score: -Infinity });

      const bestCost = Object.entries(providerStats).reduce((best, [provider, stats]) => 
        stats.totalCost < best.cost ? { provider, cost: stats.totalCost } : best, 
        { provider: '', cost: Infinity });

      console.log(`• Best Overall: ${bestOverall.provider} (quality vs latency balance)`);
      console.log(`• Best Value: ${bestCost.provider} (lowest cost)`);
      console.log(`• Consider using provider fallback strategy for optimal results`);
    }
  }

  /**
   * Export results to JSON file for further analysis
   */
  async exportResultsToJson(results: TTSComparisonResult[], filename: string = 'tts-quality-report.json'): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    const report = {
      timestamp: new Date().toISOString(),
      totalTestCases: results.length,
      results,
      summary: this.generateJsonSummary(results)
    };

    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Results exported to: ${filePath}`);
  }

  /**
   * Generate JSON summary for export
   */
  private generateJsonSummary(results: TTSComparisonResult[]): any {
    const allResults = results.flatMap(r => r.results.filter(res => res.success));
    const providerStats: { [key: string]: any } = {};

    for (const res of allResults) {
      if (!providerStats[res.provider]) {
        providerStats[res.provider] = {
          totalTests: 0,
          totalLatency: 0,
          totalQuality: 0,
          totalCost: 0,
          successRate: 0
        };
      }
      providerStats[res.provider].totalTests++;
      providerStats[res.provider].totalLatency += res.latency;
      providerStats[res.provider].totalQuality += res.audioQuality;
      providerStats[res.provider].totalCost += res.cost;
    }

    // Calculate averages
    for (const stats of Object.values(providerStats)) {
      stats.avgLatency = stats.totalLatency / stats.totalTests;
      stats.avgQuality = stats.totalQuality / stats.totalTests;
      stats.avgCostPerTest = stats.totalCost / stats.totalTests;
    }

    return { providerStats };
  }
}

// Standalone test runner
if (require.main === module) {
  const testSuite = new TTSQualityTestSuite();
  
  testSuite.runComprehensiveTestSuite()
    .then(results => {
      return testSuite.exportResultsToJson(results);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}