const fs = require("fs");
const path = require("path");

class MetricsReporter {
  constructor(options = {}) {
    this.output = options.outputFile
      || path.join(__dirname, "test-metrics.e2e.json");
    this.coverageFile = path.join(__dirname, "coverage.json");
    this.statuses = [];
    this.startedAt = Date.now();
  }

  onBegin() {
    try {
      fs.unlinkSync(this.coverageFile);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  onTestEnd(test, result) {
    this.statuses.push(result.status);
  }

  onEnd() {
    const failures = this.statuses.filter(
      (status) => status !== "passed" && status !== "skipped",
    ).length;
    const seconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    let coverage = null;
    try {
      coverage = JSON.parse(fs.readFileSync(this.coverageFile, "utf8"));
    } catch (error) {
      coverage = null;
    }
    const payload = {
      total: this.statuses.length,
      failed: failures,
      coverage: coverage ? coverage.percent : null,
      coveredLines: coverage ? coverage.coveredLines : 0,
      totalLines: coverage ? coverage.totalLines : 0,
      duration: seconds,
      perTest: Number((seconds / Math.max(1, this.statuses.length)).toFixed(3)),
      measured: new Date().toISOString(),
    };
    fs.writeFileSync(this.output, `${JSON.stringify(payload, null, 2)}\n`);
  }
}

module.exports = MetricsReporter;
