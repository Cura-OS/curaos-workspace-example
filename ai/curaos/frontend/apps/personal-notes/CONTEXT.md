# personal_notes — Agent Context

## Quick facts
- **Web:** React 18 + Next.js 14 App Router; Tiptap rich-text editor
- **Mobile:** React Native + Expo; tentap-editor or custom RN
- **Offline:** IndexedDB (web) / Expo SQLite (native)
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Web: `/notebooks` (list), `/notebooks/[id]/notes/[noteId]` (editor).
- Tiptap extensions: markdown, code block, image embed, mention.
- Offline sync: optimistic writes to local store; background sync to personal-notes-service on reconnect; conflict = last-write-wins with toast notification.
- Mobile: Expo Router; `/(tabs)/notes` list, bottom sheet quick capture.

## Agent rules
- No clinical templates in base package; HealthStack overlay adds those.
- Attachment preview: render inline for images; link out for other file types (no embedded PDF viewer in v1).
- Export to business docs: JSON export format; do not couple to business docs schema internally.
- Run `turbo run build lint test` before marking done.
