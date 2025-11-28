/**
 * Rate limiter to prevent overwhelming Steam API
 * Controls concurrent requests and enforces delays between calls
 */
class RateLimiter {
  constructor(maxConcurrent = 5, delayBetweenMs = 200) {
    this.maxConcurrent = maxConcurrent;
    this.delayBetweenMs = delayBetweenMs;
    this.activeCount = 0;
    this.queue = [];
  }

  async acquire() {
    while (this.activeCount >= this.maxConcurrent) {
      await new Promise(resolve => {
        this.queue.push(resolve);
      });
    }
    this.activeCount++;
    await this.delay(this.delayBetweenMs);
  }

  release() {
    this.activeCount--;
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RateLimiter;
