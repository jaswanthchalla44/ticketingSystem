import { describe, expect, it } from 'vitest';
import { ATTACHMENT_MAX_BYTES, attachmentTypeFor, checkAttachment, validateTicketDraft } from './validation';

const VALID = { title: 'Printer offline', description: 'The third floor printer shows offline for everyone.', category: 'Hardware' };

describe('validateTicketDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateTicketDraft(VALID)).toEqual({});
  });

  it('counts the trimmed title, so spaces do not make a short title pass', () => {
    expect(validateTicketDraft({ ...VALID, title: '   ab   ' }).title).toMatch(/at least 3/);
  });

  it('rejects a title over 140 characters and a description under 10', () => {
    expect(validateTicketDraft({ ...VALID, title: 'x'.repeat(141) }).title).toMatch(/at most 140/);
    expect(validateTicketDraft({ ...VALID, description: 'too short' }).description).toMatch(/at least 10/);
  });

  it('rejects a description over 5000 characters', () => {
    expect(validateTicketDraft({ ...VALID, description: 'x'.repeat(5001) }).description).toMatch(/5000/);
  });

  it('requires a category from the API enum', () => {
    expect(validateTicketDraft({ ...VALID, category: '' }).category).toBeDefined();
    expect(validateTicketDraft({ ...VALID, category: 'Facilities' }).category).toBeDefined();
  });
});

describe('attachments', () => {
  it('takes the content type from the extension, as the API requires', () => {
    expect(attachmentTypeFor('screen.PNG')).toBe('image/png');
    expect(attachmentTypeFor('photo.jpeg')).toBe('image/jpeg');
    expect(attachmentTypeFor('report.pdf')).toBe('application/pdf');
    expect(attachmentTypeFor('no-extension')).toBeUndefined();
  });

  it('accepts an allowed file and returns its content type', () => {
    expect(checkAttachment({ name: 'error.gif', size: 2048 })).toEqual({ ok: true, content_type: 'image/gif' });
  });

  it('rejects other types, empty files and files over 5 MB', () => {
    expect(checkAttachment({ name: 'setup.exe', size: 10 })).toMatchObject({ ok: false });
    expect(checkAttachment({ name: 'empty.png', size: 0 })).toEqual({ ok: false, error: 'That file is empty. Choose another file.' });
    expect(checkAttachment({ name: 'big.png', size: ATTACHMENT_MAX_BYTES + 1 })).toEqual({ ok: false, error: 'Files must be 5 MB or smaller.' });
  });

  it('accepts a file exactly at the limit', () => {
    expect(checkAttachment({ name: 'max.png', size: ATTACHMENT_MAX_BYTES }).ok).toBe(true);
  });
});
