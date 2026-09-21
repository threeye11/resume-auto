import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isChatPage,
  convIdFrom,
  shouldProactiveGreet,
  formatHistoryForLlm,
  extractMessages,
  extractConversations
} from '../src/platforms/boss/chat/selectors.js';
import { createChatPoller } from '../src/platforms/boss/chat/poller.js';

test('isChatPage 匹配 chat 路径', () => {
  assert.equal(isChatPage('https://www.zhipin.com/web/geek/chat?ka=header-message'), true);
  assert.equal(isChatPage('https://www.zhipin.com/web/geek/jobs?ka=header-jobs'), false);
});

test('convId 稳定', () => {
  assert.equal(convIdFrom('A', 'B', 'C'), convIdFrom('A', 'B', 'C'));
  assert.notEqual(convIdFrom('A', 'B', 'C'), convIdFrom('A', 'B', 'D'));
});

test('shouldProactiveGreet 启发式', () => {
  assert.equal(shouldProactiveGreet({ unread: true }, []), true);
  assert.equal(shouldProactiveGreet({ unread: false }, []), true);
  assert.equal(
    shouldProactiveGreet(
      { unread: false },
      [
        { role: 'self', text: '你好' },
        { role: 'self', text: '我是…' }
      ]
    ),
    true
  );
  assert.equal(
    shouldProactiveGreet(
      { unread: false },
      [
        { role: 'self', text: '你好' },
        { role: 'other', text: '你好，请问' }
      ]
    ),
    false
  );
  assert.equal(
    shouldProactiveGreet({ unread: false }, Array.from({ length: 7 }, () => ({ role: 'other', text: 'x' }))),
    false
  );
});

test('formatHistoryForLlm', () => {
  const s = formatHistoryForLlm([
    { role: 'self', text: '你好' },
    { role: 'other', text: '在的' }
  ]);
  assert.ok(s.includes('我：你好'));
  assert.ok(s.includes('对方：在的'));
});

function dom(html) {
  // node 无 jsdom 时跳过 DOM 级断言
  if (typeof document === 'undefined') return null;
  document.body.innerHTML = html;
  return document;
}

test('extractMessages fixture（有 document 时）', (t) => {
  const doc = dom(`
    <div class="message-list">
      <div class="message-item self"><div class="content">你好</div></div>
      <div class="message-item other"><div class="content">你好，请问</div></div>
    </div>
  `);
  if (!doc) {
    t.skip('no document');
    return;
  }
  const msgs = extractMessages(doc);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'self');
  assert.equal(msgs[1].role, 'other');
});

test('poller: 新对方消息触发一次，重复不触发', () => {
  const events = [];
  let seq = 1;
  let storeSeq = 1;
  const poller = createChatPoller({
    getConvId: () => 'c1',
    getLastHandled: () => storeSeq,
    extract: () => [
      { seq: 0, role: 'self', text: 'hi' },
      { seq, role: 'other', text: `msg${seq}` }
    ]
  });
  poller.onNewReply((e) => events.push(e));
  poller.pollOnce();
  assert.equal(events.length, 0);
  seq = 2;
  poller.pollOnce();
  assert.equal(events.length, 1);
  assert.equal(events[0].text, 'msg2');
  poller.pollOnce();
  assert.equal(events.length, 1);
});

test('poller: store 为 null 时先 baseline，再在新消息时触发', () => {
  const events = [];
  let seq = 1;
  const poller = createChatPoller({
    getConvId: () => 'c-null',
    getLastHandled: () => null,
    extract: () => [{ seq, role: 'other', text: `m${seq}` }]
  });
  poller.onNewReply((e) => events.push(e));
  poller.pollOnce();
  assert.equal(events.length, 0, 'first seen should baseline only');
  seq = 5;
  poller.pollOnce();
  assert.equal(events.length, 1, 'newer seq after baseline must fire');
  assert.equal(events[0].seq, 5);
  poller.pollOnce();
  assert.equal(events.length, 1);
});

test('extractConversations 无 DOM 时不抛', () => {
  if (typeof document === 'undefined') {
    assert.deepEqual(extractConversations({ querySelectorAll: () => [] }), []);
    return;
  }
  assert.ok(Array.isArray(extractConversations()));
});
