import { inWorker } from './d1-binding.js';
import { SharpImageOptimizer } from './image-optimizer.js';
import { imagesOptimizerFromEnv, type CloudflareImageOptimizer } from './images-binding.js';

/**
 * What makes images lighter where this runs: sharp wherever Node does, and Cloudflare's Images
 * binding in a Worker, where sharp cannot be loaded. Both also draw a PNG for an email.
 */
export const siteImageOptimizer = (): SharpImageOptimizer | CloudflareImageOptimizer => (inWorker() ? imagesOptimizerFromEnv() : new SharpImageOptimizer());
