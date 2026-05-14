import { Item, ItemType } from '@omnivore-app/api'
import Mustache from 'mustache'
import { parseYaml, stringifyYaml } from 'obsidian'
import {
  compareHighlightsInFile,
  formatDate,
  formatHighlightQuote,
  getHighlightLocation,
  removeFrontMatterFromContent,
  siteNameFromUrl,
  snakeToCamelCase,
} from '../util'
import { HighlightManagerId } from '.'
import { logError } from '../logger'

type FunctionMap = {
  [key: string]: () => (
    text: string,
    render: (text: string) => string,
  ) => string
}

export const DEFAULT_TEMPLATE = `# {{{title}}}
#笔记同步助手
## 来源
[原文链接]({{{originalUrl}}})
## 正文
{{{content}}}`

export interface LabelView {
  name: string
}

export interface HighlightView {
  text: string
  highlightUrl: string
  highlightID: string
  dateHighlighted?: string
  note?: string
  labels?: LabelView[]
  color: string
  positionPercent: number
  positionAnchorIndex: number
}

export type ArticleView =
  | {
      id: string
      title: string
      omnivoreUrl: string
      siteName: string
      originalUrl?: string
      author: string
      labels?: LabelView[]
      dateSaved: string
      highlights: HighlightView[]
      content?: string
      datePublished?: string
      fileAttachment?: string
      description?: string
      note?: string
      type: ItemType
      dateRead?: string
      wordsCount?: number
      readLength?: number
      state: string
      dateArchived?: string
      image?: string
      updatedAt?: string
    }
  | FunctionMap

export type View =
  | {
      id: string
      title: string
      omnivoreUrl: string
      siteName: string
      originalUrl: string
      author: string
      date: string
      dateSaved: string
      datePublished?: string
      type: ItemType
      dateRead?: string
      state: string
      dateArchived?: string
    }
  | FunctionMap

enum ItemState {
  Inbox = 'INBOX',
  Reading = 'READING',
  Completed = 'COMPLETED',
  Archived = 'ARCHIVED',
}

const getItemState = (item: Item): string => {
  if (item.isArchived) {
    return ItemState.Archived
  }
  if (item.readingProgressPercent > 0) {
    return item.readingProgressPercent === 100
      ? ItemState.Completed
      : ItemState.Reading
  }

  return ItemState.Inbox
}

function lowerCase() {
  return function (text: string, render: (text: string) => string) {
    return render(text).toLowerCase()
  }
}

function upperCase() {
  return function (text: string, render: (text: string) => string) {
    return render(text).toUpperCase()
  }
}

function upperCaseFirst() {
  return function (text: string, render: (text: string) => string) {
    const str = render(text)
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }
}

function formatDateFunc() {
  return function (text: string, render: (text: string) => string) {
    // get the date and format from the text
    const [dateVariable, format] = text.split(',', 2)
    const date = render(dateVariable)
    if (!date) {
      return ''
    }
    // format the date
    return formatDate(date, format)
  }
}

const functionMap: FunctionMap = {
  lowerCase,
  upperCase,
  upperCaseFirst,
  formatDate: formatDateFunc,
}

const getOmnivoreUrl = (item: Item) => {
  return `https://omnivore.app/me/${item.slug}`
}

export const renderFilename = (
  item: Item,
  filename: string,
  dateFormat: string,
) => {
  const renderedFilename = render(item, filename, dateFormat)

  // truncate the filename to 100 characters (matches lodash.truncate default omission)
  const MAX_LENGTH = 100
  const OMISSION = '...'
  if (renderedFilename.length <= MAX_LENGTH) {
    return renderedFilename
  }
  return renderedFilename.slice(0, MAX_LENGTH - OMISSION.length) + OMISSION
}

export const renderLabels = (labels?: LabelView[]) => {
  return labels?.map((l) => ({
    // replace spaces with underscores because Obsidian doesn't allow spaces in tags
    name: l.name.replaceAll(' ', '_'),
  }))
}

