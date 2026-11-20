import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { noteExtensions } from './noteExtensions'
import { isSafeNoteLink } from '../../shared/noteFormatting'

type Notebook = { id: number; title: string; position: number; updatedAt: string }
type Section = { id: number; notebookId: number; title: string; position: number }
type PageSummary = {
  id: number
  sectionId: number
  title: string
  position: number
  updatedAt: string
  tags: string[]
}
type NotePage = PageSummary & { content: JSONContent }
type DeletedSectionSnapshot = { section: Section; pages: NotePage[] }
type SearchResult = PageSummary & {
  notebookId: number
  notebookTitle: string
  sectionTitle: string
  contentText: string
}
type NotesIndex = { notebooks: Notebook[]; sections: Section[]; pages: PageSummary[] }
type CreateKind = 'notebook' | 'section' | 'page'
type PendingRestore = {
  key: number
  kind: 'page'
  label: string
  snapshot: NotePage
  error?: string
} | {
  key: number
  kind: 'section'
  label: string
  snapshot: DeletedSectionSnapshot
  error?: string
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(payload.error || `Ошибка HTTP ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function jsonRequest(method: 'POST' | 'PUT', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function normalizeNotesIndex(value: NotesIndex): NotesIndex {
  return {
    notebooks: value.notebooks.map((item) => ({ ...item, id: Number(item.id), position: Number(item.position) })),
    sections: value.sections.map((item) => ({
      ...item,
      id: Number(item.id),
      notebookId: Number(item.notebookId),
      position: Number(item.position),
    })),
    pages: value.pages.map((item) => ({
      ...item,
      id: Number(item.id),
      sectionId: Number(item.sectionId),
      position: Number(item.position),
      tags: Array.isArray(item.tags) ? item.tags : [],
    })),
  }
}

export default function NotesPage(): React.ReactElement {
  const [index, setIndex] = useState<NotesIndex>({ notebooks: [], sections: [], pages: [] })
  const [selectedNotebookId, setSelectedNotebookId] = useState<number | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null)
  const [activePage, setActivePage] = useState<NotePage | null>(null)
  const [pageLoadAttempt, setPageLoadAttempt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<{ pageId: number; message: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [notebooksCollapsed, setNotebooksCollapsed] = useState(false)
  const [pagesCollapsed, setPagesCollapsed] = useState(false)
  const [notebooksWidth, setNotebooksWidth] = useState(260)
  const [pagesWidth, setPagesWidth] = useState(280)
  const [createKind, setCreateKind] = useState<CreateKind | null>(null)
  const [createTitle, setCreateTitle] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingRestores, setPendingRestores] = useState<PendingRestore[]>([])
  const [restoringKey, setRestoringKey] = useState<number | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const notebooksPanelRef = useRef<HTMLElement>(null)
  const pagesPanelRef = useRef<HTMLElement>(null)
  const resizeStartRef = useRef<{ pane: 'notebooks' | 'pages'; startX: number; startWidth: number } | null>(null)
  const nextRestoreKeyRef = useRef(0)

  function resizePane(pane: 'notebooks' | 'pages', width: number): void {
    const workspaceWidth = workspaceRef.current?.clientWidth ?? 0
    const otherWidth = pane === 'notebooks' ? pagesWidth : notebooksWidth
    const maxWidth = workspaceWidth > 0 ? workspaceWidth - otherWidth - 336 : Number.POSITIVE_INFINITY
    const nextWidth = Math.max(180, Math.min(width, maxWidth))
    if (pane === 'notebooks') setNotebooksWidth(nextWidth)
    else setPagesWidth(nextWidth)
  }

  function startPaneResize(event: ReactPointerEvent<HTMLDivElement>, pane: 'notebooks' | 'pages'): void {
    event.preventDefault()
    const panel = pane === 'notebooks' ? notebooksPanelRef.current : pagesPanelRef.current
    if (!panel) return
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStartRef.current = { pane, startX: event.clientX, startWidth: panel.getBoundingClientRect().width }
  }

  function movePaneResize(event: ReactPointerEvent<HTMLDivElement>): void {
    const resizeStart = resizeStartRef.current
    if (!resizeStart) return
    resizePane(resizeStart.pane, resizeStart.startWidth + event.clientX - resizeStart.startX)
  }

  function stopPaneResize(): void {
    resizeStartRef.current = null
  }

  function handlePaneResizeKey(event: KeyboardEvent<HTMLDivElement>, pane: 'notebooks' | 'pages'): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const panel = pane === 'notebooks' ? notebooksPanelRef.current : pagesPanelRef.current
    if (panel) resizePane(pane, panel.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 16 : -16))
  }

  const loadIndex = useCallback(async (): Promise<NotesIndex> => {
    const result = await requestJson<NotesIndex>('/api/notes', { cache: 'no-store' })
    const nextIndex = normalizeNotesIndex(result)
    setIndex(nextIndex)
    return nextIndex
  }, [])

  useEffect(() => {
    let isMounted = true
    void loadIndex()
      .catch((loadError: unknown) => {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить заметки')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    return () => { isMounted = false }
  }, [loadIndex])

  const activeNotebookId = selectedNotebookId != null && index.notebooks.some((item) => item.id === selectedNotebookId)
    ? selectedNotebookId
    : index.notebooks[0]?.id ?? null
  const visibleSections = index.sections.filter((section) => section.notebookId === activeNotebookId)
  const activeSectionId = selectedSectionId != null && visibleSections.some((item) => item.id === selectedSectionId)
    ? selectedSectionId
    : visibleSections[0]?.id ?? null
  const visiblePages = index.pages.filter((page) => page.sectionId === activeSectionId)
  const activePageId = selectedPageId != null && visiblePages.some((item) => item.id === selectedPageId)
    ? selectedPageId
    : visiblePages[0]?.id ?? null
  const currentPageError = pageError?.pageId === activePageId ? pageError.message : null
  const pageLoading = activePageId != null && activePage?.id !== activePageId && currentPageError === null

  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      void requestJson<SearchResult[]>(`/api/notes/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((results) => setSearchResults(results.map((result) => ({
          ...result,
          id: Number(result.id),
          sectionId: Number(result.sectionId),
          notebookId: Number(result.notebookId),
          tags: Array.isArray(result.tags) ? result.tags : [],
        }))))
        .catch((searchError: unknown) => {
          if (!controller.signal.aborted) {
            setError(searchError instanceof Error ? searchError.message : 'Не удалось выполнить поиск')
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [searchQuery])

  useEffect(() => {
    if (activePageId == null) return
    let isCurrentPage = true
    void requestJson<NotePage>(`/api/notes/pages/${activePageId}`, { cache: 'no-store' })
      .then((result) => {
        if (isCurrentPage) {
          setActivePage({
            ...result,
            id: Number(result.id),
            sectionId: Number(result.sectionId),
            tags: Array.isArray(result.tags) ? result.tags : [],
          })
          setPageError((previous) => previous?.pageId === activePageId ? null : previous)
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrentPage) {
          setPageError({
            pageId: activePageId,
            message: loadError instanceof Error ? loadError.message : 'Не удалось открыть страницу',
          })
        }
      })
    return () => { isCurrentPage = false }
  }, [activePageId, pageLoadAttempt])

  const handlePageSaved = useCallback((savedPage: Pick<NotePage, 'id' | 'title' | 'updatedAt' | 'tags'>): void => {
    setIndex((previous) => ({
      ...previous,
      pages: previous.pages.map((page) => page.id === savedPage.id
        ? { ...page, title: savedPage.title, updatedAt: savedPage.updatedAt, tags: savedPage.tags }
        : page),
    }))
  }, [])

  function selectPage(page: PageSummary): void {
    setSelectedNotebookId(index.sections.find((section) => section.id === page.sectionId)?.notebookId ?? activeNotebookId)
    setSelectedSectionId(page.sectionId)
    setSelectedPageId(page.id)
  }

  function beginCreate(kind: CreateKind): void {
    setCreateKind(kind)
    setCreateTitle(kind === 'page' ? 'Новая страница' : '')
    setCreateError(null)
  }

  async function createItem(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!createKind) return
    setCreating(true)
    setCreateError(null)
    try {
      const title = createTitle.trim()
      if (createKind === 'notebook') {
        const result = await requestJson<Notebook>('/api/notes/notebooks', jsonRequest('POST', { title }))
        const notebook = { ...result, id: Number(result.id) }
        await loadIndex()
        setSelectedNotebookId(notebook.id)
        setSelectedSectionId(null)
        setSelectedPageId(null)
      } else if (createKind === 'section') {
        if (activeNotebookId == null) throw new Error('Сначала выберите или создайте блокнот')
        const result = await requestJson<Section>('/api/notes/sections', jsonRequest('POST', {
          notebookId: activeNotebookId,
          title,
        }))
        const section = { ...result, id: Number(result.id), notebookId: Number(result.notebookId) }
        await loadIndex()
        setSelectedSectionId(section.id)
        setSelectedPageId(null)
      } else if (createKind === 'page') {
        if (activeSectionId == null) throw new Error('Сначала выберите или создайте раздел')
        const result = await requestJson<PageSummary>('/api/notes/pages', jsonRequest('POST', {
          sectionId: activeSectionId,
          title,
        }))
        const page = { ...result, id: Number(result.id), sectionId: Number(result.sectionId) }
        await loadIndex()
        setSelectedPageId(page.id)
      }
      setCreateKind(null)
      setCreateTitle('')
    } catch (createFailure: unknown) {
      setCreateError(createFailure instanceof Error ? createFailure.message : 'Не удалось создать элемент')
    } finally {
      setCreating(false)
    }
  }

  async function renameItem(kind: 'notebook' | 'section', item: Notebook | Section): Promise<void> {
    const title = window.prompt('Новое название', item.title)?.trim()
    if (!title || title === item.title) return
    const endpoint = kind === 'notebook' ? 'notebooks' : 'sections'
    try {
      await requestJson(`/api/notes/${endpoint}/${item.id}`, jsonRequest('PUT', { title }))
      await loadIndex()
    } catch (renameError: unknown) {
      setError(renameError instanceof Error ? renameError.message : 'Не удалось переименовать элемент')
    }
  }

  async function deleteItem(kind: CreateKind, item: Notebook | Section | PageSummary): Promise<void> {
    const labels = {
      notebook: 'блокнот и все его заметки',
      section: 'раздел и все его страницы',
      page: 'страницу',
    }
    const undoHint = kind === 'notebook' ? ' Это действие нельзя отменить.' : ' Отменить действие можно в блоке уведомления.'
    if (!window.confirm(`Удалить ${labels[kind]}?${undoHint}`)) return
    try {
      if (kind === 'notebook') {
        await requestJson(`/api/notes/notebooks/${item.id}`, { method: 'DELETE' })
        setSelectedNotebookId(null)
        setSelectedSectionId(null)
        setSelectedPageId(null)
        await loadIndex()
        return
      }
      const endpoint = `${kind}s`
      const key = nextRestoreKeyRef.current++
      if (kind === 'section') {
        const snapshot = await requestJson<DeletedSectionSnapshot>(`/api/notes/${endpoint}/${item.id}`, { method: 'DELETE' })
        setPendingRestores((pending) => [...pending, {
          key,
          kind,
          label: `Раздел «${item.title}»`,
          snapshot,
        }])
      } else {
        const snapshot = await requestJson<NotePage>(`/api/notes/${endpoint}/${item.id}`, { method: 'DELETE' })
        setPendingRestores((pending) => [...pending, {
          key,
          kind,
          label: `Страница «${item.title || 'Без названия'}»`,
          snapshot,
        }])
      }
      if (kind === 'section') {
        setSelectedSectionId(null)
        setSelectedPageId(null)
      } else {
        setSelectedPageId(null)
      }
      await loadIndex()
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить элемент')
    }
  }

  async function restoreDeletedItem(undo: PendingRestore): Promise<void> {
    setRestoringKey(undo.key)
    setPendingRestores((pending) => pending.map((entry) => (
      entry.key === undo.key ? { ...entry, error: undefined } : entry
    )))
    let restored = false
    try {
      if (undo.kind === 'section') {
        const snapshot = undo.snapshot
        const result = await requestJson<{ section: Section }>(
          `/api/notes/sections/${snapshot.section.id}/restore`,
          jsonRequest('POST', snapshot),
        )
        restored = true
        setPendingRestores((pending) => pending.filter((entry) => entry.key !== undo.key))
        const restoredSection = { ...result.section, id: Number(result.section.id), notebookId: Number(result.section.notebookId) }
        await loadIndex()
        setSelectedNotebookId(restoredSection.notebookId)
        setSelectedSectionId(restoredSection.id)
        setSelectedPageId(null)
      } else {
        const snapshot = undo.snapshot
        const result = await requestJson<PageSummary>(
          `/api/notes/pages/${snapshot.id}/restore`,
          jsonRequest('POST', snapshot),
        )
        restored = true
        setPendingRestores((pending) => pending.filter((entry) => entry.key !== undo.key))
        const restoredPage = { ...result, id: Number(result.id), sectionId: Number(result.sectionId) }
        const nextIndex = await loadIndex()
        const section = nextIndex.sections.find((item) => item.id === restoredPage.sectionId)
        setSelectedNotebookId(section?.notebookId ?? null)
        setSelectedSectionId(restoredPage.sectionId)
        setSelectedPageId(restoredPage.id)
      }
    } catch (restoreError: unknown) {
      const message = restoreError instanceof Error ? restoreError.message : 'Не удалось восстановить элемент'
      if (restored) setError(`Элемент восстановлен, но список не удалось обновить: ${message}`)
      else setPendingRestores((pending) => pending.map((entry) => (
        entry.key === undo.key ? { ...entry, error: message } : entry
      )))
    } finally {
      setRestoringKey(null)
    }
  }

  const createForm = (kind: CreateKind): React.ReactElement | null => createKind === kind ? (
    <form className="notes-create-form" onSubmit={(event) => void createItem(event)}>
      <input
        autoFocus
        aria-label="Название"
        maxLength={200}
        value={createTitle}
        onChange={(event) => setCreateTitle(event.target.value)}
        placeholder="Название"
      />
      <div className="notes-create-actions">
        <button type="submit" disabled={creating || !createTitle.trim()}>{creating ? 'Создание…' : 'Создать'}</button>
        <button type="button" onClick={() => setCreateKind(null)}>Отмена</button>
      </div>
      {createError && <p className="hint hint--error">{createError}</p>}
    </form>
  ) : null

  return (
    <section className="notes-page">
      <header className="notes-header">
        <div>
          <h1>Заметки</h1>   
        </div>
        <label className="notes-search">
          <span>Поиск</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Искать в страницах и тегах"
          />
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Очистить поиск">×</button>}
        </label>
      </header>

      {error && <p className="hint hint--error notes-error">{error}</p>}
      {pendingRestores.length > 0 && (
        <section className="notes-undo-list" aria-live="polite" aria-label="Удалённые заметки">
          {pendingRestores.map((undo) => (
            <div className="notes-undo-item" key={undo.key}>
              <span>{undo.kind === 'section' ? `Удалён ${undo.label}.` : `Удалена ${undo.label}.`}</span>
              <button type="button" disabled={restoringKey !== null} onClick={() => void restoreDeletedItem(undo)}>
                {restoringKey === undo.key ? 'Восстановление…' : 'Вернуть'}
              </button>
              <button
                type="button"
                className="notes-undo-dismiss"
                aria-label={`Убрать уведомление: ${undo.label}`}
                onClick={() => setPendingRestores((pending) => pending.filter((entry) => entry.key !== undo.key))}
              >
                ×
              </button>
              {undo.error && <span className="notes-undo-error">{undo.error}</span>}
            </div>
          ))}
        </section>
      )}
      {loading ? <p className="hint">Загрузка заметок…</p> : (
        <>
        {searchQuery.trim() && (
          <section className="notes-search-results notes-panel" aria-live="polite">
            <div className="notes-panel-heading">
              <h2>Результаты поиска</h2>
              <span>{searching ? 'Поиск…' : `${searchResults.length} найдено`}</span>
            </div>
            {searching ? <p className="notes-empty">Ищем в страницах и тегах…</p>
              : searchResults.length === 0 ? <p className="notes-empty">Ничего не найдено.</p>
                : (
                  <ul className="notes-search-result-items">
                    {searchResults.map((result) => (
                      <li key={result.id}>
                        <button
                          type="button"
                          className={`notes-page-item${activePageId === result.id ? ' is-selected' : ''}`}
                          onClick={() => selectPage(result)}
                        >
                          <strong>{result.title || 'Без названия'}</strong>
                          <span>{result.notebookTitle} / {result.sectionTitle}</span>
                          <small>{result.contentText.slice(0, 120)}</small>
                          {result.tags.length > 0 && (
                            <span className="notes-tag-list">
                              {result.tags.map((tag) => <span className="notes-tag" key={tag}>{tag}</span>)}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
          </section>
        )}
        <div
          ref={workspaceRef}
          className={`notes-workspace${notebooksCollapsed ? ' notes-workspace--notebooks-collapsed' : ''}${pagesCollapsed ? ' notes-workspace--pages-collapsed' : ''}`}
          style={{
            '--notes-notebooks-width': `${notebooksWidth}px`,
            '--notes-pages-width': `${pagesWidth}px`,
          } as CSSProperties}
        >
          <aside ref={notebooksPanelRef} className={`notes-navigation notes-panel${notebooksCollapsed ? ' is-collapsed' : ''}`}>
            <div className="notes-panel-heading">
              <button
                type="button"
                className="notes-panel-toggle"
                aria-expanded={!notebooksCollapsed}
                aria-controls="notes-notebooks-content"
                onClick={() => setNotebooksCollapsed((collapsed) => !collapsed)}
              >
                <span className="notes-collapse-indicator" aria-hidden="true">{notebooksCollapsed ? '›' : '‹'}</span>
                <span>Блокноты</span>
              </button>
              {!notebooksCollapsed && (
                <button type="button" onClick={() => beginCreate('notebook')} aria-label="Добавить блокнот">+</button>
              )}
            </div>
            <div id="notes-notebooks-content" hidden={notebooksCollapsed}>
              {createForm('notebook')}
              <ul className="notes-tree">
              {index.notebooks.map((notebook) => {
                const sections = index.sections.filter((section) => section.notebookId === notebook.id)
                return (
                  <li key={notebook.id}>
                    <div className={`notes-nav-item${activeNotebookId === notebook.id ? ' is-selected' : ''}`}>
                      <button type="button" className="notes-nav-label" onClick={() => {
                        setSelectedNotebookId(notebook.id)
                        setSelectedSectionId(sections[0]?.id ?? null)
                        setSelectedPageId(null)
                      }}>
                        {notebook.title}
                      </button>
                      <button type="button" className="notes-icon-button" onClick={() => void renameItem('notebook', notebook)} aria-label={`Переименовать ${notebook.title}`}>✎</button>
                      {sections.length === 0 && (
                        <button
                          type="button"
                          className="notes-icon-button notes-delete-button"
                          onClick={() => void deleteItem('notebook', notebook)}
                          aria-label={`Удалить ${notebook.title}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {activeNotebookId === notebook.id && (
                      <ul className="notes-section-list">
                        {sections.map((section) => (
                          <li key={section.id}>
                            <div className={`notes-nav-item notes-section-item${activeSectionId === section.id ? ' is-selected' : ''}`}>
                              <button type="button" className="notes-nav-label" onClick={() => {
                                setSelectedSectionId(section.id)
                                setSelectedPageId(null)
                              }}>
                                {section.title}
                              </button>
                              <button type="button" className="notes-icon-button" onClick={() => void renameItem('section', section)} aria-label={`Переименовать ${section.title}`}>✎</button>
                              <button type="button" className="notes-icon-button notes-delete-button" onClick={() => void deleteItem('section', section)} aria-label={`Удалить ${section.title}`}>×</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
              </ul>
              {activeNotebookId != null && (
                <button type="button" className="notes-add-inline" onClick={() => beginCreate('section')}>+ Раздел</button>
              )}
              {createForm('section')}
              {index.notebooks.length === 0 && !createKind && <p className="notes-empty">Создайте блокнот, чтобы начать.</p>}
            </div>
          </aside>

          <div
            className="notes-resizer notes-resizer--notebooks"
            role="separator"
            aria-orientation="vertical"
            aria-label="Изменить ширину блока Блокноты"
            aria-valuemin={180}
            aria-valuenow={notebooksWidth}
            tabIndex={0}
            onPointerDown={(event) => startPaneResize(event, 'notebooks')}
            onPointerMove={movePaneResize}
            onPointerUp={stopPaneResize}
            onPointerCancel={stopPaneResize}
            onLostPointerCapture={stopPaneResize}
            onKeyDown={(event) => handlePaneResizeKey(event, 'notebooks')}
          />

          <aside ref={pagesPanelRef} className={`notes-page-list notes-panel${pagesCollapsed ? ' is-collapsed' : ''}`}>
            <div className="notes-panel-heading">
              <button
                type="button"
                className="notes-panel-toggle"
                aria-expanded={!pagesCollapsed}
                aria-controls="notes-pages-content"
                onClick={() => setPagesCollapsed((collapsed) => !collapsed)}
              >
                <span className="notes-collapse-indicator" aria-hidden="true">{pagesCollapsed ? '›' : '‹'}</span>
                <span>Страницы</span>
              </button>
              {!pagesCollapsed && activeSectionId != null && (
                <button type="button" onClick={() => beginCreate('page')} aria-label="Добавить страницу">+</button>
              )}
            </div>
            <div id="notes-pages-content" hidden={pagesCollapsed}>
              {createForm('page')}
              {visiblePages.length === 0 ? (
                <p className="notes-empty">{activeSectionId == null ? 'Выберите или создайте раздел.' : 'В разделе пока нет страниц.'}</p>
              ) : (
                <ul className="notes-page-items">
                  {visiblePages.map((page) => (
                    <li key={page.id}>
                      <button type="button" className={`notes-page-item${activePageId === page.id ? ' is-selected' : ''}`} onClick={() => selectPage(page)}>
                        <strong>{page.title || 'Без названия'}</strong>
                        <small>{new Date(page.updatedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</small>
                        {page.tags.length > 0 && <span className="notes-tag-list">{page.tags.map((tag) => <span className="notes-tag" key={tag}>{tag}</span>)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          <div
            className="notes-resizer notes-resizer--pages"
            role="separator"
            aria-orientation="vertical"
            aria-label="Изменить ширину блока Страницы"
            aria-valuemin={180}
            aria-valuenow={pagesWidth}
            tabIndex={0}
            onPointerDown={(event) => startPaneResize(event, 'pages')}
            onPointerMove={movePaneResize}
            onPointerUp={stopPaneResize}
            onPointerCancel={stopPaneResize}
            onLostPointerCapture={stopPaneResize}
            onKeyDown={(event) => handlePaneResizeKey(event, 'pages')}
          />

          <main className="notes-editor-panel notes-panel">
            {pageLoading && <p className="hint">Загрузка страницы…</p>}
            {currentPageError && (
              <div>
                <p className="hint hint--error">{currentPageError}</p>
                <button type="button" onClick={() => setPageLoadAttempt((attempt) => attempt + 1)}>Повторить загрузку</button>
              </div>
            )}
            {!pageLoading && !currentPageError && activePage?.id === activePageId && (
              <NoteEditor
                key={activePage.id}
                page={activePage}
                onSaved={handlePageSaved}
                onDelete={() => void deleteItem('page', activePage)}
              />
            )}
            {!pageLoading && !currentPageError && activePageId == null && (
              <div className="notes-editor-empty">Выберите страницу или создайте новую.</div>
            )}
          </main>
        </div>
        </>
      )}
    </section>
  )
}

const NOTE_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#980000', '#c62828', '#ff9900', '#ffff00', '#2e7d32', '#1565c0',
  '#6a1b9a', '#ff00ff', '#f8bbd0', '#fff59d', '#a5d6a7', '#90caf9',
  '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8',
  '#ead1dc', '#e6b8af', '#f9cb9c', '#ffe599', '#b6d7a8', '#b4a7d6',
]

function NoteColorPicker({
  label,
  defaultLabel,
  color,
  disabled,
  onChange,
}: {
  label: string
  defaultLabel: string
  color: string | null
  disabled: boolean
  onChange: (color: string | null) => void
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const paletteId = useId()

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function chooseColor(value: string | null): void {
    onChange(value)
    setOpen(false)
  }

  return (
    <div className="notes-color-picker" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={paletteId}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!open) {
            const button = buttonRef.current
            const panel = button?.closest('.notes-editor-panel')
            if (button && panel) {
              setAlignRight(panel.getBoundingClientRect().right - button.getBoundingClientRect().left < 180)
            }
          }
          setOpen((previous) => !previous)
        }}
      >
        <span className="notes-color-picker-icon" aria-hidden="true">
          {label === 'Цвет текста' ? 'A' : '▰'}
          <span style={{ backgroundColor: color || (label === 'Цвет текста' ? '#000000' : '#fff59d') }} />
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`notes-color-palette${alignRight ? ' align-right' : ''}`} id={paletteId} role="group" aria-label={label}>
          <div className="notes-color-palette-grid">
            {NOTE_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className="notes-color-swatch"
                aria-label={`${label}: ${value}`}
                title={value}
                aria-pressed={color?.toLowerCase() === value}
                style={{ backgroundColor: value }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseColor(value)}
              />
            ))}
          </div>
          <button type="button" className="notes-color-reset" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseColor(null)}>
            {defaultLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function NoteEditor({
  page,
  onSaved,
  onDelete,
}: {
  page: NotePage
  onSaved: (savedPage: Pick<NotePage, 'id' | 'title' | 'updatedAt' | 'tags'>) => void
  onDelete: () => void
}): React.ReactElement {
  const [title, setTitle] = useState(page.title)
  const [content, setContent] = useState<JSONContent>(page.content)
  const [tags, setTags] = useState(page.tags)
  const [tagInput, setTagInput] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved')
  const [saveError, setSaveError] = useState('')
  const [formatError, setFormatError] = useState('')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [pasteOptionsVisible, setPasteOptionsVisible] = useState(false)
  const pendingPasteOptionsRef = useRef<{ from: number; to: number; text: string } | null>(null)
  const skipPasteOptionsRef = useRef(false)
  const skipFirstSave = useRef(true)
  const saveQueue = useRef(Promise.resolve())

  const editor = useEditor({
    extensions: noteExtensions,
    shouldRerenderOnTransaction: true,
    content,
    editorProps: {
      handlePaste: (view, event) => {
        if (skipPasteOptionsRef.current || !event?.clipboardData) return false
        const text = event.clipboardData.getData('text/plain')
        if (!text) return false
        const from = view.state.selection.from
        const previousDocument = view.state.doc
        window.setTimeout(() => {
          const nextState = view.state
          if (nextState.doc.eq(previousDocument)) return
          const to = nextState.selection.to
          if (to < from) return
          pendingPasteOptionsRef.current = { from, to, text }
          setPasteOptionsVisible(true)
        }, 0)
        return false
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      setContent(updatedEditor.getJSON())
      setSaveState('unsaved')
      if (pendingPasteOptionsRef.current) {
        pendingPasteOptionsRef.current = null
        setPasteOptionsVisible(false)
      }
    },
    onSelectionUpdate: () => {
      if (pendingPasteOptionsRef.current) {
        pendingPasteOptionsRef.current = null
        setPasteOptionsVisible(false)
      }
    },
  })

  function dismissPasteOptions(): void {
    pendingPasteOptionsRef.current = null
    setPasteOptionsVisible(false)
  }

  function pasteAsPlainText(): void {
    const pendingPaste = pendingPasteOptionsRef.current
    if (!editor || !pendingPaste) return
    dismissPasteOptions()
    setFormatError('')
    if (!editor.commands.setTextSelection({ from: pendingPaste.from, to: pendingPaste.to })) {
      setFormatError('Не удалось выбрать вставленный текст.')
      return
    }
    skipPasteOptionsRef.current = true
    let pasted = false
    try {
      pasted = editor.view.pasteText(pendingPaste.text)
    } finally {
      skipPasteOptionsRef.current = false
    }
    if (!pasted) setFormatError('Не удалось вставить текст без оформления.')
  }

  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false
      return
    }
    let isCurrent = true
    const timer = window.setTimeout(() => {
      setSaveState('saving')
      setSaveError('')
      const saveRequest = saveQueue.current.then(async () => {
        const result = await requestJson<Pick<NotePage, 'id' | 'title' | 'updatedAt' | 'tags'>>(
          `/api/notes/pages/${page.id}`,
          jsonRequest('PUT', { title, content, tags }),
        )
        if (isCurrent) {
          const savedPage = { ...result, id: Number(result.id) }
          onSaved(savedPage)
          setSaveState('saved')
        }
      })
      saveQueue.current = saveRequest.then(() => undefined, () => undefined)
      void saveRequest.catch((saveFailure: unknown) => {
          if (!isCurrent) return
          setSaveError(saveFailure instanceof Error ? saveFailure.message : 'Не удалось сохранить страницу')
          setSaveState('error')
      })
    }, 700)
    return () => {
      isCurrent = false
      window.clearTimeout(timer)
    }
  }, [content, onSaved, page.id, saveAttempt, tags, title])

  function addTag(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const tag = tagInput.trim()
    if (!tag || tags.some((existing) => existing.toLocaleLowerCase('ru') === tag.toLocaleLowerCase('ru'))) return
    if (tags.length >= 20 || tag.length > 40) return
    setTags((previous) => [...previous, tag])
    setSaveState('unsaved')
    setTagInput('')
  }

  function editLink(): void {
    if (!editor) return
    if (editor.state.selection.empty && !editor.isActive('link')) {
      setFormatError('Выделите текст, чтобы добавить ссылку.')
      return
    }
    const url = window.prompt('Адрес ссылки (https://, http:// или mailto:)', editor.getAttributes('link').href ?? '')
    if (url === null) return
    const trimmed = url.trim()
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      setFormatError('')
    } else if (!isSafeNoteLink(trimmed)) {
      setFormatError('Укажите корректный адрес с протоколом http://, https:// или mailto:.')
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
      setFormatError('')
    }
  }

  const toolbarButton = (
    label: string,
    active: boolean,
    action: () => void,
    disabled = false,
    display: React.ReactNode = label,
  ): React.ReactElement => (
    <button
      key={label}
      type="button"
      className={active ? 'is-active' : ''}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
      disabled={!editor || disabled}
    >
      {display}
    </button>
  )

  return (
    <div className="notes-editor">
      <div className="notes-editor-toolbar">
        {toolbarButton('H1', editor?.isActive('heading', { level: 1 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
        {toolbarButton('H2', editor?.isActive('heading', { level: 2 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
        {toolbarButton('B', editor?.isActive('bold') ?? false, () => editor?.chain().focus().toggleBold().run(), false, <strong>B</strong>)}
        {toolbarButton('I', editor?.isActive('italic') ?? false, () => editor?.chain().focus().toggleItalic().run(), false, <em>I</em>)}
        {toolbarButton('Подчёркнутый', editor?.isActive('underline') ?? false, () => editor?.chain().focus().toggleUnderline().run(), false, <u>U</u>)}
        {toolbarButton('Зачёркнутый', editor?.isActive('strike') ?? false, () => editor?.chain().focus().toggleStrike().run(), false, <s>S</s>)}
        {toolbarButton('Ссылка', editor?.isActive('link') ?? false, editLink, false, '🔗')}
        {toolbarButton('Цитата', editor?.isActive('blockquote') ?? false, () => editor?.chain().focus().toggleBlockquote().run(), false, '❝')}
        {toolbarButton('Код', editor?.isActive('code') ?? false, () => editor?.chain().focus().toggleCode().run(), false, '</>')}
        {toolbarButton('Блок кода', editor?.isActive('codeBlock') ?? false, () => editor?.chain().focus().toggleCodeBlock().run(), false, '{ }')}
        {toolbarButton('• Список', editor?.isActive('bulletList') ?? false, () => editor?.chain().focus().toggleBulletList().run(), false, '•☰')}
        {toolbarButton('1. Список', editor?.isActive('orderedList') ?? false, () => editor?.chain().focus().toggleOrderedList().run(), false, '1.☰')}
        {toolbarButton('☑ Задачи', editor?.isActive('taskList') ?? false, () => editor?.chain().focus().toggleTaskList().run(), false, '☑')}
        {(['left', 'center', 'right', 'justify'] as const).map((alignment, index) =>
          toolbarButton(['По левому краю', 'По центру', 'По правому краю', 'По ширине'][index],
            editor?.isActive({ textAlign: alignment }) ?? false,
            () => editor?.chain().focus().setTextAlign(alignment).run(), false,
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 3h14M1 8h14M1 13h14" />
              <path d={alignment === 'left' ? 'M1 5.5h8M1 10.5h8' : alignment === 'center' ? 'M4 5.5h8M4 10.5h8' : alignment === 'right' ? 'M7 5.5h8M7 10.5h8' : 'M1 5.5h14M1 10.5h14'} />
            </svg>))}
        <select aria-label="Шрифт" title="Шрифт" value={editor?.getAttributes('textStyle').fontFamily ?? ''} disabled={!editor} onChange={(event) => {
          const value = event.currentTarget.value
          if (value) editor?.chain().focus().setFontFamily(value).run()
          else editor?.chain().focus().unsetFontFamily().run()
        }}>
          <option value="">Шрифт</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Tahoma">Tahoma</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Verdana">Verdana</option>
        </select>
        <select aria-label="Размер текста" title="Размер текста" value={editor?.getAttributes('textStyle').fontSize ?? ''} disabled={!editor} onChange={(event) => {
          const value = event.currentTarget.value
          if (value) editor?.chain().focus().setFontSize(value).run()
          else editor?.chain().focus().unsetFontSize().run()
        }}>
          <option value="">Размер</option>
          {[12, 14, 16, 18, 20, 24, 32, 48].map((size) => <option key={size} value={`${size}px`}>{size} px</option>)}
        </select>
        <NoteColorPicker label="Цвет текста" defaultLabel="Цвет по умолчанию" color={editor?.getAttributes('textStyle').color ?? null} disabled={!editor} onChange={(value) => {
          if (value) editor?.chain().focus().setColor(value).run()
          else editor?.chain().focus().unsetColor().run()
        }} />
        <NoteColorPicker label="Цвет выделения" defaultLabel="Без выделения" color={editor?.getAttributes('highlight').color ?? null} disabled={!editor} onChange={(value) => {
          if (value) editor?.chain().focus().setHighlight({ color: value }).run()
          else editor?.chain().focus().unsetHighlight().run()
        }} />
        {toolbarButton('Вставить таблицу', false, () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, '▦')}
        {editor?.isActive('table') && (
          <>
            {toolbarButton('+ Строка', false, () => editor.chain().focus().addRowAfter().run(), false, '+стр')}
            {toolbarButton('− Строка', false, () => editor.chain().focus().deleteRow().run(), false, '−стр')}
            {toolbarButton('+ Столбец', false, () => editor.chain().focus().addColumnAfter().run(), false, '+стб')}
            {toolbarButton('− Столбец', false, () => editor.chain().focus().deleteColumn().run(), false, '−стб')}
            {toolbarButton('Удалить таблицу', false, () => editor.chain().focus().deleteTable().run(), false, '×▦')}
          </>
        )}
        <span className={`notes-save-state${saveState === 'error' ? ' is-error' : ''}`} title={saveError}>
          {saveState === 'saving' ? 'Сохранение…'
            : saveState === 'unsaved' ? 'Есть изменения'
              : saveState === 'error' ? `Ошибка: ${saveError}` : 'Сохранено'}
        </span>
        {saveState === 'error' && (
          <button type="button" onClick={() => setSaveAttempt((attempt) => attempt + 1)}>Повторить</button>
        )}
        <button type="button" className="notes-delete-page" onClick={onDelete}>Удалить страницу</button>
      </div>
      {pasteOptionsVisible && (
        <div className="notes-paste-options" role="group" aria-label="Варианты вставки">
          <span>Вставка:</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={dismissPasteOptions}>
            Оставить форматирование
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={pasteAsPlainText}>
            Только текст
          </button>
        </div>
      )}
      {formatError && <p className="notes-save-state is-error" role="alert">{formatError}</p>}
      <input
        className="notes-title-input"
        aria-label="Заголовок страницы"
        maxLength={200}
        value={title}
        onChange={(event) => {
          setTitle(event.target.value)
          setSaveState('unsaved')
        }}
        placeholder="Заголовок страницы"
      />
      <div className="notes-tags">
        <span className="notes-tags-label">Теги</span>
        {tags.map((tag) => (
          <span className="notes-tag" key={tag}>
            {tag}
            <button type="button" aria-label={`Удалить тег ${tag}`} onClick={() => {
              setTags((previous) => previous.filter((item) => item !== tag))
              setSaveState('unsaved')
            }}>×</button>
          </span>
        ))}
        <input
          aria-label="Добавить тег"
          maxLength={40}
          value={tagInput}
          onChange={(event) => setTagInput(event.target.value)}
          onKeyDown={addTag}
          placeholder="Добавить тег и нажать Enter"
        />
      </div>
      <EditorContent editor={editor} className="notes-rich-editor" />
    </div>
  )
}
