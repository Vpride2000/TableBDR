import { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createDbClient, toFiniteNumber, buildFallbackCalculationLine } from './db.js';
import { GN_TABLE_CONFIGS, BDR_SELECT_FIELDS, LimitCalculationLineInput, LimitCalculationLineRow, LimitCalculationResponseLine } from './config.js';

// Маршруты backend-сервера.
// Этот модуль регистрирует HTTP endpoints для сущностей GN и расчета лимитов.
type NoteContentNode = {
  text?: unknown;
  content?: unknown;
};

function extractNoteText(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const node = content as NoteContentNode;
  const ownText = typeof node.text === 'string' ? node.text : '';
  const children = Array.isArray(node.content) ? node.content : [];
  return [ownText, ...children.map(extractNoteText)].filter(Boolean).join(' ');
}

function parseNotesId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeNotesTitle(value: unknown, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  if ((!allowEmpty && title.length === 0) || title.length > 200) return null;
  return title;
}

function normalizeNotesTags(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) return null;
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const tag = item.trim();
    if (!tag || tag.length > 40) return null;
    const key = tag.toLocaleLowerCase('ru');
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}

function isNotesDocument(value: unknown, root = true): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const node = value as { type?: unknown; text?: unknown; content?: unknown; attrs?: unknown; marks?: unknown };
  if (typeof node.type !== 'string') return false;
  const allowedKeys = new Set(['type', 'text', 'content', 'attrs', 'marks']);
  if (Object.keys(node).some((key) => !allowedKeys.has(key))) return false;
  const allowedTypes = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'hardBreak']);
  if (!allowedTypes.has(node.type) || (root && node.type !== 'doc')) return false;
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text.length > 1_000_000 || node.content !== undefined) return false;
  } else if (node.text !== undefined) {
    return false;
  }
  if (node.attrs !== undefined) {
    if (!node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)) return false;
    const attrs = node.attrs as Record<string, unknown>;
    if (node.type === 'heading') {
      if (Object.keys(attrs).some((key) => key !== 'level') || ![1, 2, 3].includes(Number(attrs.level))) return false;
    } else if (node.type === 'orderedList') {
      if (Object.keys(attrs).some((key) => key !== 'order') || (attrs.order !== undefined && !Number.isInteger(attrs.order))) return false;
    } else {
      return false;
    }
  }
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks) || node.marks.some((mark) => {
      if (!mark || typeof mark !== 'object' || Array.isArray(mark)) return true;
      const markValue = mark as { type?: unknown };
      return Object.keys(mark).some((key) => key !== 'type')
        || !['bold', 'italic'].includes(String(markValue.type));
    })) return false;
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content) || node.content.some((child) => !isNotesDocument(child, false))) return false;
  }
  return true;
}

