import StarterKit from '@tiptap/starter-kit'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem } from '@tiptap/extension-task-item'
import { TaskList } from '@tiptap/extension-task-list'
import { TextAlign } from '@tiptap/extension-text-align'
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { isSafeNoteLink } from '../../shared/noteFormatting'

export const noteExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
    trailingNode: false,
    link: {
      openOnClick: true,
      autolink: false,
      isAllowedUri: (url) => isSafeNoteLink(url),
    },
  }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node) => `Задача: ${node.textContent || 'без названия'}` } }),
]
