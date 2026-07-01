import test from 'node:test';
import assert from 'node:assert/strict';

import { createWechatPersonalBridge } from '../src/integrations/wechat-personal-bridge.js';

test('WCF bridge status explains missing local bridge service', async () => {
  const bridge = createWechatPersonalBridge({
    baseUrl: 'http://127.0.0.1:9999',
    fetchImpl: async () => {
      throw new Error('fetch failed');
    }
  });

  const status = await bridge.status();

  assert.equal(status.connected, false);
  assert.match(status.message, /未启动 WCF HTTP 桥接器/);
  assert.match(status.message, /127\.0\.0\.1:9999/);
});
