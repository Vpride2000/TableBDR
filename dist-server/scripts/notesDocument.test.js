import assert from 'node:assert/strict';
import test from 'node:test';
import { getSchema } from '@tiptap/core';
import { noteExtensions } from '../src/notes/noteExtensions.js';
import { isNotesDocument } from '../server/routes.js';
const schema = getSchema(noteExtensions);
function documentWithList(type, attrs) {
    const paragraph = schema.nodes.paragraph.create(null, schema.text('List item'));
    const item = schema.nodes.listItem.create(null, paragraph);
    return JSON.parse(JSON.stringify(schema.nodes.doc.create(null, schema.nodes[type].create(attrs, item)).toJSON()));
}
test('accepts ordered lists serialized by the editor', () => {
    const document = documentWithList('orderedList');
    assert.deepEqual(document.content?.[0].attrs, { start: 1, type: null });
    assert.equal(isNotesDocument(document), true);
    assert.equal(isNotesDocument(documentWithList('orderedList', { start: 3, type: 'I' })), true);
    assert.equal(isNotesDocument(documentWithList('bulletList')), true);
});
test('accepts editor formatting after JSON serialization and reload', () => {
    const marks = [
        schema.marks.underline.create(), schema.marks.strike.create(), schema.marks.code.create(),
        schema.marks.link.create({ href: 'https://example.com' }),
        schema.marks.textStyle.create({ color: '#1565c0', fontFamily: 'Arial', fontSize: '18px' }),
        schema.marks.highlight.create({ color: '#fff59d' }),
    ];
    const paragraph = schema.nodes.paragraph.create({ textAlign: 'center' }, marks.map((mark) => schema.text('text', [mark])));
    const cell = schema.nodes.tableCell.create(null, paragraph);
    const header = schema.nodes.tableHeader.create(null, paragraph);
    const document = schema.nodes.doc.create(null, [
        paragraph,
        schema.nodes.heading.create({ level: 2, textAlign: 'right' }, schema.text('Heading')),
        schema.nodes.blockquote.create(null, paragraph),
        schema.nodes.codeBlock.create(null, schema.text('const x = 1')),
        schema.nodes.taskList.create(null, schema.nodes.taskItem.create({ checked: true }, paragraph)),
        schema.nodes.table.create(null, schema.nodes.tableRow.create(null, [header, cell])),
    ]);
    const json = JSON.parse(JSON.stringify(document.toJSON()));
    assert.equal(isNotesDocument(json), true);
    assert.deepEqual(JSON.parse(JSON.stringify(schema.nodeFromJSON(json).toJSON())), json);
});
test('rejects unsafe links and formatting attributes', () => {
    const doc = (mark) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [mark] }] }] });
    assert.equal(isNotesDocument(doc({ type: 'link', attrs: { href: 'javascript:alert(1)' } })), false);
    assert.equal(isNotesDocument(doc({ type: 'link', attrs: { href: 'https://example.com' } })), true);
    assert.equal(isNotesDocument(doc({ type: 'textStyle', attrs: { color: 'red;position:fixed' } })), false);
    assert.equal(isNotesDocument(doc({ type: 'textStyle', attrs: { fontSize: 'url(evil)' } })), false);
    assert.equal(isNotesDocument(doc({ type: 'unknown' })), false);
});
test('accepts legacy list attributes and rejects invalid attributes', () => {
    const document = (attrs) => ({
        type: 'doc',
        content: [{ type: 'orderedList', attrs, content: [{ type: 'listItem' }] }],
    });
    assert.equal(isNotesDocument(document({ order: 2 })), true);
    assert.equal(isNotesDocument(document({ start: '1', type: null })), false);
    assert.equal(isNotesDocument(document({ start: 1.5 })), false);
    assert.equal(isNotesDocument(document({ start: 1, type: 'invalid' })), false);
    assert.equal(isNotesDocument(document({ start: 1, type: 1 })), false);
    assert.equal(isNotesDocument(document({ start: 1, unexpected: true })), false);
});
//# sourceMappingURL=notesDocument.test.js.map