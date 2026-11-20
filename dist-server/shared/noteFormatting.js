export function isSafeNoteLink(value) {
    if (typeof value !== 'string' || value.length > 2048
        || /\s/.test(value) || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
        return false;
    try {
        const url = new URL(value);
        return ['http:', 'https:', 'mailto:'].includes(url.protocol);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=noteFormatting.js.map