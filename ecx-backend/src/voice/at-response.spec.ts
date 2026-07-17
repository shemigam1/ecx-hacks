import { getDigits, record, response, say, speakDigits, xmlEscape } from './at-response';

describe('AT response builders', () => {
  it('response wraps children in a Response document', () => {
    expect(response(say('hi'))).toMatch(/^<\?xml.*<Response><Say[^>]*>hi<\/Say><\/Response>$/);
  });

  it('say escapes XML-unsafe characters', () => {
    expect(xmlEscape(`a<b>&'"`)).toBe('a&lt;b&gt;&amp;&apos;&quot;');
  });

  it('getDigits sets the callback path and numDigits', () => {
    const xml = getDigits({ path: '/voice/confirm', numDigits: 1 }, say('press one'));
    expect(xml).toContain('callbackUrl="/voice/confirm"');
    expect(xml).toContain('numDigits="1"');
    expect(xml).toContain('<Say');
  });

  it('record points at the intent callback', () => {
    expect(record({ path: '/voice/intent' }, say('go'))).toContain('callbackUrl="/voice/intent"');
  });

  it('speakDigits spaces digits and groups by four for slow read-back', () => {
    expect(speakDigits('1234 5678 9012 3456 7890')).toBe('1 2 3 4, 5 6 7 8, 9 0 1 2, 3 4 5 6, 7 8 9 0');
  });
});
