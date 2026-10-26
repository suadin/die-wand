const fs = require("fs");
const path = require("path");

class MetricsReporter {
  constructor(options = {}) {
    this.output = options.outputFile
      || path.join(__dirname, "test-metrics.e2e.json");
    this.statuses = [];
    this.startedAt = Date.now();
  }

  onTestEnd(test, result) {
    this.statuses.push(result.status);
  }

  onEnd() {
    const failures = this.statuses.filter(
      (status) => status !== "passed" && status !== "skipped",
    ).length;
    const seconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const payload = {
      total: this.statuses.length,
      failed: failures,
      coverage: null,
      duration: seconds,
      perTest: Number((seconds / Math.max(1, this.statuses.length)).toFixed(3)),
      measured: new Date().toISOString(),
    };
    fs.writeFileSync(this.output, `${JSON.stringify(payload, null, 2)}\n`);
  }
}

module.exports = MetricsReporter;