export const renderItemContent = (
  item: Item,
  template: string,
  highlightOrder: string,
  highlightManagerId: HighlightManagerId | undefined,
  dateHighlightedFormat: string,
  dateSavedFormat: string,
  shouldMergeIntoSingleFile: boolean,
  frontMatterVariables: string[],
  frontMatterTemplate: string,
  sectionSeparator: string,
  sectionSeparatorEnd: string,
  fileAttachment?: string,
  wechatMessageTemplate?: string,
): string => {
  // 🆕 企微消息特殊处理：直接使用简洁模板，不添加分隔符
  if (shouldMergeIntoSingleFile && isWeChatMessage(item)) {
    const dateSaved = formatDate(item.savedAt, dateSavedFormat)
    const simpleContent = wechatMessageTemplate
      ? renderWeChatMessageSimple(item, dateSavedFormat, wechatMessageTemplate)
      : `📅 ${dateSaved}\n\n${item.content || ''}`

    // 创建简单的Front Matter
    const frontMatter: { [id: string]: unknown } = {
      id: item.id,
    }

    const frontMatterYaml = stringifyYaml({
      messages: [frontMatter]
    })
    const frontMatterStr = `---\n${frontMatterYaml}---`

    return `${frontMatterStr}\n\n${simpleContent}`
  }

  // filter out notes and redactions
  const itemHighlights =
    item.highlights?.filter((h) => h.type === 'HIGHLIGHT') || []
  // sort highlights by location if selected in options
  if (highlightOrder === 'LOCATION') {
    itemHighlights.sort((a, b) => {
      try {
        if (item.pageType === 'FILE') {
          // sort by location in file
          return compareHighlightsInFile(a, b)
        }
        // for web page, sort by location in the page
        return getHighlightLocation(a.patch) - getHighlightLocation(b.patch)
      } catch (e) {
        logError(e)
        return compareHighlightsInFile(a, b)
      }
    })
  }
  const highlights: HighlightView[] = itemHighlights.map((highlight) => {
    const highlightColor = highlight.color ?? 'yellow'
    const highlightRenderOption = highlightManagerId
      ? {
          highlightColor: highlightColor,
          highlightManagerId: highlightManagerId,
        }
      : null
    return {
      text: formatHighlightQuote(
        highlight.quote,
        template,
        highlightRenderOption,
      ),
      highlightUrl: `https://omnivore.app/me/${item.slug}#${highlight.id}`,
      highlightID: highlight.id.slice(0, 8),
      dateHighlighted: highlight.updatedAt
        ? formatDate(highlight.updatedAt, dateHighlightedFormat)
        : undefined,
      note: highlight.annotation ?? undefined,
      labels: renderLabels(highlight.labels || undefined),
      color: highlightColor,
      positionPercent: highlight.highlightPositionPercent || 0,
      positionAnchorIndex: highlight.highlightPositionAnchorIndex
        ? highlight.highlightPositionAnchorIndex + 1
        : 0, // PDF page numbers start at 1
    }
  })
  const dateSaved = formatDate(item.savedAt, dateSavedFormat)
  const siteName =
    item.siteName || siteNameFromUrl(item.originalArticleUrl || item.url)
  const publishedAt = item.publishedAt
  const datePublished = publishedAt
    ? formatDate(publishedAt, dateSavedFormat).trim()
    : undefined
  const articleNote = item.highlights?.find((h) => h.type === 'NOTE')
  const dateRead = item.readAt
    ? formatDate(item.readAt, dateSavedFormat).trim()
    : undefined
  const wordsCount = item.wordsCount
  const readLength = wordsCount
    ? Math.round(Math.max(1, wordsCount / 235))
    : undefined
  const articleView: ArticleView = {
    id: item.id,
    title: item.title,
    omnivoreUrl: `https://omnivore.app/me/${item.slug}`,
    siteName,
    originalUrl: item.originalArticleUrl || item.url,
    author: item.author || 'unknown',
    labels: renderLabels(item.labels || undefined),
    dateSaved,
    highlights,
    content: item.content || undefined,
    datePublished,
    fileAttachment,
    description: item.description || undefined,
    note: articleNote?.annotation ?? undefined,
    type: item.pageType,
    dateRead,
    wordsCount: item.wordsCount || undefined,
    readLength,
    state: getItemState(item),
    dateArchived: item.archivedAt || undefined,
    image: item.image || undefined,
    updatedAt: item.updatedAt || undefined,
    ...functionMap,
  }

  let frontMatter: { [id: string]: unknown } = {
    id: item.id, // id is required for deduplication
  }

  // if the front matter template is set, use it
  if (frontMatterTemplate) {
    const frontMatterTemplateRendered = Mustache.render(
      frontMatterTemplate,
      articleView,
    )
    try {
      // parse the front matter template as yaml
      const frontMatterParsed = parseYaml(frontMatterTemplateRendered) as Record<string, unknown> | null

      frontMatter = {
        ...(frontMatterParsed ?? {}),
        ...frontMatter,
      }
    } catch (error) {
      // if there's an error parsing the front matter template, log it
      logError('Error parsing front matter template', error)
      // and add the error to the front matter
      frontMatter = {
        ...frontMatter,
        omnivore_error:
          'There was an error parsing the front matter template. See console for details.',
      }
    }
  } else {
    // otherwise, use the front matter variables
    for (const item of frontMatterVariables) {
      // split the item into variable and alias
      const aliasedVariables = item.split('::')
      const variable = aliasedVariables[0]
      // we use snake case for variables in the front matter
      const articleVariable = snakeToCamelCase(variable)
      // use alias if available, otherwise use variable
      const key = aliasedVariables[1] || variable
      if (
        variable === 'tags' &&
        articleView.labels &&
        articleView.labels.length > 0
      ) {
        // tags are handled separately
        // use label names as tags
        frontMatter[key] = articleView.labels.map((l) => l.name)
        continue
      }

      const value = (articleView as Record<string, unknown>)[articleVariable]
      if (value) {
        // if variable is in article, use it
        frontMatter[key] = value
      }
    }
  }

  // Build content string based on template
  const content = Mustache.render(template, articleView)
  let contentWithoutFrontMatter = removeFrontMatterFromContent(content)
  let frontMatterYaml = stringifyYaml(frontMatter)
  if (shouldMergeIntoSingleFile) {
    // 如果用户配置了分隔符,则使用分隔符包裹内容
    if (sectionSeparator && sectionSeparatorEnd) {
      // 使用Mustache渲染分隔符模板,支持变量(如{{{dateSaved}}})
      const renderedStart = Mustache.render(sectionSeparator, articleView)
      const renderedEnd = Mustache.render(sectionSeparatorEnd, articleView)
      contentWithoutFrontMatter = `${renderedStart}\n${contentWithoutFrontMatter}\n${renderedEnd}`
    }

    // if merging into single file, wrap the front matter in a "messages" object to avoid Obsidian "Invalid properties" warning
    frontMatterYaml = stringifyYaml({
      messages: [frontMatter]
    })
  }

  const frontMatterStr = `---\n${frontMatterYaml}---`

  return `${frontMatterStr}\n\n${contentWithoutFrontMatter}`
}

