import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from './net.js';

describe('isPrivateAddress', () => {
  it('knows this machine, private networks and metadata addresses', () => {
    for (const address of ['127.0.0.1', '10.0.0.8', '172.16.4.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:10.0.0.8', '::ffff:7f00:1', '[::1]', '64:ff9b::a00:8']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true]);
    }
  });

  it('lets public addresses through', () => {
    for (const address of ['93.184.216.34', '172.32.0.1', '100.128.0.1', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, false]);
    }
  });

  it('refuses what it cannot read', () => {
    for (const address of ['', 'example.com', '999.1.1.1', '1.2.3']) expect([address, isPrivateAddress(address)]).toEqual([address, true]);
  });
});
