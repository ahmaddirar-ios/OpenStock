import { describe, expect, it } from 'vitest';
import {
    ALERT_COOLDOWN_SECONDS,
    DEFAULT_NOTIFY_PREFS,
    firingBatch,
    firingDetail,
    firingMessage,
    firingRules,
    freshFirings,
    readNotifyPrefs,
    writeNotifyPrefs,
    type FiredNotice,
} from '@/lib/alert-notify';

const hit = (over: Partial<FiredNotice> = {}): FiredNotice => ({
    id: 'a1',
    symbol: '4013.SR',
    condition: 'ABOVE',
    targetPrice: 120,
    value: 121.5,
    price: 121.5,
    ...over,
});

describe('readNotifyPrefs', () => {
    it('defaults both switches on when this browser has never chosen', () => {
        expect(readNotifyPrefs(() => null)).toEqual(DEFAULT_NOTIFY_PREFS);
        expect(DEFAULT_NOTIFY_PREFS).toEqual({ toast: true, sound: true });
    });

    it('reads a stored choice, and treats an unreadable one as the default', () => {
        const stored: Record<string, string> = { 'openstock:alert-notify': '0', 'openstock:alert-sound': '0' };
        expect(readNotifyPrefs((key) => stored[key] ?? null)).toEqual({ toast: false, sound: false });
        expect(readNotifyPrefs(() => 'nonsense')).toEqual({ toast: false, sound: false });
    });

    it('writes both switches as numbers the reader understands', () => {
        const written: Record<string, string> = {};
        writeNotifyPrefs({ toast: true, sound: false }, (key, value) => { written[key] = value; });
        expect(written).toEqual({ 'openstock:alert-notify': '1', 'openstock:alert-sound': '0' });
    });
});

describe('firing copy', () => {
    it('names the symbol and the value in both languages', () => {
        expect(firingMessage(hit(), 'en')).toContain('4013.SR');
        expect(firingMessage(hit(), 'ar')).toContain('4013.SR');
        expect(firingMessage(hit(), 'en')).not.toBe(firingMessage(hit(), 'ar'));
    });

    it('spells the rule and the price in the detail line', () => {
        expect(firingDetail(hit(), 'en')).toContain('at or above');
        expect(firingDetail(hit(), 'en')).toContain('121.50');
        expect(firingDetail(hit({ price: null }), 'en')).not.toContain('·');
    });

    it('counts a batch of firings', () => {
        expect(firingBatch(3, 'en')).toContain('3');
    });
});

describe('freshFirings', () => {
    it('passes a new rule through and remembers when it was said', () => {
        const result = freshFirings([hit()], {}, 1000);
        expect(result.fresh).toHaveLength(1);
        expect(result.seen['a1:ABOVE']).toBe(1000);
    });

    it('drops the same rule inside the cooldown and lets it speak again after it', () => {
        const first = freshFirings([hit()], {}, 1000);
        const repeat = freshFirings([hit()], first.seen, 1000 + ALERT_COOLDOWN_SECONDS - 1);
        expect(repeat.fresh).toHaveLength(0);
        expect(repeat.seen['a1:ABOVE']).toBe(1000);

        const later = freshFirings([hit()], repeat.seen, 1000 + ALERT_COOLDOWN_SECONDS);
        expect(later.fresh).toHaveLength(1);
    });

    it('keeps different rules apart even on the same alert', () => {
        const result = freshFirings([hit(), hit({ condition: 'BELOW', targetPrice: 110 })], {}, 1000);
        expect(result.fresh).toHaveLength(2);
    });
});

describe('grouped firings', () => {
    it('announces the rule that tripped, not the group first rule', () => {
        // An OR group fires on its tripped rule, which is what the server lists first.
        const grouped = hit({
            condition: 'RSI_BELOW',
            targetPrice: 30,
            value: 28.4,
            ruleList: [
                { condition: 'RSI_BELOW', targetPrice: 30, value: 28.4 },
                { condition: 'ABOVE', targetPrice: 120, value: 121.5 },
            ],
        });
        const detail = firingDetail(grouped, 'en');
        expect(detail).toContain('RSI');
        expect(detail).not.toContain('at or above');
    });

    it('falls back to its own rule when the server sent no list', () => {
        expect(firingRules(hit())).toEqual([{ condition: 'ABOVE', targetPrice: 120, value: 121.5 }]);
        expect(firingRules(hit({ ruleList: [] }))).toHaveLength(1);
    });
});