export const render = (item: Item, template: string, dateFormat: string) => {
  const dateSaved = formatDate(item.savedAt, dateFormat)
  const datePublished = item.publishedAt
    ? formatDate(item.publishedAt, dateFormat).trim()
    : undefined
  const dateArchived = item.archivedAt
    ? formatDate(item.archivedAt, dateFormat).trim()
    : undefined
  const dateRead = item.readAt
    ? formatDate(item.readAt, dateFormat).trim()
    : undefined
  const view: View = {
    ...item,
    siteName:
      item.siteName || siteNameFromUrl(item.originalArticleUrl || item.url),
    author: item.author || 'unknown',
    omnivoreUrl: getOmnivoreUrl(item),
    originalUrl: item.originalArticleUrl || item.url,
    date: dateSaved,
    dateSaved,
    datePublished,
    dateArchived,
    dateRead,
    type: item.pageType,
    state: getItemState(item),
    ...functionMap,
  }
  return Mustache.render(template, view)
}

export const preParseTemplate = (template: string) => {
  return Mustache.parse(template)
}

/**
 * 检测是否为企微消息
 * 标题格式: 同步助手_yyyyMMdd_xxx_类型
 */
export const isWeChatMessage = (item: Item): boolean => {
  return item.title.startsWith('同步助手_')
}

/**
 * 处理聊天记录内容中的时间戳，将其转换为弱化样式，并精简换行
 */
const processContentTimestamps = (content: string): string => {
  // 1. 匹配聊天记录中的时间戳格式: **yyyy/MM/dd HH:mm:ss**
  // 将其转换为弱化样式: <small style="color: #999;">yyyy/MM/dd HH:mm:ss</small>
  let processed = content.replace(
    /\*\*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\*\*/g,
    '<small style="color: #999;">$1</small>'
  )

  // 2. 精简多余换行：将连续3个及以上换行替换为2个换行
  processed = processed.replace(/\n{3,}/g, '\n\n')

  // 3. 移除时间戳后的多余空行（时间戳+换行+换行 -> 时间戳+换行）
  processed = processed.replace(/(<small style="color: #999;">.*?<\/small>)\n\n/g, '$1\n')

  return processed
}

/**
 * 为企微消息渲染简洁内容（使用用户自定义模板）
 * 可用变量: {{{dateSaved}}}, {{{content}}}, {{{title}}}, {{{id}}} 等
 */
export const renderWeChatMessageSimple = (
  item: Item,
  dateSavedFormat: string,
  wechatMessageTemplate: string,
): string => {
  const dateSaved = formatDate(item.savedAt, dateSavedFormat)
  // 处理content中的时间戳，将其弱化显示
  const processedContent = item.content ? processContentTimestamps(item.content) : ''

  const articleView = {
    id: item.id,
    title: item.title,
    content: processedContent,
    dateSaved,
    savedAt: item.savedAt,
  }
  return Mustache.render(wechatMessageTemplate, articleView)
}
