// Whether an address is worth keeping on the waitlist. One rule, shared by the API and its test:
// one '@', a dot in the domain, no spaces, and not absurdly long.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isWaitlistEmail(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const email = value.trim();
    return email.length <= 254 && EMAIL.test(email);
}

export const normalizeWaitlistEmail = (value: string) => value.trim().toLowerCase();
