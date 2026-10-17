import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initialState, addNote, editNote, removeNote, makeBatch, markSent, move, boundaries, lines } from '../src/model.ts'
const source = { sessionID: 'session-a', messageID: 'message-a', part: 2, text: 'same same\n👨‍👩‍👧 é é\tend' }
test('reversed exact repeated passage and optional empty comment', () => {
 const s = initialState(); const n = addNote(s, source, 9, 5, '', '1')
 assert.equal(n.quote, 'same'); assert.equal(n.start, 5); assert.equal(n.comment, '')
})
test('numbering remains stable after remove and sessions are isolated', () => {
 const s = initialState(); addNote(s, source, 0, 4, '', '1'); removeNote(s, '1')
 assert.equal(addNote(s, source, 5, 9, '', '2').number, 2)
 assert.equal(addNote(s, { ...source, sessionID: 'b' }, 0, 4, '', '3').number, 1)
})
test('graphemes, whitespace, newline and trailing cursor positions preserved', () => {
 const b = boundaries(source.text); assert.equal(move(source.text, 10, 1), 18)
 for (let i=0;i<b.length-1;i++) assert.equal(move(source.text,b[i],1),b[i+1])
 assert.equal(lines(source.text).flat().map(x=>x.text).join(''), source.text)
 assert.throws(()=>addNote(initialState(),source,11,12,'','bad'))
 assert.throws(()=>addNote(initialState(),source,0,0,'','bad'))
})
test('snapshot survives drift and includes full unselected context once', () => {
 const s=initialState(); addNote(s,source,0,4,'first','1'); addNote(s,source,5,9,'second','2')
 const b=makeBatch(s,'session-a','batch',1); const payload=JSON.parse(b.text.slice(b.text.indexOf('{')))
 assert.equal(payload.sources.length,1); assert.equal(payload.sources[0].fullTextSnapshot,source.text)
 assert.equal(payload.annotations[1].startUTF16,5); assert.equal(b.notes[0].source.text,source.text)
})
test('edit/remove and durable JSON restoration',()=>{
 const s=initialState(); addNote(s,source,0,4,'','1'); editNote(s,'1','updated')
 const restored=JSON.parse(JSON.stringify(s)); assert.equal(restored.notes[0].comment,'updated'); removeNote(restored,'1'); assert.equal(restored.notes.length,0)
})
test('prepared submission is idempotent; failed send retains notes; new notes survive successful send',()=>{
 const s=initialState(); addNote(s,source,0,4,'','1'); const b=makeBatch(s,'session-a','batch',1)
 assert.equal(makeBatch(s,'session-a','other',2),b); assert.equal(s.notes.length,1)
 assert.throws(()=>editNote(s,'1','new')); assert.throws(()=>removeNote(s,'1'))
 addNote(s,source,5,9,'','2'); addNote(s,{...source,sessionID:'b'},0,4,'','3')
 markSent(s,'batch'); assert.deepEqual(s.notes.map(n=>n.id),['2','3']); assert.equal(s.batches[0].status,'sent')
})
test('full sibling response text parts are retained without thinking or tools',()=>{
 const s=initialState(); const full={...source,responseParts:[{part:0,text:'Earlier explanation'},{part:2,text:source.text},{part:4,text:'Conclusion'}]}
 addNote(s,full,5,9,'','a');const b=makeBatch(s,source.sessionID,'batch',1)
 const payload=JSON.parse(b.text.slice(b.text.indexOf('{')))
 assert.deepEqual(payload.sources[0].fullAssistantTextParts,full.responseParts)
})
