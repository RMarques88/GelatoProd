// Custom Jest reporter para exibir tempos por teste e destacar lentos.
class TimeReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options || {};
    this._slow = this._options.slowTestThresholdMs || 1500;
  }

  onTestResult(test, testResult) {
    const path = test.path.replace(process.cwd(), '');
    testResult.testResults.forEach(tr => {
      const duration = tr.duration == null ? 0 : tr.duration;
      const label = duration > this._slow ? '⚠️  LENTO' : '⏱️';
      console.log(`${label} ${duration}ms - ${tr.fullName} (${path})`);
    });
  }

  onRunComplete() {
    console.log(
      '\n📊 Reporter de tempo concluído. Ajuste slowTestThresholdMs no jest.config.js se necessário.',
    );
  }
}

module.exports = TimeReporter;