export function setupRoutes(app: Express): void {
  const satellitesControlUsers: Record<string, string> = {
    ADM: process.env.SAT_CTRL_PASS_ADM ?? '',
    'ВГГФ': process.env.SAT_CTRL_PASS_VGGF ?? '',
    'СГГФ': process.env.SAT_CTRL_PASS_SGGF ?? '',
    'ТГГФ': process.env.SAT_CTRL_PASS_TGGF ?? '',
  };
  const satellitesControlSessions = new Map<string, { user: string; expiresAt: number }>();
  const satellitesSessionTtlMs = 8 * 60 * 60 * 1000;
  const dashboardTileKeys = [
    'services',
    'contracts',
    'cellular',
    'satellites',
    'purchases',
    'import-substitution',
    'equipment-accounting',
  ];
  const dashboardTileStatuses = ['red', 'yellow', 'green'];
  const dashboardBdrFields = ['Лимит', 'БДР25корр', 'БДР26', 'БДР26корр', 'БДР27'];

  function getSatellitesUserByToken(req: Request): string | null {
    const authHeader = String(req.headers.authorization ?? '').trim();
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null;

    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const session = satellitesControlSessions.get(token);
    if (!session) return null;

    if (session.expiresAt < Date.now()) {
      satellitesControlSessions.delete(token);
      return null;
    }

    return session.user;
  }

  function normalizeMacKey(value: string): string {
    return String(value ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  }

  function parseAmount(value: unknown): number {
    const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function toNullableTrimmedText(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized === '' ? null : normalized;
  }

  function buildCellularRowKey(account: string | null, identifier: string, icc: string | null): string {
    return `${account ?? ''}||${identifier}||${icc ?? ''}`;
  }

  // Health check
  // Простой endpoint для проверки, что сервер доступен.
  app.get('/api/health', (req: Request, res: Response): void => {
    res.json({ status: 'ok' });
  });

  app.get('/api/notes', async (_req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const [notebooks, sections, pages] = await Promise.all([
        client.query(`
          SELECT "id", "title", "position", "updated_at" AS "updatedAt"
          FROM "app_notes_notebooks"
          ORDER BY "position", "id"
        `),
        client.query(`
          SELECT "id", "notebook_id" AS "notebookId", "title", "position"
          FROM "app_notes_sections"
          ORDER BY "notebook_id", "position", "id"
        `),
        client.query(`
          SELECT p."id", p."section_id" AS "sectionId", p."title", p."position",
                 p."updated_at" AS "updatedAt",
                 COALESCE(ARRAY_AGG(t."name") FILTER (WHERE t."id" IS NOT NULL), ARRAY[]::TEXT[]) AS "tags"
          FROM "app_notes_pages" p
          LEFT JOIN "app_notes_page_tags" pt ON pt."page_id" = p."id"
          LEFT JOIN "app_notes_tags" t ON t."id" = pt."tag_id"
          GROUP BY p."id"
          ORDER BY p."section_id", p."position", p."id"
        `),
      ]);
      res.json({ notebooks: notebooks.rows, sections: sections.rows, pages: pages.rows });
    } catch (err) {
      console.error('Failed to fetch notes workspace', err);
      res.status(500).json({ error: 'Failed to fetch notes workspace' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/notes/search', async (req: Request, res: Response): Promise<void> => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length > 200) {
      res.status(400).json({ error: 'Search query must be 200 characters or fewer' });
      return;
    }
    if (!query) {
      res.json([]);
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query(`
        SELECT p."id", p."section_id" AS "sectionId", s."notebook_id" AS "notebookId",
               p."title", p."content_text" AS "contentText", p."updated_at" AS "updatedAt",
               s."title" AS "sectionTitle", n."title" AS "notebookTitle",
               COALESCE(ARRAY_AGG(DISTINCT t."name") FILTER (WHERE t."id" IS NOT NULL), ARRAY[]::TEXT[]) AS "tags",
               TS_RANK(p."search_vector", PLAINTO_TSQUERY('simple', $1::TEXT)) AS "rank"
        FROM "app_notes_pages" p
        JOIN "app_notes_sections" s ON s."id" = p."section_id"
        JOIN "app_notes_notebooks" n ON n."id" = s."notebook_id"
        LEFT JOIN "app_notes_page_tags" pt ON pt."page_id" = p."id"
        LEFT JOIN "app_notes_tags" t ON t."id" = pt."tag_id"
        WHERE p."search_vector" @@ PLAINTO_TSQUERY('simple', $1::TEXT)
           OR p."title" ILIKE '%' || $1::TEXT || '%'
           OR p."content_text" ILIKE '%' || $1::TEXT || '%'
           OR EXISTS (
             SELECT 1 FROM "app_notes_page_tags" matched_pt
             JOIN "app_notes_tags" matched_t ON matched_t."id" = matched_pt."tag_id"
             WHERE matched_pt."page_id" = p."id"
               AND matched_t."name" ILIKE '%' || $1::TEXT || '%'
           )
        GROUP BY p."id", s."id", n."id"
        ORDER BY "rank" DESC, p."updated_at" DESC
        LIMIT 100
      `, [query]);
      res.json(result.rows);
    } catch (err) {
      console.error('Failed to search notes', err);
      res.status(500).json({ error: 'Failed to search notes' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/notes/notebooks', async (req: Request, res: Response): Promise<void> => {
    const title = normalizeNotesTitle(req.body?.title);
    if (title === null) {
      res.status(400).json({ error: 'Notebook title is required and must be 200 characters or fewer' });
      return;
    }
    const client = await createDbClient();
    try {
      const result = await client.query(`
        INSERT INTO "app_notes_notebooks" ("title", "position")
        SELECT $1, COALESCE(MAX("position"), -1) + 1 FROM "app_notes_notebooks"
        RETURNING "id", "title", "position", "updated_at" AS "updatedAt"
      `, [title]);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Failed to create notes notebook', err);
      res.status(500).json({ error: 'Failed to create notes notebook' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/notes/notebooks/:id', async (req: Request, res: Response): Promise<void> => {
    const id = parseNotesId(req.params.id);
    const title = normalizeNotesTitle(req.body?.title);
    if (id === null || title === null) {
      res.status(400).json({ error: 'Valid notebook ID and title are required' });
      return;
    }
    const client = await createDbClient();
    try {
      const result = await client.query(`
        UPDATE "app_notes_notebooks"
        SET "title" = $1, "updated_at" = NOW()
        WHERE "id" = $2
        RETURNING "id", "title", "position", "updated_at" AS "updatedAt"
      `, [title, id]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Failed to update notes notebook', err);
      res.status(500).json({ error: 'Failed to update notes notebook' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/notes/notebooks/:id', async (req: Request, res: Response): Promise<void> => {
    const id = parseNotesId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Valid notebook ID is required' });
      return;
    }
    const client = await createDbClient();
    try {
      await client.query('BEGIN');
      const notebookResult = await client.query(
        'SELECT "id" FROM "app_notes_notebooks" WHERE "id" = $1 FOR UPDATE',
        [id],
      );
      if (notebookResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }
      const sectionsResult = await client.query(
        'SELECT 1 FROM "app_notes_sections" WHERE "notebook_id" = $1 LIMIT 1',
        [id],
      );
      if (sectionsResult.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Cannot delete a notebook that contains sections' });
        return;
      }
      await client.query('DELETE FROM "app_notes_notebooks" WHERE "id" = $1', [id]);
      await client.query('COMMIT');
      res.sendStatus(204);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to delete notes notebook', err);
      res.status(500).json({ error: 'Failed to delete notes notebook' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/notes/sections', async (req: Request, res: Response): Promise<void> => {
    const notebookId = parseNotesId(String(req.body?.notebookId ?? ''));
    const title = normalizeNotesTitle(req.body?.title);
    if (notebookId === null || title === null) {
      res.status(400).json({ error: 'Valid notebook ID and section title are required' });
      return;
    }
    const client = await createDbClient();
    try {
      const result = await client.query(`
        INSERT INTO "app_notes_sections" ("notebook_id", "title", "position")
        SELECT n."id", $2, COALESCE((
          SELECT MAX(s."position") + 1
          FROM "app_notes_sections" s
          WHERE s."notebook_id" = n."id"
        ), 0)
        FROM "app_notes_notebooks" n
        WHERE n."id" = $1
        RETURNING "id", "notebook_id" AS "notebookId", "title", "position"
      `, [notebookId, title]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Failed to create notes section', err);
      res.status(500).json({ error: 'Failed to create notes section' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/notes/sections/:id', async (req: Request, res: Response): Promise<void> => {
    const id = parseNotesId(req.params.id);
    const title = normalizeNotesTitle(req.body?.title);
    if (id === null || title === null) {
      res.status(400).json({ error: 'Valid section ID and title are required' });
      return;
    }
    const client = await createDbClient();
    try {
      const result = await client.query(`
        UPDATE "app_notes_sections"
        SET "title" = $1, "updated_at" = NOW()
        WHERE "id" = $2
        RETURNING "id", "notebook_id" AS "notebookId", "title", "position"
      `, [title, id]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Section not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Failed to update notes section', err);
      res.status(500).json({ error: 'Failed to update notes section' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/notes/sections/:id', async (req: Request, res: Response): Promise<void> => {
    const id = parseNotesId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Valid section ID is required' });
      return;
    }
    const client = await createDbClient();
    try {
      await client.query('BEGIN');
      const sectionResult = await client.query(`
        SELECT "id", "notebook_id" AS "notebookId", "title", "position"
        FROM "app_notes_sections"
        WHERE "id" = $1
        FOR UPDATE
      `, [id]);
      if (sectionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Section not found' });
        return;
      }
      const pagesResult = await client.query(`
        SELECT p."id", p."section_id" AS "sectionId", p."title", p."content",
               p."position", p."updated_at" AS "updatedAt",
               COALESCE((
                 SELECT ARRAY_AGG(t."name")
                 FROM "app_notes_page_tags" pt
                 JOIN "app_notes_tags" t ON t."id" = pt."tag_id"
                 WHERE pt."page_id" = p."id"
               ), ARRAY[]::TEXT[]) AS "tags"
        FROM "app_notes_pages" p
        WHERE p."section_id" = $1
        ORDER BY p."position", p."id"
        FOR UPDATE OF p
      `, [id]);
      await client.query('DELETE FROM "app_notes_sections" WHERE "id" = $1', [id]);
      await client.query('COMMIT');
      res.json({ section: sectionResult.rows[0], pages: pagesResult.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to delete notes section', err);
      res.status(500).json({ error: 'Failed to delete notes section' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/notes/sections/:id/restore', async (req: Request, res: Response): Promise<void> => {
    const deletedId = parseNotesId(req.params.id);
    const snapshot = req.body as {
      section?: { id?: unknown; notebookId?: unknown; title?: unknown; position?: unknown };
      pages?: Array<{ id?: unknown; sectionId?: unknown; title?: unknown; position?: unknown; content?: unknown; tags?: unknown }>;
    } | undefined;
    const deletedSectionId = parseNotesId(String(snapshot?.section?.id ?? ''));
    const notebookId = parseNotesId(String(snapshot?.section?.notebookId ?? ''));
    const title = normalizeNotesTitle(snapshot?.section?.title);
    const position = Number(snapshot?.section?.position);
    const pages = snapshot?.pages;
    if (deletedId === null || deletedSectionId !== deletedId || notebookId === null || title === null
      || !Number.isSafeInteger(position) || position < 0 || !Array.isArray(pages)
      || pages.some((page) => {
        const pageId = parseNotesId(String(page.id ?? ''));
        const pageSectionId = parseNotesId(String(page.sectionId ?? ''));
        const pageTitle = normalizeNotesTitle(page.title, true);
        const pagePosition = Number(page.position);
        const tags = normalizeNotesTags(page.tags);
        return pageId === null || pageSectionId !== deletedId || pageTitle === null
          || !Number.isSafeInteger(pagePosition) || pagePosition < 0
          || !isNotesDocument(page.content) || JSON.stringify(page.content).length > 1_000_000
          || tags === null;
      })) {
      res.status(400).json({ error: 'Invalid deleted section snapshot' });
      return;
    }

    const client = await createDbClient();
    try {
      await client.query('BEGIN');
      const sectionResult = await client.query(`
        INSERT INTO "app_notes_sections" ("notebook_id", "title", "position")
        SELECT "id", $2, $3
        FROM "app_notes_notebooks"
        WHERE "id" = $1
        RETURNING "id", "notebook_id" AS "notebookId", "title", "position"
      `, [notebookId, title, position]);
      if (sectionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Notebook not found' });
        return;
      }
      const restoredSection = sectionResult.rows[0] as { id: string | number };
      const restoredPages: Array<{ id: string | number; title: string }> = [];
      for (const page of pages) {
        const pageTitle = normalizeNotesTitle(page.title, true)!;
        const contentText = extractNoteText(page.content).slice(0, 1_000_000);
        const pageResult = await client.query(`
          INSERT INTO "app_notes_pages" ("section_id", "title", "position", "content", "content_text", "search_vector")
          VALUES ($1, $2, $3, $4::jsonb, $5, TO_TSVECTOR('simple', CONCAT_WS(' ', $2::TEXT, $5::TEXT)))
          RETURNING "id", "title"
        `, [restoredSection.id, pageTitle, Number(page.position), JSON.stringify(page.content), contentText]);
        const restoredPage = pageResult.rows[0] as { id: string | number; title: string };
        for (const tag of normalizeNotesTags(page.tags)!) {
          const tagResult = await client.query<{ id: string | number }>(`
            INSERT INTO "app_notes_tags" ("name")
            VALUES ($1)
            ON CONFLICT ((LOWER("name"))) DO UPDATE SET "name" = EXCLUDED."name"
            RETURNING "id"
          `, [tag]);
          await client.query(
            'INSERT INTO "app_notes_page_tags" ("page_id", "tag_id") VALUES ($1, $2)',
            [restoredPage.id, tagResult.rows[0].id],
          );
        }
        restoredPages.push(restoredPage);
      }
      await client.query('COMMIT');
      res.status(201).json({ section: sectionResult.rows[0], pages: restoredPages });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to restore notes section', err);
      res.status(500).json({ error: 'Failed to restore notes section' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/notes/pages/:id', async (req: Request, res: Response): Promise<void> => {
    const id = parseNotesId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Valid page ID is required' });
      return;
    }
    const client = await createDbClient();
    try {
      const result = await client.query(`
        SELECT p."id", p."section_id" AS "sectionId", p."title", p."content",
               p."updated_at" AS "updatedAt",
               COALESCE(ARRAY_AGG(t."name") FILTER (WHERE t."id" IS NOT NULL), ARRAY[]::TEXT[]) AS "tags"
        FROM "app_notes_pages" p
        LEFT JOIN "app_notes_page_tags" pt ON pt."page_id" = p."id"
        LEFT JOIN "app_notes_tags" t ON t."id" = pt."tag_id"
        WHERE p."id" = $1
        GROUP BY p."id"
      `, [id]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Page not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Failed to fetch notes page', err);
      res.status(500).json({ error: 'Failed to fetch notes page' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/notes/pages', async (req: Request, res: Response): Promise<void> => {
    const sectionId = parseNotesId(String(req.body?.sectionId ?? ''));
    const title = normalizeNotesTitle(req.body?.title);
    if (sectionId === null || title === null) {
      res.status(400).json({ error: 'Valid section ID and page title are required' });
      return;
    }
    const client = await createDbClient();
    try {
      const result = await client.query(`
        INSERT INTO "app_notes_pages" ("section_id", "title", "position", "search_vector")
        SELECT s."id", $2, COALESCE((
          SELECT MAX(p."position") + 1
          FROM "app_notes_pages" p
          WHERE p."section_id" = s."id"
        ), 0), TO_TSVECTOR('simple', $2::TEXT)
        FROM "app_notes_sections" s
        WHERE s."id" = $1
        RETURNING "id", "section_id" AS "sectionId", "title", "position",
                  "updated_at" AS "updatedAt", ARRAY[]::TEXT[] AS "tags"
      `, [sectionId, title]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Section not found' });
        return;
      }
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Failed to create notes page', err);
      res.status(500).json({ error: 'Failed to create notes page' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/notes/pages/:id', async (req: Request, res: Response): Promise<void> => {
    const id = parseNotesId(req.params.id);
    const title = normalizeNotesTitle(req.body?.title, true);
    const content = req.body?.content;
    const tags = normalizeNotesTags(req.body?.tags);
    if (id === null || title === null || !isNotesDocument(content) || tags === null
      || JSON.stringify(content).length > 1_000_000) {
      res.status(400).json({ error: 'Invalid page content, title, or tags' });
      return;
    }

    const contentText = extractNoteText(content).slice(0, 1_000_000);
    const client = await createDbClient();
    try {
      await client.query('BEGIN');
      const pageResult = await client.query(`
        UPDATE "app_notes_pages"
        SET "title" = $1,
            "content" = $2::jsonb,
            "content_text" = $3,
            "search_vector" = TO_TSVECTOR('simple', CONCAT_WS(' ', $1::TEXT, $3::TEXT)),
            "updated_at" = NOW()
        WHERE "id" = $4
        RETURNING "id", "section_id" AS "sectionId", "title", "updated_at" AS "updatedAt"
      `, [title, JSON.stringify(content), contentText, id]);
      if (pageResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Page not found' });
        return;
      }

      await client.query('DELETE FROM "app_notes_page_tags" WHERE "page_id" = $1', [id]);
      const savedTags: string[] = [];
      for (const tag of tags) {
        const tagResult = await client.query<{ id: string; name: string }>(`
          INSERT INTO "app_notes_tags" ("name")
          VALUES ($1)
          ON CONFLICT ((LOWER("name"))) DO UPDATE SET "name" = EXCLUDED."name"
          RETURNING "id", "name"
        `, [tag]);
        const tagRow = tagResult.rows[0];
        await client.query(
          'INSERT INTO "app_notes_page_tags" ("page_id", "tag_id") VALUES ($1, $2)',
          [id, tagRow.id],
        );
        savedTags.push(tagRow.name);
      }
      await client.query('COMMIT');
      res.json({ ...pageResult.rows[0], tags: savedTags });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to save notes page', err);
      res.status(500).json({ error: 'Failed to save notes page' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/notes/pages/:id', async (req: Request, res: Response): Promise<void> => {
    const id = parseNotesId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'Valid page ID is required' });
      return;
    }
    const client = await createDbClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        SELECT p."id", p."section_id" AS "sectionId", p."title", p."content",
               p."position", p."updated_at" AS "updatedAt",
               COALESCE((
                 SELECT ARRAY_AGG(t."name")
                 FROM "app_notes_page_tags" pt
                 JOIN "app_notes_tags" t ON t."id" = pt."tag_id"
                 WHERE pt."page_id" = p."id"
               ), ARRAY[]::TEXT[]) AS "tags"
        FROM "app_notes_pages" p
        WHERE p."id" = $1
        FOR UPDATE OF p
      `, [id]);
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Page not found' });
        return;
      }
      await client.query('DELETE FROM "app_notes_pages" WHERE "id" = $1', [id]);
      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to delete notes page', err);
      res.status(500).json({ error: 'Failed to delete notes page' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/notes/pages/:id/restore', async (req: Request, res: Response): Promise<void> => {
    const deletedId = parseNotesId(req.params.id);
    const snapshot = req.body as {
      id?: unknown; sectionId?: unknown; title?: unknown; position?: unknown; content?: unknown; tags?: unknown;
    } | undefined;
    const snapshotId = parseNotesId(String(snapshot?.id ?? ''));
    const sectionId = parseNotesId(String(snapshot?.sectionId ?? ''));
    const title = normalizeNotesTitle(snapshot?.title, true);
    const position = Number(snapshot?.position);
    const tags = normalizeNotesTags(snapshot?.tags);
    if (!snapshot || deletedId === null || snapshotId !== deletedId || sectionId === null || title === null
      || !Number.isSafeInteger(position) || position < 0 || !isNotesDocument(snapshot?.content)
      || JSON.stringify(snapshot?.content).length > 1_000_000 || tags === null) {
      res.status(400).json({ error: 'Invalid deleted page snapshot' });
      return;
    }

    const client = await createDbClient();
    try {
      await client.query('BEGIN');
      const contentText = extractNoteText(snapshot.content).slice(0, 1_000_000);
      const pageResult = await client.query(`
        INSERT INTO "app_notes_pages" ("section_id", "title", "position", "content", "content_text", "search_vector")
        SELECT "id", $2, $3, $4::jsonb, $5, TO_TSVECTOR('simple', CONCAT_WS(' ', $2::TEXT, $5::TEXT))
        FROM "app_notes_sections"
        WHERE "id" = $1
        RETURNING "id", "section_id" AS "sectionId", "title", "position", "updated_at" AS "updatedAt"
      `, [sectionId, title, position, JSON.stringify(snapshot.content), contentText]);
      if (pageResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Section not found' });
        return;
      }
      const restoredPage = pageResult.rows[0] as { id: string | number };
      for (const tag of tags) {
        const tagResult = await client.query<{ id: string | number }>(`
          INSERT INTO "app_notes_tags" ("name")
          VALUES ($1)
          ON CONFLICT ((LOWER("name"))) DO UPDATE SET "name" = EXCLUDED."name"
          RETURNING "id"
        `, [tag]);
        await client.query(
          'INSERT INTO "app_notes_page_tags" ("page_id", "tag_id") VALUES ($1, $2)',
          [restoredPage.id, tagResult.rows[0].id],
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ ...pageResult.rows[0], tags });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to restore notes page', err);
      res.status(500).json({ error: 'Failed to restore notes page' });
    } finally {
      await client.end();
    }
  });
  app.get('/api/database/schema', async (_req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query<{
        database: string;
        schema_name: string;
        table_name: string;
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: 'YES' | 'NO';
        foreign_schema: string | null;
        foreign_table: string | null;
        foreign_column: string | null;
      }>(`
        SELECT
          current_database() AS database,
          tables.table_schema AS schema_name,
          tables.table_name,
          columns.column_name,
          columns.data_type,
          columns.udt_name,
          columns.is_nullable,
          foreign_keys.foreign_schema,
          foreign_keys.foreign_table,
          foreign_keys.foreign_column
        FROM information_schema.tables AS tables
        JOIN information_schema.columns AS columns
          ON columns.table_schema = tables.table_schema
          AND columns.table_name = tables.table_name
        LEFT JOIN (
          SELECT
            source_namespace.nspname AS table_schema,
            source_table.relname AS table_name,
            source_column.attname AS column_name,
            target_namespace.nspname AS foreign_schema,
            target_table.relname AS foreign_table,
            target_column.attname AS foreign_column
          FROM pg_catalog.pg_constraint AS foreign_key
          JOIN pg_catalog.pg_class AS source_table
            ON source_table.oid = foreign_key.conrelid
          JOIN pg_catalog.pg_namespace AS source_namespace
            ON source_namespace.oid = source_table.relnamespace
          JOIN pg_catalog.pg_class AS target_table
            ON target_table.oid = foreign_key.confrelid
          JOIN pg_catalog.pg_namespace AS target_namespace
            ON target_namespace.oid = target_table.relnamespace
          JOIN LATERAL unnest(foreign_key.conkey, foreign_key.confkey)
            WITH ORDINALITY AS key_columns(source_column_id, target_column_id, position)
            ON TRUE
          JOIN pg_catalog.pg_attribute AS source_column
            ON source_column.attrelid = source_table.oid
            AND source_column.attnum = key_columns.source_column_id
          JOIN pg_catalog.pg_attribute AS target_column
            ON target_column.attrelid = target_table.oid
            AND target_column.attnum = key_columns.target_column_id
          WHERE foreign_key.contype = 'f'
        ) AS foreign_keys
          ON foreign_keys.table_schema = columns.table_schema
          AND foreign_keys.table_name = columns.table_name
          AND foreign_keys.column_name = columns.column_name
        WHERE tables.table_type IN ('BASE TABLE', 'VIEW', 'FOREIGN')
          AND tables.table_schema NOT IN ('information_schema', 'pg_catalog')
          AND tables.table_schema NOT LIKE 'pg_toast%'
        ORDER BY tables.table_schema, tables.table_name, columns.ordinal_position
      `);

      const tablesByName = new Map<string, {
        schema: string;
        name: string;
        columns: Array<{ name: string; type: string; nullable: boolean; foreignKeys: string[] }>;
      }>();
      for (const row of result.rows) {
        const key = `${row.schema_name}.${row.table_name}`;
        let table = tablesByName.get(key);
        if (!table) {
          table = { schema: row.schema_name, name: row.table_name, columns: [] };
          tablesByName.set(key, table);
        }
        const type = row.data_type === 'USER-DEFINED' || row.data_type === 'ARRAY'
          ? row.udt_name.replace(/^_/, '') + (row.data_type === 'ARRAY' ? '[]' : '')
          : row.data_type;
        let column = table.columns.find((item) => item.name === row.column_name);
        if (!column) {
          column = {
            name: row.column_name,
            type,
            nullable: row.is_nullable === 'YES',
            foreignKeys: [],
          };
          table.columns.push(column);
        }
        if (row.foreign_schema && row.foreign_table && row.foreign_column) {
          const foreignKey = `${row.foreign_schema}.${row.foreign_table}.${row.foreign_column}`;
          if (!column.foreignKeys.includes(foreignKey)) column.foreignKeys.push(foreignKey);
        }
      }

      res.json({
        database: result.rows[0]?.database ?? '',
        tables: [...tablesByName.values()],
      });
    } catch (err) {
      console.error('Failed to fetch PostgreSQL schema', err);
      const errorDetails = err instanceof Error
        ? err as Error & { code?: unknown; detail?: unknown; hint?: unknown }
        : null;
      res.status(500).json({
        error: 'Failed to fetch PostgreSQL schema',
        details: {
          message: errorDetails?.message ?? String(err),
          code: typeof errorDetails?.code === 'string' ? errorDetails.code : undefined,
          detail: typeof errorDetails?.detail === 'string' ? errorDetails.detail : undefined,
          hint: typeof errorDetails?.hint === 'string' ? errorDetails.hint : undefined,
        },
      });
    } finally {
      await client.end();
    }
  });

  app.get('/api/satellites/summary', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query<{
        satelliteCount: string;
        activeSatelliteCount: string;
        departmentCount: string;
        directionCount: string;
      }>(
        `SELECT
           COUNT(*)::text AS "satelliteCount",
           COUNT(DISTINCT s."GN_satellite_id") FILTER (WHERE EXISTS (
             SELECT 1
             FROM "GN_satellite_xml_monthly" x
             WHERE x."mac_norm" = REPLACE(UPPER(COALESCE(s."GN_satellite_mac", '')), ':', '')
               AND x."amount_without_vat" > 0
           ))::text AS "activeSatelliteCount",
           COUNT(DISTINCT s."GN_department_FK")::text AS "departmentCount",
           COUNT(DISTINCT NULLIF(TRIM(s."GN_satellite_direction_name"), ''))::text AS "directionCount"
         FROM "GN_satellites" s`
      );
      const row = result.rows[0];
      res.json({
        satelliteCount: Number(row?.satelliteCount ?? 0),
        activeSatelliteCount: Number(row?.activeSatelliteCount ?? 0),
        departmentCount: Number(row?.departmentCount ?? 0),
        directionCount: Number(row?.directionCount ?? 0),
      });
    } catch (err) {
      console.error('Failed to fetch satellites summary', err);
      res.status(500).json({ error: 'Failed to fetch satellites summary' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/satellites/auth', (req: Request, res: Response): void => {
    const payload = req.body as { username?: string; password?: string };
    const username = String(payload?.username ?? '').trim();
    const password = String(payload?.password ?? '');

    if (!username || !password) {
      res.status(400).json({ error: 'Требуются логин и пароль' });
      return;
    }

    const expectedPassword = satellitesControlUsers[username];
    if (!expectedPassword) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }

    if (password !== expectedPassword) {
      res.status(401).json({ error: 'Неверный логин или пароль' });
      return;
    }

    const token = randomUUID();
    satellitesControlSessions.set(token, {
      user: username,
      expiresAt: Date.now() + satellitesSessionTtlMs,
    });

    res.json({ ok: true, user: username, token });
  });

  app.post('/api/personal-account/auth', (req: Request, res: Response): void => {
    const password = String(req.body?.password ?? '');
    if (!password) {
      res.status(400).json({ error: 'Требуется пароль пользователя АДМ' });
      return;
    }

    const expectedPassword = satellitesControlUsers.ADM;
    if (!expectedPassword) {
      res.status(503).json({ error: 'Авторизация АДМ не настроена на сервере' });
      return;
    }
    if (password !== expectedPassword) {
      res.status(401).json({ error: 'Неверный пароль пользователя АДМ' });
      return;
    }

    const token = randomUUID();
    satellitesControlSessions.set(token, {
      user: 'ADM',
      expiresAt: Date.now() + satellitesSessionTtlMs,
    });
    res.json({ ok: true, user: 'ADM', token });
  });

  app.get('/api/personal-account/session', (req: Request, res: Response): void => {
    const authUser = getSatellitesUserByToken(req);
    if (authUser !== 'ADM') {
      res.status(401).json({ error: 'Требуется действующая сессия пользователя АДМ' });
      return;
    }
    res.json({ ok: true, user: authUser });
  });

  app.get('/api/dashboard/tile-statuses', async (_req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query<{ tile_key: string; status: string }>(
        'SELECT "tile_key", "status" FROM "app_dashboard_tile_statuses"',
      );
      res.json(Object.fromEntries(result.rows.map((row) => [row.tile_key, row.status])));
    } catch (err) {
      console.error('Failed to fetch dashboard tile statuses', err);
      res.status(500).json({ error: 'Не удалось загрузить статусы актуальности плиток' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/dashboard/tile-statuses/:tileKey', async (req: Request, res: Response): Promise<void> => {
    if (getSatellitesUserByToken(req) !== 'ADM') {
      res.status(401).json({ error: 'Изменять статусы может только пользователь АДМ' });
      return;
    }
    const { tileKey } = req.params;
    const status = String(req.body?.status ?? '');
    if (!dashboardTileKeys.includes(tileKey)) {
      res.status(400).json({ error: 'Неизвестная плитка дашборда' });
      return;
    }
    if (!dashboardTileStatuses.includes(status)) {
      res.status(400).json({ error: 'Статус должен быть red, yellow или green' });
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query(
        `INSERT INTO "app_dashboard_tile_statuses" ("tile_key", "status", "updated_by", "updated_at")
         VALUES ($1, $2, 'ADM', NOW())
         ON CONFLICT ("tile_key") DO UPDATE
         SET "status" = EXCLUDED."status", "updated_by" = EXCLUDED."updated_by", "updated_at" = NOW()
         RETURNING "tile_key", "status", "updated_by", "updated_at"`,
        [tileKey, status],
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Failed to update dashboard tile status', err);
      res.status(500).json({ error: 'Не удалось сохранить статус плитки' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/dashboard/bdr-field', async (_req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query<{ setting_value: string }>(
        'SELECT "setting_value" FROM "app_dashboard_settings" WHERE "setting_key" = $1',
        ['bdr_field'],
      );
      if (!result.rows[0] || !dashboardBdrFields.includes(result.rows[0].setting_value)) {
        throw new Error('Dashboard BDR field setting is missing or invalid');
      }
      res.json({ field: result.rows[0].setting_value });
    } catch (err) {
      console.error('Failed to fetch dashboard BDR field', err);
      res.status(500).json({ error: 'Не удалось загрузить вариант БДР для сводки' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/dashboard/bdr-field', async (req: Request, res: Response): Promise<void> => {
    if (getSatellitesUserByToken(req) !== 'ADM') {
      res.status(401).json({ error: 'Изменять вариант БДР может только пользователь АДМ' });
      return;
    }
    const field = String(req.body?.field ?? '');
    if (!dashboardBdrFields.includes(field)) {
      res.status(400).json({ error: 'Неизвестный вариант БДР' });
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query<{ setting_value: string }>(
        `INSERT INTO "app_dashboard_settings" ("setting_key", "setting_value", "updated_by", "updated_at")
         VALUES ('bdr_field', $1, 'ADM', NOW())
         ON CONFLICT ("setting_key") DO UPDATE
         SET "setting_value" = EXCLUDED."setting_value", "updated_by" = EXCLUDED."updated_by", "updated_at" = NOW()
         RETURNING "setting_value"`,
        [field],
      );
      res.json({ field: result.rows[0].setting_value });
    } catch (err) {
      console.error('Failed to update dashboard BDR field', err);
      res.status(500).json({ error: 'Не удалось сохранить вариант БДР для сводки' });
    } finally {
      await client.end();
    }
  });

  // Satellites control route
  // Получение данных о спутниковых услугах с информацией о подразделениях
  app.get('/api/satellites', async (req: Request, res: Response): Promise<void> => {
    const authUser = getSatellitesUserByToken(req);
    if (!authUser) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const client = await createDbClient();
    try {
      const branchFilter = authUser === 'ADM' ? null : `%${authUser}%`;
      const result = await client.query<{
        GN_satellite_id: number;
        GN_satellite_mac: string;
        GN_satellite_direction_name: string;
        GN_satellite_description: string | null;
        GN_Dep_id: number;
        GN_department: string;
        GN_satellite_gt_numbers_FK: number | null;
        GN_satellite_diameter: string | null;
        GN_satellite_power: string | null;
        GN_satellite_model: string | null;
        GN_satellite_modem: string | null;
      }>(
        `SELECT
           s."GN_satellite_id",
           s."GN_satellite_mac",
           s."GN_satellite_direction_name",
           s."GN_satellite_description",
           d."GN_Dep_id",
           d."GN_department",
           s."GN_satellite_gt_numbers_FK",
           s."GN_satellite_diameter",
           s."GN_satellite_power",
           s."GN_satellite_model",
           s."GN_satellite_modem"
         FROM "GN_satellites" s
         LEFT JOIN "GN_department" d ON s."GN_department_FK" = d."GN_Dep_id"
         WHERE ($1::text IS NULL OR COALESCE(d."GN_department", '') ILIKE $1)
         ORDER BY s."GN_satellite_id" ASC`
        ,
        [branchFilter]
      );

      res.json({ satellites: result.rows });
    } catch (err) {
      console.error('Failed to fetch satellites', err);
      res.status(500).json({ error: 'Failed to fetch satellites' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/satellites/:id', async (req: Request, res: Response): Promise<void> => {
    const authUser = getSatellitesUserByToken(req);
    if (!authUser) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Некорректный id' });
      return;
    }

    const payload = req.body as {
      mac?: string;
      directionName?: string;
      description?: string;
      departmentId?: number | string | null;
      gtNumbersFK?: number | string | null;
      diameter?: string;
      power?: string;
      model?: string;
      modem?: string;
    };

    const mac = String(payload.mac ?? '').trim();
    const directionName = String(payload.directionName ?? '').trim();
    const description = String(payload.description ?? '').trim();
    const departmentIdRaw = payload.departmentId;
    const departmentId = departmentIdRaw == null || departmentIdRaw === ''
      ? null
      : Number(departmentIdRaw);
    const gtNumbersFKRaw = payload.gtNumbersFK;
    const gtNumbersFK = gtNumbersFKRaw == null || gtNumbersFKRaw === ''
      ? null
      : Number(gtNumbersFKRaw);
    const diameter = String(payload.diameter ?? '').trim();
    const power = String(payload.power ?? '').trim();
    const model = String(payload.model ?? '').trim();
    const modem = String(payload.modem ?? '').trim();

    if (!mac || !directionName) {
      res.status(400).json({ error: 'MAC и имя направления обязательны' });
      return;
    }

    if (departmentId !== null && (!Number.isFinite(departmentId) || departmentId <= 0)) {
      res.status(400).json({ error: 'Некорректное подразделение' });
      return;
    }

    if (gtNumbersFK !== null && (!Number.isFinite(gtNumbersFK) || gtNumbersFK <= 0)) {
      res.status(400).json({ error: 'Некорректный номер ГТ' });
      return;
    }

    const client = await createDbClient();
    try {
      const updated = await client.query<{
        GN_satellite_id: number;
        GN_satellite_mac: string;
        GN_satellite_direction_name: string;
        GN_satellite_description: string | null;
        GN_department_FK: number | null;
        GN_satellite_gt_numbers_FK: number | null;
        GN_satellite_diameter: string | null;
        GN_satellite_power: string | null;
        GN_satellite_model: string | null;
        GN_satellite_modem: string | null;
      }>(
        `UPDATE "GN_satellites" s
         SET
           "GN_satellite_mac" = $1,
           "GN_satellite_direction_name" = $2,
           "GN_satellite_description" = $3,
           "GN_department_FK" = $4,
           "GN_satellite_gt_numbers_FK" = $5,
           "GN_satellite_diameter" = $6,
           "GN_satellite_power" = $7,
           "GN_satellite_model" = $8,
           "GN_satellite_modem" = $9
         WHERE s."GN_satellite_id" = $10
         RETURNING
           s."GN_satellite_id",
           s."GN_satellite_mac",
           s."GN_satellite_direction_name",
           s."GN_satellite_description",
           s."GN_department_FK",
           s."GN_satellite_gt_numbers_FK",
           s."GN_satellite_diameter",
           s."GN_satellite_power",
           s."GN_satellite_model",
           s."GN_satellite_modem"`,
        [mac, directionName, description || null, departmentId, gtNumbersFK, diameter || null, power || null, model || null, modem || null, id]
      );

      if (updated.rowCount === 0) {
        res.status(404).json({ error: 'Спутник не найден' });
        return;
      }

      const row = updated.rows[0];
      const dep = await client.query<{ GN_department: string | null }>(
        `SELECT "GN_department" FROM "GN_department" WHERE "GN_Dep_id" = $1 LIMIT 1`,
        [row.GN_department_FK]
      );

      res.json({
        GN_satellite_id: row.GN_satellite_id,
        GN_satellite_mac: row.GN_satellite_mac,
        GN_satellite_direction_name: row.GN_satellite_direction_name,
        GN_satellite_description: row.GN_satellite_description,
        GN_Dep_id: row.GN_department_FK,
        GN_department: dep.rows[0]?.GN_department ?? null,
        GN_satellite_gt_numbers_FK: row.GN_satellite_gt_numbers_FK,
        GN_satellite_diameter: row.GN_satellite_diameter,
        GN_satellite_power: row.GN_satellite_power,
        GN_satellite_model: row.GN_satellite_model,
        GN_satellite_modem: row.GN_satellite_modem,
      });
    } catch (err) {
      console.error('Failed to update satellite', err);
      res.status(500).json({ error: 'Failed to update satellite' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/satellites/xml-monthly', async (req: Request, res: Response): Promise<void> => {
    const authUser = getSatellitesUserByToken(req);
    if (!authUser) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const client = await createDbClient();
    try {
      const branchFilter = authUser === 'ADM' ? null : `%${authUser}%`;
      const result = await client.query<{
        mac_norm: string;
        month_name: string;
        branch: string | null;
        tariff: string | null;
        tariff_note: string | null;
        status: string;
        amount_without_vat: string | number;
        uploaded_at: string;
      }>(
        `SELECT
           x."mac_norm" AS mac_norm,
           x."month_name" AS month_name,
           x."branch" AS branch,
           x."tariff" AS tariff,
           x."tariff_note" AS tariff_note,
           x."status" AS status,
           x."amount_without_vat" AS amount_without_vat,
           x."uploaded_at" AS uploaded_at
         FROM "GN_satellite_xml_monthly" x
         LEFT JOIN "GN_satellites" s ON REPLACE(UPPER(COALESCE(s."GN_satellite_mac", '')), ':', '') = x."mac_norm"
         LEFT JOIN "GN_department" d ON s."GN_department_FK" = d."GN_Dep_id"
         WHERE ($1::text IS NULL OR COALESCE(d."GN_department", '') ILIKE $1)
         ORDER BY x."month_name" ASC, x."mac_norm" ASC`,
        [branchFilter]
      );

      res.json({ rows: result.rows });
    } catch (err) {
      console.error('Failed to fetch satellites xml monthly', err);
      res.status(500).json({ error: 'Failed to fetch satellites xml monthly' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/satellites/xml-monthly', async (req: Request, res: Response): Promise<void> => {
    const authUser = getSatellitesUserByToken(req);
    if (!authUser) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const payload = req.body as {
      rows?: Array<{
        macAddress?: string;
        month?: string;
        branch?: string;
        tariff?: string;
        tariffNote?: string;
        status?: string;
        amountWithoutVat?: string | number;
      }>;
    };

    if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
      res.status(400).json({ error: 'rows are required' });
      return;
    }

    const client = await createDbClient();
    try {
      await client.query('BEGIN');

      for (const row of payload.rows) {
        const macNorm = normalizeMacKey(row.macAddress ?? '');
        const monthName = String(row.month ?? '').trim();
        if (!macNorm || !monthName) {
          continue;
        }

        await client.query(
          `INSERT INTO "GN_satellite_xml_monthly" (
             "mac_norm",
             "month_name",
             "branch",
             "tariff",
             "tariff_note",
             "status",
             "amount_without_vat",
             "uploaded_by"
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT ("mac_norm", "month_name")
           DO UPDATE SET
             "branch" = EXCLUDED."branch",
             "tariff" = EXCLUDED."tariff",
             "tariff_note" = EXCLUDED."tariff_note",
             "status" = EXCLUDED."status",
             "amount_without_vat" = EXCLUDED."amount_without_vat",
             "uploaded_by" = EXCLUDED."uploaded_by",
             "uploaded_at" = NOW()`,
          [
            macNorm,
            monthName,
            String(row.branch ?? '').trim() || null,
            String(row.tariff ?? '').trim() || null,
            String(row.tariffNote ?? '').trim() || null,
            ['сломан', 'склад', 'в работе', 'отключен', 'ошибка'].includes(String(row.status ?? '').trim().toLowerCase())
              ? String(row.status ?? '').trim().toLowerCase()
              : 'склад',
            parseAmount(row.amountWithoutVat),
            authUser,
          ]
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to save satellites xml monthly', err);
      res.status(500).json({ error: 'Failed to save satellites xml monthly' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/satellites/xml-monthly/:month', async (req: Request, res: Response): Promise<void> => {
    const authUser = getSatellitesUserByToken(req);
    if (!authUser) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    if (authUser !== 'ADM') {
      res.status(403).json({ error: 'Очистка доступна только пользователю АДМ' });
      return;
    }

    const month = decodeURIComponent(String(req.params.month ?? '')).trim();
    if (!month) {
      res.status(400).json({ error: 'month is required' });
      return;
    }

    const client = await createDbClient();
    try {
      const cleared = await client.query(
        `UPDATE "GN_satellite_xml_monthly"
         SET
           "tariff" = NULL,
           "tariff_note" = NULL,
           "amount_without_vat" = 0,
           "uploaded_at" = NOW()
         WHERE "month_name" = $1`,
        [month]
      );

      res.json({ ok: true, clearedRows: cleared.rowCount ?? 0 });
    } catch (err) {
      console.error('Failed to clear satellites xml month', err);
      res.status(500).json({ error: 'Failed to clear satellites xml month' });
    } finally {
      await client.end();
    }
  });

  // GN entity routes
  app.get('/api/gn/departments', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_department" ORDER BY "GN_Dep_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_department' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/budget-items', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_budget_network_item" ORDER BY "GN_b_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_budget_network_item' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/pao-budget-items', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "PAO__budget_network_item" ORDER BY "PAO_b_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch PAO__budget_network_item' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/contractors', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_contractor" ORDER BY "GN_c_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_contractor' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/dogovors', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const contractor = typeof req.query.contractor === 'string' ? req.query.contractor.trim() : '';
      const result = await client.query(
        `SELECT dogovor.*
         FROM "GN_dogovor" dogovor
         ${contractor ? `JOIN "GN_contractor" contractor
           ON contractor."GN_c_id" = dogovor."GN_contarctor_FK"
           AND contractor."GN_contarctor" = $1` : ''}
         ORDER BY dogovor."GN_dgv_id" ASC`,
        contractor ? [contractor] : [],
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_dogovor' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/objects', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_departament_object" ORDER BY "GN_do_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_departament_object' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/contracts', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const conditions: string[] = [];
      const values: string[] = [];
      if (req.query.archive === 'true') {
        conditions.push(`COALESCE(c."GN_contract_approval_status", 'действующий') = 'не действующий'`);
      } else if (req.query.includeArchive === 'false') {
        conditions.push(`COALESCE(c."GN_contract_approval_status", 'действующий') <> 'не действующий'`);
      }
      if (typeof req.query.contractor === 'string' && req.query.contractor.trim()) {
        values.push(req.query.contractor.trim());
        conditions.push(`EXISTS (
          SELECT 1
          FROM "GN_contractor" contractor
          WHERE contractor."GN_c_id" = d."GN_contarctor_FK"
            AND contractor."GN_contarctor" = $${values.length}
        )`);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await client.query(`
        SELECT
          c.*,
          d."GN_dogovor" AS "GN_contract_name",
          d."GN_dogovor_note" AS "GN_dogovor_note",
          signer."GN_department" AS "GN_dogovor_signer"
        FROM "GN_contracts" c
        LEFT JOIN "GN_dogovor" d ON c."GN_contract_dogovor_FK" = d."GN_dgv_id"
        LEFT JOIN "GN_department" signer ON d."GN_dogovor_signer_FK" = signer."GN_Dep_id"
        ${whereClause}
        ORDER BY c."GN_contract_id" ASC
      `, values);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_contracts' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/gazprom-telecom', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query(`
        SELECT
          gt.*,
          d."GN_dogovor" AS "GN_dogovor_name",
          obj."GN_departament_object" AS "GN_departament_object_name",
          p."PAO__budget_network_item" AS "PAO_budget_network_item_name",
          dep."GN_department" AS "GN_department_name"
        FROM "GN_gazprom_telecom" gt
        LEFT JOIN "GN_dogovor" d ON gt."GN_dogovor_FK" = d."GN_dgv_id"
        LEFT JOIN "GN_departament_object" obj ON gt."GN_departament_object_FK" = obj."GN_do_id"
        LEFT JOIN "PAO__budget_network_item" p ON gt."PAO_budget_network_item_FK" = p."PAO_b_id"
        LEFT JOIN "GN_department" dep ON gt."GN_department_FK" = dep."GN_Dep_id"
        ORDER BY gt."GN_gazprom_telecom_id" ASC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch Gazprom Telecom rows' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/gn/contracts', async (req: Request, res: Response): Promise<void> => {
    const payload = req.body as {
      GN_contract_contractor_FK?: number;
      GN_contract_dogovor_FK: number;
      GN_contract_sed_launch_date?: string;
      GN_contract_asez_load_date?: string;
      GN_contract_state?: string;
      GN_contract_status_updated_at?: string;
      GN_contract_approval_status?: string;
      GN_contract_date?: string;
      GN_contract_term_from?: string;
      GN_contract_term_to?: string;
      GN_contract_side?: string;
      GN_contract_asez_number?: string;
    };

    if (!payload || !payload.GN_contract_dogovor_FK) {
      res.status(400).json({ error: 'Missing required fields: GN_contract_dogovor_FK' });
      return;
    }

    const statusUpdatedAt = payload.GN_contract_status_updated_at || new Date().toISOString().slice(0, 10);
    const approvalStatus = payload.GN_contract_approval_status || 'действующий';

    const client = await createDbClient();
    try {
      const result = await client.query(
        `INSERT INTO "GN_contracts" (
           "GN_contract_contractor_FK",
           "GN_contract_dogovor_FK",
           "GN_contract_sed_launch_date",
           "GN_contract_asez_load_date",
           "GN_contract_state",
           "GN_contract_status_updated_at",
           "GN_contract_approval_status",
           "GN_contract_date",
           "GN_contract_term_from",
           "GN_contract_term_to",
           "GN_contract_side",
           "GN_contract_asez_number"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *,
           (SELECT "GN_dogovor" FROM "GN_dogovor" WHERE "GN_dogovor"."GN_dgv_id" = "GN_contracts"."GN_contract_dogovor_FK") AS "GN_contract_name",
           (SELECT "GN_dogovor_note" FROM "GN_dogovor" WHERE "GN_dogovor"."GN_dgv_id" = "GN_contracts"."GN_contract_dogovor_FK") AS "GN_dogovor_note",
           (SELECT signer."GN_department"
            FROM "GN_dogovor" dogovor
            LEFT JOIN "GN_department" signer ON dogovor."GN_dogovor_signer_FK" = signer."GN_Dep_id"
            WHERE dogovor."GN_dgv_id" = "GN_contracts"."GN_contract_dogovor_FK") AS "GN_dogovor_signer"`,
        [
          payload.GN_contract_contractor_FK ?? null,
          payload.GN_contract_dogovor_FK,
          payload.GN_contract_sed_launch_date || statusUpdatedAt,
          payload.GN_contract_asez_load_date || statusUpdatedAt,
          payload.GN_contract_state || '',
          statusUpdatedAt,
          approvalStatus,
          payload.GN_contract_date ?? null,
          payload.GN_contract_term_from ?? null,
          payload.GN_contract_term_to ?? null,
          payload.GN_contract_side ?? '',
          payload.GN_contract_asez_number ?? '',
        ]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err instanceof Error ? (err.stack || err.message) : err);
      res.status(500).json({ error: String(err instanceof Error ? err.message : 'Failed to create GN_contracts') });
    } finally {
      await client.end();
    }
  });

  app.put('/api/gn/contracts/:id', async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const payload = req.body as {
      GN_contract_contractor_FK: number;
      GN_contract_dogovor_FK: number;
      GN_contract_sed_launch_date: string;
      GN_contract_asez_load_date: string;
      GN_contract_state: string;
      GN_contract_status_updated_at?: string;
      GN_contract_approval_status?: string;
      GN_contract_date?: string;
      GN_contract_term_from?: string;
      GN_contract_term_to?: string;
      GN_contract_side?: string;
      GN_contract_asez_number?: string;
    };

    if (!Number.isFinite(id)
      || !payload.GN_contract_contractor_FK
      || !payload.GN_contract_dogovor_FK
      || !payload.GN_contract_sed_launch_date
      || !payload.GN_contract_asez_load_date
      || payload.GN_contract_state === undefined
    ) {
      res.status(400).json({ error: 'Invalid contract update payload' });
      return;
    }

    const statusUpdatedAt = payload.GN_contract_status_updated_at || new Date().toISOString().slice(0, 10);
    const approvalStatus = payload.GN_contract_approval_status || 'действующий';

    const client = await createDbClient();
    try {
      const result = await client.query(
        `UPDATE "GN_contracts"
         SET
           "GN_contract_contractor_FK" = $1,
           "GN_contract_dogovor_FK" = $2,
           "GN_contract_sed_launch_date" = $3,
           "GN_contract_asez_load_date" = $4,
           "GN_contract_state" = $5,
           "GN_contract_status_updated_at" = $6,
           "GN_contract_approval_status" = $7,
           "GN_contract_date" = $8,
           "GN_contract_term_from" = $9,
           "GN_contract_term_to" = $10,
           "GN_contract_side" = $11,
           "GN_contract_asez_number" = $12
         WHERE "GN_contract_id" = $13
         RETURNING *,
           (SELECT "GN_dogovor" FROM "GN_dogovor" WHERE "GN_dogovor"."GN_dgv_id" = "GN_contracts"."GN_contract_dogovor_FK") AS "GN_contract_name",
           (SELECT "GN_dogovor_note" FROM "GN_dogovor" WHERE "GN_dogovor"."GN_dgv_id" = "GN_contracts"."GN_contract_dogovor_FK") AS "GN_dogovor_note",
           (SELECT signer."GN_department"
            FROM "GN_dogovor" dogovor
            LEFT JOIN "GN_department" signer ON dogovor."GN_dogovor_signer_FK" = signer."GN_Dep_id"
            WHERE dogovor."GN_dgv_id" = "GN_contracts"."GN_contract_dogovor_FK") AS "GN_dogovor_signer"`,
        [
          payload.GN_contract_contractor_FK,
          payload.GN_contract_dogovor_FK,
          payload.GN_contract_sed_launch_date,
          payload.GN_contract_asez_load_date,
          payload.GN_contract_state,
          statusUpdatedAt,
          approvalStatus,
          payload.GN_contract_date ?? null,
          payload.GN_contract_term_from ?? null,
          payload.GN_contract_term_to ?? null,
          payload.GN_contract_side ?? '',
          payload.GN_contract_asez_number ?? '',
          id,
        ]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Contract not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update GN_contracts' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/contract-additional-agreements', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query(`
        SELECT
          caa."GN_additional_agreement_id",
          caa."GN_contract_id_FK",
          caa."GN_additional_agreement_number",
          caa."GN_additional_agreement_date",
          caa."GN_additional_agreement_description",
          caa."GN_additional_agreement_amount",
          caa."GN_additional_agreement_status",
          d."GN_dogovor" AS contract_name
        FROM "GN_contract_additional_agreements" caa
        JOIN "GN_contracts" c ON caa."GN_contract_id_FK" = c."GN_contract_id"
        LEFT JOIN "GN_dogovor" d ON c."GN_contract_dogovor_FK" = d."GN_dgv_id"
        ORDER BY caa."GN_additional_agreement_date" DESC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_contract_additional_agreements' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/gn/contract-additional-agreements', async (req: Request, res: Response): Promise<void> => {
    const payload = req.body as {
      contractId: number;
      number: string;
      date: string;
      description: string;
      amount: number;
      approvalStatus?: string;
    };

    if (!payload.contractId || !payload.number || !payload.date || !payload.description || payload.amount === undefined) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const status = payload.approvalStatus || 'действующий';
    const validStatuses = ['действующий', 'на согласовании'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid approval status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query(
        `INSERT INTO "GN_contract_additional_agreements" (
           "GN_contract_id_FK",
           "GN_additional_agreement_number",
           "GN_additional_agreement_date",
           "GN_additional_agreement_description",
           "GN_additional_agreement_amount",
           "GN_additional_agreement_status"
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          payload.contractId,
          payload.number,
          payload.date,
          payload.description,
          payload.amount,
          status,
        ]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create additional agreement' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/gn/contract-additional-agreements/:id', async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const payload = req.body as {
      contractId: number;
      number: string;
      date: string;
      description: string;
      amount: number;
      approvalStatus?: string;
    };

    if (!Number.isFinite(id) || !payload.contractId || !payload.number || !payload.date || !payload.description || payload.amount === undefined) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const status = payload.approvalStatus || 'действующий';
    if (!['действующий', 'на согласовании'].includes(status)) {
      res.status(400).json({ error: 'Invalid approval status' });
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query(
        `UPDATE "GN_contract_additional_agreements"
         SET
           "GN_contract_id_FK" = $1,
           "GN_additional_agreement_number" = $2,
           "GN_additional_agreement_date" = $3,
           "GN_additional_agreement_description" = $4,
           "GN_additional_agreement_amount" = $5,
           "GN_additional_agreement_status" = $6
         WHERE "GN_additional_agreement_id" = $7
         RETURNING *`,
        [
          payload.contractId,
          payload.number,
          payload.date,
          payload.description,
          payload.amount,
          status,
          id,
        ]
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Additional agreement not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update additional agreement' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/gn/contract-additional-agreements/:id', async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query(
        'DELETE FROM "GN_contract_additional_agreements" WHERE "GN_additional_agreement_id" = $1',
        [id]
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Additional agreement not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete additional agreement' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/invest-okdp-tko-is-prit', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_invest_okdp_tko_is_prit" WHERE "is_deleted" = FALSE ORDER BY "GN_invest_okdp_tko_is_prit_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_invest_okdp_tko_is_prit' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/invest-ogruz-rekvizit', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_invest_ogruz_rekvizit" WHERE "is_deleted" = FALSE ORDER BY "GN_invest_ogruz_rekvizit_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_invest_ogruz_rekvizit' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/equipment-manufacturers', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_equipment_manufacturer" WHERE "is_deleted" = FALSE ORDER BY "GN_equipment_manufacturer_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_equipment_manufacturer' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/equipment-types', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_equipment_type" ORDER BY "GN_equipment_type_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_equipment_type' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/equipment-models', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_equipment_model" ORDER BY "GN_equipment_model_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_equipment_model' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/satellite-gt-numbers', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query('SELECT * FROM "GN_satellite_gt_numbers" ORDER BY "GN_satellite_gt_numbers_id" ASC');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_satellite_gt_numbers' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/cellular-account-options', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query<{
        GN_cellular_account: string | null;
        GN_department: string | null;
      }>(
        `SELECT DISTINCT
           c."GN_cellular_account",
           a."GN_cellular_account_id",
           d."GN_department"
         FROM "GN_cellular" c
         LEFT JOIN "GN_cellular_account" a ON a."GN_cellular_account" = c."GN_cellular_account"
         LEFT JOIN "GN_department" d ON d."GN_Dep_id" = a."GN_department_FK"
         WHERE c."GN_cellular_account" IS NOT NULL
         ORDER BY c."GN_cellular_account" ASC, a."GN_cellular_account_id" ASC`
      );

      res.json(result.rows
        .map((row) => ({
          account: String(row.GN_cellular_account ?? '').trim(),
          department: String(row.GN_department ?? '').trim(),
        }))
        .filter((row) => row.account));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_cellular_account_options' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/cellular', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const accountFilter = String(req.query.account ?? '').trim();
      const accountParam = accountFilter ? accountFilter : null;
      const result = await client.query(
        `SELECT
           c."GN_cellular_id",
           c."GN_cellular_account",
           c."GN_cellular_client",
           c."GN_cellular_contract_number",
           c."GN_cellular_identifier_FK",
           i."GN_cellular_identifier",
           i."GN_cellular_identifier_fio",
           c."GN_cellular_icc",
           c."GN_cellular_status",
           c."GN_cellular_activation_date",
           c."GN_cellular_zone",
           c."GN_cellular_tariff_plan_FK",
           t."GN_cellular_tariff_plan",
           t."GN_cellular_tariff_plan_details",
           c."GN_cellular_tariff_plan_enabled_date",
           c."GN_cellular_updated_at"
         FROM "GN_cellular" c
         JOIN "GN_cellular_identifier" i ON c."GN_cellular_identifier_FK" = i."GN_cellular_identifier_id"
         JOIN "GN_cellular_tariff_plan" t ON c."GN_cellular_tariff_plan_FK" = t."GN_cellular_tariff_plan_id"
         WHERE ($1::text IS NULL OR c."GN_cellular_account" = $1)
         ORDER BY c."GN_cellular_id" ASC`
        ,
        [accountParam]
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_cellular' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/gn/cellular/sync', async (req: Request, res: Response): Promise<void> => {
    const payload = req.body as {
      rows?: Array<{
        account?: unknown;
        clientName?: unknown;
        contractNumber?: unknown;
        identifier?: unknown;
        icc?: unknown;
        status?: unknown;
        activationDate?: unknown;
        zone?: unknown;
        tariffPlan?: unknown;
        tariffPlanEnabledDate?: unknown;
      }>;
    };

    if (!Array.isArray(payload.rows) || payload.rows.length === 0) {
      res.status(400).json({ error: 'rows are required' });
      return;
    }

    const client = await createDbClient();
    try {
      await client.query('BEGIN');

      let insertedRows = 0;
      let updatedRows = 0;
      let unchangedRows = 0;
      const changedColumnsByRowKey: Record<string, string[]> = {};

      for (const sourceRow of payload.rows) {
        const identifier = String(sourceRow.identifier ?? '').trim();
        const tariffPlan = String(sourceRow.tariffPlan ?? '').trim();

        if (!identifier || !tariffPlan) {
          continue;
        }

        const account = toNullableTrimmedText(sourceRow.account);
        const icc = toNullableTrimmedText(sourceRow.icc);
        const rowKey = buildCellularRowKey(account, identifier, icc);

        const identifierResult = await client.query<{ id: number }>(
          `INSERT INTO "GN_cellular_identifier" ("GN_cellular_identifier")
           VALUES ($1)
           ON CONFLICT ("GN_cellular_identifier")
           DO UPDATE SET "GN_cellular_identifier" = EXCLUDED."GN_cellular_identifier"
           RETURNING "GN_cellular_identifier_id" AS id`,
          [identifier]
        );
        const identifierId = identifierResult.rows[0].id;

        const tariffResult = await client.query<{ id: number }>(
          `INSERT INTO "GN_cellular_tariff_plan" ("GN_cellular_tariff_plan")
           VALUES ($1)
           ON CONFLICT ("GN_cellular_tariff_plan")
           DO UPDATE SET "GN_cellular_tariff_plan" = EXCLUDED."GN_cellular_tariff_plan"
           RETURNING "GN_cellular_tariff_plan_id" AS id`,
          [tariffPlan]
        );
        const tariffId = tariffResult.rows[0].id;

        const normalizedRow = {
          account,
          client: toNullableTrimmedText(sourceRow.clientName),
          contractNumber: toNullableTrimmedText(sourceRow.contractNumber),
          identifierId,
          identifier,
          icc,
          status: toNullableTrimmedText(sourceRow.status),
          activationDate: toNullableTrimmedText(sourceRow.activationDate),
          zone: toNullableTrimmedText(sourceRow.zone),
          tariffId,
          tariffPlan,
          tariffPlanEnabledDate: toNullableTrimmedText(sourceRow.tariffPlanEnabledDate),
        };

        const existingResult = await client.query<{
          GN_cellular_id: number;
          GN_cellular_account: string | null;
          GN_cellular_client: string | null;
          GN_cellular_contract_number: string | null;
          GN_cellular_identifier_FK: number;
          GN_cellular_icc: string | null;
          GN_cellular_status: string | null;
          GN_cellular_activation_date: string | null;
          GN_cellular_zone: string | null;
          GN_cellular_tariff_plan_FK: number;
          GN_cellular_tariff_plan_enabled_date: string | null;
        }>(
          `SELECT
             c."GN_cellular_id",
             c."GN_cellular_account",
             c."GN_cellular_client",
             c."GN_cellular_contract_number",
             c."GN_cellular_identifier_FK",
             c."GN_cellular_icc",
             c."GN_cellular_status",
             c."GN_cellular_activation_date"::text AS "GN_cellular_activation_date",
             c."GN_cellular_zone",
             c."GN_cellular_tariff_plan_FK",
             c."GN_cellular_tariff_plan_enabled_date"::text AS "GN_cellular_tariff_plan_enabled_date"
           FROM "GN_cellular" c
           WHERE c."GN_cellular_account" IS NOT DISTINCT FROM $1
             AND c."GN_cellular_identifier_FK" = $2
             AND c."GN_cellular_icc" IS NOT DISTINCT FROM $3
           ORDER BY c."GN_cellular_id" ASC
           LIMIT 1`,
          [normalizedRow.account, normalizedRow.identifierId, normalizedRow.icc]
        );

        if (existingResult.rowCount === 0) {
          await client.query(
            `INSERT INTO "GN_cellular" (
               "GN_cellular_account",
               "GN_cellular_client",
               "GN_cellular_contract_number",
               "GN_cellular_identifier_FK",
               "GN_cellular_icc",
               "GN_cellular_status",
               "GN_cellular_activation_date",
               "GN_cellular_zone",
               "GN_cellular_tariff_plan_FK",
               "GN_cellular_tariff_plan_enabled_date",
               "GN_cellular_updated_at"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
            [
              normalizedRow.account,
              normalizedRow.client,
              normalizedRow.contractNumber,
              normalizedRow.identifierId,
              normalizedRow.icc,
              normalizedRow.status,
              normalizedRow.activationDate,
              normalizedRow.zone,
              normalizedRow.tariffId,
              normalizedRow.tariffPlanEnabledDate,
            ]
          );

          insertedRows += 1;
          changedColumnsByRowKey[rowKey] = [
            'GN_cellular_account',
            'GN_cellular_client',
            'GN_cellular_contract_number',
            'GN_cellular_identifier',
            'GN_cellular_icc',
            'GN_cellular_status',
            'GN_cellular_activation_date',
            'GN_cellular_zone',
            'GN_cellular_tariff_plan',
            'GN_cellular_tariff_plan_enabled_date',
          ];
          continue;
        }

        const existing = existingResult.rows[0];
        const changedColumns: string[] = [];

        if (existing.GN_cellular_account !== normalizedRow.account) changedColumns.push('GN_cellular_account');
        if (existing.GN_cellular_client !== normalizedRow.client) changedColumns.push('GN_cellular_client');
        if (existing.GN_cellular_contract_number !== normalizedRow.contractNumber) changedColumns.push('GN_cellular_contract_number');
        if (existing.GN_cellular_identifier_FK !== normalizedRow.identifierId) changedColumns.push('GN_cellular_identifier');
        if (existing.GN_cellular_icc !== normalizedRow.icc) changedColumns.push('GN_cellular_icc');
        if (existing.GN_cellular_status !== normalizedRow.status) changedColumns.push('GN_cellular_status');
        if (toNullableTrimmedText(existing.GN_cellular_activation_date) !== normalizedRow.activationDate) changedColumns.push('GN_cellular_activation_date');
        if (existing.GN_cellular_zone !== normalizedRow.zone) changedColumns.push('GN_cellular_zone');
        if (existing.GN_cellular_tariff_plan_FK !== normalizedRow.tariffId) changedColumns.push('GN_cellular_tariff_plan');
        if (toNullableTrimmedText(existing.GN_cellular_tariff_plan_enabled_date) !== normalizedRow.tariffPlanEnabledDate) changedColumns.push('GN_cellular_tariff_plan_enabled_date');

        if (changedColumns.length === 0) {
          unchangedRows += 1;
          continue;
        }

        await client.query(
          `UPDATE "GN_cellular"
           SET
             "GN_cellular_client" = $1,
             "GN_cellular_contract_number" = $2,
             "GN_cellular_status" = $3,
             "GN_cellular_activation_date" = $4,
             "GN_cellular_zone" = $5,
             "GN_cellular_tariff_plan_FK" = $6,
             "GN_cellular_tariff_plan_enabled_date" = $7,
             "GN_cellular_updated_at" = NOW()
           WHERE "GN_cellular_id" = $8`,
          [
            normalizedRow.client,
            normalizedRow.contractNumber,
            normalizedRow.status,
            normalizedRow.activationDate,
            normalizedRow.zone,
            normalizedRow.tariffId,
            normalizedRow.tariffPlanEnabledDate,
            existing.GN_cellular_id,
          ]
        );

        updatedRows += 1;
        changedColumnsByRowKey[rowKey] = changedColumns;
      }

      await client.query('COMMIT');
      res.json({
        insertedRows,
        updatedRows,
        unchangedRows,
        changedColumnsByRowKey,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to sync cellular rows', err);
      res.status(500).json({ error: 'Failed to sync cellular rows' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/cellular-identifiers', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query(
        `SELECT *
         FROM "GN_cellular_identifier"
         WHERE "is_deleted" = FALSE
         ORDER BY "GN_cellular_identifier_id" ASC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_cellular_identifier' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/cellular-tariff-plans', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query(
        `SELECT *
         FROM "GN_cellular_tariff_plan"
         ORDER BY "GN_cellular_tariff_plan_id" ASC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_cellular_tariff_plan' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/cellular-accounts', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query(
        `SELECT
           a."GN_cellular_account_id",
           a."GN_cellular_account",
           a."GN_department_FK",
           a."GN_cellular_account_note",
           COALESCE(cnt.numbers_count, 0)::int AS "GN_cellular_account_numbers_count",
           COALESCE(cnt.active_numbers_count, 0)::int AS "GN_cellular_account_active_numbers_count",
           COALESCE(cnt.total_cost, 0) AS "GN_cellular_account_total_cost"
         FROM "GN_cellular_account" a
         LEFT JOIN (
           SELECT c."GN_cellular_account", COUNT(*) AS numbers_count,
             COUNT(*) FILTER (WHERE lower(trim(c."GN_cellular_status")) = 'действующий') AS active_numbers_count,
             SUM(CASE WHEN lower(trim(c."GN_cellular_status")) = 'действующий' THEN COALESCE(t."GN_cellular_tariff_plan_cost", 0) ELSE 0 END) AS total_cost
           FROM "GN_cellular" c
           LEFT JOIN "GN_cellular_tariff_plan" t ON t."GN_cellular_tariff_plan_id" = c."GN_cellular_tariff_plan_FK"
           GROUP BY c."GN_cellular_account"
         ) cnt ON cnt."GN_cellular_account" = a."GN_cellular_account"
         ORDER BY a."GN_cellular_account_id" ASC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_cellular_account' });
    } finally {
      await client.end();
    }
  });

  app.patch('/api/gn/equipment-models/:id', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    const id = Number(req.params.id);
    const { model, manufacturer_fk, type_fk, department_fk, budget_item_fk, object_fk, status } = req.body as {
      model: string;
      manufacturer_fk: number | null;
      type_fk: number | null;
      department_fk: number | null;
      budget_item_fk: number | null;
      object_fk: number | null;
      status: string;
    };
    try {
      const result = await client.query(
        `UPDATE "GN_equipment_model"
         SET "GN_equipment_model" = $1,
           "GN_equipment_manufacturer_FK" = $2,
           "GN_equipment_type_FK" = $3,
           "GN_equipment_department_FK" = $4,
           "GN_equipment_budget_item_FK" = $5,
           "GN_equipment_object_FK" = $6,
           "GN_equipment_status" = $7
         WHERE "GN_equipment_model_id" = $8`,
        [model, manufacturer_fk || null, type_fk || null, department_fk || null, budget_item_fk || null, object_fk || null, status, id]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Модель оборудования не найдена' });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update GN_equipment_model' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/invest-program', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query(`
        SELECT
          ip."GN_invest_program_id",
          ip."GN_invest_pf_npf",
          ip."GN_invest_name",
          ip."GN_invest_quantity",
          okdp."GN_invest_okdp_tko_is_prit" AS "GN_invest_okdp",
          sup."GN_contarctor" AS "GN_invest_supplier",
          ogr."GN_invest_ogruz_rekvizit" AS "GN_invest_ogruz",
          ip."GN_invest_status",
          ip."GN_invest_payment",
          ip."GN_invest_in_budget",
          ip."GN_invest_peo_code",
          ip."GN_invest_mtr_code",
          ip."GN_invest_pzp",
          ip."GN_invest_agent_report",
          ip."GN_invest_ap",
          ip."GN_invest_spec",
          ip."GN_invest_commissioning",
          ip."GN_invest_it_accounting",
          ip."GN_invest_sed_spec",
          ip."GN_invest_sed_agent_report",
          ip."GN_invest_state",
          ip."GN_invest_real_price_no_vat_per_unit",
          ip."GN_invest_real_sum_no_vat_plus_agent_no_vat",
          ip."GN_invest_sum_no_vat"
        FROM "GN_invest_program" ip
        LEFT JOIN "GN_invest_okdp_tko_is_prit" okdp ON ip."GN_invest_okdp_fk" = okdp."GN_invest_okdp_tko_is_prit_id"
        LEFT JOIN "GN_contractor" sup ON ip."GN_invest_supplier_fk" = sup."GN_c_id"
        LEFT JOIN "GN_invest_ogruz_rekvizit" ogr ON ip."GN_invest_ogruz_fk" = ogr."GN_invest_ogruz_rekvizit_id"
        ORDER BY ip."GN_invest_program_id" ASC
      `);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_invest_program' });
    } finally {
      await client.end();
    }
  });

  // BDR routes
  app.get('/api/gn/bdr/:id', async (req: Request, res: Response): Promise<void> => {
    const rowId = Number(req.params.id);
    if (Number.isNaN(rowId)) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query(
        `${BDR_SELECT_FIELDS}
         WHERE b."GN_bdr_ID" = $1`,
        [rowId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Row not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_bdr row' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/bdr/:id/limit-calculation', async (req: Request, res: Response): Promise<void> => {
    const rowId = Number(req.params.id);
    if (Number.isNaN(rowId)) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    const client = await createDbClient();
    try {
      const baseResult = await client.query<{
        quantity: string | number;
        limit_total: string | number;
        unit_limit: string | number;
        comments: string | null;
      }>(
        `SELECT
           "GN_bdr_kol-vo" AS quantity,
           "GN_bdr_limit" AS limit_total,
           "GN_bdr_edin.limit" AS unit_limit,
           "GN_bdr_comments" AS comments
         FROM "GN_bdr"
         WHERE "GN_bdr_ID" = $1
         LIMIT 1`,
        [rowId]
      );

      if (baseResult.rowCount === 0) {
        res.status(404).json({ error: 'Row not found' });
        return;
      }

      const base = baseResult.rows[0];
      const quantity = Number(base.quantity ?? 0);
      const storedLimit = Number(base.limit_total ?? 0);
      const unitLimit = Number(base.unit_limit ?? 0);

      const lineResult = await client.query<LimitCalculationLineRow>(
        `SELECT
           "line_order" AS line_order,
           "quantity" AS quantity,
           "tariff" AS tariff,
           "line_note" AS line_note
         FROM "GN_bdr_limit_calculation"
         WHERE "GN_bdr_ID_FK" = $1
         ORDER BY "line_order" ASC`,
        [rowId]
      );

      const lines: LimitCalculationResponseLine[] =
        lineResult.rows.length > 0
          ? lineResult.rows.map((line) => ({
              lineOrder: Number(line.line_order),
              quantity: Number(line.quantity ?? 0),
              tariff: Number(line.tariff ?? 0),
              note: String(line.line_note ?? ''),
            }))
          : [buildFallbackCalculationLine(quantity, storedLimit, unitLimit)];

      const totalByLines = lines.reduce((acc, line) => acc + line.quantity * line.tariff, 0);
      const calculatedLimit = totalByLines + unitLimit;

      res.json({
        rowId,
        unitLimit,
        comments: String(base.comments ?? ''),
        lines,
        totalByLines,
        calculatedLimit,
        storedLimit,
        difference: storedLimit - calculatedLimit,
      });
    } catch (err) {
      console.error('Failed to fetch limit calculation', err);
      res.status(500).json({ error: 'Failed to fetch limit calculation' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/gn/bdr/:id/limit-calculation', async (req: Request, res: Response): Promise<void> => {
    const rowId = Number(req.params.id);
    if (Number.isNaN(rowId)) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    const payload = req.body as {
      unitLimit?: unknown;
      comments?: unknown;
      lines?: Array<{ quantity?: unknown; tariff?: unknown; note?: unknown }>;
    };

    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      res.status(400).json({ error: 'Lines are required' });
      return;
    }

    let unitLimit: number;
    const lines: LimitCalculationLineInput[] = [];

    try {
      unitLimit = toFiniteNumber(payload.unitLimit ?? 0, 'unitLimit');

      payload.lines.forEach((line, index) => {
        const quantity = toFiniteNumber(line.quantity ?? 0, `line ${index + 1} quantity`);
        const tariff = toFiniteNumber(line.tariff ?? 0, `line ${index + 1} tariff`);
        lines.push({
          quantity,
          tariff,
          note: String(line.note ?? ''),
        });
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid payload' });
      return;
    }

    const client = await createDbClient();
    try {
      await client.query('BEGIN');

      const baseResult = await client.query<{ comments: string | null }>(
        `SELECT "GN_bdr_comments" AS comments
         FROM "GN_bdr"
         WHERE "GN_bdr_ID" = $1
         FOR UPDATE`,
        [rowId]
      );

      if (baseResult.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Row not found' });
        return;
      }

      await client.query(
        `DELETE FROM "GN_bdr_limit_calculation"
         WHERE "GN_bdr_ID_FK" = $1`,
        [rowId]
      );

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        await client.query(
          `INSERT INTO "GN_bdr_limit_calculation" (
             "GN_bdr_ID_FK",
             "line_order",
             "quantity",
             "tariff",
             "line_note"
           ) VALUES ($1, $2, $3, $4, $5)`,
          [rowId, index + 1, line.quantity, line.tariff, line.note]
        );
      }

      const totalByLines = lines.reduce((acc, line) => acc + line.quantity * line.tariff, 0);
      const calculatedLimit = totalByLines + unitLimit;
      const totalQuantity = lines.reduce((acc, line) => acc + line.quantity, 0);
      const comments = payload.comments === undefined
        ? String(baseResult.rows[0].comments ?? '')
        : String(payload.comments ?? '');

      await client.query(
        `UPDATE "GN_bdr"
         SET
           "GN_bdr_kol-vo" = $1,
           "GN_bdr_edin.limit" = $2,
           "GN_bdr_limit" = $3,
           "GN_bdr_comments" = $4
         WHERE "GN_bdr_ID" = $5`,
        [totalQuantity, unitLimit, calculatedLimit, comments, rowId]
      );

      await client.query('COMMIT');

      res.json({
        rowId,
        unitLimit,
        comments,
        lines: lines.map((line, index) => ({
          lineOrder: index + 1,
          quantity: line.quantity,
          tariff: line.tariff,
          note: line.note,
        })),
        totalByLines,
        calculatedLimit,
        storedLimit: calculatedLimit,
        difference: 0,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to save limit calculation', err);
      res.status(500).json({ error: 'Failed to save limit calculation' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/gn/bdr/:id', async (req: Request, res: Response): Promise<void> => {
    const rowId = Number(req.params.id);
    if (Number.isNaN(rowId)) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    const client = await createDbClient();

    async function resolveLookupId(
      query: string,
      value: string,
      entityLabel: string
    ): Promise<number> {
      const result = await client.query<{ id: number }>(query, [value]);
      if (result.rowCount === 0) {
        throw new Error(`${entityLabel} not found`);
      }
      return result.rows[0].id;
    }

    const payload = req.body as Record<string, unknown>;
    const updates: Array<{ column: string; value: unknown }> = [];

    try {
      await client.query('BEGIN');

      if (payload['Статья бюджета УС'] !== undefined) {
        const id = await resolveLookupId(
          'SELECT "PAO_b_id" AS id FROM "PAO__budget_network_item" WHERE "PAO__budget_network_item" = $1 LIMIT 1',
          String(payload['Статья бюджета УС']),
          'PAO budget item'
        );
        updates.push({ column: 'PAO_budget_network_item_FK', value: id });
      }

      if (payload['Подразделение'] !== undefined) {
        const id = await resolveLookupId(
          'SELECT "GN_Dep_id" AS id FROM "GN_department" WHERE "GN_department" = $1 LIMIT 1',
          String(payload['Подразделение']),
          'Department'
        );
        updates.push({ column: 'GN_department_FK', value: id });
      }

      if (payload['Объект'] !== undefined) {
        const id = await resolveLookupId(
          'SELECT "GN_do_id" AS id FROM "GN_departament_object" WHERE "GN_departament_object" = $1 LIMIT 1',
          String(payload['Объект']),
          'Object'
        );
        updates.push({ column: 'GN_departament_object_FK', value: id });
      }

      if (payload['Договор'] !== undefined) {
        const id = await resolveLookupId(
          'SELECT "GN_dgv_id" AS id FROM "GN_dogovor" WHERE "GN_dogovor" = $1 LIMIT 1',
          String(payload['Договор']),
          'Dogovor'
        );
        updates.push({ column: 'GN_dogovor_FK', value: id });
      }

      if (payload['Контрагент'] !== undefined) {
        const id = await resolveLookupId(
          'SELECT "GN_c_id" AS id FROM "GN_contractor" WHERE "GN_contarctor" = $1 LIMIT 1',
          String(payload['Контрагент']),
          'Contractor'
        );
        updates.push({ column: 'GN_contracor_FK', value: id });
      }

      if (payload['Статья бюджета'] !== undefined) {
        const id = await resolveLookupId(
          'SELECT "GN_b_id" AS id FROM "GN_budget_network_item" WHERE "GN_budget_network_item" = $1 LIMIT 1',
          String(payload['Статья бюджета']),
          'Budget item'
        );
        updates.push({ column: 'GN_budget_network_item_FK', value: id });
      }

      if (payload['Предмет договора'] !== undefined) {
        updates.push({ column: 'GN_bdr_predmet_dogovora', value: String(payload['Предмет договора']) });
      }

      if (payload['РАСЧЕТ'] !== undefined) {
        updates.push({ column: 'GN_bdr_calculation', value: String(payload['РАСЧЕТ']) });
      }

      if (payload['Ед. изм.'] !== undefined) {
        updates.push({ column: 'GN_bdr_ed.izm', value: String(payload['Ед. изм.']) });
      }

      if (payload['Кол-во'] !== undefined) {
        const value = Number(payload['Кол-во']);
        if (Number.isNaN(value)) {
          throw new Error('Invalid Кол-во');
        }
        updates.push({ column: 'GN_bdr_kol-vo', value });
      }

      if (payload['Лимит'] !== undefined) {
        const value = Number(payload['Лимит']);
        if (Number.isNaN(value)) {
          throw new Error('Invalid Лимит');
        }
        updates.push({ column: 'GN_bdr_limit', value });
      }

      if (payload['БДР25корр'] !== undefined) {
        const value = payload['БДР25корр'] === '' ? null : Number(payload['БДР25корр']);
        if (value !== null && Number.isNaN(value)) {
          throw new Error('Invalid БДР25корр');
        }
        updates.push({ column: 'GN_bdr_bdr25_corr', value });
      }

      if (payload['Кол-во БДР25корр'] !== undefined) {
        const value = payload['Кол-во БДР25корр'] === '' ? null : Number(payload['Кол-во БДР25корр']);
        if (value !== null && !Number.isFinite(value)) {
          throw new Error('Invalid Кол-во БДР25корр');
        }
        updates.push({ column: 'GN_bdr_bdr25_corr_kol_vo', value });
      }

      if (payload['БДР26'] !== undefined) {
        const value = payload['БДР26'] === '' ? null : Number(payload['БДР26']);
        if (value !== null && Number.isNaN(value)) {
          throw new Error('Invalid БДР26');
        }
        updates.push({ column: 'GN_bdr_bdr26', value });
      }

      if (payload['Кол-во БДР26'] !== undefined) {
        const value = payload['Кол-во БДР26'] === '' ? null : Number(payload['Кол-во БДР26']);
        if (value !== null && !Number.isFinite(value)) {
          throw new Error('Invalid Кол-во БДР26');
        }
        updates.push({ column: 'GN_bdr_bdr26_kol_vo', value });
      }

      if (payload['БДР26корр'] !== undefined) {
        const value = payload['БДР26корр'] === '' ? null : Number(payload['БДР26корр']);
        if (value !== null && Number.isNaN(value)) {
          throw new Error('Invalid БДР26корр');
        }
        updates.push({ column: 'GN_bdr_bdr26_corr', value });
      }

      if (payload['Кол-во БДР26корр'] !== undefined) {
        const value = payload['Кол-во БДР26корр'] === '' ? null : Number(payload['Кол-во БДР26корр']);
        if (value !== null && !Number.isFinite(value)) {
          throw new Error('Invalid Кол-во БДР26корр');
        }
        updates.push({ column: 'GN_bdr_bdr26_corr_kol_vo', value });
      }

      if (payload['Кол-во БДР27'] !== undefined) {
        const value = payload['Кол-во БДР27'] === '' ? null : Number(payload['Кол-во БДР27']);
        if (value !== null && !Number.isFinite(value)) {
          throw new Error('Invalid Кол-во БДР27');
        }
        updates.push({ column: 'GN_bdr_bdr27_kol_vo', value });
      }

      if (payload['БДР27'] !== undefined) {
        const value = payload['БДР27'] === '' ? null : Number(payload['БДР27']);
        if (value !== null && !Number.isFinite(value)) {
          throw new Error('Invalid БДР27');
        }
        updates.push({ column: 'GN_bdr_bdr27', value });
      }

      if (payload['Един. лимит'] !== undefined) {
        const value = Number(payload['Един. лимит']);
        if (Number.isNaN(value)) {
          throw new Error('Invalid Един. лимит');
        }
        updates.push({ column: 'GN_bdr_edin.limit', value });
      }

      if (payload['Примечания'] !== undefined) {
        updates.push({ column: 'GN_bdr_comments', value: String(payload['Примечания']) });
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No editable fields provided' });
        return;
      }

      const setClause = updates
        .map((entry, index) => `"${entry.column}" = $${index + 1}`)
        .join(', ');
      const values = updates.map((entry) => entry.value);

      const updateResult = await client.query(
        `UPDATE "GN_bdr"
         SET ${setClause}
         WHERE "GN_bdr_ID" = $${updates.length + 1}
         RETURNING "GN_bdr_ID"`,
        [...values, rowId]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Row not found' });
        return;
      }

      const result = await client.query(
        `${BDR_SELECT_FIELDS}
         WHERE b."GN_bdr_ID" = $1`,
        [rowId]
      );

      await client.query('COMMIT');
      res.json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to update GN_bdr row', err);

      if (err instanceof Error && (err.message.includes('not found') || err.message.includes('Invalid'))) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: 'Failed to update GN_bdr row' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/gn/bdr/:id', async (req: Request, res: Response): Promise<void> => {
    const rowId = Number(req.params.id);
    if (!Number.isInteger(rowId) || rowId <= 0) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query(
        `UPDATE "GN_bdr"
         SET "is_deleted" = TRUE, "deleted_at" = NOW()
         WHERE "GN_bdr_ID" = $1 AND "is_deleted" = FALSE
         RETURNING "GN_bdr_ID"`,
        [rowId]
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Row not found' });
        return;
      }
      res.sendStatus(204);
    } catch (err) {
      console.error('Failed to delete GN_bdr row', err);
      res.status(500).json({ error: 'Failed to delete GN_bdr row' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/gn/:entity', async (req: Request, res: Response, next): Promise<void> => {
    const { entity } = req.params;
    if (entity === 'bdr') {
      next();
      return;
    }

    const config = GN_TABLE_CONFIGS[entity];

    if (!config) {
      res.status(404).json({ error: 'Unknown GN entity' });
      return;
    }

    const fields = config.editableColumns.filter((column) => req.body[column] !== undefined);
    if (entity === 'objects' && Array.isArray(req.body.GN_department_FKs)) {
      if (!fields.includes('GN_department_FK')) fields.push('GN_department_FK');
    }
    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields provided for creation' });
      return;
    }

    const values = fields.map((column) => {
      if (config.nullableColumns?.includes(column) && req.body[column] === '') return null;
      if (entity === 'objects' && column === 'GN_department_FK' && Array.isArray(req.body.GN_department_FKs)) {
        const firstDepartmentId = Number(req.body.GN_department_FKs[0]);
        if (!Number.isInteger(firstDepartmentId)) throw new Error(`Invalid value for ${column}`);
        return firstDepartmentId;
      }
      if (column.endsWith('_FK')) {
        if (req.body[column] === null
          || (config.nullableForeignKeyColumns?.includes(column) && req.body[column] === '')) return null;
        const numericValue = Number(req.body[column]);
        if (Number.isNaN(numericValue)) {
          throw new Error(`Invalid value for ${column}`);
        }
        return numericValue;
      }
      if (config.arrayColumns?.includes(column)) {
        if (!Array.isArray(req.body[column])) throw new Error(`Invalid value for ${column}`);
        const values = req.body[column].map(Number);
        if (values.some((value: number) => !Number.isInteger(value))) throw new Error(`Invalid value for ${column}`);
        return values;
      }
      if (config.numericColumns?.includes(column)) {
        if (req.body[column] === null || req.body[column] === '') return null;
        const numericValue = Number(req.body[column]);
        if (Number.isNaN(numericValue)) {
          throw new Error(`Invalid value for ${column}`);
        }
        return numericValue;
      }
      return req.body[column];
    });

    const client = await createDbClient();
    try {
      if (entity === 'contractors') {
        await client.query(`
          CREATE TABLE IF NOT EXISTS "GN_contractor" (
            "GN_c_id" SERIAL PRIMARY KEY,
            "GN_contarctor" TEXT NOT NULL
          )
        `);
      }
      if (entity === 'gazprom-telecom' && req.body.GN_departament_object_FK) {
        const departmentId = Number(req.body.GN_department_FK);
        const objectId = Number(req.body.GN_departament_object_FK);
        if (!Number.isInteger(departmentId) || !Number.isInteger(objectId)) {
          res.status(400).json({ error: 'Для объекта требуется корректное подразделение' });
          return;
        }
        const objectResult = await client.query(
          `SELECT 1
           FROM "GN_departament_object"
           WHERE "GN_do_id" = $1
             AND (
               "GN_department_FK" = $2
               OR $2 = ANY(COALESCE("GN_department_FKs", ARRAY[]::INTEGER[]))
             )`,
          [objectId, departmentId],
        );
        if (objectResult.rowCount === 0) {
          res.status(400).json({ error: 'Выбранный объект не относится к указанному подразделению' });
          return;
        }
      }
      const sequenceConfig: Record<string, { table: string; idColumn: string }> = {
        objects: { table: 'GN_departament_object', idColumn: 'GN_do_id' },
        departments: { table: 'GN_department', idColumn: 'GN_Dep_id' },
        contractors: { table: 'GN_contractor', idColumn: 'GN_c_id' },
        dogovors: { table: 'GN_dogovor', idColumn: 'GN_dgv_id' },
      };
      const sequence = sequenceConfig[entity];
      if (sequence) {
        await client.query(
          `SELECT setval(
             pg_get_serial_sequence(format('%I', $1::text), $2::text),
             COALESCE(MAX("${sequence.idColumn}"), 1),
             COUNT(*) > 0
           )
           FROM "${sequence.table}"`,
          [sequence.table, sequence.idColumn],
        );
      }
      const result = await client.query(
        `INSERT INTO "${config.tableName}" (${fields.map((column) => `"${column}"`).join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
        values,
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      const errorDetails = err instanceof Error
        ? err as Error & { code?: unknown; detail?: unknown; hint?: unknown; constraint?: unknown }
        : null;
      res.status(500).json({
        error: 'Failed to create GN entity row',
        details: {
          message: errorDetails?.message ?? String(err),
          code: typeof errorDetails?.code === 'string' ? errorDetails.code : undefined,
          detail: typeof errorDetails?.detail === 'string' ? errorDetails.detail : undefined,
          hint: typeof errorDetails?.hint === 'string' ? errorDetails.hint : undefined,
          constraint: typeof errorDetails?.constraint === 'string' ? errorDetails.constraint : undefined,
        },
      });
    } finally {
      await client.end();
    }
  });

  app.post('/api/gn/:entity/mark-missing', async (req: Request, res: Response, next): Promise<void> => {
    const { entity } = req.params;
    if (entity === 'bdr') {
      next();
      return;
    }

    const config = GN_TABLE_CONFIGS[entity];
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];

    if (!config?.supportsExcelImportDeletion) {
      res.status(404).json({ error: 'Excel deletion marking is not supported for this entity' });
      return;
    }

    const client = await createDbClient();
    try {
      await client.query(
        `UPDATE "${config.tableName}"
         SET "is_deleted" = TRUE, "deleted_at" = NOW()
         WHERE "is_deleted" = FALSE
           AND NOT ("${config.idColumn}" = ANY($1::int[]))`,
        [ids],
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to mark missing Excel rows' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/gn/:entity/:id', async (req: Request, res: Response): Promise<void> => {
    const { entity, id } = req.params;
    const config = GN_TABLE_CONFIGS[entity];

    if (!config) {
      res.status(404).json({ error: 'Unknown GN entity' });
      return;
    }

    const rowId = Number(id);
    if (Number.isNaN(rowId)) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    const client = await createDbClient();
    try {
      if (entity === 'gazprom-telecom' && req.body.GN_departament_object_FK) {
        const departmentId = Number(req.body.GN_department_FK);
        const objectId = Number(req.body.GN_departament_object_FK);
        if (!Number.isInteger(departmentId) || !Number.isInteger(objectId)) {
          res.status(400).json({ error: 'Для объекта требуется корректное подразделение' });
          return;
        }
        const objectResult = await client.query(
          `SELECT 1
           FROM "GN_departament_object"
           WHERE "GN_do_id" = $1
             AND (
               "GN_department_FK" = $2
               OR $2 = ANY(COALESCE("GN_department_FKs", ARRAY[]::INTEGER[]))
             )`,
          [objectId, departmentId],
        );
        if (objectResult.rowCount === 0) {
          res.status(400).json({ error: 'Выбранный объект не относится к указанному подразделению' });
          return;
        }
      }
      const result = await client.query(
        `DELETE FROM "${config.tableName}" WHERE "${config.idColumn}" = $1`,
        [rowId],
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Row not found' });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete GN entity row' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/gn/:entity/:id', async (req: Request, res: Response): Promise<void> => {
    const { entity, id } = req.params;
    const config = GN_TABLE_CONFIGS[entity];

    if (!config) {
      res.status(404).json({ error: 'Unknown GN entity' });
      return;
    }

    const rowId = Number(id);
    if (Number.isNaN(rowId)) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    const updates = config.editableColumns.filter((column) => req.body[column] !== undefined);
    if (entity === 'objects' && Array.isArray(req.body.GN_department_FKs)) {
      if (!updates.includes('GN_department_FK')) updates.push('GN_department_FK');
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'No editable fields provided' });
      return;
    }

    const setClause = updates
      .map((column, index) => `"${column}" = $${index + 1}`)
      .join(', ');
    const values = updates.map((column) => {
      if (config.nullableColumns?.includes(column) && req.body[column] === '') return null;
      if (entity === 'objects' && column === 'GN_department_FK' && Array.isArray(req.body.GN_department_FKs)) {
        const firstDepartmentId = Number(req.body.GN_department_FKs[0]);
        if (!Number.isInteger(firstDepartmentId)) throw new Error(`Invalid value for ${column}`);
        return firstDepartmentId;
      }
      if (column.endsWith('_FK')) {
        if (req.body[column] === null
          || (config.nullableForeignKeyColumns?.includes(column) && req.body[column] === '')) return null;
        const numericValue = Number(req.body[column]);
        if (Number.isNaN(numericValue)) {
          throw new Error(`Invalid value for ${column}`);
        }
        return numericValue;
      }
      if (config.arrayColumns?.includes(column)) {
        if (!Array.isArray(req.body[column])) throw new Error(`Invalid value for ${column}`);
        const values = req.body[column].map(Number);
        if (values.some((value: number) => !Number.isInteger(value))) throw new Error(`Invalid value for ${column}`);
        return values;
      }
      if (config.numericColumns?.includes(column)) {
        if (req.body[column] === null || req.body[column] === '') return null;
        const numericValue = Number(req.body[column]);
        if (Number.isNaN(numericValue)) {
          throw new Error(`Invalid value for ${column}`);
        }
        return numericValue;
      }
      return req.body[column];
    });

    const client = await createDbClient();
    try {
      const result = await client.query(
        `UPDATE "${config.tableName}"
         SET ${setClause}
         WHERE "${config.idColumn}" = $${updates.length + 1}
         RETURNING *`,
        [...values, rowId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Row not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error('Failed to update GN entity row', err);

      if (err instanceof Error && err.message.includes('Invalid value')) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: 'Failed to update GN entity row' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/gn/bdr', async (req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query(`${BDR_SELECT_FIELDS}
        WHERE b."is_deleted" = FALSE
        ORDER BY b."GN_bdr_ID" ASC`);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch GN_bdr' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/gn/bdr', async (req: Request, res: Response): Promise<void> => {
    const {
      pao_budget_item,
      department,
      object_name,
      dogovor,
      contractor,
      budget_item,
      predmet_dogovora,
      ed_izm,
      kol_vo,
      limit,
      bdr25_corr,
      bdr25_corr_kol_vo,
      bdr26,
      bdr26_kol_vo,
      bdr26_corr,
      bdr26_corr_kol_vo,
      bdr27,
      bdr27_kol_vo,
      calculation,
      edin_limit,
      comments,
    } = req.body;

    if (
      !pao_budget_item ||
      !department ||
      !object_name ||
      !dogovor ||
      !contractor ||
      !budget_item ||
      !predmet_dogovora ||
      !ed_izm ||
      kol_vo == null ||
      limit == null ||
      edin_limit == null
    ) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const kolVoNumber = Number(kol_vo);
    const limitNumber = Number(limit);
    const bdr25CorrNumber = bdr25_corr == null || bdr25_corr === '' ? null : Number(bdr25_corr);
    const bdr25CorrQuantityNumber = bdr25_corr_kol_vo == null || bdr25_corr_kol_vo === '' ? null : Number(bdr25_corr_kol_vo);
    const bdr26Number = bdr26 == null || bdr26 === '' ? null : Number(bdr26);
    const bdr26QuantityNumber = bdr26_kol_vo == null || bdr26_kol_vo === '' ? null : Number(bdr26_kol_vo);
    const bdr26CorrNumber = bdr26_corr == null || bdr26_corr === '' ? null : Number(bdr26_corr);
    const bdr26CorrQuantityNumber = bdr26_corr_kol_vo == null || bdr26_corr_kol_vo === '' ? null : Number(bdr26_corr_kol_vo);
    const bdr27Number = bdr27 == null || bdr27 === '' ? null : Number(bdr27);
    const bdr27QuantityNumber = bdr27_kol_vo == null || bdr27_kol_vo === '' ? null : Number(bdr27_kol_vo);
    const edinLimitNumber = Number(edin_limit);

    if (
      Number.isNaN(kolVoNumber) ||
      Number.isNaN(limitNumber) ||
      (bdr25CorrNumber !== null && Number.isNaN(bdr25CorrNumber)) ||
      (bdr25CorrQuantityNumber !== null && !Number.isFinite(bdr25CorrQuantityNumber)) ||
      (bdr26Number !== null && Number.isNaN(bdr26Number)) ||
      (bdr26QuantityNumber !== null && !Number.isFinite(bdr26QuantityNumber)) ||
      (bdr26CorrNumber !== null && Number.isNaN(bdr26CorrNumber)) ||
      (bdr26CorrQuantityNumber !== null && !Number.isFinite(bdr26CorrQuantityNumber)) ||
      (bdr27Number !== null && !Number.isFinite(bdr27Number)) ||
      (bdr27QuantityNumber !== null && !Number.isFinite(bdr27QuantityNumber)) ||
      Number.isNaN(edinLimitNumber)
    ) {
      res.status(400).json({ error: 'Numeric fields are invalid' });
      return;
    }

    const client = await createDbClient();

    async function getIdByName(
      query: string,
      value: string,
      entityLabel: string
    ): Promise<number> {
      const result = await client.query<{ id: number }>(query, [value]);
      if (result.rowCount === 0) {
        throw new Error(`${entityLabel} not found`);
      }
      return result.rows[0].id;
    }

    try {
      await client.query('BEGIN');

      const paoId = await getIdByName(
        'SELECT "PAO_b_id" AS id FROM "PAO__budget_network_item" WHERE "PAO__budget_network_item" = $1 LIMIT 1',
        pao_budget_item,
        'PAO budget item'
      );

      const departmentId = await getIdByName(
        'SELECT "GN_Dep_id" AS id FROM "GN_department" WHERE "GN_department" = $1 LIMIT 1',
        department,
        'Department'
      );

      const objectId = await getIdByName(
        'SELECT "GN_do_id" AS id FROM "GN_departament_object" WHERE "GN_departament_object" = $1 LIMIT 1',
        object_name,
        'Object'
      );

      const dogovorId = await getIdByName(
        'SELECT "GN_dgv_id" AS id FROM "GN_dogovor" WHERE "GN_dogovor" = $1 LIMIT 1',
        dogovor,
        'Dogovor'
      );

      const contractorId = await getIdByName(
        'SELECT "GN_c_id" AS id FROM "GN_contractor" WHERE "GN_contarctor" = $1 LIMIT 1',
        contractor,
        'Contractor'
      );

      const budgetItemId = await getIdByName(
        'SELECT "GN_b_id" AS id FROM "GN_budget_network_item" WHERE "GN_budget_network_item" = $1 LIMIT 1',
        budget_item,
        'Budget item'
      );

      const insertResult = await client.query<{ id: number }>(
        `INSERT INTO "GN_bdr" (
           "PAO_budget_network_item_FK",
           "GN_department_FK",
           "GN_departament_object_FK",
           "GN_dogovor_FK",
           "GN_contracor_FK",
           "GN_budget_network_item_FK",
           "GN_bdr_predmet_dogovora",
           "GN_bdr_ed.izm",
           "GN_bdr_kol-vo",
           "GN_bdr_limit",
           "GN_bdr_calculation",
           "GN_bdr_bdr25_corr",
           "GN_bdr_bdr25_corr_kol_vo",
           "GN_bdr_bdr26",
           "GN_bdr_bdr26_kol_vo",
           "GN_bdr_bdr26_corr",
           "GN_bdr_bdr26_corr_kol_vo",
           "GN_bdr_bdr27",
           "GN_bdr_bdr27_kol_vo",
           "GN_bdr_edin.limit",
           "GN_bdr_comments"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         RETURNING "GN_bdr_ID" AS id`,
        [
          paoId,
          departmentId,
          objectId,
          dogovorId,
          contractorId,
          budgetItemId,
          predmet_dogovora,
          ed_izm,
          kolVoNumber,
          limitNumber,
          calculation ?? '',
          bdr25CorrNumber,
          bdr25CorrQuantityNumber,
          bdr26Number,
          bdr26QuantityNumber,
          bdr26CorrNumber,
          bdr26CorrQuantityNumber,
          bdr27Number,
          bdr27QuantityNumber,
          edinLimitNumber,
          comments ?? '',
        ]
      );

      const newBdrId = insertResult.rows[0].id;

      const createdRow = await client.query(
        `${BDR_SELECT_FIELDS}
         WHERE b."GN_bdr_ID" = $1`,
        [newBdrId]
      );

      await client.query('COMMIT');
      res.status(201).json(createdRow.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to create GN_bdr row', err);

      if (err instanceof Error && err.message.includes('not found')) {
        res.status(400).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: 'Failed to create GN_bdr row' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/gn/bdr/mark-missing', async (req: Request, res: Response): Promise<void> => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    const client = await createDbClient();
    try {
      await client.query(
        `UPDATE "GN_bdr"
         SET "is_deleted" = TRUE, "deleted_at" = NOW()
         WHERE "is_deleted" = FALSE
           AND NOT ("GN_bdr_ID" = ANY($1::int[]))`,
        [ids],
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to mark missing Excel rows' });
    } finally {
      await client.end();
    }
  });

  // Импортозамещение endpoints
  app.get('/api/import-substitution', async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const client = await createDbClient();
    try {
      const result = await client.query(
        `SELECT
           "GN_import_substitution_id",
          i."updated_at" AS "updatedAt",
          "Подразделение",
           okdp."GN_invest_okdp_tko_is_prit" AS "Код ТКО",
           i."Наименование ТКО",
           etype."GN_equipment_type" AS "Тип",
           vendor."GN_equipment_manufacturer" AS "Вендор ТКО",
           i."Классификация ТКО",
           i."ЕРРП",
           i."ЕРМТР",
           i."Регистрационный номер ТКО",
           i."Количество",
           i."Выведен из эксплуатации",
           i."Инвентарный",
           i."ИМЯ",
           i."СЕРИЙНЫЙ НОМЕР",
           i."Замещенное импортное ТКО",
           i."Кол-во выводенного импортного ТКО",
           i."Статья затрат ТКО",
           i."СЧЕТ УЧЕТА",
           i."Статус закупки",
           i."Платеж ТР без НДС",
           i."Год",
           i."Примечание",
           i."ЭКСПЛ",
           i."ПЛАН",
           i."ГРУППА",
           COALESCE(
             (
               SELECT ARRAY_AGG(object_ref."GN_departament_object" ORDER BY object_ref."GN_departament_object")
               FROM unnest(i."GN_import_substitution_object_fks") AS selected_object(object_id)
               JOIN "GN_departament_object" object_ref ON object_ref."GN_do_id" = selected_object.object_id
             ),
             CASE WHEN obj."GN_departament_object" IS NOT NULL
               THEN ARRAY[obj."GN_departament_object"]
               ELSE ARRAY[]::TEXT[]
             END
           ) AS "ОБЪЕКТ",
           supplier."GN_contarctor" AS "Поставщик",
           ogruz."GN_invest_ogruz_rekvizit" AS "Огрузочный реквизит",
           i."оплата"
         FROM "GN_import_substitution" i
         LEFT JOIN "GN_invest_okdp_tko_is_prit" okdp ON i."GN_import_substitution_okdp_fk" = okdp."GN_invest_okdp_tko_is_prit_id"
         LEFT JOIN "GN_equipment_type" etype ON i."GN_import_substitution_equipment_type_fk" = etype."GN_equipment_type_id"
         LEFT JOIN "GN_equipment_manufacturer" vendor ON i."GN_import_substitution_vendor_fk" = vendor."GN_equipment_manufacturer_id"
         LEFT JOIN "GN_departament_object" obj ON i."GN_import_substitution_object_fk" = obj."GN_do_id"
         LEFT JOIN "GN_contractor" supplier ON i."GN_import_substitution_supplier_fk" = supplier."GN_c_id"
         LEFT JOIN "GN_invest_ogruz_rekvizit" ogruz ON i."GN_import_substitution_ogruz_fk" = ogruz."GN_invest_ogruz_rekvizit_id"
         WHERE i."is_deleted" = FALSE
         ORDER BY "Подразделение" ASC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch import-substitution data' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/import-substitution/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const {
      'Подразделение': department,
      'Код ТКО': okdpCode,
      'Наименование ТКО': tkoName,
      'Тип': equipmentTypeName,
      'Вендор ТКО': vendorName,
      'Классификация ТКО': classification,
      'ЕРРП': errp,
      'ЕРМТР': ermtr,
      'Регистрационный номер ТКО': registrationNumber,
      'Количество': quantity,
      'Выведен из эксплуатации': decommissioned,
      'Инвентарный': inventoryNumber,
      'ИМЯ': equipmentName,
      'СЕРИЙНЫЙ НОМЕР': serialNumber,
      'Замещенное импортное ТКО': replacedImportTko,
      'Кол-во выводенного импортного ТКО': decommissionedQuantity,
      'Статья затрат ТКО': costItem,
      'СЧЕТ УЧЕТА': accountingNumber,
      'Статус закупки': purchaseStatus,
      'Платеж ТР без НДС': paymentWithoutVat,
      'Год': year,
      'Примечание': note,
      'ЭКСПЛ': ekspl,
      'ПЛАН': plan,
      'ГРУППА': group,
      'ОБЪЕКТ': objectName,
      'Поставщик': supplierName,
      'Огрузочный реквизит': ogruzName,
      'оплата': payment,
    } = req.body;

    const rowId = Number(id);
    if (Number.isNaN(rowId)) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    if (!department) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (classification && !['Импорт', 'РФ в реестре', 'РФ НЕ в реестре'].includes(classification)) {
      res.status(400).json({ error: 'Некорректная классификация ТКО' });
      return;
    }
    if (![undefined, 'ДА', 'НЕТ'].includes(errp) || ![undefined, 'ДА', 'НЕТ'].includes(ermtr)) {
      res.status(400).json({ error: 'ЕРРП и ЕРМТР могут принимать только значения ДА или НЕТ' });
      return;
    }
    if (![undefined, 'ДА', 'НЕТ'].includes(ekspl)) {
      res.status(400).json({ error: 'ЭКСПЛ может принимать только значения ДА или НЕТ' });
      return;
    }
    if (![undefined, 'ЭКСПЛ', 'РЕЗЕРВ', 'СПИСАНИЕ'].includes(plan)) {
      res.status(400).json({ error: 'ПЛАН может принимать только значения ЭКСПЛ, РЕЗЕРВ или СПИСАНИЕ' });
      return;
    }
    const decommissionedNumber = decommissioned === undefined || decommissioned === '' ? 0 : Number(decommissioned);
    if (!Number.isInteger(decommissionedNumber) || decommissionedNumber < 0) {
      res.status(400).json({ error: 'Выведен из эксплуатации должно быть целым неотрицательным числом' });
      return;
    }
    if (costItem && !['ОНМ', 'ПЭН'].includes(costItem)) {
      res.status(400).json({ error: 'Некорректная статья затрат ТКО' });
      return;
    }
    if (purchaseStatus && !['план', 'согласован', 'в закупе', 'поставка', 'поставленно'].includes(purchaseStatus)) {
      res.status(400).json({ error: 'Некорректный статус закупки' });
      return;
    }

    const client = await createDbClient();
    try {
      const resolveId = async (query: string, value: unknown): Promise<number | null> => {
        const normalized = String(value ?? '').trim();
        if (!normalized) return null;
        const lookup = await client.query<{ id: number }>(query, [normalized]);
        if (lookup.rowCount === 0) throw new Error('Значение не найдено в справочнике');
        return lookup.rows[0].id;
      };
      const okdpId = await resolveId('SELECT "GN_invest_okdp_tko_is_prit_id" AS id FROM "GN_invest_okdp_tko_is_prit" WHERE "GN_invest_okdp_tko_is_prit" = $1 LIMIT 1', okdpCode);
      const equipmentTypeId = await resolveId('SELECT "GN_equipment_type_id" AS id FROM "GN_equipment_type" WHERE "GN_equipment_type" = $1 LIMIT 1', equipmentTypeName);
      const vendorId = await resolveId('SELECT "GN_equipment_manufacturer_id" AS id FROM "GN_equipment_manufacturer" WHERE "GN_equipment_manufacturer" = $1 LIMIT 1', vendorName);
      const objectNames = Array.isArray(objectName) ? objectName : objectName ? [objectName] : [];
      const objectIds: number[] = [];
      for (const name of objectNames) {
        const resolvedId = await resolveId('SELECT "GN_do_id" AS id FROM "GN_departament_object" WHERE "GN_departament_object" = $1 LIMIT 1', name);
        if (resolvedId != null && !objectIds.includes(resolvedId)) objectIds.push(resolvedId);
      }
      const objectId = objectIds[0] ?? null;
      const supplierId = await resolveId('SELECT "GN_c_id" AS id FROM "GN_contractor" WHERE "GN_contarctor" = $1 LIMIT 1', supplierName);
      const ogruzId = await resolveId('SELECT "GN_invest_ogruz_rekvizit_id" AS id FROM "GN_invest_ogruz_rekvizit" WHERE "GN_invest_ogruz_rekvizit" = $1 LIMIT 1', ogruzName);
      const result = await client.query(
        `UPDATE "GN_import_substitution"
         SET "Подразделение" = $1, "GN_import_substitution_okdp_fk" = $2, "Наименование ТКО" = $3,
           "GN_import_substitution_vendor_fk" = $4, "Классификация ТКО" = $5, "ЕРРП" = $6,
           "ЕРМТР" = $7, "Регистрационный номер ТКО" = $8, "Количество" = $9,
           "Замещенное импортное ТКО" = $10, "Кол-во выводенного импортного ТКО" = $11,
           "Статья затрат ТКО" = $12, "Платеж ТР без НДС" = $13, "Год" = $14, "Примечание" = $15,
           "GN_import_substitution_equipment_type_fk" = $17, "GN_import_substitution_supplier_fk" = $18,
           "GN_import_substitution_ogruz_fk" = $19, "оплата" = $20,
           "Выведен из эксплуатации" = $21, "Инвентарный" = $22, "Статус закупки" = $23,
            "ЭКСПЛ" = $24, "ПЛАН" = $25, "GN_import_substitution_object_fk" = $26, "ГРУППА" = $27,
            "СЧЕТ УЧЕТА" = COALESCE($28, "СЧЕТ УЧЕТА", CASE WHEN $12 = 'ПЭН' THEN 'МЦ400201' END),
            "GN_import_substitution_object_fks" = $29::INTEGER[],
            "ИМЯ" = $30, "СЕРИЙНЫЙ НОМЕР" = $31, "updated_at" = NOW()
         WHERE "GN_import_substitution_id" = $16
         RETURNING *`,
          [department, okdpId, tkoName || null, vendorId, classification || null, errp || 'НЕТ', ermtr || 'НЕТ', registrationNumber || null, quantity === '' || quantity == null ? null : Number(quantity), replacedImportTko || null, decommissionedQuantity === '' || decommissionedQuantity == null ? null : Number(decommissionedQuantity), costItem || 'ПЭН', paymentWithoutVat === '' || paymentWithoutVat == null ? null : Number(paymentWithoutVat), year === '' || year == null ? null : Number(year), note || null, rowId, equipmentTypeId, supplierId, ogruzId, payment || null, decommissionedNumber, inventoryNumber || null, purchaseStatus || 'план', ekspl || 'НЕТ', plan || 'РЕЗЕРВ', objectId, group || 'офис', accountingNumber === undefined ? null : String(accountingNumber), objectIds, equipmentName || null, serialNumber || null]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Row not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update import-substitution data' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/import-substitution', async (req: Request, res: Response): Promise<void> => {
    const {
      'Подразделение': department,
      'Код ТКО': okdpCode,
      'Наименование ТКО': tkoName,
      'Тип': equipmentTypeName,
      'Вендор ТКО': vendorName,
      'Классификация ТКО': classification,
      'ЕРРП': errp = 'НЕТ',
      'ЕРМТР': ermtr = 'НЕТ',
      'Регистрационный номер ТКО': registrationNumber,
      'Количество': quantity,
      'Выведен из эксплуатации': decommissioned = 0,
      'Инвентарный': inventoryNumber,
      'ИМЯ': equipmentName,
      'СЕРИЙНЫЙ НОМЕР': serialNumber,
      'Замещенное импортное ТКО': replacedImportTko,
      'Кол-во выводенного импортного ТКО': decommissionedQuantity,
      'Статья затрат ТКО': costItem = 'ПЭН',
      'СЧЕТ УЧЕТА': accountingNumber,
      'Статус закупки': purchaseStatus = 'план',
      'Платеж ТР без НДС': paymentWithoutVat,
      'Год': year,
      'Примечание': note,
      'ЭКСПЛ': ekspl = 'НЕТ',
      'ПЛАН': plan = 'РЕЗЕРВ',
      'ГРУППА': group = 'офис',
      'ОБЪЕКТ': objectName,
      'Поставщик': supplierName,
      'Огрузочный реквизит': ogruzName,
      'оплата': payment,
    } = req.body;

    if (!department) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (classification && !['Импорт', 'РФ в реестре', 'РФ НЕ в реестре'].includes(classification)) {
      res.status(400).json({ error: 'Некорректная классификация ТКО' });
      return;
    }
    if (!['ДА', 'НЕТ'].includes(errp) || !['ДА', 'НЕТ'].includes(ermtr)) {
      res.status(400).json({ error: 'ЕРРП и ЕРМТР могут принимать только значения ДА или НЕТ' });
      return;
    }
    if (!['ДА', 'НЕТ'].includes(ekspl)) {
      res.status(400).json({ error: 'ЭКСПЛ может принимать только значения ДА или НЕТ' });
      return;
    }
    if (!['ЭКСПЛ', 'РЕЗЕРВ', 'СПИСАНИЕ'].includes(plan)) {
      res.status(400).json({ error: 'ПЛАН может принимать только значения ЭКСПЛ, РЕЗЕРВ или СПИСАНИЕ' });
      return;
    }
    const decommissionedNumber = Number(decommissioned);
    if (!Number.isInteger(decommissionedNumber) || decommissionedNumber < 0) {
      res.status(400).json({ error: 'Выведен из эксплуатации должно быть целым неотрицательным числом' });
      return;
    }
    if (!['ОНМ', 'ПЭН'].includes(costItem)) {
      res.status(400).json({ error: 'Некорректная статья затрат ТКО' });
      return;
    }
    if (!['план', 'согласован', 'в закупе', 'поставка', 'поставленно'].includes(purchaseStatus)) {
      res.status(400).json({ error: 'Некорректный статус закупки' });
      return;
    }

    const client = await createDbClient();
    try {
      const resolveId = async (query: string, value: unknown): Promise<number | null> => {
        const normalized = String(value ?? '').trim();
        if (!normalized) return null;
        const lookup = await client.query<{ id: number }>(query, [normalized]);
        if (lookup.rowCount === 0) throw new Error('Значение не найдено в справочнике');
        return lookup.rows[0].id;
      };
      const okdpId = await resolveId('SELECT "GN_invest_okdp_tko_is_prit_id" AS id FROM "GN_invest_okdp_tko_is_prit" WHERE "GN_invest_okdp_tko_is_prit" = $1 LIMIT 1', okdpCode);
      const equipmentTypeId = await resolveId('SELECT "GN_equipment_type_id" AS id FROM "GN_equipment_type" WHERE "GN_equipment_type" = $1 LIMIT 1', equipmentTypeName);
      const vendorId = await resolveId('SELECT "GN_equipment_manufacturer_id" AS id FROM "GN_equipment_manufacturer" WHERE "GN_equipment_manufacturer" = $1 LIMIT 1', vendorName);
      const objectNames = Array.isArray(objectName) ? objectName : objectName ? [objectName] : [];
      const objectIds: number[] = [];
      for (const name of objectNames) {
        const resolvedId = await resolveId('SELECT "GN_do_id" AS id FROM "GN_departament_object" WHERE "GN_departament_object" = $1 LIMIT 1', name);
        if (resolvedId != null && !objectIds.includes(resolvedId)) objectIds.push(resolvedId);
      }
      const objectId = objectIds[0] ?? null;
      const supplierId = await resolveId('SELECT "GN_c_id" AS id FROM "GN_contractor" WHERE "GN_contarctor" = $1 LIMIT 1', supplierName);
      const ogruzId = await resolveId('SELECT "GN_invest_ogruz_rekvizit_id" AS id FROM "GN_invest_ogruz_rekvizit" WHERE "GN_invest_ogruz_rekvizit" = $1 LIMIT 1', ogruzName);
      const result = await client.query(
        `INSERT INTO "GN_import_substitution" (
           "Подразделение", "GN_import_substitution_okdp_fk", "Наименование ТКО", "GN_import_substitution_vendor_fk", "Классификация ТКО", "ЕРРП", "ЕРМТР", "Регистрационный номер ТКО", "Количество", "Выведен из эксплуатации", "Инвентарный", "Замещенное импортное ТКО", "Кол-во выводенного импортного ТКО", "Статья затрат ТКО", "Статус закупки", "Платеж ТР без НДС", "Год", "Примечание", "ЭКСПЛ", "ПЛАН", "GN_import_substitution_object_fk", "GN_import_substitution_equipment_type_fk", "GN_import_substitution_supplier_fk", "GN_import_substitution_ogruz_fk", "оплата", "ГРУППА", "СЧЕТ УЧЕТА", "GN_import_substitution_object_fks", "ИМЯ", "СЕРИЙНЫЙ НОМЕР"
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
         RETURNING *`,
        [department, okdpId, tkoName || null, vendorId, classification || null, errp, ermtr, registrationNumber || null, quantity === '' || quantity == null ? null : Number(quantity), decommissionedNumber, inventoryNumber || null, replacedImportTko || null, decommissionedQuantity === '' || decommissionedQuantity == null ? null : Number(decommissionedQuantity), costItem, purchaseStatus, paymentWithoutVat === '' || paymentWithoutVat == null ? null : Number(paymentWithoutVat), year === '' || year == null ? null : Number(year), note || null, ekspl, plan, objectId, equipmentTypeId, supplierId, ogruzId, payment || null, group, accountingNumber ?? (costItem === 'ПЭН' ? 'МЦ400201' : null), objectIds, equipmentName || null, serialNumber || null]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create import-substitution data' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/import-substitution/:id/copy', async (req: Request, res: Response): Promise<void> => {
    const rowId = Number(req.params.id);
    const quantityToCopy = Number(req.body?.quantity);
    const department = typeof req.body?.department === 'string' ? req.body.department.trim() : '';
    const objectNames = req.body?.objects;
    if (!Number.isInteger(rowId) || rowId <= 0) {
      res.status(400).json({ error: 'Некорректный номер строки' });
      return;
    }
    if (!Number.isInteger(quantityToCopy) || quantityToCopy < 0) {
      res.status(400).json({ error: 'Количество для копирования должно быть целым неотрицательным числом' });
      return;
    }
    if (!department) {
      res.status(400).json({ error: 'Выберите подразделение для копии' });
      return;
    }
    if (!Array.isArray(objectNames) || objectNames.some((name: unknown) => typeof name !== 'string')) {
      res.status(400).json({ error: 'Некорректный список объектов для копии' });
      return;
    }

    const client = await createDbClient();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const sourceResult = await client.query<{ 'Количество': string | number | null; 'Выведен из эксплуатации': string | number | null }>(
        `SELECT "Количество", "Выведен из эксплуатации"
         FROM "GN_import_substitution"
         WHERE "GN_import_substitution_id" = $1 AND "is_deleted" = FALSE
         FOR UPDATE`,
        [rowId],
      );
      if (sourceResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        res.status(404).json({ error: 'Строка не найдена' });
        return;
      }

      const availableQuantity = Number(sourceResult.rows[0]['Количество'] ?? 0);
      const decommissionedQuantity = Number(sourceResult.rows[0]['Выведен из эксплуатации'] ?? 0);
      const copyableQuantity = Math.max(0, availableQuantity - decommissionedQuantity);
      if (!Number.isFinite(copyableQuantity) || quantityToCopy > copyableQuantity) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        res.status(400).json({ error: `Доступно для копирования: ${Number.isFinite(copyableQuantity) ? copyableQuantity : 0}` });
        return;
      }

      const departmentResult = await client.query<{ GN_Dep_id: number }>(
        `SELECT "GN_Dep_id"
         FROM "GN_department"
         WHERE "GN_department" = $1
         LIMIT 1`,
        [department],
      );
      if (departmentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        res.status(400).json({ error: 'Выбранное подразделение не найдено' });
        return;
      }
      const departmentId = Number(departmentResult.rows[0].GN_Dep_id);
      const objectIds: number[] = [];
      for (const objectName of objectNames) {
        const objectResult = await client.query<{
          id: number;
          GN_department_FK: number | null;
          GN_department_FKs: number[] | null;
        }>(
          `SELECT "GN_do_id" AS id, "GN_department_FK", "GN_department_FKs"
           FROM "GN_departament_object"
           WHERE "GN_departament_object" = $1
           LIMIT 1`,
          [objectName.trim()],
        );
        if (objectResult.rowCount === 0) {
          await client.query('ROLLBACK');
          transactionStarted = false;
          res.status(400).json({ error: `Объект «${objectName}» не найден` });
          return;
        }
        const object = objectResult.rows[0];
        const objectDepartments = Array.isArray(object.GN_department_FKs)
          ? object.GN_department_FKs.map(Number)
          : [Number(object.GN_department_FK)];
        if (!objectDepartments.includes(departmentId)) {
          await client.query('ROLLBACK');
          transactionStarted = false;
          res.status(400).json({ error: `Объект «${objectName}» не относится к выбранному подразделению` });
          return;
        }
        if (!objectIds.includes(object.id)) objectIds.push(object.id);
      }

      await client.query(
        `UPDATE "GN_import_substitution"
         SET "Количество" = COALESCE("Количество", 0) - $2, "updated_at" = NOW()
         WHERE "GN_import_substitution_id" = $1`,
        [rowId, quantityToCopy],
      );
      const copiedResult = await client.query(
        `INSERT INTO "GN_import_substitution" (
           "Подразделение", "GN_import_substitution_okdp_fk", "Наименование ТКО", "GN_import_substitution_vendor_fk",
           "Классификация ТКО", "ЕРРП", "ЕРМТР", "Регистрационный номер ТКО", "Количество",
           "Выведен из эксплуатации", "Инвентарный", "Замещенное импортное ТКО", "Кол-во выводенного импортного ТКО",
           "Статья затрат ТКО", "Статус закупки", "Платеж ТР без НДС", "Год", "Примечание", "ЭКСПЛ", "ПЛАН",
           "GN_import_substitution_object_fk", "GN_import_substitution_equipment_type_fk", "GN_import_substitution_supplier_fk",
           "GN_import_substitution_ogruz_fk", "оплата", "ГРУППА", "СЧЕТ УЧЕТА", "GN_import_substitution_object_fks",
           "ИМЯ", "СЕРИЙНЫЙ НОМЕР"
         )
         SELECT
           $3, source."GN_import_substitution_okdp_fk", source."Наименование ТКО",
           source."GN_import_substitution_vendor_fk", source."Классификация ТКО", source."ЕРРП", source."ЕРМТР",
           source."Регистрационный номер ТКО", $2, 0, source."Инвентарный", source."Замещенное импортное ТКО", 0,
           source."Статья затрат ТКО", source."Статус закупки", 0, source."Год",
           BTRIM(COALESCE(source."Примечание", '') || ' COPY'), source."ЭКСПЛ", source."ПЛАН",
           $4, source."GN_import_substitution_equipment_type_fk",
           source."GN_import_substitution_supplier_fk", source."GN_import_substitution_ogruz_fk", source."оплата",
           source."ГРУППА", source."СЧЕТ УЧЕТА", $5::INTEGER[],
           source."ИМЯ", source."СЕРИЙНЫЙ НОМЕР"
         FROM "GN_import_substitution" source
         WHERE source."GN_import_substitution_id" = $1
         RETURNING "GN_import_substitution_id"`,
        [rowId, quantityToCopy, department, objectIds[0] ?? null, objectIds],
      );
      await client.query('COMMIT');
      transactionStarted = false;
      res.status(201).json({ success: true, copiedRowId: copiedResult.rows[0]?.GN_import_substitution_id });
    } catch (err) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
      console.error('Failed to split import-substitution row', err);
      res.status(500).json({ error: 'Не удалось создать копию строки' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/import-substitution/:id', async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const client = await createDbClient();
    try {
      const result = await client.query(
        `UPDATE "GN_import_substitution"
         SET "is_deleted" = TRUE, "deleted_at" = NOW()
         WHERE "GN_import_substitution_id" = $1 AND "is_deleted" = FALSE
         RETURNING "GN_import_substitution_id"`,
        [id],
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Row not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete import-substitution row' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/import-substitution/:id/restore', async (req: Request, res: Response): Promise<void> => {
    const rowId = Number(req.params.id);
    if (!Number.isSafeInteger(rowId) || rowId <= 0) {
      res.status(400).json({ error: 'Invalid row id' });
      return;
    }

    const client = await createDbClient();
    try {
      const result = await client.query(
        `UPDATE "GN_import_substitution"
         SET "is_deleted" = FALSE, "deleted_at" = NULL, "updated_at" = NOW()
         WHERE "GN_import_substitution_id" = $1 AND "is_deleted" = TRUE
         RETURNING "GN_import_substitution_id"`,
        [rowId],
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Deleted row not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to restore import-substitution row', err);
      res.status(500).json({ error: 'Failed to restore import-substitution row' });
    } finally {
      await client.end();
    }
  });

  app.post('/api/import-substitution/mark-missing', async (req: Request, res: Response): Promise<void> => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    const client = await createDbClient();
    try {
      await client.query(
        `UPDATE "GN_import_substitution"
         SET "is_deleted" = TRUE, "deleted_at" = NOW()
         WHERE "is_deleted" = FALSE
           AND NOT ("GN_import_substitution_id" = ANY($1::int[]))`,
        [ids],
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to mark missing Excel rows' });
    } finally {
      await client.end();
    }
  });

  app.get('/api/primary', async (_req: Request, res: Response): Promise<void> => {
    const client = await createDbClient();
    try {
      const result = await client.query(`
        SELECT
          primary_document."GN_primary_document_id" AS id,
          primary_document."GN_department_FK" AS "departmentId",
          department."GN_department" AS department,
          primary_document."GN_dogovor_FK" AS "contractId",
          dogovor."GN_dogovor" AS contract,
          primary_document."personal_account" AS "personalAccount",
          primary_document."amount_with_vat" AS "amountWithVat",
          primary_document."details",
          primary_document."edo_arrival_date" AS "edoArrivalDate",
          primary_document."sed_launch_date" AS "sedLaunchDate",
          primary_document."note"
        FROM "GN_primary_documents" primary_document
        LEFT JOIN "GN_department" department
          ON department."GN_Dep_id" = primary_document."GN_department_FK"
        LEFT JOIN "GN_dogovor" dogovor
          ON dogovor."GN_dgv_id" = primary_document."GN_dogovor_FK"
        ORDER BY primary_document."GN_primary_document_id"
      `);
      const [objects, budgetItems] = await Promise.all([
        client.query(`
          SELECT relation."primary_document_id" AS id,
                 object."GN_do_id" AS "itemId",
                 object."GN_departament_object" AS label
          FROM "GN_primary_document_objects" relation
          JOIN "GN_departament_object" object ON object."GN_do_id" = relation."object_id"
          ORDER BY relation."primary_document_id", object."GN_departament_object"
        `),
        client.query(`
          SELECT relation."primary_document_id" AS id,
                 item."GN_b_id" AS "itemId",
                 item."GN_budget_network_item" AS label
          FROM "GN_primary_document_budget_items" relation
          JOIN "GN_budget_network_item" item ON item."GN_b_id" = relation."budget_item_id"
          ORDER BY relation."primary_document_id", item."GN_budget_network_item"
        `),
      ]);
      const objectsById = new Map<number, Array<{ id: number; label: string }>>();
      const itemsById = new Map<number, Array<{ id: number; label: string }>>();
      objects.rows.forEach((row: { id: number; itemId: number; label: string }) => {
        const list = objectsById.get(row.id) ?? [];
        list.push({ id: row.itemId, label: row.label });
        objectsById.set(row.id, list);
      });
      budgetItems.rows.forEach((row: { id: number; itemId: number; label: string }) => {
        const list = itemsById.get(row.id) ?? [];
        list.push({ id: row.itemId, label: row.label });
        itemsById.set(row.id, list);
      });
      res.json(result.rows.map((row: Record<string, unknown>) => ({
        ...row,
        objects: objectsById.get(Number(row.id)) ?? [],
        budgetItems: itemsById.get(Number(row.id)) ?? [],
      })));
    } catch (err) {
      console.error('Failed to fetch primary documents', err);
      res.status(500).json({ error: 'Не удалось загрузить первичные документы' });
    } finally {
      await client.end();
    }
  });

  function parsePrimaryIds(value: unknown): number[] | null {
    if (!Array.isArray(value)) return null;
    const ids = value.map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return null;
    return [...new Set(ids)];
  }

  function parsePrimaryNullableId(value: unknown): number | null | undefined {
    if (value === '' || value === null || value === undefined) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
  }

  function parsePrimaryDate(value: unknown): string | null | undefined {
    if (value === '' || value === null || value === undefined) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
  }

  function parsePrimaryPayload(body: Record<string, unknown>) {
    const departmentId = parsePrimaryNullableId(body.departmentId);
    const contractId = parsePrimaryNullableId(body.contractId);
    const objectIds = parsePrimaryIds(body.objectIds);
    const budgetItemIds = parsePrimaryIds(body.budgetItemIds);
    const amountWithVat = Number(String(body.amountWithVat ?? '0').replace(/\s/g, '').replace(',', '.'));
    const edoArrivalDate = parsePrimaryDate(body.edoArrivalDate);
    const sedLaunchDate = parsePrimaryDate(body.sedLaunchDate);
    if (departmentId === undefined || contractId === undefined || !objectIds || !budgetItemIds
      || !Number.isFinite(amountWithVat) || edoArrivalDate === undefined || sedLaunchDate === undefined) {
      return null;
    }
    return {
      departmentId,
      contractId,
      personalAccount: String(body.personalAccount ?? ''),
      objectIds,
      budgetItemIds,
      amountWithVat,
      details: String(body.details ?? ''),
      edoArrivalDate,
      sedLaunchDate,
      note: String(body.note ?? ''),
    };
  }

  async function replacePrimaryLinks(
    client: Awaited<ReturnType<typeof createDbClient>>,
    documentId: number,
    objectIds: number[],
    budgetItemIds: number[],
  ): Promise<void> {
    await client.query('DELETE FROM "GN_primary_document_objects" WHERE "primary_document_id" = $1', [documentId]);
    await client.query('DELETE FROM "GN_primary_document_budget_items" WHERE "primary_document_id" = $1', [documentId]);
    if (objectIds.length > 0) {
      await client.query(
        `INSERT INTO "GN_primary_document_objects" ("primary_document_id", "object_id")
         SELECT $1, unnest($2::integer[])`,
        [documentId, objectIds],
      );
    }
    if (budgetItemIds.length > 0) {
      await client.query(
        `INSERT INTO "GN_primary_document_budget_items" ("primary_document_id", "budget_item_id")
         SELECT $1, unnest($2::integer[])`,
        [documentId, budgetItemIds],
      );
    }
  }

  app.post('/api/primary', async (req: Request, res: Response): Promise<void> => {
    const input = parsePrimaryPayload(req.body as Record<string, unknown>);
    if (!input) {
      res.status(400).json({ error: 'Проверьте подразделение, договор, статьи, объекты, сумму и даты' });
      return;
    }
    const client = await createDbClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO "GN_primary_documents"
           ("GN_department_FK", "GN_dogovor_FK", "personal_account", "amount_with_vat", "details", "edo_arrival_date", "sed_launch_date", "note")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING "GN_primary_document_id" AS id`,
        [input.departmentId, input.contractId, input.personalAccount, input.amountWithVat, input.details, input.edoArrivalDate, input.sedLaunchDate, input.note],
      );
      await replacePrimaryLinks(client, Number(result.rows[0].id), input.objectIds, input.budgetItemIds);
      await client.query('COMMIT');
      res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to create primary document', err);
      res.status(400).json({ error: 'Не удалось создать первичный документ. Проверьте выбранные значения.' });
    } finally {
      await client.end();
    }
  });

  app.put('/api/primary/:id', async (req: Request, res: Response): Promise<void> => {
    const documentId = Number(req.params.id);
    const input = parsePrimaryPayload(req.body as Record<string, unknown>);
    if (!Number.isSafeInteger(documentId) || documentId <= 0 || !input) {
      res.status(400).json({ error: 'Проверьте идентификатор и заполненные поля первичного документа' });
      return;
    }
    const client = await createDbClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE "GN_primary_documents"
         SET "GN_department_FK" = $2, "GN_dogovor_FK" = $3, "personal_account" = $4,
             "amount_with_vat" = $5, "details" = $6, "edo_arrival_date" = $7,
             "sed_launch_date" = $8, "note" = $9
         WHERE "GN_primary_document_id" = $1
         RETURNING "GN_primary_document_id"`,
        [documentId, input.departmentId, input.contractId, input.personalAccount, input.amountWithVat, input.details, input.edoArrivalDate, input.sedLaunchDate, input.note],
      );
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Первичный документ не найден' });
        return;
      }
      await replacePrimaryLinks(client, documentId, input.objectIds, input.budgetItemIds);
      await client.query('COMMIT');
      res.json({ id: documentId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to update primary document', err);
      res.status(400).json({ error: 'Не удалось сохранить первичный документ. Проверьте выбранные значения.' });
    } finally {
      await client.end();
    }
  });

  app.delete('/api/primary/:id', async (req: Request, res: Response): Promise<void> => {
    const documentId = Number(req.params.id);
    if (!Number.isSafeInteger(documentId) || documentId <= 0) {
      res.status(400).json({ error: 'Некорректный номер первичного документа' });
      return;
    }
    const client = await createDbClient();
    try {
      const result = await client.query(
        'DELETE FROM "GN_primary_documents" WHERE "GN_primary_document_id" = $1 RETURNING "GN_primary_document_id"',
        [documentId],
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Первичный документ не найден' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to delete primary document', err);
      res.status(500).json({ error: 'Не удалось удалить первичный документ' });
    } finally {
      await client.end();
    }
  });
}